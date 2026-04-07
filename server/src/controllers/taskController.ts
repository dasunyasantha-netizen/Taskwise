import { Request, Response } from 'express'
import prisma from '../prisma'

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

async function writeAudit(workspaceId: string, event: string, actorType: 'director' | 'personnel', actorId: string, taskId?: string, payload?: object) {
  await prisma.auditLog.create({
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

async function notifyActor(workspaceId: string, recipientType: 'director' | 'personnel', recipientId: string, type: string, title: string, message: string, taskId?: string) {
  await prisma.notification.create({
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
    const { projectId, status, parentTaskId, overdue } = req.query as Record<string, string>
    const where: Record<string, unknown> = { workspaceId: req.user!.workspaceId, deletedAt: null }
    if (projectId) where.projectId = projectId
    if (status)    where.status    = status
    if (parentTaskId === 'null') where.parentTaskId = null
    else if (parentTaskId)       where.parentTaskId = parentTaskId
    if (overdue === 'true') where.deadline = { lt: new Date() }
    const tasks = await prisma.task.findMany({ where, include: TASK_INCLUDE, orderBy: [{ deadline: 'asc' }, { createdAt: 'desc' }] })
    res.json(tasks)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// GET /api/tasks/:id
export async function getTask(req: Request, res: Response): Promise<void> {
  try {
    const task = await prisma.task.findFirst({
      where: { id: req.params.id, workspaceId: req.user!.workspaceId },
      include: { ...TASK_INCLUDE, subtasks: { include: TASK_INCLUDE }, parent: true }
    })
    if (!task) { res.status(404).json({ error: 'Task not found' }); return }
    res.json(task)
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

    // If subtask, verify parent exists and actor has access
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
      await writeAudit(workspaceId, parentTaskId ? 'SUBTASK_CREATED' : 'TASK_CREATED', actorType, actorId, t.id, { title })
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
      await writeAudit(workspaceId, 'TASK_UPDATED', actorType, actorId, t.id, req.body)
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
      await writeAudit(workspaceId, 'TASK_ASSIGNED', actorType, actorId, task.id, { personnelId, groupId, departmentId })
      // Notify the assignee
      if (personnelId) {
        await notifyActor(workspaceId, 'personnel', personnelId, 'task_assigned', 'New task assigned', `You have been assigned: "${task.title}"`, task.id)
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
      await tx.task.update({ where: { id: task.id }, data: { status: 'IN_PROGRESS' } })
      await writeAudit(workspaceId, 'TASK_STARTED', actorType, actorId, task.id)
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

    // Check all subtasks are approved
    const blocking = await prisma.task.findMany({
      where: { parentTaskId: task.id, deletedAt: null, status: { not: 'APPROVED' }, cancelledAt: null }
    })
    if (blocking.length > 0) {
      res.status(400).json({ error: 'All subtasks must be APPROVED before submitting', blockingSubtasks: blocking.map(t => ({ id: t.id, title: t.title, status: t.status }) ) }); return
    }

    await prisma.$transaction(async tx => {
      await tx.task.update({ where: { id: task.id }, data: { status: 'SUBMITTED' } })
      await writeAudit(workspaceId, 'TASK_SUBMITTED', actorType, actorId, task.id)
      // Notify approving authority
      if (task.approvalById && task.approvalByType) {
        await notifyActor(workspaceId, task.approvalByType as 'director' | 'personnel', task.approvalById, 'task_submitted_for_approval', 'Task ready for approval', `"${task.title}" has been submitted for your approval.`, task.id)
      }
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
      await tx.task.update({ where: { id: task.id }, data: { status: 'RETURNED', returnReason: reason, returnedAt: new Date() } })
      await writeAudit(workspaceId, 'TASK_RETURNED', actorType, actorId, task.id, { reason })
      if (task.approvalById && task.approvalByType) {
        await notifyActor(workspaceId, task.approvalByType as 'director' | 'personnel', task.approvalById, 'task_returned', 'Task returned', `"${task.title}" was returned: ${reason}`, task.id)
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
      await writeAudit(workspaceId, 'TASK_APPROVED', actorType, actorId, task.id)
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
      await writeAudit(workspaceId, 'TASK_REJECTED', actorType, actorId, task.id, { reason })
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
      await tx.task.update({ where: { id: task.id }, data: { status: 'IN_PROGRESS', returnReason: null } })
      await writeAudit(workspaceId, 'TASK_UPDATED', actorType, actorId, task.id, { action: 'reopened' })
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
      await writeAudit(workspaceId, 'TASK_CANCELLED', actorType, actorId, task.id, { reason })
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
      await writeAudit(workspaceId, 'TASK_DELETED', actorType, actorId, task.id)
    })
    res.json({ success: true })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// GET /api/tasks/:id/subtasks
export async function getSubtasks(req: Request, res: Response): Promise<void> {
  try {
    const subtasks = await prisma.task.findMany({
      where: { parentTaskId: req.params.id, workspaceId: req.user!.workspaceId, deletedAt: null },
      include: TASK_INCLUDE,
      orderBy: { createdAt: 'asc' }
    })
    res.json(subtasks)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// GET /api/tasks/:id/comments
export async function getComments(req: Request, res: Response): Promise<void> {
  try {
    const comments = await prisma.taskComment.findMany({
      where: { taskId: req.params.id, deletedAt: null },
      orderBy: { createdAt: 'asc' }
    })
    res.json(comments)
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
      await writeAudit(workspaceId, 'COMMENT_ADDED', actorType, actorId, task.id, { commentId: c.id })
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
      orderBy: { createdAt: 'asc' }
    })
    res.json(logs)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}
