import { Request, Response } from 'express'
import prisma from '../prisma'

// GET /api/projects
export async function listProjects(req: Request, res: Response): Promise<void> {
  try {
    const projects = await prisma.project.findMany({
      where: { workspaceId: req.user!.workspaceId, deletedAt: null },
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
