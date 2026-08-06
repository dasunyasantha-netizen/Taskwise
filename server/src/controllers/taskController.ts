import { Request, Response } from 'express'
import prisma from '../prisma'
import { buildTaskVisibilityFilter } from '../helpers/visibility'
import { sendPushToActor } from '../helpers/push'
import type { AuthPayload } from '../middleware/authMiddleware'

const TASK_INCLUDE = {
  project: { include: { category: { select: { id: true, name: true, color: true, status: true } } } },
  parent: { select: { id: true, title: true } },
  assignments: {
    include: {
      personnel: { select: { id: true, name: true, avatarUrl: true } },
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

async function writeAudit(
  db: TxClient | typeof prisma,
  workspaceId: string,
  event: string,
  actorType: 'director' | 'personnel',
  actorId: string,
  taskId?: string,
  payload?: object,
  user?: AuthPayload,
) {
  const isImp = !!(user?.adminId)
  const impPayload = isImp
    ? { _impersonatedBy: user!.adminName ?? user!.adminId, _impersonationSessionId: user!.impersonationSessionId, _viewingAs: actorId }
    : {}
  await db.auditLog.create({
    data: {
      workspaceId,
      event,
      // During support access, audit actor is the System Admin, not the target user.
      actorType: isImp ? 'director' : actorType,
      actorDirectorId:  isImp ? user!.adminId : (actorType === 'director' ? actorId : undefined),
      actorPersonnelId: isImp ? undefined         : (actorType === 'personnel' ? actorId : undefined),
      taskId,
      payload: { ...payload, ...impPayload },
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
  // Fire-and-forget push notification
  sendPushToActor(recipientId, recipientType, title, message)
}

// A real work action by an assignee means the task has started, regardless of
// which desktop/mobile surface the action came from. Administrative actions
// such as reassignment and return intentionally do not call this helper.
async function startAssignedTaskForActivity(
  db: TxClient,
  taskId: string,
  workspaceId: string,
  user: AuthPayload,
  trigger: 'progress_update' | 'comment' | 'subtask' | 'task_edit' | 'deadline_extension',
): Promise<boolean> {
  if (user.actorType !== 'personnel') return false

  const task = await db.task.findFirst({
    where: { id: taskId, workspaceId, status: 'ASSIGNED', deletedAt: null },
    select: { id: true, title: true, approvalById: true, approvalByType: true },
  })
  if (!task) return false

  const assignments = await db.taskAssignment.findMany({
    where: {
      taskId,
      OR: [
        { personnelId: user.actorId },
        ...(user.departmentId ? [{ departmentId: user.departmentId }] : []),
      ],
    },
    select: { id: true, personnelId: true, departmentId: true },
  })
  const assignment = assignments.find(item => item.personnelId === user.actorId)
    ?? assignments.find(item => item.departmentId === user.departmentId)
  if (!assignment) return false

  const started = await db.task.updateMany({
    where: { id: taskId, workspaceId, status: 'ASSIGNED' },
    data: {
      status: 'IN_PROGRESS',
      actedById: user.actorId,
      actedByType: 'personnel',
      startedAt: new Date(),
    },
  })
  if (started.count === 0) return false

  // Claim a department-level task for the member who performed the work.
  if (!assignment.personnelId && assignment.departmentId) {
    await db.taskAssignment.delete({ where: { id: assignment.id } })
    const existingPersonal = await db.taskAssignment.findFirst({ where: { taskId, personnelId: user.actorId }, select: { id: true } })
    if (!existingPersonal) {
      await db.taskAssignment.create({ data: { taskId, personnelId: user.actorId } })
    }
  }

  await writeAudit(db, workspaceId, 'TASK_STARTED', 'personnel', user.actorId, taskId, { actedBy: user.actorId, trigger }, user)
  if (task.approvalById && task.approvalByType) {
    await notifyActor(
      db,
      workspaceId,
      task.approvalByType as 'director' | 'personnel',
      task.approvalById,
      'task_assigned',
      'Task started',
      `Work has started on "${task.title}".`,
      taskId,
    )
  }
  return true
}

// GET /api/tasks
export async function listTasks(req: Request, res: Response): Promise<void> {
  try {
    const { actorId, actorType, workspaceId, layerNumber, departmentId } = req.user!
    const {
      projectId, status, parentTaskId, overdue,
      filterPersonnelId, filterDepartmentId, filterLayerNumber,
      deadlineFrom, deadlineTo, createdFrom, createdTo,
    } = req.query as Record<string, string>

    const baseWhere: Record<string, unknown> = { workspaceId, deletedAt: null }
    if (projectId) baseWhere.projectId = projectId
    if (status)    baseWhere.status    = status
    if (parentTaskId === 'null') baseWhere.parentTaskId = null
    else if (parentTaskId)       baseWhere.parentTaskId = parentTaskId
    if (overdue === 'true') baseWhere.deadline = { lt: new Date() }

    // Cascading filter params sent from the project filter view
    if (filterPersonnelId) {
      baseWhere.assignments = { some: { personnelId: filterPersonnelId } }
    } else if (filterDepartmentId) {
      baseWhere.assignments = { some: { OR: [
        { departmentId: filterDepartmentId },
        { personnel: { departmentId: filterDepartmentId } },
      ] } }
    } else if (filterLayerNumber) {
      const num = parseInt(filterLayerNumber)
      const layer = await prisma.layer.findFirst({
        where: { workspaceId, number: num },
        include: { departments: { select: { id: true } } }
      })
      const deptIds = layer?.departments.map(d => d.id) ?? []
      if (deptIds.length > 0) {
        baseWhere.assignments = { some: { OR: [
          { departmentId: { in: deptIds } },
          { personnel: { departmentId: { in: deptIds } } },
        ] } }
      }
    }

    if (deadlineFrom || deadlineTo) {
      const df: Record<string, Date> = {}
      if (deadlineFrom) df.gte = new Date(deadlineFrom)
      if (deadlineTo)   df.lte = new Date(deadlineTo + 'T23:59:59')
      baseWhere.deadline = df
    }
    if (createdFrom || createdTo) {
      const cf: Record<string, Date> = {}
      if (createdFrom) cf.gte = new Date(createdFrom)
      if (createdTo)   cf.lte = new Date(createdTo + 'T23:59:59')
      baseWhere.createdAt = cf
    }

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

    // If subtask, verify parent exists and deadline constraint
    let parentTask: { id: string; deadline: Date | null } | null = null
    if (parentTaskId) {
      parentTask = await prisma.task.findFirst({
        where: { id: parentTaskId, workspaceId, deletedAt: null },
        select: { id: true, deadline: true },
      })
      if (!parentTask) { res.status(404).json({ error: 'Parent task not found' }); return }
      if (deadline && parentTask.deadline && new Date(deadline) > parentTask.deadline) {
        res.status(400).json({ error: `Subtask deadline cannot be after the parent task deadline (${parentTask.deadline.toISOString().slice(0, 10)})` }); return
      }
    }

    const task = await prisma.$transaction(async tx => {
      if (parentTask) {
        await startAssignedTaskForActivity(tx, parentTask.id, workspaceId, req.user!, 'subtask')
      }
      const t = await tx.task.create({
        data: {
          workspaceId,
          projectId,
          parentTaskId: parentTaskId || null,
          title,
          description,
          priority: priority || 'MEDIUM',
          deadline:         deadline ? new Date(deadline) : undefined,
          originalDeadline: deadline ? new Date(deadline) : undefined,
          deadlineSetById:   deadline ? actorId    : undefined,
          deadlineSetByType: deadline ? actorType  : undefined,
          createdByDirectorId:  actorType === 'director'  ? actorId : undefined,
          createdByPersonnelId: actorType === 'personnel' ? actorId : undefined,
          approvalById:   actorId,
          approvalByType: actorType,
        }
      })
      await writeAudit(tx, workspaceId, parentTaskId ? 'SUBTASK_CREATED' : 'TASK_CREATED', actorType, actorId, t.id, { title }, req.user!)
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

    const { title, description, priority, deadline, reassignPersonnelId } = req.body

    // Deadline edit: only allowed by whoever set it
    // Compare date-only (YYYY-MM-DD) to avoid false positives from time/timezone differences
    const existingDeadlineDate = task.deadline ? task.deadline.toISOString().slice(0, 10) : null
    const incomingDeadlineDate = deadline ? new Date(deadline).toISOString().slice(0, 10) : null
    const deadlineChanged = deadline !== undefined && existingDeadlineDate !== incomingDeadlineDate
    if (deadlineChanged) {
      if (task.deadlineSetById && (task.deadlineSetById !== actorId || task.deadlineSetByType !== actorType)) {
        res.status(403).json({ error: 'Only the assigning authority can change the deadline' }); return
      }
    }

    // Reassign: validate target personnel exists in workspace
    if (reassignPersonnelId) {
      if (actorType !== 'director') { res.status(403).json({ error: 'Only directors can reassign tasks' }); return }
      const target = await prisma.personnel.findFirst({ where: { id: reassignPersonnelId, workspaceId, deletedAt: null } })
      if (!target) { res.status(404).json({ error: 'Personnel not found' }); return }
    }

    const updated = await prisma.$transaction(async tx => {
      if (!reassignPersonnelId) {
        await startAssignedTaskForActivity(tx, task.id, workspaceId, req.user!, 'task_edit')
      }
      const t = await tx.task.update({
        where: { id: req.params.id },
        data: {
          title:       title       ?? task.title,
          description: description ?? task.description,
          priority:    priority    ?? task.priority,
          deadline: deadline !== undefined ? (deadline ? new Date(deadline) : null) : task.deadline,
          deadlineSetById:   deadline ? actorId   : task.deadlineSetById  || undefined,
          deadlineSetByType: deadline ? actorType : task.deadlineSetByType || undefined,
        }
      })

      const editorName = actorType === 'director'
        ? (await tx.director.findUnique({ where: { id: actorId }, select: { name: true } }))?.name ?? 'Director'
        : (await tx.personnel.findUnique({ where: { id: actorId }, select: { name: true } }))?.name ?? 'Someone'

      // Handle reassignment: replace all existing assignments with the new person
      if (reassignPersonnelId) {
        const oldAssignments = await tx.taskAssignment.findMany({ where: { taskId: task.id } })
        // Notify old assignees they've been removed
        for (const a of oldAssignments) {
          if (a.personnelId && a.personnelId !== reassignPersonnelId) {
            await notifyActor(tx, workspaceId, 'personnel', a.personnelId, 'task_updated', 'Task Reassigned',
              `"${t.title}" has been reassigned by ${editorName}`, t.id)
          }
        }
        await tx.taskAssignment.deleteMany({ where: { taskId: task.id } })
        await tx.taskAssignment.create({ data: { taskId: task.id, personnelId: reassignPersonnelId } })
        // Notify new assignee
        await notifyActor(tx, workspaceId, 'personnel', reassignPersonnelId, 'task_assigned', 'Task Assigned',
          `You have been assigned: "${t.title}"`, t.id)
        await writeAudit(tx, workspaceId, 'TASK_REASSIGNED', actorType, actorId, t.id, { reassignedTo: reassignPersonnelId }, req.user!)
      } else {
        // Regular update — notify existing assignees
        const assignments = await tx.taskAssignment.findMany({ where: { taskId: task.id } })
        const notifyMsg = `"${t.title}" was updated by ${editorName}`
        for (const a of assignments) {
          if (a.personnelId && a.personnelId !== actorId) {
            await notifyActor(tx, workspaceId, 'personnel', a.personnelId, 'task_updated', 'Task Updated', notifyMsg, t.id)
          }
        }
        if (actorType === 'personnel') {
          const workspace = await tx.workspace.findUnique({ where: { id: workspaceId }, include: { director: { select: { id: true } } } })
          if (workspace?.director?.id) {
            await notifyActor(tx, workspaceId, 'director', workspace.director.id, 'task_updated', 'Task Updated', notifyMsg, t.id)
          }
        }
      }

      await writeAudit(tx, workspaceId, 'TASK_UPDATED', actorType, actorId, t.id, req.body, req.user!)
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

    const { personnelId, departmentId } = req.body
    const set = [personnelId, departmentId].filter(Boolean)
    if (set.length !== 1) { res.status(400).json({ error: 'Specify exactly one of personnelId or departmentId' }); return }

    await prisma.$transaction(async tx => {
      await tx.taskAssignment.create({ data: { taskId: task.id, personnelId, departmentId } })
      await tx.task.update({ where: { id: task.id }, data: { status: 'ASSIGNED' } })
      await writeAudit(tx, workspaceId, 'TASK_ASSIGNED', actorType, actorId, task.id, { personnelId, departmentId }, req.user!)
      if (personnelId) {
        await notifyActor(tx, workspaceId, 'personnel', personnelId, 'task_assigned', 'New task assigned', `You have been assigned: "${task.title}"`, task.id)
      }
    })
    res.json({ success: true })
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'P2002') { res.status(409).json({ error: 'Already assigned to this person or department' }); return }
    console.error(err); res.status(500).json({ error: 'Internal server error' })
  }
}

// POST /api/tasks/:id/accept
// Personnel accepts a department-assigned task — removes dept assignment, creates personal assignment, moves to IN_PROGRESS
export async function acceptTask(req: Request, res: Response): Promise<void> {
  try {
    const { actorId, actorType, workspaceId, departmentId } = req.user!
    if (actorType !== 'personnel') { res.status(403).json({ error: 'Only personnel can accept tasks' }); return }

    const task = await prisma.task.findFirst({
      where: { id: req.params.id, workspaceId, deletedAt: null },
      include: { assignments: true }
    })
    if (!task) { res.status(404).json({ error: 'Task not found' }); return }
    if (task.status !== 'ASSIGNED') { res.status(400).json({ error: 'Task is no longer available to accept' }); return }

    // Case 1: directly assigned to this personnel
    const personalAssignment = task.assignments.find(a => a.personnelId === actorId)
    // Case 2: assigned to this personnel's department (no personal assignment yet)
    const deptAssignment = !personalAssignment
      ? task.assignments.find(a => a.departmentId === departmentId)
      : null

    if (!personalAssignment && !deptAssignment) {
      res.status(403).json({ error: 'This task is not assigned to you or your department' }); return
    }
    if (!personalAssignment) {
      // dept path: check nobody else has already accepted
      const alreadyAccepted = task.assignments.some(a => a.personnelId)
      if (alreadyAccepted) { res.status(409).json({ error: 'This task has already been accepted by someone else' }); return }
    }

    await prisma.$transaction(async tx => {
      if (deptAssignment) {
        // Replace dept assignment with personal assignment
        await tx.taskAssignment.delete({ where: { id: deptAssignment.id } })
        await tx.taskAssignment.create({ data: { taskId: task.id, personnelId: actorId } })
      }
      // If already personally assigned, just update status
      await tx.task.update({
        where: { id: task.id },
        data: { status: 'IN_PROGRESS', actedById: actorId, actedByType: 'personnel', startedAt: new Date() }
      })
      await writeAudit(tx, workspaceId, 'TASK_ACCEPTED', 'personnel', actorId, task.id, { acceptedBy: actorId }, req.user!)
      if (task.approvalById && task.approvalByType) {
        await notifyActor(tx, workspaceId, task.approvalByType as 'director' | 'personnel', task.approvalById, 'task_assigned',
          'Task accepted', `Your task "${task.title}" has been accepted.`, task.id)
      }
    })
    res.json({ success: true })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// POST /api/tasks/:id/reassign
// Personnel reassigns their personally-assigned task to another personnel (not dept/group/layer)
export async function reassignTask(req: Request, res: Response): Promise<void> {
  try {
    const { actorId, actorType, workspaceId } = req.user!
    if (actorType !== 'personnel') { res.status(403).json({ error: 'Only personnel can use this endpoint' }); return }

    const { personnelId, reason } = req.body
    if (!personnelId) { res.status(400).json({ error: 'personnelId required' }); return }
    if (!reason)      { res.status(400).json({ error: 'reason required' }); return }
    if (personnelId === actorId) { res.status(400).json({ error: 'Cannot reassign to yourself' }); return }

    const task = await prisma.task.findFirst({
      where: { id: req.params.id, workspaceId, deletedAt: null },
      include: { assignments: true }
    })
    if (!task) { res.status(404).json({ error: 'Task not found' }); return }

    // Assignee can reassign; creator (approvalById) can also reassign/assign a PENDING subtask
    const myAssignment = task.assignments.find(a => a.personnelId === actorId)
    const isCreator = task.approvalById === actorId && task.approvalByType === 'personnel'

    if (!myAssignment && !isCreator) {
      res.status(403).json({ error: 'You are not assigned to or the creator of this task' }); return
    }
    if (!['PENDING', 'ASSIGNED', 'IN_PROGRESS'].includes(task.status)) {
      res.status(400).json({ error: 'Task cannot be reassigned in its current status' }); return
    }

    // Verify target personnel exists in same workspace
    const targetPersonnel = await prisma.personnel.findFirst({
      where: { id: personnelId, workspaceId, deletedAt: null }
    })
    if (!targetPersonnel) { res.status(404).json({ error: 'Personnel not found' }); return }

    await prisma.$transaction(async tx => {
      if (myAssignment) {
        await tx.taskAssignment.delete({ where: { id: myAssignment.id } })
      } else {
        // Creator assigning a PENDING subtask — delete any existing unassigned assignment
        await tx.taskAssignment.deleteMany({ where: { taskId: task.id } })
      }
      await tx.taskAssignment.create({ data: { taskId: task.id, personnelId } })
      await tx.task.update({
        where: { id: task.id },
        data: { status: 'ASSIGNED', actedById: actorId, actedByType: 'personnel' }
      })
      await writeAudit(tx, workspaceId, 'TASK_REASSIGNED', 'personnel', actorId, task.id, { reason, reassignedTo: personnelId }, req.user!)
      await notifyActor(tx, workspaceId, 'personnel', personnelId, 'task_assigned',
        'Task assigned to you', `"${task.title}" was reassigned to you.`, task.id)
      // Notify approval authority
      if (task.approvalById && task.approvalByType) {
        await notifyActor(tx, workspaceId, task.approvalByType as 'director' | 'personnel', task.approvalById, 'task_assigned',
          'Task reassigned', `"${task.title}" was reassigned to ${targetPersonnel.name}: ${reason}`, task.id)
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
          startedAt: new Date(),
        }
      })
      await writeAudit(tx, workspaceId, 'TASK_STARTED', actorType, actorId, task.id, { actedBy: actorId }, req.user!)
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

    // Check all subtasks are at least SUBMITTED or APPROVED (not still in progress/pending)
    // CANCELLED subtasks are excluded. SUBMITTED is allowed — they are pending approval.
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
      SELECT id, status, title FROM subtree WHERE status NOT IN ('APPROVED', 'SUBMITTED')
    `

    if (deepSubtasks.length > 0) {
      res.status(400).json({
        error: 'All subtasks must be completed (submitted or approved) before submitting this task',
        blockingSubtasks: deepSubtasks.map(t => ({ id: t.id, title: t.title, status: t.status }))
      })
      return
    }

    // ── Resolve approval chain ────────────────────────────────────────────────
    // For personnel submitting a subtask: route to their direct supervisor.
    // Walk up the supervisor chain until we find someone, or fall back to Director.
    let newApprovalById   = task.approvalById
    let newApprovalByType = task.approvalByType

    if (actorType === 'personnel') {
      // Find this person's supervisor chain
      const actor = await prisma.personnel.findUnique({
        where: { id: actorId },
        select: { supervisorId: true }
      })
      if (actor?.supervisorId) {
        newApprovalById   = actor.supervisorId
        newApprovalByType = 'personnel'
      } else {
        // No supervisor set — escalate to Director
        const director = await prisma.director.findFirst({ where: { workspaceId } })
        if (director) {
          newApprovalById   = director.id
          newApprovalByType = 'director'
        }
      }
    }

    await prisma.$transaction(async tx => {
      await tx.task.update({
        where: { id: task.id },
        data: {
          status: 'SUBMITTED',
          actedById: actorId,
          actedByType: actorType,
          approvalById:   newApprovalById,
          approvalByType: newApprovalByType,
        }
      })
      await writeAudit(tx, workspaceId, 'TASK_SUBMITTED', actorType, actorId, task.id, { actedBy: actorId }, req.user!)
      if (newApprovalById && newApprovalByType) {
        await notifyActor(tx, workspaceId, newApprovalByType as 'director' | 'personnel', newApprovalById, 'task_submitted_for_approval', 'Task ready for approval', `"${task.title}" has been submitted for your approval.`, task.id)
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
      await writeAudit(tx, workspaceId, 'TASK_BLOCKED', actorType, actorId, task.id, { reason }, req.user!)
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
      await writeAudit(tx, workspaceId, 'TASK_UNBLOCKED', actorType, actorId, task.id, undefined, req.user!)
    })
    res.json({ success: true })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// POST /api/tasks/:id/return
export async function returnTask(req: Request, res: Response): Promise<void> {
  try {
    const { actorId, actorType, workspaceId } = req.user!
    const { reason } = req.body
    const task = await prisma.task.findFirst({ where: { id: req.params.id, workspaceId, deletedAt: null } })
    if (!task) { res.status(404).json({ error: 'Task not found' }); return }
    if (!['ASSIGNED', 'IN_PROGRESS', 'SUBMITTED'].includes(task.status)) { res.status(400).json({ error: 'Task cannot be returned in its current status' }); return }
    await prisma.$transaction(async tx => {
      await tx.task.update({
        where: { id: task.id },
        data: {
          status: 'RETURNED',
          returnReason: reason || null,
          returnedAt: new Date(),
          actedById: actorId,
          actedByType: actorType,
        }
      })
      await writeAudit(tx, workspaceId, 'TASK_RETURNED', actorType, actorId, task.id, { reason, actedBy: actorId }, req.user!)
      if (task.approvalById && task.approvalByType) {
        await notifyActor(tx, workspaceId, task.approvalByType as 'director' | 'personnel', task.approvalById, 'task_returned', 'Task returned', `"${task.title}" was returned${reason ? ': ' + reason : ''}`, task.id)
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
    // Directors can approve any submitted task; personnel can only approve tasks routed to them
    const isDirector = actorType === 'director'
    if (!isDirector && (task.approvalById !== actorId || task.approvalByType !== actorType)) {
      res.status(403).json({ error: 'Only the assigning authority can approve this task' }); return
    }

    // If the current approver is personnel, check if they have a supervisor to route to next
    let nextApprovalById: string | null = null
    let nextApprovalByType: string | null = null
    if (actorType === 'personnel') {
      const approver = await prisma.personnel.findUnique({ where: { id: actorId }, select: { supervisorId: true } })
      if (approver?.supervisorId) {
        nextApprovalById = approver.supervisorId
        nextApprovalByType = 'personnel'
      } else {
        // No supervisor set — route to director
        const director = await prisma.director.findFirst({ where: { workspaceId } })
        if (director) { nextApprovalById = director.id; nextApprovalByType = 'director' }
      }
    }

    await prisma.$transaction(async tx => {
      if (nextApprovalById && nextApprovalByType) {
        // Route to next level — keep SUBMITTED but change approvalById
        await tx.task.update({ where: { id: task.id }, data: { approvalById: nextApprovalById, approvalByType: nextApprovalByType } })
        await writeAudit(tx, workspaceId, 'TASK_APPROVED', actorType, actorId, task.id, undefined, req.user!)
        // Notify the next approver
        await notifyActor(tx, workspaceId, nextApprovalByType as 'director' | 'personnel', nextApprovalById, 'task_submitted_for_approval', 'Task pending your approval', `"${task.title}" has been approved by ${actorType} and is awaiting your approval.`, task.id)
      } else {
        // Director approving or no further chain — fully approve
        await tx.task.update({ where: { id: task.id }, data: { status: 'APPROVED' } })
        await writeAudit(tx, workspaceId, 'TASK_APPROVED', actorType, actorId, task.id, undefined, req.user!)
      }

      // If this is a group task instance, check if all sibling instances are now approved
      if (task.groupTaskId) {
        const siblings = await tx.task.findMany({
          where: { groupTaskId: task.groupTaskId, deletedAt: null },
          select: { status: true },
        })
        const allApproved = siblings.every(s => s.status === 'APPROVED')
        if (allApproved) {
          await tx.task.update({
            where: { id: task.groupTaskId },
            data: { status: 'APPROVED', approvalById: actorId, approvalByType: actorType },
          })
        }
      }

      // If this task has a parent, notify the parent's assignee that one subtask is now approved
      if (task.parentTaskId) {
        const parent = await tx.task.findUnique({ where: { id: task.parentTaskId } })
        if (parent?.approvalById && parent?.approvalByType) {
          // Check if all sibling subtasks are now approved
          const stillBlocking = await tx.$queryRaw<Array<{ id: string }>>`
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
    if (actorType !== 'director' && (task.approvalById !== actorId || task.approvalByType !== actorType)) {
      res.status(403).json({ error: 'Only the assigning authority can reject this task' }); return
    }
    await prisma.$transaction(async tx => {
      await tx.task.update({ where: { id: task.id }, data: { status: 'REJECTED', returnReason: reason } })
      await writeAudit(tx, workspaceId, 'TASK_REJECTED', actorType, actorId, task.id, { reason }, req.user!)
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
      await writeAudit(tx, workspaceId, 'TASK_UPDATED', actorType, actorId, task.id, { action: 'reopened' }, req.user!)
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
      await writeAudit(tx, workspaceId, 'TASK_CANCELLED', actorType, actorId, task.id, { reason }, req.user!)
    })
    res.json({ success: true })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// POST /api/tasks/:id/change-assignees
// Add/remove assignees. Removing someone cancels their subtasks and writes history.
export async function changeAssignees(req: Request, res: Response): Promise<void> {
  try {
    const { actorId, actorType, workspaceId } = req.user!
    const { add = [], remove = [], reason } = req.body as { add: string[]; remove: string[]; reason: string }

    if (!reason?.trim()) { res.status(400).json({ error: 'reason required' }); return }
    if (!Array.isArray(add) || !Array.isArray(remove)) { res.status(400).json({ error: 'add and remove must be arrays' }); return }
    if (add.length === 0 && remove.length === 0) { res.status(400).json({ error: 'No changes specified' }); return }

    const task = await prisma.task.findFirst({
      where: { id: req.params.id, workspaceId, deletedAt: null },
      include: { assignments: true }
    })
    if (!task) { res.status(404).json({ error: 'Task not found' }); return }
    if (['APPROVED', 'CANCELLED'].includes(task.status)) {
      res.status(400).json({ error: 'Cannot change assignees on a completed task' }); return
    }

    // Only creator (personnel) or director can change assignees
    const isCreator = task.approvalById === actorId && task.approvalByType === 'personnel'
    if (actorType !== 'director' && !isCreator) {
      res.status(403).json({ error: 'Only the task creator or a director can change assignees' }); return
    }

    // Verify all added personnel exist
    if (add.length > 0) {
      const found = await prisma.personnel.findMany({ where: { id: { in: add }, workspaceId, deletedAt: null }, select: { id: true } })
      if (found.length !== add.length) { res.status(404).json({ error: 'One or more personnel to add not found' }); return }
    }

    // Current assignee IDs being removed
    const removedAssignments = task.assignments.filter(a => a.personnelId && remove.includes(a.personnelId))

    // Resolve names for audit log
    const addedNames = add.length > 0
      ? (await prisma.personnel.findMany({ where: { id: { in: add } }, select: { id: true, name: true } })).map(p => p.name)
      : []
    const removedNames = removedAssignments.length > 0
      ? (await prisma.personnel.findMany({ where: { id: { in: removedAssignments.map(a => a.personnelId!).filter(Boolean) } }, select: { id: true, name: true } })).map(p => p.name)
      : []

    await prisma.$transaction(async tx => {
      // Cancel subtasks belonging to removed assignees and write history entries
      for (const assignment of removedAssignments) {
        if (!assignment.personnelId) continue
        const theirSubtasks = await tx.task.findMany({
          where: { parentTaskId: task.id, workspaceId, deletedAt: null, status: { notIn: ['APPROVED', 'CANCELLED'] } },
          include: { assignments: true }
        })
        const owned = theirSubtasks.filter(s => s.assignments.some(a => a.personnelId === assignment.personnelId))
        for (const sub of owned) {
          await tx.task.update({
            where: { id: sub.id },
            data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: `Assignee removed from parent task: ${reason}` }
          })
          await tx.auditLog.create({
            data: {
              workspaceId,
              event: 'TASK_CANCELLED',
              actorType: actorType as 'director' | 'personnel',
              actorDirectorId:  actorType === 'director'  ? actorId : undefined,
              actorPersonnelId: actorType === 'personnel' ? actorId : undefined,
              taskId: sub.id,
              payload: { reason: `Assignee removed from parent task. ${reason}`, autoCancel: true },
            }
          })
        }
        await tx.taskAssignment.delete({ where: { id: assignment.id } })
      }

      // Add new assignees (skip if already assigned)
      const existingIds = new Set(task.assignments.map(a => a.personnelId).filter(Boolean))
      for (const pid of add) {
        if (!existingIds.has(pid)) {
          await tx.taskAssignment.create({ data: { taskId: task.id, personnelId: pid } })
        }
      }

      // Write single audit entry for the parent task change
      await writeAudit(tx, workspaceId, 'ASSIGNEES_CHANGED', actorType as 'director' | 'personnel', actorId, task.id, {
        reason,
        added: addedNames,
        removed: removedNames,
      }, req.user!)

      // Notify newly added people
      for (const pid of add) {
        await notifyActor(tx, workspaceId, 'personnel', pid, 'task_assigned',
          'Task assigned to you', `"${task.title}" has been assigned to you.`, task.id)
      }
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
      await writeAudit(tx, workspaceId, 'TASK_DELETED', actorType, actorId, task.id, undefined, req.user!)
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
      await startAssignedTaskForActivity(tx, task.id, workspaceId, req.user!, 'comment')
      const c = await tx.taskComment.create({
        data: {
          taskId: task.id,
          content,
          authorType: actorType,
          authorDirectorId:  actorType === 'director'  ? actorId : undefined,
          authorPersonnelId: actorType === 'personnel' ? actorId : undefined,
        }
      })
      await writeAudit(tx, workspaceId, 'COMMENT_ADDED', actorType, actorId, task.id, { commentId: c.id }, req.user!)
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

// GET /api/tasks/:id/progress-logs
export async function getProgressLogs(req: Request, res: Response): Promise<void> {
  try {
    const logs = await prisma.taskProgressLog.findMany({
      where: { taskId: req.params.id, workspaceId: req.user!.workspaceId },
      include: {
        authorPersonnel: { select: { id: true, name: true } },
        authorDirector:  { select: { id: true, name: true } },
      },
      orderBy: { logDate: 'asc' }
    })
    const enriched = logs.map(l => ({
      ...l,
      authorName: l.authorPersonnel?.name || l.authorDirector?.name || l.authorType,
    }))
    res.json(enriched)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// POST /api/tasks/:id/extend-deadline
export async function extendDeadline(req: Request, res: Response): Promise<void> {
  try {
    const { actorId, actorType, workspaceId } = req.user!
    const { newDeadline, reason, note } = req.body as { newDeadline: string; reason: string; note?: string }

    if (!newDeadline || !reason?.trim()) {
      res.status(400).json({ error: 'newDeadline and reason are required' }); return
    }

    const task = await prisma.task.findFirst({ where: { id: req.params.id, workspaceId, deletedAt: null } })
    if (!task) { res.status(404).json({ error: 'Task not found' }); return }
    if (['APPROVED', 'CANCELLED'].includes(task.status)) {
      res.status(400).json({ error: 'Cannot extend deadline of an approved or cancelled task' }); return
    }

    // Only the task creator can extend
    const isCreator = actorType === 'director'
      ? task.createdByDirectorId === actorId
      : task.createdByPersonnelId === actorId
    if (!isCreator) {
      res.status(403).json({ error: 'Only the task creator can extend the deadline' }); return
    }

    const newDate = new Date(newDeadline)
    if (isNaN(newDate.getTime())) {
      res.status(400).json({ error: 'Invalid date' }); return
    }
    // New deadline must be strictly after current deadline (or in the future if no current deadline)
    if (task.deadline && newDate <= task.deadline) {
      res.status(400).json({ error: 'New deadline must be later than the current deadline' }); return
    }
    if (!task.deadline && newDate <= new Date()) {
      res.status(400).json({ error: 'New deadline must be in the future' }); return
    }

    // Resolve the creator's name for the audit record
    let extendedByName = 'Unknown'
    if (actorType === 'director') {
      const d = await prisma.director.findUnique({ where: { id: actorId }, select: { name: true } })
      extendedByName = d?.name ?? extendedByName
    } else {
      const p = await prisma.personnel.findUnique({ where: { id: actorId }, select: { name: true } })
      extendedByName = p?.name ?? extendedByName
    }

    const oldDeadline = task.deadline ?? new Date()

    await prisma.$transaction(async tx => {
      await startAssignedTaskForActivity(tx, task.id, workspaceId, req.user!, 'deadline_extension')
      await tx.task.update({
        where: { id: task.id },
        data: {
          deadline: newDate,
          // Preserve the very first deadline ever set as originalDeadline
          originalDeadline: task.originalDeadline ?? task.deadline ?? newDate,
        }
      })

      await tx.deadlineExtension.create({
        data: {
          taskId:         task.id,
          workspaceId,
          oldDeadline,
          newDeadline:    newDate,
          reason:         reason.trim(),
          note:           note?.trim() || null,
          extendedById:   actorId,
          extendedByType: actorType,
          extendedByName,
        }
      })

      await writeAudit(tx, workspaceId, 'DEADLINE_EXTENDED', actorType, actorId, task.id, {
        oldDeadline: oldDeadline.toISOString(),
        newDeadline: newDate.toISOString(),
        reason: reason.trim(),
        note: note?.trim(),
        extendedBy: extendedByName,
      }, req.user!)

      // Notify all personnel assigned to this task
      const assignments = await tx.taskAssignment.findMany({
        where: { taskId: task.id },
        select: { personnelId: true }
      })
      for (const a of assignments) {
        if (a.personnelId && a.personnelId !== actorId) {
          await notifyActor(tx, workspaceId, 'personnel', a.personnelId,
            'task_deadline_warning',
            'Deadline Extended',
            `The deadline for "${task.title}" has been extended to ${newDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}.`,
            task.id
          )
        }
      }
    })

    res.json({ success: true })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// GET /api/tasks/:id/deadline-extensions
export async function getDeadlineExtensions(req: Request, res: Response): Promise<void> {
  try {
    const { workspaceId } = req.user!
    const task = await prisma.task.findFirst({ where: { id: req.params.id, workspaceId, deletedAt: null } })
    if (!task) { res.status(404).json({ error: 'Task not found' }); return }

    const extensions = await prisma.deadlineExtension.findMany({
      where: { taskId: req.params.id },
      orderBy: { createdAt: 'asc' },
    })
    res.json(extensions)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// POST /api/tasks/:id/assign-next
// Chairman approves the current task and hands it off to one or more new tasks in one atomic transaction.
export async function assignNextTasks(req: Request, res: Response): Promise<void> {
  try {
    const { actorId, actorType, workspaceId } = req.user!
    if (actorType !== 'director') { res.status(403).json({ error: 'Only directors can use chained handover' }); return }

    const { nextTasks, handoverNote, allowPreviousAssigneeView = false } = req.body as {
      nextTasks: Array<{
        title: string
        description?: string
        projectId?: string
        priority?: string
        deadline?: string
        personnelIds?: string[]       // individual assignees
        groupId?: string              // assign to an entire group
        isGroupTask?: boolean
      }>
      handoverNote?: string
      allowPreviousAssigneeView?: boolean
    }

    if (!Array.isArray(nextTasks) || nextTasks.length === 0) {
      res.status(400).json({ error: 'nextTasks array is required and must have at least one task' }); return
    }

    const task = await prisma.task.findFirst({ where: { id: req.params.id, workspaceId, deletedAt: null } })
    if (!task) { res.status(404).json({ error: 'Task not found' }); return }
    if (task.status !== 'SUBMITTED') { res.status(400).json({ error: 'Task must be SUBMITTED to hand over' }); return }

    // Determine chainId: inherit if this task is already in a chain, else start a new one
    const existingChainLink = await prisma.taskChain.findFirst({ where: { childTaskId: task.id } })
    const chainId = existingChainLink?.chainId ?? crypto.randomUUID()
    const chainStepNumber = existingChainLink ? existingChainLink.chainStepNumber + 1 : 1

    // Validate all next task inputs
    for (const nt of nextTasks) {
      if (!nt.title?.trim()) { res.status(400).json({ error: 'Each next task must have a title' }); return }
      const projectId = nt.projectId ?? task.projectId
      const proj = await prisma.project.findFirst({ where: { id: projectId, workspaceId } })
      if (!proj) { res.status(400).json({ error: `Project not found: ${projectId}` }); return }
    }

    // Collect all assignee IDs to notify later
    const createdTaskIds: string[] = []

    await prisma.$transaction(async tx => {
      // 1. Approve the current task
      await tx.task.update({ where: { id: task.id }, data: { status: 'APPROVED' } })
      await writeAudit(tx, workspaceId, 'TASK_AUTO_APPROVED_HANDOVER', 'director', actorId, task.id, {
        handoverNote,
        nextTaskCount: nextTasks.length,
      }, req.user!)

      // If this is a group task instance, check if all siblings are now approved
      if (task.groupTaskId) {
        const siblings = await tx.task.findMany({
          where: { groupTaskId: task.groupTaskId, deletedAt: null },
          select: { id: true, status: true },
        })
        const allApproved = siblings.every(s => s.id === task.id || s.status === 'APPROVED')
        if (allApproved) {
          await tx.task.update({
            where: { id: task.groupTaskId },
            data: { status: 'APPROVED', approvalById: actorId, approvalByType: 'director' },
          })
        }
      }

      // 2. Create each next task + TaskChain record
      for (const nt of nextTasks) {
        const projectId = nt.projectId ?? task.projectId

        const newTask = await tx.task.create({
          data: {
            workspaceId,
            projectId,
            title: nt.title.trim(),
            description: nt.description?.trim() ?? null,
            priority: nt.priority ?? 'MEDIUM',
            deadline: nt.deadline ? new Date(nt.deadline) : null,
            originalDeadline: nt.deadline ? new Date(nt.deadline) : null,
            deadlineSetById: nt.deadline ? actorId : undefined,
            deadlineSetByType: nt.deadline ? 'director' : undefined,
            createdByDirectorId: actorId,
            approvalById: actorId,
            approvalByType: 'director',
            status: 'PENDING',
          }
        })
        createdTaskIds.push(newTask.id)

        // Create TaskChain link
        await tx.taskChain.create({
          data: {
            chainId,
            workspaceId,
            parentTaskId: task.id,
            childTaskId: newTask.id,
            chainStepNumber,
            createdByChairmanId: actorId,
            handoverNote: handoverNote?.trim() ?? null,
            allowPreviousAssigneeView,
          }
        })

        await writeAudit(tx, workspaceId, 'TASK_CREATED', 'director', actorId, newTask.id, {
          title: newTask.title,
          chainedFrom: task.id,
          chainStepNumber,
        }, req.user!)

        // Assign to personnel or group
        if (nt.isGroupTask && nt.groupId) {
          // Group task: create per-member child instances
          const members = await tx.taskGroupMember.findMany({
            where: { groupId: nt.groupId },
            include: { personnel: { select: { id: true, name: true } } },
          })

          for (const member of members) {
            const memberTask = await tx.task.create({
              data: {
                workspaceId,
                projectId,
                title: nt.title.trim(),
                description: nt.description?.trim() ?? null,
                priority: nt.priority ?? 'MEDIUM',
                deadline: nt.deadline ? new Date(nt.deadline) : null,
                originalDeadline: nt.deadline ? new Date(nt.deadline) : null,
                createdByDirectorId: actorId,
                approvalById: actorId,
                approvalByType: 'director',
                status: 'ASSIGNED',
                groupTaskId: newTask.id,
              }
            })
            await tx.taskAssignment.create({ data: { taskId: memberTask.id, personnelId: member.personnelId } })
            await notifyActor(tx, workspaceId, 'personnel', member.personnelId, 'task_assigned',
              'New chained task assigned',
              `"${newTask.title}" has been assigned to you as a continuation of a completed task.`,
              memberTask.id
            )
          }
          // Set parent group task to ASSIGNED
          await tx.task.update({ where: { id: newTask.id }, data: { status: 'ASSIGNED' } })
        } else if (nt.personnelIds && nt.personnelIds.length > 0) {
          // Individual assignees
          for (const pid of nt.personnelIds) {
            await tx.taskAssignment.create({ data: { taskId: newTask.id, personnelId: pid } })
            await notifyActor(tx, workspaceId, 'personnel', pid, 'task_assigned',
              'New chained task assigned',
              `"${newTask.title}" has been assigned to you as a continuation of a completed task${handoverNote ? ': ' + handoverNote : ''}.`,
              newTask.id
            )
          }
          await tx.task.update({ where: { id: newTask.id }, data: { status: 'ASSIGNED' } })
        }

        await writeAudit(tx, workspaceId, 'TASK_CHAIN_HANDOVER', 'director', actorId, newTask.id, {
          parentTaskId: task.id,
          chainId,
          chainStepNumber,
          handoverNote,
        }, req.user!)
      }
    })

    res.status(201).json({ success: true, chainId, createdTaskIds })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// GET /api/tasks/:id/chain
// Returns the full chain this task belongs to (all steps, in order)
export async function getTaskChain(req: Request, res: Response): Promise<void> {
  try {
    const { workspaceId } = req.user!
    const taskId = req.params.id

    // Find which chain this task is in (as parent or child)
    const chainLink = await prisma.taskChain.findFirst({
      where: { OR: [{ parentTaskId: taskId }, { childTaskId: taskId }], workspaceId }
    })
    if (!chainLink) { res.json({ chain: [], chainId: null }); return }

    const { chainId } = chainLink

    // Get all links in the chain
    const links = await prisma.taskChain.findMany({
      where: { chainId, workspaceId },
      orderBy: { chainStepNumber: 'asc' },
      include: {
        parentTask: {
          include: {
            assignments: {
              include: {
                personnel: { select: { id: true, name: true, avatarUrl: true } },
                department: { select: { id: true, name: true } },
              }
            }
          }
        },
        childTask: {
          include: {
            assignments: {
              include: {
                personnel: { select: { id: true, name: true, avatarUrl: true } },
                department: { select: { id: true, name: true } },
              }
            }
          }
        },
      }
    })

    // Build ordered list of unique tasks in the chain
    const seen = new Set<string>()
    const orderedTasks: unknown[] = []
    for (const link of links) {
      if (!seen.has(link.parentTaskId)) {
        seen.add(link.parentTaskId)
        orderedTasks.push({ ...link.parentTask, chainStepNumber: link.chainStepNumber, isCurrentTask: link.parentTaskId === taskId })
      }
      if (!seen.has(link.childTaskId)) {
        seen.add(link.childTaskId)
        orderedTasks.push({ ...link.childTask, chainStepNumber: link.chainStepNumber + 1, isCurrentTask: link.childTaskId === taskId })
      }
    }

    res.json({ chainId, chain: orderedTasks, links })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// GET /api/tasks/:id/previous-history
// Returns progress logs + history of the parent task in the chain, for read-only display
export async function getPreviousHistory(req: Request, res: Response): Promise<void> {
  try {
    const { actorId, actorType, workspaceId } = req.user!
    const taskId = req.params.id

    // Find the chain link where this task is the child
    const chainLink = await prisma.taskChain.findFirst({
      where: { childTaskId: taskId, workspaceId },
    })
    if (!chainLink) { res.json({ progressLogs: [], history: [], parentTask: null }); return }

    // If allowPreviousAssigneeView is false and the caller is not a director, check if they're assigned to the parent
    if (!chainLink.allowPreviousAssigneeView && actorType !== 'director') {
      // Personnel can only see it if they're assigned to the current task
      const assignment = await prisma.taskAssignment.findFirst({
        where: { taskId, personnelId: actorId }
      })
      if (!assignment) { res.status(403).json({ error: 'Access denied' }); return }
    }

    const parentTaskId = chainLink.parentTaskId

    const [parentTask, progressLogs, history] = await Promise.all([
      prisma.task.findUnique({
        where: { id: parentTaskId },
        include: {
          assignments: {
            include: {
              personnel: { select: { id: true, name: true } },
              department: { select: { id: true, name: true } },
            }
          }
        }
      }),
      prisma.taskProgressLog.findMany({
        where: { taskId: parentTaskId, workspaceId },
        include: {
          authorPersonnel: { select: { id: true, name: true } },
          authorDirector:  { select: { id: true, name: true } },
        },
        orderBy: { logDate: 'asc' }
      }),
      prisma.auditLog.findMany({
        where: { taskId: parentTaskId, workspaceId },
        include: {
          actorDirector:  { select: { id: true, name: true } },
          actorPersonnel: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'asc' }
      })
    ])

    const enrichedLogs = progressLogs.map(l => ({
      ...l,
      authorName: l.authorPersonnel?.name || l.authorDirector?.name || l.authorType,
    }))

    res.json({
      parentTask,
      progressLogs: enrichedLogs,
      history,
      handoverNote: chainLink.handoverNote,
      chainStepNumber: chainLink.chainStepNumber,
    })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// POST /api/tasks/:id/progress-logs
export async function addProgressLog(req: Request, res: Response): Promise<void> {
  try {
    const { note } = req.body as { note: string }
    if (!note?.trim()) { res.status(400).json({ error: 'Note is required' }); return }
    const { actorId, actorType, workspaceId } = req.user!
    const task = await prisma.task.findFirst({ where: { id: req.params.id, workspaceId, deletedAt: null } })
    if (!task) { res.status(404).json({ error: 'Task not found' }); return }
    const log = await prisma.$transaction(async tx => {
      await startAssignedTaskForActivity(tx, task.id, workspaceId, req.user!, 'progress_update')
      return tx.taskProgressLog.create({
        data: {
          taskId: task.id,
          workspaceId,
          note: note.trim(),
          authorType: actorType,
          authorPersonnelId: actorType === 'personnel' ? actorId : undefined,
          authorDirectorId:  actorType === 'director'  ? actorId : undefined,
        }
      })
    })
    res.status(201).json(log)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// PUT /api/tasks/:id/progress-logs/:logId
// Directors may correct any progress update in their own workspace. The
// original author is retained and the change is preserved in the audit log.
export async function updateProgressLog(req: Request, res: Response): Promise<void> {
  try {
    const { actorId, actorType, workspaceId } = req.user!
    if (actorType !== 'director') {
      res.status(403).json({ error: 'Director access required to edit progress updates' }); return
    }

    const { note } = req.body as { note?: string }
    const trimmedNote = note?.trim()
    if (!trimmedNote) {
      res.status(400).json({ error: 'Update text is required' }); return
    }
    if (trimmedNote.length > 5000) {
      res.status(400).json({ error: 'Update text must be 5000 characters or fewer' }); return
    }

    const existing = await prisma.taskProgressLog.findFirst({
      where: {
        id: req.params.logId,
        taskId: req.params.id,
        workspaceId,
        task: { deletedAt: null },
      },
    })
    if (!existing) {
      res.status(404).json({ error: 'Progress update not found' }); return
    }

    const editedAt = new Date()
    const updated = await prisma.$transaction(async tx => {
      const log = await tx.taskProgressLog.update({
        where: { id: existing.id },
        data: { note: trimmedNote, editedAt },
      })
      await writeAudit(
        tx,
        workspaceId,
        'PROGRESS_LOG_EDITED',
        actorType,
        actorId,
        existing.taskId,
        {
          progressLogId: existing.id,
          originalAuthorType: existing.authorType,
          originalAuthorId: existing.authorPersonnelId || existing.authorDirectorId,
          previousNote: existing.note,
          updatedNote: trimmedNote,
        },
        req.user!,
      )
      return log
    })

    res.json(updated)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
}
