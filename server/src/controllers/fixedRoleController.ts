import { Request, Response } from 'express'
import { randomBytes, randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import prisma from '../prisma'
import { usesFixedRoles } from '../helpers/fixedRoles'
import { isFourLevelWorkspace, resolveSupervisor } from '../helpers/hierarchy'
import { syncMigrationContact } from './migrationContactController'

export async function listFixedRoles(req: Request, res: Response): Promise<void> {
  const { workspaceId } = req.user!
  if (!await usesFixedRoles(workspaceId)) { res.status(404).json({ error: 'Fixed roles are not enabled for this company.' }); return }
  const roles = await prisma.workspaceRole.findMany({ where: { workspaceId }, include: {
    director: true, personnel: { include: { department: { include: { layer: true } } } },
  } })
  const contacts = await prisma.migrationRoleContact.findMany({ where: { workspaceId } })
  res.json(roles.filter(r => r.director ? r.director.isActive : r.personnel?.isActive && !r.personnel.deletedAt).map(r => {
    const actor = r.director || r.personnel!
    const actorType = r.director ? 'director' : 'personnel'
    const contact = contacts.find(c => c.actorId === actor.id && c.actorType === actorType && !c.holderKey)
    return { id: r.id, name: actor.name, actorType, actorId: actor.id, personnelId: r.personnelId,
      departmentId: r.personnel?.departmentId, departmentName: r.personnel?.department.name,
      layerNumber: r.personnel?.department.layer.number, supervisorId: r.personnel?.supervisorId,
      companyManagement: !!r.director, isLetterAssigner: r.personnel?.isLetterAssigner === true, phone: contact?.phoneE164 || null,
      accountConnected: !!contact?.syswiseUserId }
  }).sort((a, b) => a.name.localeCompare(b.name)))
}

export async function saveFixedRole(req: Request, res: Response): Promise<void> {
  const { workspaceId, actorId, actorType, adminId, adminName, impersonationSessionId } = req.user!
  if (actorType !== 'director') { res.status(403).json({ error: 'Only the Director can manage roles.' }); return }
  // Support Access may manage roles; the audit trail records the admin behind the change.
  const support = impersonationSessionId ? { supportSessionId: impersonationSessionId, impersonatedBy: adminName ?? adminId } : {}
  if (!await usesFixedRoles(workspaceId)) { res.status(404).json({ error: 'Fixed roles are not enabled.' }); return }
  try {
    const name = String(req.body?.name || '').trim(), departmentId = String(req.body?.departmentId || '')
    if (!name || name.length > 150) { res.status(400).json({ error: 'Enter a role name of up to 150 characters.' }); return }
    if (req.body.isLetterAssigner !== undefined && typeof req.body.isLetterAssigner !== 'boolean') {
      res.status(400).json({ error: 'Letter Assigner permission must be true or false.' }); return
    }
    const existing = req.params.id ? await prisma.workspaceRole.findFirst({ where: { id: req.params.id, workspaceId }, include: { personnel: true, director: true } }) : null
    if (req.params.id && !existing) { res.status(404).json({ error: 'Role not found.' }); return }
    const isLetterAssigner = req.body.isLetterAssigner ?? existing?.personnel?.isLetterAssigner ?? false
    const department = await prisma.department.findFirst({ where: { id: departmentId, workspaceId, deletedAt: null }, include: { layer: true } })
    if (!department) { res.status(400).json({ error: 'Select a department in this company.' }); return }
    const fourLevel = await isFourLevelWorkspace(workspaceId)
    const supervisor = existing?.personnel?.departmentId === departmentId && req.body.supervisorId === undefined
      ? { value: existing.personnel.supervisorId }
      : await resolveSupervisor({ fourLevel, workspaceId, level: department.layer.number,
      departmentName: department.name, subjectId: existing?.personnelId || undefined,
      current: existing?.personnel?.supervisorId, provided: req.body.supervisorId,
      isCreate: !existing || existing.personnel?.departmentId !== departmentId })
    if ('error' in supervisor) { res.status(400).json({ error: supervisor.error }); return }
    const company = await prisma.company.findUnique({ where: { workspaceId }, select: { id: true } })
    const hash = !existing ? await bcrypt.hash(randomBytes(32).toString('base64url'), 12) : ''
    const role = await prisma.$transaction(async tx => {
      let role
      if (existing) {
        if (existing.personnelId) await tx.personnel.update({ where: { id: existing.personnelId }, data: { name, departmentId, supervisorId: supervisor.value, isLetterAssigner } })
        if (existing.directorId) await tx.director.update({ where: { id: existing.directorId }, data: { name } })
        role = existing
      } else {
        const id = randomUUID()
        const position = await tx.personnel.create({ data: { id, name, departmentId, supervisorId: supervisor.value,
          workspaceId, companyId: company?.id, phone: '', loginId: 'role:' + id, password: hash, mustChangePassword: false, isLetterAssigner } })
        role = await tx.workspaceRole.create({ data: { id, workspaceId, personnelId: position.id } })
      }
      await tx.auditLog.create({ data: { workspaceId, actorType: 'director', actorDirectorId: actorId,
        event: existing ? 'ROLE_UPDATED' : 'ROLE_CREATED', payload: { roleId: role.id, name, departmentId, supervisorId: supervisor.value, isLetterAssigner, ...support } } })
      return role
    })
    const contacts = await prisma.migrationRoleContact.findMany({ where: {
      actorType: role.directorId ? 'director' : 'personnel', actorId: role.directorId || role.personnelId!,
    } })
    for (const contact of contacts) await syncMigrationContact(contact)
    res.status(existing ? 200 : 201).json({ id: role.id, saved: true })
  } catch (error) { console.error(error); res.status(500).json({ error: 'Could not save the role.' }) }
}
