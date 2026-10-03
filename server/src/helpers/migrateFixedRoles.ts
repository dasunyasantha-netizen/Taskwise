import { PrismaClient } from '@prisma/client'

// Idempotent, explicit company rollout. Never derives contacts from legacy phone
// or loginId fields, and never deletes or rewrites historical actor references.
export async function migrateFixedRoles(db: PrismaClient, workspaceId: string, apply = false) {
  const workspace = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } })
  const personnel = await db.personnel.findMany({ where: { workspaceId } })
  const directors = await db.director.findMany({ where: { workspaceId, isSyswiseAdmin: false } })
  const chairman = directors.filter(d => d.isChairman && d.name.trim().toLowerCase() === 'chairman')
  const chairmanPersonnel = personnel.filter(p => !p.deletedAt && p.name.trim().toLowerCase() === 'chairman')
  if (chairman.length !== 1 || chairmanPersonnel.length !== 1) throw new Error('Expected exactly one Chairman management record and one Chairman personnel record. Migration stopped.')
  const management = chairman[0], position = chairmanPersonnel[0]
  const contacts = await db.migrationRoleContact.findMany({ where: { workspaceId } })
  const managementContact = contacts.find(c => c.actorType === 'director' && c.actorId === management.id)
  const positionContact = contacts.find(c => c.actorType === 'personnel' && c.actorId === position.id)
  if (managementContact && positionContact && (managementContact.phoneE164 !== positionContact.phoneE164 || managementContact.email !== positionContact.email)) {
    throw new Error('Chairman records have different collected contacts. Migration stopped without changing data.')
  }
  const report = { workspaceId, company: workspace.companyName || workspace.name,
    personnelRecordsPreserved: personnel.length, fixedRoles: personnel.length + directors.length - 1,
    activeRoles: personnel.filter(p => p.id === position.id ? management.isActive : p.isActive && !p.deletedAt).length + directors.filter(d => d.id !== management.id && d.isActive).length,
    collectedAssignmentsPreserved: contacts.length - Number(!!positionContact && !!managementContact),
    chairmanPersonnelId: position.id, chairmanDirectorId: management.id, applied: apply }
  if (!apply) return report
  await db.$transaction(async tx => {
    for (const p of personnel) {
      await tx.workspaceRole.upsert({ where: { personnelId: p.id },
        create: { id: p.id, workspaceId, personnelId: p.id, ...(p.id === position.id ? { directorId: management.id } : {}) },
        update: p.id === position.id ? { directorId: management.id } : {} })
    }
    for (const d of directors.filter(d => d.id !== management.id)) await tx.workspaceRole.upsert({ where: { directorId: d.id },
      create: { id: d.id, workspaceId, directorId: d.id }, update: {} })
    if (positionContact && !managementContact) await tx.migrationRoleContact.create({ data: {
      actorType: 'director', actorId: management.id, workspaceId, companyId: management.companyId,
      country: positionContact.country, phoneE164: positionContact.phoneE164, email: positionContact.email,
      syswiseUserId: positionContact.syswiseUserId, syncStatus: 'PENDING', assignmentVersion: positionContact.assignmentVersion,
    } })
    // Retain any source contact for audit; it becomes an inactive alias in Syswise.
    if (positionContact) await tx.migrationRoleContact.update({ where: { id: positionContact.id },
      data: { legacyAccessRevokedAt: new Date(), syswiseUserId: null, syncStatus: 'PENDING' } })
    await tx.migrationRoleContact.updateMany({ where: { workspaceId }, data: { syncStatus: 'PENDING' } })
    await tx.workspace.update({ where: { id: workspaceId }, data: { roleBasedIdentity: true } })
    if (!workspace.roleBasedIdentity) await tx.auditLog.create({ data: { workspaceId, event: 'FIXED_ROLES_MIGRATED', actorType: 'director', actorDirectorId: management.id,
      payload: { ...report, action: 'Converted personnel positions into fixed roles and unified Chairman management access, preserving all source records.' } } })
  }, { timeout: 30000 })
  return report
}
