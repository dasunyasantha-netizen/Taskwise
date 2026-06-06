import { Request, Response } from 'express'
import prisma from '../prisma'
import { sendPushToActor } from '../helpers/push'

const PROJECT_INCLUDE = {
  category: { select: { id: true, name: true, color: true, status: true } },
  _count: { select: { tasks: true } },
}

// GET /api/projects
export async function listProjects(req: Request, res: Response): Promise<void> {
  try {
    const { layerNumber, departmentId, personnelId, deadlineFrom, deadlineTo, categoryId } = req.query as Record<string, string>

    const taskWhereClauses: object[] = []

    if (personnelId) {
      taskWhereClauses.push({ assignments: { some: { personnelId } } })
    } else if (departmentId) {
      taskWhereClauses.push({ assignments: { some: { OR: [
        { departmentId },
        { personnel: { departmentId } },
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
        ] } } })
      }
    }

    if (deadlineFrom || deadlineTo) {
      const deadlineFilter: Record<string, Date> = {}
      if (deadlineFrom) deadlineFilter.gte = new Date(deadlineFrom)
      if (deadlineTo)   deadlineFilter.lte = new Date(deadlineTo + 'T23:59:59')
      taskWhereClauses.push({ deadline: deadlineFilter })
    }

    let taskFilter: object | undefined
    if (taskWhereClauses.length === 1) taskFilter = { some: taskWhereClauses[0] }
    else if (taskWhereClauses.length > 1) taskFilter = { some: { AND: taskWhereClauses } }

    const where: Record<string, unknown> = {
      workspaceId: req.user!.workspaceId,
      deletedAt: null,
      ...(taskFilter ? { tasks: taskFilter } : {}),
      ...(categoryId ? { categoryId } : {}),
    }

    const projects = await prisma.project.findMany({
      where,
      include: PROJECT_INCLUDE,
      orderBy: { name: 'asc' },
    })
    res.json(projects)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// GET /api/projects/:id
export async function getProject(req: Request, res: Response): Promise<void> {
  try {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, workspaceId: req.user!.workspaceId, deletedAt: null },
      include: PROJECT_INCLUDE,
    })
    if (!project) { res.status(404).json({ error: 'Project not found' }); return }
    res.json(project)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// POST /api/projects
export async function createProject(req: Request, res: Response): Promise<void> {
  try {
    if (req.user!.actorType !== 'director') { res.status(403).json({ error: 'Director only' }); return }
    const { name, description, color, categoryId } = req.body
    if (!name?.trim()) { res.status(400).json({ error: 'name required' }); return }
    if (!categoryId) { res.status(400).json({ error: 'categoryId required' }); return }

    const { workspaceId, actorId } = req.user!

    // Validate category exists, is active, and is not system (Uncategorized)
    const cat = await prisma.projectCategory.findFirst({ where: { id: categoryId, workspaceId } })
    if (!cat) { res.status(400).json({ error: 'Category not found' }); return }
    if (cat.isSystem) { res.status(400).json({ error: 'Cannot assign new projects to Uncategorized' }); return }
    if (cat.status === 'archived') { res.status(400).json({ error: 'Cannot assign new projects to an archived category' }); return }

    const project = await prisma.$transaction(async tx => {
      const p = await tx.project.create({
        data: { name: name.trim(), description: description?.trim() ?? null, color: color || '#0073ea', workspaceId, directorId: actorId, categoryId },
        include: PROJECT_INCLUDE,
      })
      await tx.auditLog.create({ data: { workspaceId, event: 'PROJECT_CREATED', actorDirectorId: actorId, actorType: 'director', payload: { projectId: p.id, name: p.name, categoryId, categoryName: cat.name } } })
      return p
    })
    res.status(201).json(project)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// PUT /api/projects/:id
export async function updateProject(req: Request, res: Response): Promise<void> {
  try {
    if (req.user!.actorType !== 'director') { res.status(403).json({ error: 'Director only' }); return }
    const { workspaceId, actorId } = req.user!
    const project = await prisma.project.findFirst({ where: { id: req.params.id, workspaceId, deletedAt: null } })
    if (!project) { res.status(404).json({ error: 'Project not found' }); return }
    if (project.directorId !== actorId) { res.status(403).json({ error: 'Only the creator can edit this project' }); return }

    const { name, description, color, status, categoryId } = req.body

    // Validate new category if provided
    if (categoryId && categoryId !== project.categoryId) {
      const cat = await prisma.projectCategory.findFirst({ where: { id: categoryId, workspaceId } })
      if (!cat) { res.status(400).json({ error: 'Category not found' }); return }
      if (cat.isSystem) { res.status(400).json({ error: 'Cannot assign projects to Uncategorized via edit' }); return }
      if (cat.status === 'archived') { res.status(400).json({ error: 'Cannot assign project to an archived category' }); return }
    }

    const updated = await prisma.$transaction(async tx => {
      const p = await tx.project.update({
        where: { id: req.params.id },
        data: {
          name:        name?.trim()        ?? project.name,
          description: description !== undefined ? (description?.trim() || null) : project.description,
          color:       color               ?? project.color,
          status:      status              ?? project.status,
          categoryId:  categoryId          ?? project.categoryId,
        },
        include: PROJECT_INCLUDE,
      })
      const changes: Record<string, unknown> = {}
      if (name && name.trim() !== project.name) changes.name = { from: project.name, to: name.trim() }
      if (categoryId && categoryId !== project.categoryId) changes.categoryId = { from: project.categoryId, to: categoryId }
      await tx.auditLog.create({ data: { workspaceId, event: 'PROJECT_UPDATED', actorDirectorId: actorId, actorType: 'director', payload: { projectId: p.id, name: p.name, changes } as object } })
      return p
    })

    if (name || description) {
      const director = await prisma.director.findUnique({ where: { id: actorId }, select: { name: true } })
      const msg = `Project "${updated.name}" was updated by ${director?.name ?? 'Director'}`
      const assignments = await prisma.taskAssignment.findMany({
        where: { task: { projectId: project.id, deletedAt: null } },
        select: { personnelId: true },
        distinct: ['personnelId'],
      })
      for (const a of assignments) {
        if (a.personnelId) {
          await prisma.notification.create({ data: { workspaceId, recipientType: 'personnel', recipientPersonnelId: a.personnelId, type: 'project_updated', title: 'Project Updated', message: msg } })
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
    const { workspaceId, actorId } = req.user!
    const project = await prisma.project.findFirst({ where: { id: req.params.id, workspaceId, deletedAt: null } })
    if (!project) { res.status(404).json({ error: 'Project not found' }); return }
    if (project.directorId !== actorId) { res.status(403).json({ error: 'Only the creator can delete this project' }); return }
    await prisma.project.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } })
    res.json({ success: true })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}
