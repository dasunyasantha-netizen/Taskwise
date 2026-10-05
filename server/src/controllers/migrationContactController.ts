import { Request, Response } from 'express'
import { isSupportedCountry, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/max'
import prisma from '../prisma'
import { usesFixedRoles, isRoleAlias } from '../helpers/fixedRoles'
import { randomUUID } from 'node:crypto'
import { TEST_WORKSPACE } from '../helpers/testSandbox'

type RoleContact = { id: string; actorType: string; actorId: string; workspaceId: string; companyId: string | null; country: string; phoneE164: string; email: string | null; assignmentVersion: number; holderKey?: string; holderName?: string | null }

const MAX_EXTRA_HOLDERS = 5

export async function syncMigrationContact(contact: RoleContact, removed = false): Promise<boolean> {
  const base = process.env.SYSWISE_BASE_URL?.replace(/\/$/, '')
  const key = process.env.SYSWISE_TASKWISE_SERVICE_KEY
  if (!base || !key) return false
  try {
    const actor = contact.actorType === 'director'
      ? await prisma.director.findUnique({ where: { id: contact.actorId }, include: { company: true } })
      : await prisma.personnel.findUnique({ where: { id: contact.actorId }, include: { company: true, department: true } })
    const workspace = await prisma.workspace.findUnique({ where: { id: contact.workspaceId } })
    const fixedRoles = await usesFixedRoles(contact.workspaceId)
    const active = !removed && Boolean(!await isRoleAlias(contact.actorType, contact.actorId) && actor?.isActive && actor.workspaceId === contact.workspaceId &&
      (!('deletedAt' in actor) || !actor.deletedAt) && (!actor.company || actor.company.status === 'ACTIVE'))
    const response = await fetch(`${base}/api/auth/internal/taskwise-role-contact/`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Service-Key': key },
      body: JSON.stringify({
        actorType: contact.actorType, actorId: contact.actorId, holderKey: contact.holderKey || '',
        workspaceId: contact.workspaceId, companyId: contact.companyId,
        country: contact.country, phone: contact.phoneE164, email: contact.email || '',
        assignmentVersion: contact.assignmentVersion, active,
        companyName: actor?.company?.displayName || actor?.company?.legalName || workspace?.companyName || workspace?.name || 'Company',
        roleName: contact.holderName && actor ? `${contact.holderName} (${actor.name})` : fixedRoles && actor ? actor.name : contact.actorType === 'director' ? 'Director' : actor && 'department' in actor ? actor.department.name : 'Personnel',
      }),
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) return false
    if (removed) return true
    const result = await response.json() as { syswiseUserId?: number | null }
    await prisma.migrationRoleContact.updateMany({
      where: { id: contact.id, assignmentVersion: contact.assignmentVersion },
      data: {
        syncStatus: 'SYNCED', syncedAt: new Date(),
        syswiseUserId: result.syswiseUserId ?? null,
      },
    })
    return true
  } catch {
    return false
  }
}

export async function retryPendingMigrationContacts(): Promise<void> {
  const pending = await prisma.migrationRoleContact.findMany({
    orderBy: { updatedAt: 'asc' }, take: 1000,
  })
  for (const contact of pending) await syncMigrationContact(contact)
}

export async function getMigrationContact(req: Request, res: Response): Promise<void> {
  if (req.user!.workspaceId === TEST_WORKSPACE) { res.json({ required: false }); return }
  if (await usesFixedRoles(req.user!.workspaceId)) { res.json({ required: false }); return }
  if (req.user?.impersonationSessionId) {
    res.json({ required: false }); return
  }
  const { actorType, actorId } = req.user!
  const contact = await prisma.migrationRoleContact.findUnique({
    where: { actorType_actorId_holderKey: { actorType, actorId, holderKey: '' } },
  })
  res.json({
    required: !contact,
    contact: contact ? {
      country: contact.country, phone: contact.phoneE164,
      email: contact.email, syncStatus: contact.syncStatus,
    } : null,
  })
}

export async function saveMigrationContact(req: Request, res: Response): Promise<void> {
  if (await usesFixedRoles(req.user!.workspaceId)) { res.status(403).json({ error: 'Only the Director can assign a mobile number to this role.' }); return }
  if (req.user?.impersonationSessionId) {
    res.status(403).json({ error: 'Cannot change role contacts during support access.' }); return
  }
  const { actorType, actorId, workspaceId } = req.user!
  const country = String(req.body?.country || '').trim().toUpperCase()
  const rawPhone = String(req.body?.phone || '').trim()
  const email = String(req.body?.email || '').trim().toLowerCase()
  if (!isSupportedCountry(country)) {
    res.status(400).json({ error: 'Select a valid country.' }); return
  }
  const parsed = parsePhoneNumberFromString(rawPhone, country as CountryCode)
  if (!parsed?.isValid() || parsed.country !== country ||
      !['MOBILE', 'FIXED_LINE_OR_MOBILE'].includes(parsed.getType() || '') ||
      (country === 'LK' && parsed.getType() !== 'MOBILE')) {
    res.status(400).json({ error: 'Enter a valid mobile number for the selected country.' }); return
  }
  if (country === 'LK' && parsed.getType() !== 'MOBILE') {
    res.status(400).json({ error: 'Enter a Sri Lankan mobile number.' }); return
  }
  if (country !== 'LK' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'Enter an email address for a foreign number.' }); return
  }
  try {
    const actor = actorType === 'director'
      ? await prisma.director.findFirst({ where: { id: actorId, workspaceId, isActive: true }, select: { companyId: true } })
      : await prisma.personnel.findFirst({ where: { id: actorId, workspaceId, isActive: true, deletedAt: null }, select: { companyId: true } })
    if (!actor) { res.status(403).json({ error: 'Active role required.' }); return }

    const existing = await prisma.migrationRoleContact.findUnique({
      where: { actorType_actorId_holderKey: { actorType, actorId, holderKey: '' } },
    })
    if (existing && (existing.phoneE164 !== parsed.number || existing.email !== (country === 'LK' ? null : email))) {
      res.status(409).json({ error: 'This role is already linked. Contact your director to change its assignment.' }); return
    }
    // First collection cannot overwrite an assignment saved concurrently by a supervisor.
    let contact: RoleContact
    if (existing) {
      const updated = await prisma.migrationRoleContact.updateMany({
        where: { id: existing.id, assignmentVersion: existing.assignmentVersion,
          phoneE164: existing.phoneE164, email: existing.email },
        data: { syncStatus: 'PENDING', syncedAt: null },
      })
      if (!updated.count) { res.status(409).json({ error: 'This assignment changed. Contact your director.' }); return }
      contact = existing
    } else {
      try {
        contact = await prisma.migrationRoleContact.create({ data: {
          actorType, actorId, workspaceId, companyId: actor.companyId,
          country, phoneE164: parsed.number, email: country === 'LK' ? null : email,
        } })
      } catch (e) {
        if ((e as { code?: string }).code === 'P2002') { res.status(409).json({ error: 'An assignment was just saved. Refresh and contact your director if it needs correction.' }); return }
        throw e
      }
    }
    const synced = await syncMigrationContact(contact)
    res.json({ saved: true, syncStatus: synced ? 'SYNCED' : 'PENDING' })
  } catch {
    res.status(500).json({ error: 'Could not save the number. Please try again.' })
  }
}

export async function getManagedMigrationContacts(req: Request, res: Response): Promise<void> {
  if (req.user?.impersonationSessionId) { res.status(403).json({ error: 'Unavailable during support access.' }); return }
  const { actorType, actorId, workspaceId } = req.user!
  const fixedRoles = await usesFixedRoles(workspaceId)
  if (fixedRoles && actorType !== 'director') { res.status(403).json({ error: 'Only the Director can manage role assignments.' }); return }
  const people = await prisma.personnel.findMany({
    where: { workspaceId, isActive: true, deletedAt: null,
      ...(fixedRoles ? { fixedRole: { is: { directorId: null } } } : {}),
      ...(actorType === 'personnel' ? { supervisorId: actorId } : {}) },
    include: { department: true }, orderBy: { name: 'asc' },
  })
  const directors = actorType === 'director'
    ? await prisma.director.findMany({ where: { workspaceId, isActive: true } }) : []
  const actorIds = [...people.map(person => person.id), ...directors.map(director => director.id)]
  const contacts = await prisma.migrationRoleContact.findMany({
    where: { workspaceId, actorId: { in: actorIds } },
  })
  const lookup = new Map(contacts.filter(c => !c.holderKey).map(contact => [`${contact.actorType}:${contact.actorId}`, contact]))
  const holders = (id: string) => contacts.filter(c => c.actorType === 'director' && c.actorId === id && c.holderKey)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map(c => ({ holderKey: c.holderKey, holderName: c.holderName || '', contact: c }))
  res.json([
    ...directors.map(director => ({ actorType: 'director', actorId: director.id,
      name: director.name, roleName: fixedRoles ? director.name : 'Director', contact: lookup.get(`director:${director.id}`) || null,
      ...(fixedRoles ? { holders: holders(director.id) } : {}) })),
    ...people.map(person => ({ actorType: 'personnel', actorId: person.id,
      name: person.name, roleName: fixedRoles ? person.name : person.department.name, contact: lookup.get(`personnel:${person.id}`) || null })),
  ])
}

type Target = { workspaceId: string; managerType: 'director' | 'personnel'; managerId: string; targetType: string; targetId: string; companyId: string | null }

// Resolves the role in the URL and checks the caller may assign it. Fixed-role
// companies allow only the Director; elsewhere a supervisor may assign reports.
async function resolveTarget(req: Request, res: Response): Promise<Target | null> {
  if (req.user?.impersonationSessionId) { res.status(403).json({ error: 'Unavailable during support access.' }); return null }
  const { actorType: managerType, actorId: managerId, workspaceId } = req.user!
  if (await usesFixedRoles(workspaceId) && managerType !== 'director') { res.status(403).json({ error: 'Only the Director can assign phone numbers.' }); return null }
  const targetType = req.params.actorType
  const targetId = req.params.actorId
  if (await isRoleAlias(targetType, targetId)) { res.status(409).json({ error: 'This position is part of the unified Chairman role. Assign its management role.' }); return null }
  if (!['director', 'personnel'].includes(targetType)) { res.status(400).json({ error: 'Invalid role.' }); return null }
  const target = targetType === 'director'
    ? await prisma.director.findFirst({ where: { id: targetId, workspaceId, isActive: true } })
    : await prisma.personnel.findFirst({ where: { id: targetId, workspaceId, isActive: true, deletedAt: null } })
  if (!target || (managerType === 'personnel' && (targetType !== 'personnel' ||
      !('supervisorId' in target) || target.supervisorId !== managerId))) {
    res.status(403).json({ error: 'You can assign only roles you supervise.' }); return null
  }
  return { workspaceId, managerType, managerId, targetType, targetId, companyId: target.companyId }
}

function parseContact(req: Request, res: Response): { country: string; phone: string; email: string | null } | null {
  const country = String(req.body?.country || '').trim().toUpperCase()
  const rawPhone = String(req.body?.phone || '').trim()
  const email = String(req.body?.email || '').trim().toLowerCase()
  if (!isSupportedCountry(country)) { res.status(400).json({ error: 'Select a valid country.' }); return null }
  const parsed = parsePhoneNumberFromString(rawPhone, country as CountryCode)
  if (!parsed?.isValid() || parsed.country !== country ||
      !['MOBILE', 'FIXED_LINE_OR_MOBILE'].includes(parsed.getType() || '') ||
      (country === 'LK' && parsed.getType() !== 'MOBILE')) {
    res.status(400).json({ error: 'Enter a valid mobile number for the selected country.' }); return null
  }
  if (country !== 'LK' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'Enter an email address for a foreign number.' }); return null
  }
  return { country, phone: parsed.number, email: country === 'LK' ? null : email }
}

// Extra holders exist only on a fixed-role company's management (Chairman) role.
async function holderRoleAllowed(t: Target, res: Response): Promise<boolean> {
  if (t.targetType !== 'director' || t.managerType !== 'director' || !await usesFixedRoles(t.workspaceId)) {
    res.status(400).json({ error: 'Only the company management role can have additional holders.' }); return false
  }
  return true
}

async function holderNameError(t: Target, name: string, exceptKey?: string): Promise<string | null> {
  if (name.length < 2 || name.length > 100) return 'Enter a holder name of 2 to 100 characters.'
  const director = await prisma.director.findUnique({ where: { id: t.targetId }, select: { name: true } })
  const others = await prisma.migrationRoleContact.findMany({ where: { actorType: t.targetType, actorId: t.targetId, holderKey: { notIn: ['', exceptKey || ''] } }, select: { holderName: true } })
  const clash = [director?.name, ...others.map(h => h.holderName)].some(n => n?.trim().toLowerCase() === name.toLowerCase())
  return clash ? 'Another holder of this role already uses that name.' : null
}

async function phoneTakenOnRole(t: Target, phone: string, exceptKey: string | null): Promise<boolean> {
  return !!await prisma.migrationRoleContact.findFirst({ where: { actorType: t.targetType, actorId: t.targetId, phoneE164: phone,
    ...(exceptKey === null ? {} : { holderKey: { not: exceptKey } }) } })
}

export async function assignMigrationContact(req: Request, res: Response): Promise<void> {
  const t = await resolveTarget(req, res); if (!t) return
  const parsed = parseContact(req, res); if (!parsed) return
  const holderKey = String(req.body?.holderKey || '')
  const holderName = String(req.body?.holderName ?? '').trim()
  try {
    if (holderKey) {
      if (!await holderRoleAllowed(t, res)) return
      const error = await holderNameError(t, holderName, holderKey)
      if (error) { res.status(400).json({ error }); return }
    }
    const previous = await prisma.migrationRoleContact.findUnique({
      where: { actorType_actorId_holderKey: { actorType: t.targetType, actorId: t.targetId, holderKey } },
    })
    if (holderKey && !previous) { res.status(404).json({ error: 'This holder was removed. Refresh and try again.' }); return }
    if (await phoneTakenOnRole(t, parsed.phone, holderKey)) { res.status(409).json({ error: 'This number is already assigned to another holder of this role.' }); return }
    const reassigned = Boolean(previous && (previous.phoneE164 !== parsed.phone ||
      previous.country !== parsed.country || previous.email !== parsed.email))
    const contact = await prisma.migrationRoleContact.upsert({
      where: { actorType_actorId_holderKey: { actorType: t.targetType, actorId: t.targetId, holderKey } },
      create: { actorType: t.targetType, actorId: t.targetId, workspaceId: t.workspaceId,
        companyId: t.companyId, country: parsed.country, phoneE164: parsed.phone, email: parsed.email },
      update: { workspaceId: t.workspaceId, companyId: t.companyId, country: parsed.country,
        phoneE164: parsed.phone, email: parsed.email,
        ...(holderKey ? { holderName } : {}),
        ...(reassigned ? { syswiseUserId: null, syncStatus: 'PENDING', syncedAt: null,
          legacyAccessRevokedAt: new Date(), assignmentVersion: { increment: 1 } } : {}),
      },
    })
    await prisma.auditLog.create({ data: {
      workspaceId: t.workspaceId, event: 'ROLE_CONTACT_ASSIGNED', actorType: t.managerType,
      ...(t.managerType === 'director' ? { actorDirectorId: t.managerId } : { actorPersonnelId: t.managerId }),
      payload: { targetType: t.targetType, targetId: t.targetId, country: parsed.country, phoneLast4: parsed.phone.slice(-4),
        ...(holderKey ? { holderKey, holderName } : {}) },
    } })
    const synced = await syncMigrationContact(contact)
    res.json({ saved: true, syncStatus: synced ? 'SYNCED' : 'PENDING' })
  } catch {
    res.status(500).json({ error: 'Could not assign this number.' })
  }
}

// POST /auth/role-contacts/:actorType/:actorId/holders — another named person who
// shares the Chairman role's access and signs in with their own number.
export async function addRoleHolder(req: Request, res: Response): Promise<void> {
  const t = await resolveTarget(req, res); if (!t) return
  if (!await holderRoleAllowed(t, res)) return
  const parsed = parseContact(req, res); if (!parsed) return
  const holderName = String(req.body?.holderName ?? '').trim()
  try {
    const error = await holderNameError(t, holderName)
    if (error) { res.status(400).json({ error }); return }
    const count = await prisma.migrationRoleContact.count({ where: { actorType: t.targetType, actorId: t.targetId, holderKey: { not: '' } } })
    if (count >= MAX_EXTRA_HOLDERS) { res.status(400).json({ error: `A role can have at most ${MAX_EXTRA_HOLDERS} additional holders.` }); return }
    if (await phoneTakenOnRole(t, parsed.phone, null)) { res.status(409).json({ error: 'This number is already assigned to another holder of this role.' }); return }
    const contact = await prisma.migrationRoleContact.create({ data: {
      actorType: t.targetType, actorId: t.targetId, holderKey: randomUUID(), holderName,
      workspaceId: t.workspaceId, companyId: t.companyId, country: parsed.country, phoneE164: parsed.phone, email: parsed.email,
    } })
    await prisma.auditLog.create({ data: {
      workspaceId: t.workspaceId, event: 'ROLE_HOLDER_ADDED', actorType: 'director', actorDirectorId: t.managerId,
      payload: { targetType: t.targetType, targetId: t.targetId, holderKey: contact.holderKey, holderName, country: parsed.country, phoneLast4: parsed.phone.slice(-4) },
    } })
    const synced = await syncMigrationContact(contact)
    res.status(201).json({ saved: true, holderKey: contact.holderKey, syncStatus: synced ? 'SYNCED' : 'PENDING' })
  } catch {
    res.status(500).json({ error: 'Could not add this holder.' })
  }
}

// DELETE /auth/role-contacts/:actorType/:actorId/holders/:holderKey — ends that
// person's access at once; the role, its tasks and history are untouched.
export async function removeRoleHolder(req: Request, res: Response): Promise<void> {
  const t = await resolveTarget(req, res); if (!t) return
  if (!await holderRoleAllowed(t, res)) return
  const holderKey = String(req.params.holderKey || '')
  try {
    const contact = holderKey ? await prisma.migrationRoleContact.findUnique({
      where: { actorType_actorId_holderKey: { actorType: t.targetType, actorId: t.targetId, holderKey } } }) : null
    if (!contact) { res.status(404).json({ error: 'Holder not found.' }); return }
    await prisma.migrationRoleContact.delete({ where: { id: contact.id } })
    await prisma.auditLog.create({ data: {
      workspaceId: t.workspaceId, event: 'ROLE_HOLDER_REMOVED', actorType: 'director', actorDirectorId: t.managerId,
      payload: { targetType: t.targetType, targetId: t.targetId, holderKey, holderName: contact.holderName, phoneLast4: contact.phoneE164.slice(-4) },
    } })
    // Sessions need this row, so access already ended; this also drops the role from the Syswise launcher.
    await syncMigrationContact(contact, true)
    res.json({ removed: true })
  } catch {
    res.status(500).json({ error: 'Could not remove this holder.' })
  }
}
