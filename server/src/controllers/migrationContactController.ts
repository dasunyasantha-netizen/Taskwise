import { Request, Response } from 'express'
import { isSupportedCountry, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/max'
import prisma from '../prisma'

type RoleContact = { id: string; actorType: string; actorId: string; workspaceId: string; companyId: string | null; country: string; phoneE164: string; email: string | null }

export async function syncMigrationContact(contact: RoleContact): Promise<boolean> {
  const base = process.env.SYSWISE_BASE_URL?.replace(/\/$/, '')
  const key = process.env.SYSWISE_TASKWISE_SERVICE_KEY
  if (!base || !key) return false
  try {
    const response = await fetch(`${base}/api/auth/internal/taskwise-role-contact/`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Service-Key': key },
      body: JSON.stringify({
        actorType: contact.actorType, actorId: contact.actorId,
        workspaceId: contact.workspaceId, companyId: contact.companyId,
        country: contact.country, phone: contact.phoneE164, email: contact.email || '',
      }),
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) return false
    const result = await response.json() as { syswiseUserId?: number | null }
    await prisma.migrationRoleContact.update({
      where: { id: contact.id },
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
    where: { syncStatus: 'PENDING' }, orderBy: { updatedAt: 'asc' }, take: 50,
  })
  for (const contact of pending) await syncMigrationContact(contact)
}

export async function getMigrationContact(req: Request, res: Response): Promise<void> {
  if (req.user?.impersonationSessionId) {
    res.json({ required: false }); return
  }
  const { actorType, actorId } = req.user!
  const contact = await prisma.migrationRoleContact.findUnique({
    where: { actorType_actorId: { actorType, actorId } },
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
      where: { actorType_actorId: { actorType, actorId } },
    })
    if (existing?.syswiseUserId && (existing.phoneE164 !== parsed.number || existing.email !== (email || null))) {
      res.status(409).json({ error: 'This role is already linked. Contact your director to change its assignment.' }); return
    }
    const contact = await prisma.migrationRoleContact.upsert({
      where: { actorType_actorId: { actorType, actorId } },
      create: {
        actorType, actorId, workspaceId, companyId: actor.companyId,
        country, phoneE164: parsed.number, email: country === 'LK' ? null : email,
      },
      update: {
        workspaceId, companyId: actor.companyId,
        country, phoneE164: parsed.number, email: country === 'LK' ? null : email,
        syncStatus: 'PENDING', syncedAt: null,
      },
    })
    const synced = await syncMigrationContact(contact)
    res.json({ saved: true, syncStatus: synced ? 'SYNCED' : 'PENDING' })
  } catch {
    res.status(500).json({ error: 'Could not save the number. Please try again.' })
  }
}

export async function getManagedMigrationContacts(req: Request, res: Response): Promise<void> {
  if (req.user?.impersonationSessionId) { res.status(403).json({ error: 'Unavailable during support access.' }); return }
  const { actorType, actorId, workspaceId } = req.user!
  const people = await prisma.personnel.findMany({
    where: { workspaceId, isActive: true, deletedAt: null,
      ...(actorType === 'personnel' ? { supervisorId: actorId } : {}) },
    include: { department: true }, orderBy: { name: 'asc' },
  })
  const directors = actorType === 'director'
    ? await prisma.director.findMany({ where: { workspaceId, isActive: true } }) : []
  const actorIds = [...people.map(person => person.id), ...directors.map(director => director.id)]
  const contacts = await prisma.migrationRoleContact.findMany({
    where: { workspaceId, actorId: { in: actorIds } },
  })
  const lookup = new Map(contacts.map(contact => [`${contact.actorType}:${contact.actorId}`, contact]))
  res.json([
    ...directors.map(director => ({ actorType: 'director', actorId: director.id,
      name: director.name, roleName: 'Director', contact: lookup.get(`director:${director.id}`) || null })),
    ...people.map(person => ({ actorType: 'personnel', actorId: person.id,
      name: person.name, roleName: person.department.name, contact: lookup.get(`personnel:${person.id}`) || null })),
  ])
}

export async function assignMigrationContact(req: Request, res: Response): Promise<void> {
  if (req.user?.impersonationSessionId) { res.status(403).json({ error: 'Unavailable during support access.' }); return }
  const { actorType: managerType, actorId: managerId, workspaceId } = req.user!
  const targetType = req.params.actorType
  const targetId = req.params.actorId
  if (!['director', 'personnel'].includes(targetType)) { res.status(400).json({ error: 'Invalid role.' }); return }
  const target = targetType === 'director'
    ? await prisma.director.findFirst({ where: { id: targetId, workspaceId, isActive: true } })
    : await prisma.personnel.findFirst({ where: { id: targetId, workspaceId, isActive: true, deletedAt: null } })
  if (!target || (managerType === 'personnel' && (targetType !== 'personnel' ||
      !('supervisorId' in target) || target.supervisorId !== managerId))) {
    res.status(403).json({ error: 'You can assign only roles you supervise.' }); return
  }
  const country = String(req.body?.country || '').trim().toUpperCase()
  const rawPhone = String(req.body?.phone || '').trim()
  const email = String(req.body?.email || '').trim().toLowerCase()
  if (!isSupportedCountry(country)) { res.status(400).json({ error: 'Select a valid country.' }); return }
  const parsed = parsePhoneNumberFromString(rawPhone, country as CountryCode)
  if (!parsed?.isValid() || parsed.country !== country ||
      !['MOBILE', 'FIXED_LINE_OR_MOBILE'].includes(parsed.getType() || '') ||
      (country === 'LK' && parsed.getType() !== 'MOBILE')) {
    res.status(400).json({ error: 'Enter a valid mobile number for the selected country.' }); return
  }
  if (country !== 'LK' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'Enter an email address for a foreign number.' }); return
  }
  try {
    const previous = await prisma.migrationRoleContact.findUnique({
      where: { actorType_actorId: { actorType: targetType, actorId: targetId } },
    })
    const reassigned = Boolean(previous && (previous.phoneE164 !== parsed.number ||
      previous.country !== country || previous.email !== (country === 'LK' ? null : email)))
    const contact = await prisma.migrationRoleContact.upsert({
      where: { actorType_actorId: { actorType: targetType, actorId: targetId } },
      create: { actorType: targetType, actorId: targetId, workspaceId,
        companyId: target.companyId, country, phoneE164: parsed.number,
        email: country === 'LK' ? null : email },
      update: { workspaceId, companyId: target.companyId, country,
        phoneE164: parsed.number, email: country === 'LK' ? null : email,
        ...(reassigned ? { syswiseUserId: null, syncStatus: 'PENDING', syncedAt: null,
          legacyAccessRevokedAt: new Date() } : {}),
      },
    })
    await prisma.auditLog.create({ data: {
      workspaceId, event: 'ROLE_CONTACT_ASSIGNED', actorType: managerType,
      ...(managerType === 'director' ? { actorDirectorId: managerId } : { actorPersonnelId: managerId }),
      payload: { targetType, targetId, country, phoneLast4: parsed.number.slice(-4) },
    } })
    const synced = await syncMigrationContact(contact)
    res.json({ saved: true, syncStatus: synced ? 'SYNCED' : 'PENDING' })
  } catch {
    res.status(500).json({ error: 'Could not assign this number.' })
  }
}
