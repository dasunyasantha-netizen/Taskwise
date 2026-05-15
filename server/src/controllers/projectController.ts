import { Request, Response } from 'express'
import prisma from '../prisma'
import { sendPushToActor } from '../helpers/push'

// GET /api/projects
export async function listProjects(req: Request, res: Response): Promise<void> {
  try {
    const { layerNumber, departmentId, personnelId, deadlineFrom, deadlineTo } = req.query as Record<string, string>

    // Build task filter clauses
    const taskWhereClauses: object[] = []

    // Layer/dept/person scoping
    if (personnelId) {
      taskWhereClauses.push({ assignments: { some: { personnelId } } })
    } else if (departmentId) {
      taskWhereClauses.push({ assignments: { some: { OR: [
        { departmentId },
        { personnel: { departmentId } },
        { group: { departmentId } },
      ] } } })
    } else if (layerNumber) {
      const num = parseInt(layerNumber)
      const layer = await prisma.layer.findFirst({
        where: { workspaceId: req.user!.workspaceId, number: num },
        include: { departments: { select: { id: true } } }
      })
      const deptIds = layer?.departments.map(d => d.id) ?? []
      if (deptIds.length > 0) {
        taskWhereClauses.push({ assignments: { some: { OR: [
          { departmentId: { in: deptIds } },
          { personnel: { departmentId: { in: deptIds } } },
          { group: { departmentId: { in: deptIds } } },
        ] } } })
      }
    }

    // Deadline range — project must have at least one task with deadline in range
    if (deadlineFrom || deadlineTo) {
      const deadlineFilter: Record<string, Date> = {}
      if (deadlineFrom) deadlineFilter.gte = new Date(deadlineFrom)
      if (deadlineTo)   deadlineFilter.lte = new Date(deadlineTo + 'T23:59:59')
      taskWhereClauses.push({ deadline: deadlineFilter })
    }

    // Combine: project must have at least one task matching ALL clauses
    let taskFilter: object | undefined
    if (taskWhereClauses.length === 1) {
      taskFilter = { some: taskWhereClauses[0] }
    } else if (taskWhereClauses.length > 1) {
      taskFilter = { some: { AND: taskWhereClauses } }
    }

    const projects = await prisma.project.findMany({
      where: {
        workspaceId: req.user!.workspaceId,
        deletedAt: null,
        ...(taskFilter ? { tasks: taskFilter } : {}),
      },
      include: { _count: { select: { tasks: true } } },
      orderBy: { createdAt: 'desc' }
    })
    res.json(projects)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// GET /api/projects/:id
export async function getProject(req: Request, res: Response): Promise<void> {
  try {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, workspaceId: req.user!.workspaceId, deletedAt: null },
      include: { _count: { select: { tasks: true } } }
    })
    if (!project) { res.status(404).json({ error: 'Project not found' }); return }
    res.json(project)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// POST /api/projects
export async function createProject(req: Request, res: Response): Promise<void> {
  try {
    if (req.user!.actorType !== 'director') { res.status(403).json({ error: 'Director only' }); return }
    const { name, description, color } = req.body
    if (!name) { res.status(400).json({ error: 'name required' }); return }
    const project = await prisma.$transaction(async tx => {
      const p = await tx.project.create({ data: { name, description, color: color || '#0073ea', workspaceId: req.user!.workspaceId, directorId: req.user!.actorId } })
      await tx.auditLog.create({ data: { workspaceId: req.user!.workspaceId, event: 'PROJECT_CREATED', actorDirectorId: req.user!.actorId, actorType: 'director', payload: { projectId: p.id, name } } })
      return p
    })
    res.status(201).json(project)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// PUT /api/projects/:id
export async function updateProject(req: Request, res: Response): Promise<void> {
  try {
    if (req.user!.actorType !== 'director') { res.status(403).json({ error: 'Director only' }); return }
    const project = await prisma.project.findFirst({ where: { id: req.params.id, workspaceId: req.user!.workspaceId, deletedAt: null } })
    if (!project) { res.status(404).json({ error: 'Project not found' }); return }
    const { name, description, color, status } = req.body
    const updated = await prisma.project.update({ where: { id: req.params.id }, data: { name, description, color, status } })

    // Notify all personnel assigned to tasks in this project
    if (name || description) {
      const director = await prisma.director.findUnique({ where: { id: req.user!.actorId }, select: { name: true } })
      const msg = `Project "${updated.name}" was updated by ${director?.name ?? 'Director'}`
      const assignments = await prisma.taskAssignment.findMany({
        where: { task: { projectId: project.id, deletedAt: null } },
        select: { personnelId: true },
        distinct: ['personnelId'],
      })
      for (const a of assignments) {
        if (a.personnelId) {
          await prisma.notification.create({
            data: { workspaceId: req.user!.workspaceId, recipientType: 'personnel', recipientPersonnelId: a.personnelId, type: 'project_updated', title: 'Project Updated', message: msg }
          })
          sendPushToActor(a.personnelId, 'personnel', 'Project Updated', msg)
        }
      }
    }
    res.json(updated)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// DELETE /api/projects/:id
export async function deleteProject(req: Request, res: Response): Promise<void> {
  try {
    if (req.user!.actorType !== 'director') { res.status(403).json({ error: 'Director only' }); return }
    const project = await prisma.project.findFirst({ where: { id: req.params.id, workspaceId: req.user!.workspaceId, deletedAt: null } })
    if (!project) { res.status(404).json({ error: 'Project not found' }); return }
    await prisma.project.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } })
    res.json({ success: true })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}
