import { Request, Response } from 'express'
import prisma from '../prisma'
import { buildTaskVisibilityFilter } from '../helpers/visibility'

const TASK_INCLUDE = {
  project: true,
  assignments: {
    include: {
      personnel: { select: { id: true, name: true, avatarUrl: true } },
      group: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
    }
  },
  _count: { select: { subtasks: true, comments: true } }
}

// Resolves actedByName from actedById+actedByType and flattens it onto the task
async function resolveActedByName(task: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!task.actedById || !task.actedByType) return task
  try {
    if (task.actedByType === 'director') {
      const d = await prisma.director.findUnique({ where: { id: task.actedById as string }, select: { name: true } })
      return { ...task, actedByName: d?.name }
    } else {
      const p = await prisma.personnel.findUnique({ where: { id: task.actedById as string }, select: { name: true } })
      return { ...task, actedByName: p?.name }
    }
  } catch { return task }
}

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

async function writeAudit(db: TxClient | typeof prisma, workspaceId: string, event: string, actorType: 'director' | 'personnel', actorId: string, taskId?: string, payload?: object) {
  await db.auditLog.create({
    data: {
      workspaceId,
      event,
      actorType,
      actorDirectorId:  actorType === 'director'  ? actorId : undefined,
      actorPersonnelId: actorType === 'personnel' ? actorId : undefined,
      taskId,
      payload,
    }
  })
}

async function notifyActor(db: TxClient | typeof prisma, workspaceId: string, recipientType: 'director' | 'personnel', recipientId: string, type: string, title: string, message: string, taskId?: string) {
  await db.notification.create({
    data: {
      workspaceId,
      recipientType,
      recipientDirectorId:  recipientType === 'director'  ? recipientId : undefined,
      recipientPersonnelId: recipientType === 'personnel' ? recipientId : undefined,
      type,
      title,
      message,
      taskId,
    }
  })
}

// GET /api/tasks
export async function listTasks(req: Request, res: Response): Promise<void> {
  try {
    const { actorId, actorType, workspaceId, layerNumber, departmentId } = req.user!
    const { projectId, status, parentTaskId, overdue } = req.query as Record<string, string>

    const baseWhere: Record<string, unknown> = { workspaceId, deletedAt: null }
    if (projectId) baseWhere.projectId = projectId
    if (status)    baseWhere.status    = status
    if (parentTaskId === 'null') baseWhere.parentTaskId = null
    else if (parentTaskId)       baseWhere.parentTaskId = parentTaskId
    if (overdue === 'true') baseWhere.deadline = { lt: new Date() }

    // Apply visibility filter for personnel
    const visibilityFilter = await buildTaskVisibilityFilter(actorType, actorId, workspaceId, layerNumber, departmentId)

    const where = Object.keys(visibilityFilter).length > 0
      ? { AND: [baseWhere, visibilityFilter] }
      : baseWhere

    const tasks = await prisma.task.findMany({
      where,
      include: TASK_INCLUDE,
      orderBy: [{ deadline: 'asc' }, { createdAt: 'desc' }]
    })
    res.json(tasks)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// GET /api/tasks/:id
export async function getTask(req: Request, res: Response): Promise<void> {
  try {
    const { actorId, actorType, workspaceId, layerNumber, departmentId } = req.user!

    const task = await prisma.task.findFirst({
      where: { id: req.params.id, workspaceId },
      include: { ...TASK_INCLUDE, subtasks: { include: TASK_INCLUDE }, parent: true }
    })
    if (!task) { res.status(404).json({ error: 'Task not found' }); return }

    // Verify personnel can see this task
    if (actorType === 'personnel') {
      const visibilityFilter = await buildTaskVisibilityFilter(actorType, actorId, workspaceId, layerNumber, departmentId)
      const allowed = await prisma.task.findFirst({
        where: { id: req.params.id, workspaceId, AND: [visibilityFilter] }
      })
      if (!allowed) { res.status(403).json({ error: 'Access denied' }); return }
    }

    const enriched = await resolveActedByName(task as unknown as Record<string, unknown>)
    res.json(enriched)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// GET /api/tasks/:id/subtasks  (supports ?recursive=true for full tree via PostgreSQL CTE)
export async function getSubtasks(req: Request, res: Response): Promise<void> {
  try {
    const { actorId, actorType, workspaceId, layerNumber, departmentId } = req.user!

    if (req.query.recursive === 'true') {
      // Use PostgreSQL recursive CTE to fetch the full subtask tree in one query
      const rows = await prisma.$queryRaw<Array<{ id: string }>>`
        WITH RECURSIVE subtree AS (
          SELECT id FROM "Task"
          WHERE "parentTaskId" = ${req.params.id}
            AND "workspaceId" = ${workspaceId}
            AND "deletedAt" IS NULL
          UNION ALL
          SELECT t.id FROM "Task" t
          INNER JOIN subtree s ON t."parentTaskId" = s.id
          WHERE t."workspaceId" = ${workspaceId}
            AND t."deletedAt" IS NULL
        )
        SELECT id FROM subtree
      `
      const ids = rows.map(r => r.id)
      if (ids.length === 0) { res.json([]); return }

      const visibilityFilter = actorType === 'personnel'
        ? await buildTaskVisibilityFilter(actorType, actorId, workspaceId, layerNumber, departmentId)
        : {}

      const where: Record<string, unknown> = { id: { in: ids }, workspaceId, deletedAt: null }
      const subtasks = await prisma.task.findMany({
        where: Object.keys(visibilityFilter).length > 0 ? { AND: [where, visibilityFilter] } : where,
        include: TASK_INCLUDE,
        orderBy: { createdAt: 'asc' }
      })
      res.json(subtasks)
    } else {
      // Direct children only
      const subtasks = await prisma.task.findMany({
        where: { parentTaskId: req.params.id, workspaceId, deletedAt: null },
        include: TASK_INCLUDE,
        orderBy: { createdAt: 'asc' }
      })
      res.json(subtasks)
    }
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// POST /api/tasks
export async function createTask(req: Request, res: Response): Promise<void> {
  try {
    const { actorId, actorType, workspaceId } = req.user!
    const { title, description, projectId, parentTaskId, priority, deadline } = req.body
    if (!title || !projectId) { res.status(400).json({ error: 'title and projectId required' }); return }

    // Top-level tasks: Director only
    if (!parentTaskId && actorType !== 'director') {
      res.status(403).json({ error: 'Only Directors can create top-level tasks' }); return
    }

    // If subtask, verify parent exists
    if (parentTaskId) {
      const parent = await prisma.task.findFirst({ where: { id: parentTaskId, workspaceId, deletedAt: null } })
      if (!parent) { res.status(404).json({ error: 'Parent task not found' }); return }
    }

    const task = await prisma.$transaction(async tx => {
      const t = await tx.task.create({
        data: {
          workspaceId,
          projectId,
          parentTaskId: parentTaskId || null,
          title,
          description,
          priority: priority || 'MEDIUM',
          deadline: deadline ? new Date(deadline) : undefined,
          deadlineSetById:   deadline ? actorId    : undefined,
          deadlineSetByType: deadline ? actorType  : undefined,
          createdByDirectorId:  actorType === 'director'  ? actorId : undefined,
          createdByPersonnelId: actorType === 'personnel' ? actorId : undefined,
          approvalById:   actorId,
          approvalByType: actorType,
        }
      })
      await writeAudit(tx, workspaceId, parentTaskId ? 'SUBTASK_CREATED' : 'TASK_CREATED', actorType, actorId, t.id, { title })
      return t
    })
    res.status(201).json(task)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// PUT /api/tasks/:id
export async function updateTask(req: Request, res: Response): Promise<void> {
  try {
    const { actorId, actorType, workspaceId } = req.user!
    const task = await prisma.task.findFirst({ where: { id: req.params.id, workspaceId, deletedAt: null } })
    if (!task) { res.status(404).json({ error: 'Task not found' }); return }

    const { title, description, priority, deadline } = req.body

    // Deadline edit: only allowed by whoever set it
    if (deadline !== undefined && task.deadline?.toISOString() !== new Date(deadline).toISOString()) {
      if (task.deadlineSetById && (task.deadlineSetById !== actorId || task.deadlineSetByType !== actorType)) {
        res.status(403).json({ error: 'Only the assigning authority can change the deadline' }); return
      }
    }

    const updated = await prisma.$transaction(async tx => {
      const t = await tx.task.update({
        where: { id: req.params.id },
        data: {
          title,
          description,
          priority,
          deadline: deadline ? new Date(deadline) : undefined,
          deadlineSetById:   deadline ? actorId   : task.deadlineSetById  || undefined,
          deadlineSetByType: deadline ? actorType : task.deadlineSetByType || undefined,
        }
      })
      await writeAudit(tx, workspaceId, 'TASK_UPDATED', actorType, actorId, t.id, req.body)
      return t
    })
    res.json(updated)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// POST /api/tasks/:id/assign
export async function assignTask(req: Request, res: Response): Promise<void> {
  try {
    const { actorId, actorType, workspaceId } = req.user!
    const task = await prisma.task.findFirst({ where: { id: req.params.id, workspaceId, deletedAt: null } })
    if (!task) { res.status(404).json({ error: 'Task not found' }); return }

    const { personnelId, groupId, departmentId } = req.body
    const set = [personnelId, groupId, departmentId].filter(Boolean)
    if (set.length !== 1) { res.status(400).json({ error: 'Specify exactly one of personnelId, groupId, or departmentId' }); return }

    await prisma.$transaction(async tx => {
      await tx.taskAssignment.create({ data: { taskId: task.id, personnelId, groupId, departmentId } })
      await tx.task.update({ where: { id: task.id }, data: { status: 'ASSIGNED' } })
      await writeAudit(tx, workspaceId, 'TASK_ASSIGNED', actorType, actorId, task.id, { personnelId, groupId, departmentId })
      if (personnelId) {
        await notifyActor(tx, workspaceId, 'personnel', personnelId, 'task_assigned', 'New task assigned', `You have been assigned: "${task.title}"`, task.id)
      }
    })
    res.json({ success: true })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// POST /api/tasks/:id/start
export async function startTask(req: Request, res: Response): Promise<void> {
  try {
    const { actorId, actorType, workspaceId } = req.user!
    const task = await prisma.task.findFirst({ where: { id: req.params.id, workspaceId, deletedAt: null } })
    if (!task) { res.status(404).json({ error: 'Task not found' }); return }
    if (task.status !== 'ASSIGNED') { res.status(400).json({ error: 'Task must be in ASSIGNED status' }); return }
    await prisma.$transaction(async tx => {
      await tx.task.update({
        where: { id: task.id },
        data: {
          status: 'IN_PROGRESS',
          actedById: actorId,
          actedByType: actorType,
        }
      })
      await writeAudit(tx, workspaceId, 'TASK_STARTED', actorType, actorId, task.id, { actedBy: actorId })
    })
    res.json({ success: true })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// POST /api/tasks/:id/submit
export async function submitTask(req: Request, res: Response): Promise<void> {
  try {
    const { actorId, actorType, workspaceId } = req.user!
    const task = await prisma.task.findFirst({ where: { id: req.params.id, workspaceId, deletedAt: null } })
    if (!task) { res.status(404).json({ error: 'Task not found' }); return }
    if (task.status !== 'IN_PROGRESS') { res.status(400).json({ error: 'Task must be IN_PROGRESS to submit' }); return }

    // Check ALL subtasks at all levels are approved (recursive CTE)
    // CANCELLED and BLOCKED tasks are excluded — cancelled are skipped, blocked are flagged
    const deepSubtasks = await prisma.$queryRaw<Array<{ id: string; status: string; title: string }>>`
      WITH RECURSIVE subtree AS (
        SELECT id, status, title FROM "Task"
        WHERE "parentTaskId" = ${task.id}
          AND "workspaceId" = ${workspaceId}
          AND "deletedAt" IS NULL
          AND status != 'CANCELLED'
        UNION ALL
        SELECT t.id, t.status, t.title FROM "Task" t
        INNER JOIN subtree s ON t."parentTaskId" = s.id
        WHERE t."workspaceId" = ${workspaceId}
          AND t."deletedAt" IS NULL
          AND t.status != 'CANCELLED'
      )
      SELECT id, status, title FROM subtree WHERE status != 'APPROVED'
    `

    if (deepSubtasks.length > 0) {
      res.status(400).json({
        error: 'All subtasks at all levels must be APPROVED before submitting',
        blockingSubtasks: deepSubtasks.map(t => ({ id: t.id, title: t.title, status: t.status }))
      })
      return
    }

    await prisma.$transaction(async tx => {
      await tx.task.update({
        where: { id: task.id },
        data: {
          status: 'SUBMITTED',
          actedById: actorId,
          actedByType: actorType,
        }
      })
      await writeAudit(tx, workspaceId, 'TASK_SUBMITTED', actorType, actorId, task.id, { actedBy: actorId })
      if (task.approvalById && task.approvalByType) {
        await notifyActor(tx, workspaceId, task.approvalByType as 'director' | 'personnel', task.approvalById, 'task_submitted_for_approval', 'Task ready for approval', `"${task.title}" has been submitted for your approval.`, task.id)
      }
    })
    res.json({ success: true })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// POST /api/tasks/:id/block  (IN_PROGRESS → BLOCKED)
export async function blockTask(req: Request, res: Response): Promise<void> {
  try {
    const { actorId, actorType, workspaceId } = req.user!
    const { reason } = req.body
    if (!reason) { res.status(400).json({ error: 'reason required' }); return }
    const task = await prisma.task.findFirst({ where: { id: req.params.id, workspaceId, deletedAt: null } })
    if (!task) { res.status(404).json({ error: 'Task not found' }); return }
    if (task.status !== 'IN_PROGRESS') { res.status(400).json({ error: 'Task must be IN_PROGRESS to block' }); return }
    await prisma.$transaction(async tx => {
      await tx.task.update({ where: { id: task.id }, data: { status: 'BLOCKED', returnReason: reason } })
      await writeAudit(tx, workspaceId, 'TASK_BLOCKED', actorType, actorId, task.id, { reason })
      // Notify approval authority that the task is blocked
      if (task.approvalById && task.approvalByType) {
        await notifyActor(tx, workspaceId, task.approvalByType as 'director' | 'personnel', task.approvalById, 'task_returned', 'Task blocked', `"${task.title}" is blocked: ${reason}`, task.id)
      }
    })
    res.json({ success: true })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// POST /api/tasks/:id/unblock  (BLOCKED → IN_PROGRESS)
export async function unblockTask(req: Request, res: Response): Promise<void> {
  try {
    const { actorId, actorType, workspaceId } = req.user!
    const task = await prisma.task.findFirst({ where: { id: req.params.id, workspaceId, deletedAt: null } })
    if (!task) { res.status(404).json({ error: 'Task not found' }); return }
    if (task.status !== 'BLOCKED') { res.status(400).json({ error: 'Task must be BLOCKED to unblock' }); return }
    await prisma.$transaction(async tx => {
      await tx.task.update({ where: { id: task.id }, data: { status: 'IN_PROGRESS', returnReason: null } })
      await writeAudit(tx, workspaceId, 'TASK_UNBLOCKED', actorType, actorId, task.id)
    })
    res.json({ success: true })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// POST /api/tasks/:id/return
export async function returnTask(req: Request, res: Response): Promise<void> {
  try {
    const { actorId, actorType, workspaceId } = req.user!
    const { reason } = req.body
    if (!reason) { res.status(400).json({ error: 'reason required' }); return }
    const task = await prisma.task.findFirst({ where: { id: req.params.id, workspaceId, deletedAt: null } })
    if (!task) { res.status(404).json({ error: 'Task not found' }); return }
    if (task.status !== 'IN_PROGRESS') { res.status(400).json({ error: 'Task must be IN_PROGRESS to return' }); return }
    await prisma.$transaction(async tx => {
      await tx.task.update({
        where: { id: task.id },
        data: {
          status: 'RETURNED',
          returnReason: reason,
          returnedAt: new Date(),
          actedById: actorId,
          actedByType: actorType,
        }
      })
      await writeAudit(tx, workspaceId, 'TASK_RETURNED', actorType, actorId, task.id, { reason, actedBy: actorId })
      if (task.approvalById && task.approvalByType) {
        await notifyActor(tx, workspaceId, task.approvalByType as 'director' | 'personnel', task.approvalById, 'task_returned', 'Task returned', `"${task.title}" was returned: ${reason}`, task.id)
      }
    })
    res.json({ success: true })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// POST /api/tasks/:id/approve
export async function approveTask(req: Request, res: Response): Promise<void> {
  try {
    const { actorId, actorType, workspaceId } = req.user!
    const task = await prisma.task.findFirst({ where: { id: req.params.id, workspaceId, deletedAt: null } })
    if (!task) { res.status(404).json({ error: 'Task not found' }); return }
    if (task.status !== 'SUBMITTED') { res.status(400).json({ error: 'Task must be SUBMITTED to approve' }); return }
    if (task.approvalById !== actorId || task.approvalByType !== actorType) {
      res.status(403).json({ error: 'Only the assigning authority can approve this task' }); return
    }
    await prisma.$transaction(async tx => {
      await tx.task.update({ where: { id: task.id }, data: { status: 'APPROVED' } })
      await writeAudit(tx, workspaceId, 'TASK_APPROVED', actorType, actorId, task.id)

      // If this task has a parent, notify the parent's assignee that one subtask is now approved
      if (task.parentTaskId) {
        const parent = await tx.task.findUnique({ where: { id: task.parentTaskId } })
        if (parent?.approvalById && parent?.approvalByType) {
          // Check if all sibling subtasks are now approved
          const stillBlocking = await prisma.$queryRaw<Array<{ id: string }>>`
            WITH RECURSIVE subtree AS (
              SELECT id, status FROM "Task"
              WHERE "parentTaskId" = ${parent.id}
                AND "workspaceId" = ${workspaceId}
                AND "deletedAt" IS NULL
                AND "cancelledAt" IS NULL
              UNION ALL
              SELECT t.id, t.status FROM "Task" t
              INNER JOIN subtree s ON t."parentTaskId" = s.id
              WHERE t."workspaceId" = ${workspaceId}
                AND t."deletedAt" IS NULL
                AND t."cancelledAt" IS NULL
            )
            SELECT id FROM subtree WHERE status != 'APPROVED'
          `
          if (stillBlocking.length === 0) {
            // All subtasks done — notify parent task's acted-by person or creator
            const notifyId = parent.actedById || parent.createdByPersonnelId || parent.createdByDirectorId
            const notifyType = parent.actedByType || (parent.createdByPersonnelId ? 'personnel' : 'director')
            if (notifyId) {
              await notifyActor(tx, workspaceId, notifyType as 'director' | 'personnel', notifyId, 'subtask_all_approved', 'All subtasks approved', `All subtasks of "${parent.title}" are now approved. You can submit it for approval.`, parent.id)
            }
          }
        }
      }
    })
    res.json({ success: true })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// POST /api/tasks/:id/reject
export async function rejectTask(req: Request, res: Response): Promise<void> {
  try {
    const { actorId, actorType, workspaceId } = req.user!
    const { reason } = req.body
    const task = await prisma.task.findFirst({ where: { id: req.params.id, workspaceId, deletedAt: null } })
    if (!task) { res.status(404).json({ error: 'Task not found' }); return }
    if (task.status !== 'SUBMITTED') { res.status(400).json({ error: 'Task must be SUBMITTED to reject' }); return }
    if (task.approvalById !== actorId || task.approvalByType !== actorType) {
      res.status(403).json({ error: 'Only the assigning authority can reject this task' }); return
    }
    await prisma.$transaction(async tx => {
      await tx.task.update({ where: { id: task.id }, data: { status: 'REJECTED', returnReason: reason } })
      await writeAudit(tx, workspaceId, 'TASK_REJECTED', actorType, actorId, task.id, { reason })
      // Notify the person who actually submitted it
      if (task.actedById && task.actedByType && task.actedById !== actorId) {
        await notifyActor(tx, workspaceId, task.actedByType as 'director' | 'personnel', task.actedById, 'task_rejected', 'Task rejected', `"${task.title}" was rejected${reason ? ': ' + reason : ''}.`, task.id)
      }
    })
    res.json({ success: true })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// POST /api/tasks/:id/reopen
export async function reopenTask(req: Request, res: Response): Promise<void> {
  try {
    const { actorId, actorType, workspaceId } = req.user!
    const task = await prisma.task.findFirst({ where: { id: req.params.id, workspaceId, deletedAt: null } })
    if (!task) { res.status(404).json({ error: 'Task not found' }); return }
    if (task.status !== 'REJECTED') { res.status(400).json({ error: 'Task must be REJECTED to reopen' }); return }
    await prisma.$transaction(async tx => {
      await tx.task.update({
        where: { id: task.id },
        data: {
          status: 'IN_PROGRESS',
          returnReason: null,
          actedById: actorId,
          actedByType: actorType,
        }
      })
      await writeAudit(tx, workspaceId, 'TASK_UPDATED', actorType, actorId, task.id, { action: 'reopened' })
    })
    res.json({ success: true })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// POST /api/tasks/:id/cancel
export async function cancelTask(req: Request, res: Response): Promise<void> {
  try {
    if (req.user!.actorType !== 'director') { res.status(403).json({ error: 'Director only' }); return }
    const { actorId, actorType, workspaceId } = req.user!
    const { reason } = req.body
    const task = await prisma.task.findFirst({ where: { id: req.params.id, workspaceId, deletedAt: null } })
    if (!task) { res.status(404).json({ error: 'Task not found' }); return }
    await prisma.$transaction(async tx => {
      await tx.task.update({ where: { id: task.id }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason } })
      await writeAudit(tx, workspaceId, 'TASK_CANCELLED', actorType, actorId, task.id, { reason })
    })
    res.json({ success: true })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// DELETE /api/tasks/:id  (soft delete, Director only)
export async function deleteTask(req: Request, res: Response): Promise<void> {
  try {
    if (req.user!.actorType !== 'director') { res.status(403).json({ error: 'Director only' }); return }
    const { actorId, actorType, workspaceId } = req.user!
    const task = await prisma.task.findFirst({ where: { id: req.params.id, workspaceId } })
    if (!task) { res.status(404).json({ error: 'Task not found' }); return }
    await prisma.$transaction(async tx => {
      await tx.task.update({ where: { id: task.id }, data: { deletedAt: new Date() } })
      await writeAudit(tx, workspaceId, 'TASK_DELETED', actorType, actorId, task.id)
    })
    res.json({ success: true })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// GET /api/tasks/:id/comments
export async function getComments(req: Request, res: Response): Promise<void> {
  try {
    const comments = await prisma.taskComment.findMany({
      where: { taskId: req.params.id, deletedAt: null },
      include: {
        authorDirector:  { select: { id: true, name: true } },
        authorPersonnel: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' }
    })
    // Flatten authorName for the frontend
    const result = comments.map(c => ({
      ...c,
      authorName: c.authorDirector?.name || c.authorPersonnel?.name || null,
    }))
    res.json(result)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// POST /api/tasks/:id/comments
export async function addComment(req: Request, res: Response): Promise<void> {
  try {
    const { actorId, actorType, workspaceId } = req.user!
    const { content } = req.body
    if (!content) { res.status(400).json({ error: 'content required' }); return }
    const task = await prisma.task.findFirst({ where: { id: req.params.id, workspaceId, deletedAt: null } })
    if (!task) { res.status(404).json({ error: 'Task not found' }); return }
    const comment = await prisma.$transaction(async tx => {
      const c = await tx.taskComment.create({
        data: {
          taskId: task.id,
          content,
          authorType: actorType,
          authorDirectorId:  actorType === 'director'  ? actorId : undefined,
          authorPersonnelId: actorType === 'personnel' ? actorId : undefined,
        }
      })
      await writeAudit(tx, workspaceId, 'COMMENT_ADDED', actorType, actorId, task.id, { commentId: c.id })
      return c
    })
    res.status(201).json(comment)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// GET /api/tasks/:id/history
export async function getTaskHistory(req: Request, res: Response): Promise<void> {
  try {
    const logs = await prisma.auditLog.findMany({
      where: { taskId: req.params.id, workspaceId: req.user!.workspaceId },
      include: {
        actorDirector:  { select: { id: true, name: true } },
        actorPersonnel: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' }
    })
    res.json(logs)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}
