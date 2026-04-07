/**
 * Layer-based visibility rules
 *
 * Directors see everything in their workspace.
 *
 * Personnel visibility by layer:
 *   Layer 1 (senior)  → can see their own tasks AND tasks assigned to Layer 2 & 3 departments below them
 *   Layer 2 (mid)     → can see their own tasks AND tasks assigned to Layer 3 departments below them
 *   Layer 3 (ground)  → can only see tasks assigned directly to them, their group, or their department
 *
 * "Seeing a task" means:
 *   - The task is assigned to a department/group/person that the viewer is allowed to see, OR
 *   - The task was created by the viewer, OR
 *   - The viewer is the approvalById for the task (they need to review it)
 *
 * Implementation:
 *   We build a Prisma `where` clause fragment that filters tasks to only those
 *   visible to the requesting actor. Directors get no extra filter (empty fragment).
 */

import prisma from '../prisma'

export type TaskVisibilityWhere = Record<string, unknown>

/**
 * Returns a Prisma `where` clause fragment to restrict task visibility.
 * For directors: returns {} (no restriction beyond workspaceId).
 * For personnel: returns an OR clause covering visible assignments + own approval authority.
 */
export async function buildTaskVisibilityFilter(
  actorType: 'director' | 'personnel',
  actorId: string,
  workspaceId: string,
  layerNumber?: number,
  departmentId?: string
): Promise<TaskVisibilityWhere> {
  if (actorType === 'director') {
    // Directors see all tasks in their workspace
    return {}
  }

  // Find which department IDs are visible to this personnel member
  const visibleDeptIds = await getVisibleDepartmentIds(
    workspaceId,
    layerNumber ?? 3,
    departmentId
  )

  // Find group IDs the personnel belongs to
  const memberships = await prisma.groupMember.findMany({
    where: { personnelId: actorId },
    select: { groupId: true }
  })
  const myGroupIds = memberships.map(m => m.groupId)

  // A task is visible if:
  // 1. Assigned to this personnel directly
  // 2. Assigned to a group the personnel belongs to
  // 3. Assigned to a department the personnel can see (their layer or below)
  // 4. The personnel is the approval authority (they must be able to see it to act on it)
  // 5. Created by this personnel (they should see their own work)
  return {
    OR: [
      { assignments: { some: { personnelId: actorId } } },
      ...(myGroupIds.length > 0 ? [{ assignments: { some: { groupId: { in: myGroupIds } } } }] : []),
      ...(visibleDeptIds.length > 0 ? [{ assignments: { some: { departmentId: { in: visibleDeptIds } } } }] : []),
      { approvalById: actorId, approvalByType: 'personnel' },
      { createdByPersonnelId: actorId },
    ]
  }
}

/**
 * Returns the department IDs visible to a personnel member at a given layer.
 * Layer 1 → their dept + all L2 depts + all L3 depts in same workspace
 * Layer 2 → their dept + all L3 depts in same workspace
 * Layer 3 → only their own department
 */
async function getVisibleDepartmentIds(
  workspaceId: string,
  layerNumber: number,
  ownDepartmentId?: string
): Promise<string[]> {
  if (layerNumber === 3) {
    // Ground level: only own department
    return ownDepartmentId ? [ownDepartmentId] : []
  }

  // Layer 1 or 2: find all layers with number > their own, plus own dept
  const visibleLayerNumbers = layerNumber === 1 ? [1, 2, 3] : [2, 3]

  const layers = await prisma.layer.findMany({
    where: { workspaceId, number: { in: visibleLayerNumbers } },
    include: { departments: { where: { deletedAt: null }, select: { id: true } } }
  })

  const deptIds = layers.flatMap(l => l.departments.map(d => d.id))

  // Always include own department even if something went wrong
  if (ownDepartmentId && !deptIds.includes(ownDepartmentId)) {
    deptIds.push(ownDepartmentId)
  }

  return deptIds
}
