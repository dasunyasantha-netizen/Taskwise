import { Request, Response } from 'express'
import prisma from '../prisma'

// GET /api/notifications
export async function listNotifications(req: Request, res: Response): Promise<void> {
  try {
    const { actorId, actorType, workspaceId } = req.user!
    const where = actorType === 'director'
      ? { recipientDirectorId: actorId, workspaceId }
      : { recipientPersonnelId: actorId, workspaceId }

    const notifications = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    res.json(notifications)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// POST /api/notifications/:id/read
export async function markRead(req: Request, res: Response): Promise<void> {
  try {
    await prisma.notification.updateMany({
      where: { id: req.params.id },
      data: { isRead: true, readAt: new Date() }
    })
    res.json({ success: true })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// POST /api/notifications/read-all
export async function markAllRead(req: Request, res: Response): Promise<void> {
  try {
    const { actorId, actorType, workspaceId } = req.user!
    const where = actorType === 'director'
      ? { recipientDirectorId: actorId, workspaceId, isRead: false }
      : { recipientPersonnelId: actorId, workspaceId, isRead: false }
    await prisma.notification.updateMany({ where, data: { isRead: true, readAt: new Date() } })
    res.json({ success: true })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}
