import { Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// GET /api/notices — active notices for the current user
export async function getActiveNotices(req: Request, res: Response): Promise<void> {
  const { actorId, actorType, workspaceId, layerNumber } = req.user!
  try {
    const now = new Date()
    const notices = await prisma.notice.findMany({
      where: {
        workspaceId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        AND: [
          {
            OR: [
              { audience: 'ALL' },
              { audience: 'LAYER', layerNumber: actorType === 'director' ? undefined : layerNumber },
            ],
          },
        ],
        dismissals: { none: { actorId, actorType } },
      },
      orderBy: { createdAt: 'desc' },
    })
    res.json(notices)
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch notices' })
  }
}

// GET /api/notices/all — all notices (director only, for management UI)
export async function getAllNotices(req: Request, res: Response): Promise<void> {
  const { workspaceId } = req.user!
  try {
    const notices = await prisma.notice.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { dismissals: true } } },
    })
    res.json(notices)
  } catch {
    res.status(500).json({ error: 'Failed to fetch notices' })
  }
}

// POST /api/notices — create a notice (director only)
export async function createNotice(req: Request, res: Response): Promise<void> {
  const { actorType, workspaceId } = req.user!
  if (actorType !== 'director') { res.status(403).json({ error: 'Director only' }); return }
  const { message, audience, layerNumber, expiresAt } = req.body
  if (!message?.trim()) { res.status(400).json({ error: 'Message is required' }); return }
  if (audience === 'LAYER' && !layerNumber) { res.status(400).json({ error: 'layerNumber required for LAYER audience' }); return }
  try {
    const notice = await prisma.notice.create({
      data: {
        workspaceId,
        message: message.trim(),
        audience: audience || 'ALL',
        layerNumber: audience === 'LAYER' ? Number(layerNumber) : null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    })
    res.status(201).json(notice)
  } catch {
    res.status(500).json({ error: 'Failed to create notice' })
  }
}

// DELETE /api/notices/:id — delete a notice (director only)
export async function deleteNotice(req: Request, res: Response): Promise<void> {
  const { actorType, workspaceId } = req.user!
  if (actorType !== 'director') { res.status(403).json({ error: 'Director only' }); return }
  try {
    const notice = await prisma.notice.findFirst({ where: { id: req.params.id, workspaceId } })
    if (!notice) { res.status(404).json({ error: 'Not found' }); return }
    await prisma.notice.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Failed to delete notice' })
  }
}

// POST /api/notices/:id/dismiss — mark a notice as dismissed
export async function dismissNotice(req: Request, res: Response): Promise<void> {
  const { actorId, actorType } = req.user!
  try {
    await prisma.noticeDismissal.upsert({
      where: { noticeId_actorId_actorType: { noticeId: req.params.id, actorId, actorType } },
      create: { noticeId: req.params.id, actorId, actorType },
      update: {},
    })
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Failed to dismiss notice' })
  }
}
