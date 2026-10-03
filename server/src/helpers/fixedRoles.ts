import prisma from '../prisma'

export async function usesFixedRoles(workspaceId?: string | null): Promise<boolean> {
  if (!workspaceId) return false
  return !!(await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { roleBasedIdentity: true } }))?.roleBasedIdentity
}

export async function fixedRoleMetadata(actorType: string, actorId: string, workspaceId: string) {
  if (!await usesFixedRoles(workspaceId)) return {}
  const role = await prisma.workspaceRole.findFirst({ where: { workspaceId,
    ...(actorType === 'director' ? { directorId: actorId } : { personnelId: actorId }) } })
  return { roleBasedIdentity: true, roleId: role?.id, personnelRoleId: actorType === 'director' ? role?.personnelId || undefined : undefined }
}

export async function isRoleAlias(actorType: string, actorId: string): Promise<boolean> {
  if (actorType !== 'personnel') return false
  return !!await prisma.workspaceRole.findFirst({ where: { personnelId: actorId, directorId: { not: null }, workspace: { roleBasedIdentity: true } } })
}
