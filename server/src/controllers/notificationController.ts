import { Request, Response } from 'express'
import prisma from '../prisma'

// GET /api/notifications/vapid-public-key
export async function getVapidKey(_req: Request, res: Response): Promise<void> {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY })
}

// POST /api/notifications/push-subscribe
export async function savePushSubscription(req: Request, res: Response): Promise<void> {
  try {
    const { actorId, actorType, workspaceId } = req.user!
    const { endpoint, keys } = req.body
    if (!endpoint || !keys?.p256dh || !keys?.auth) { res.status(400).json({ error: 'Invalid subscription' }); return }
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { actorId, actorType, workspaceId, p256dh: keys.p256dh, auth: keys.auth },
      create: { actorId, actorType, workspaceId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    })
    res.json({ success: true })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// DELETE /api/notifications/push-subscribe
export async function removePushSubscription(req: Request, res: Response): Promise<void> {
  try {
    const { endpoint } = req.body
    if (endpoint) await prisma.pushSubscription.deleteMany({ where: { endpoint } })
    res.json({ success: true })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

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
      include: {
        task: { select: { id: true, status: true, approvalById: true, approvalByType: true } },
      },
    })

    const companyRequestRefs = notifications
      .filter(n => n.type === 'company_request_submitted')
      .map(n => (n.payload as { reference?: string } | null)?.reference)
      .filter((ref): ref is string => !!ref)

    const companyRequests = companyRequestRefs.length > 0
      ? await prisma.companyRequest.findMany({
          where: { reference: { in: companyRequestRefs } },
          select: { reference: true, status: true },
        })
      : []
    const companyRequestStatus = new Map(companyRequests.map(r => [r.reference, r.status]))

    const staleIds: string[] = []
    const visible = notifications.filter(notification => {
      if (notification.type === 'task_submitted_for_approval') {
        const task = notification.task
        const isCurrentApprover = task?.approvalById === actorId && task?.approvalByType === actorType
        const isActionable = !!task && task.status === 'SUBMITTED' && isCurrentApprover
        if (!isActionable) staleIds.push(notification.id)
        return isActionable
      }

      if (['task_assigned', 'subtask_created'].includes(notification.type)) {
        const isActionable = !!notification.task && !['APPROVED', 'CANCELLED'].includes(notification.task.status)
        if (!isActionable) staleIds.push(notification.id)
        return isActionable
      }

      if (notification.type === 'company_request_submitted') {
        const reference = (notification.payload as { reference?: string } | null)?.reference
        const status = reference ? companyRequestStatus.get(reference) : null
        const isActionable = status === 'PENDING' || status === 'MORE_INFORMATION_REQUIRED'
        if (!isActionable) staleIds.push(notification.id)
        return isActionable
      }

      return true
    })

    if (staleIds.length > 0) {
      await prisma.notification.updateMany({
        where: { id: { in: staleIds }, isRead: false },
        data: { isRead: true, readAt: new Date() },
      })
    }

    res.json(visible.map(({ task, ...notification }) => notification))
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// POST /api/notifications/:id/read
export async function markRead(req: Request, res: Response): Promise<void> {
  try {
    const { actorId, actorType, workspaceId } = req.user!
    // Only mark read if the notification actually belongs to this actor
    const ownerFilter = actorType === 'director'
      ? { recipientDirectorId: actorId }
      : { recipientPersonnelId: actorId }

    const result = await prisma.notification.updateMany({
      where: { id: req.params.id, workspaceId, ...ownerFilter, isRead: false },
      data: { isRead: true, readAt: new Date() }
    })
    if (result.count === 0) {
      // Either already read or doesn't belong to this user — return 200 silently (idempotent)
      res.json({ success: true })
      return
    }
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
