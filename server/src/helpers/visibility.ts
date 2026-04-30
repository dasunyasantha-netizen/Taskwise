/**
 * Task visibility rules
 *
 * Directors see everything in their workspace.
 *
 * Personnel can see a task if ANY of the following is true:
 *   1. They are directly assigned to it
 *   2. They belong to a group or department that is assigned to it
 *   3. They are a supervisor (direct or ancestor) of any assigned personnel
 *   4. They are the current approvalById (need to act on it)
 *   5. They created it (createdByPersonnelId)
 *
 * "Supervisor ancestor" means: following the supervisorId chain upward from
 * an assignee, the viewer appears somewhere in that chain.
 *
 * Implementation:
 *   We compute the set of personnel IDs whose supervisor chain includes this
 *   viewer, then include tasks assigned to any of those people.
 */

import prisma from '../prisma'

export type TaskVisibilityWhere = Record<string, unknown>

export async function buildTaskVisibilityFilter(
  actorType: 'director' | 'personnel',
  actorId: string,
  workspaceId: string,
  layerNumber?: number,
  departmentId?: string
): Promise<TaskVisibilityWhere> {
  if (actorType === 'director') {
    return {}
  }

  // Groups the actor belongs to
  const memberships = await prisma.groupMember.findMany({
    where: { personnelId: actorId },
    select: { groupId: true }
  })
  const myGroupIds = memberships.map(m => m.groupId)

  // All personnel in the workspace — used to walk supervisor chains
  const allPersonnel = await prisma.personnel.findMany({
    where: { workspaceId, deletedAt: null },
    select: { id: true, supervisorId: true, departmentId: true }
  })

  // Build map: personnelId → supervisorId
  const supervisorOf = new Map(allPersonnel.map(p => [p.id, p.supervisorId]))

  // Returns true if actorId is an ancestor supervisor of targetId
  function isAncestorSupervisor(targetId: string): boolean {
    let current = supervisorOf.get(targetId)
    const visited = new Set<string>()
    while (current) {
      if (current === actorId) return true
      if (visited.has(current)) break // cycle guard
      visited.add(current)
      current = supervisorOf.get(current)
    }
    return false
  }

  // Personnel IDs for whom this actor is a supervisor (direct or ancestor)
  const subordinateIds = allPersonnel
    .filter(p => p.id !== actorId && isAncestorSupervisor(p.id))
    .map(p => p.id)

  // Department IDs of actor's own department (they can see dept-assigned tasks for their own dept)
  const myDeptIds = departmentId ? [departmentId] : []

  const orClauses: Record<string, unknown>[] = [
    // 1. Directly assigned to actor
    { assignments: { some: { personnelId: actorId } } },
    // 2. Assigned to actor's department
    ...(myDeptIds.length > 0 ? [{ assignments: { some: { departmentId: { in: myDeptIds } } } }] : []),
    // 3. Assigned to a group actor belongs to
    ...(myGroupIds.length > 0 ? [{ assignments: { some: { groupId: { in: myGroupIds } } } }] : []),
    // 4. Assigned to a subordinate (actor is in their supervisor chain)
    ...(subordinateIds.length > 0 ? [{ assignments: { some: { personnelId: { in: subordinateIds } } } }] : []),
    // 5. Actor is the current approval authority
    { approvalById: actorId, approvalByType: 'personnel' },
    // 6. Actor created it
    { createdByPersonnelId: actorId },
  ]

  return { OR: orClauses }
}
