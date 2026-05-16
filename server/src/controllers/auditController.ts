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

// GET /api/reports/recent-updates?date=YYYY-MM-DD
// Returns all comments and progress logs for the given date (defaults to today)
// scoped to the director's workspace, merged and sorted by createdAt desc
export async function getRecentUpdates(req: Request, res: Response): Promise<void> {
  try {
    if (req.user!.actorType !== 'director') { res.status(403).json({ error: 'Director only' }); return }
    const { workspaceId } = req.user!
    const dateStr = (req.query.date as string) || new Date().toISOString().slice(0, 10)
    const from = new Date(dateStr + 'T00:00:00.000Z')
    const to   = new Date(dateStr + 'T23:59:59.999Z')

    const [comments, progressLogs] = await Promise.all([
      prisma.taskComment.findMany({
        where: { task: { workspaceId }, createdAt: { gte: from, lte: to }, deletedAt: null },
        include: {
          task: { select: { id: true, title: true, project: { select: { id: true, name: true } } } },
          authorDirector:  { select: { id: true, name: true } },
          authorPersonnel: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.taskProgressLog.findMany({
        where: { workspaceId, createdAt: { gte: from, lte: to } },
        include: {
          task: { select: { id: true, title: true, project: { select: { id: true, name: true } } } },
          authorDirector:  { select: { id: true, name: true } },
          authorPersonnel: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ])

    const mapped = [
      ...comments.map(c => ({
        id: c.id, type: 'comment' as const,
        taskId: c.taskId, taskTitle: c.task?.title || '',
        projectName: c.task?.project?.name || '',
        authorName: c.authorDirector?.name || c.authorPersonnel?.name || c.authorType,
        content: c.content, createdAt: c.createdAt,
      })),
      ...progressLogs.map(l => ({
        id: l.id, type: 'update' as const,
        taskId: l.taskId, taskTitle: l.task?.title || '',
        projectName: l.task?.project?.name || '',
        authorName: l.authorDirector?.name || l.authorPersonnel?.name || l.authorType,
        content: l.note, createdAt: l.createdAt,
      })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    res.json(mapped)
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
