import { Request, Response } from 'express'
import prisma from '../prisma'

// GET /api/project-categories
export async function listCategories(req: Request, res: Response): Promise<void> {
  try {
    const { workspaceId, actorType, actorId, layerNumber, departmentId } = req.user!

    let categories = await prisma.projectCategory.findMany({
      where: { workspaceId },
      include: {
        projects: {
          where: { deletedAt: null },
          include: { _count: { select: { tasks: true } } },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: [{ isSystem: 'asc' }, { name: 'asc' }],
    })

    // Personnel: filter to only categories that contain projects with tasks they can see
    if (actorType === 'personnel') {
      const { buildTaskVisibilityFilter } = await import('../helpers/visibility')
      const visFilter = await buildTaskVisibilityFilter(actorType, actorId, workspaceId, layerNumber, departmentId)

      if (Object.keys(visFilter).length > 0) {
        // Get project IDs that have at least one visible task
        const visibleTasks = await prisma.task.findMany({
          where: { workspaceId, deletedAt: null, ...(visFilter as object) },
          select: { projectId: true },
          distinct: ['projectId'],
        })
        const visibleProjectIds = new Set(visibleTasks.map(t => t.projectId))

        categories = categories.map(cat => ({
          ...cat,
          projects: cat.projects.filter(p => visibleProjectIds.has(p.id)),
        })).filter(cat => cat.projects.length > 0)
      }
    }

    res.json(categories)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// POST /api/project-categories
export async function createCategory(req: Request, res: Response): Promise<void> {
  try {
    if (req.user!.actorType !== 'director') { res.status(403).json({ error: 'Director only' }); return }
    const { name, description, color } = req.body
    if (!name?.trim()) { res.status(400).json({ error: 'name required' }); return }
    const { workspaceId, actorId } = req.user!

    const category = await prisma.$transaction(async tx => {
      const c = await tx.projectCategory.create({
        data: { workspaceId, name: name.trim(), description: description?.trim() ?? null, color: color || '#0073ea' },
      })
      await tx.auditLog.create({ data: { workspaceId, event: 'CATEGORY_CREATED', actorDirectorId: actorId, actorType: 'director', payload: { categoryId: c.id, name: c.name } } })
      return c
    })
    res.status(201).json(category)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// PUT /api/project-categories/:id
export async function updateCategory(req: Request, res: Response): Promise<void> {
  try {
    if (req.user!.actorType !== 'director') { res.status(403).json({ error: 'Director only' }); return }
    const { workspaceId, actorId } = req.user!
    const cat = await prisma.projectCategory.findFirst({ where: { id: req.params.id, workspaceId } })
    if (!cat) { res.status(404).json({ error: 'Category not found' }); return }
    if (cat.isSystem) { res.status(400).json({ error: 'Cannot edit the Uncategorized system category' }); return }

    const { name, description, color, status } = req.body
    const updated = await prisma.$transaction(async tx => {
      const c = await tx.projectCategory.update({
        where: { id: req.params.id },
        data: {
          name: name?.trim() ?? cat.name,
          description: description !== undefined ? (description?.trim() || null) : cat.description,
          color: color ?? cat.color,
          status: status ?? cat.status,
        },
      })
      const changes: Record<string, unknown> = {}
      if (name && name.trim() !== cat.name) changes.name = { from: cat.name, to: name.trim() }
      if (status && status !== cat.status) changes.status = { from: cat.status, to: status }
      const event = status === 'archived' && cat.status !== 'archived' ? 'CATEGORY_ARCHIVED'
        : status === 'active' && cat.status !== 'active' ? 'CATEGORY_UNARCHIVED'
        : 'CATEGORY_UPDATED'
      await tx.auditLog.create({ data: { workspaceId, event, actorDirectorId: actorId, actorType: 'director', payload: { categoryId: c.id, name: c.name, changes } as object } })
      return c
    })
    res.json(updated)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// DELETE /api/project-categories/:id
export async function deleteCategory(req: Request, res: Response): Promise<void> {
  try {
    if (req.user!.actorType !== 'director') { res.status(403).json({ error: 'Director only' }); return }
    const { workspaceId } = req.user!
    const cat = await prisma.projectCategory.findFirst({ where: { id: req.params.id, workspaceId } })
    if (!cat) { res.status(404).json({ error: 'Category not found' }); return }
    if (cat.isSystem) { res.status(400).json({ error: 'Cannot delete the Uncategorized system category' }); return }

    // Move all projects in this category to Uncategorized
    const uncategorized = await prisma.projectCategory.findFirst({ where: { workspaceId, isSystem: true } })
    await prisma.project.updateMany({
      where: { categoryId: req.params.id },
      data: { categoryId: uncategorized?.id ?? null },
    })
    await prisma.projectCategory.delete({ where: { id: req.params.id } })
    res.json({ success: true })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}
