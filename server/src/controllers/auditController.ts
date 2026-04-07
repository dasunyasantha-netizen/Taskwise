import { Request, Response } from 'express'
import prisma from '../prisma'

// GET /api/audit
export async function listAuditLogs(req: Request, res: Response): Promise<void> {
  try {
    if (req.user!.actorType !== 'director') { res.status(403).json({ error: 'Director only' }); return }
    const { event, from, to, actorPersonnelId } = req.query as Record<string, string>
    const where: Record<string, unknown> = { workspaceId: req.user!.workspaceId }
    if (event)            where.event = event
    if (actorPersonnelId) where.actorPersonnelId = actorPersonnelId
    if (from || to) {
      where.createdAt = { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) }
    }
    const logs = await prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 })
    res.json(logs)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// GET /api/reports/overdue
export async function getOverdue(req: Request, res: Response): Promise<void> {
  try {
    if (req.user!.actorType !== 'director') { res.status(403).json({ error: 'Director only' }); return }
    const tasks = await prisma.task.findMany({
      where: { workspaceId: req.user!.workspaceId, deletedAt: null, deadline: { lt: new Date() }, status: { notIn: ['APPROVED', 'CANCELLED'] } },
      include: { project: true, assignments: { include: { personnel: { select: { id: true, name: true } } } } },
      orderBy: { deadline: 'asc' }
    })
    res.json(tasks)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// GET /api/reports/progress
export async function getProgress(req: Request, res: Response): Promise<void> {
  try {
    if (req.user!.actorType !== 'director') { res.status(403).json({ error: 'Director only' }); return }
    const projects = await prisma.project.findMany({
      where: { workspaceId: req.user!.workspaceId, deletedAt: null },
      include: { _count: { select: { tasks: true } } }
    })
    const data = await Promise.all(projects.map(async p => {
      const counts = await prisma.task.groupBy({ by: ['status'], where: { projectId: p.id, deletedAt: null }, _count: { _all: true } })
      return { ...p, statusCounts: Object.fromEntries(counts.map(c => [c.status, c._count._all])) }
    }))
    res.json(data)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// GET /api/reports/queue/:personnelId
export async function getPersonnelQueueReport(req: Request, res: Response): Promise<void> {
  try {
    const tasks = await prisma.task.findMany({
      where: { workspaceId: req.user!.workspaceId, deletedAt: null, assignments: { some: { personnelId: req.params.personnelId } }, status: { notIn: ['APPROVED', 'CANCELLED'] } },
      include: { project: true, _count: { select: { subtasks: true } } },
      orderBy: [{ deadline: 'asc' }, { createdAt: 'desc' }]
    })
    res.json(tasks)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}
