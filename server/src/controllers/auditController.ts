import { Request, Response } from 'express'
import prisma from '../prisma'
import {
  computeWorkspaceScores,
  getCurrentScoringPoints,
  resolveScoreRange,
  SCORING_EPOCH,
  SCORING_EVENT_TYPES,
  ScorePeriod,
  ScoringEventType,
} from '../helpers/scoring'

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

// GET /api/reports/user-analytics/logins/:actorId?actorType=personnel
// Returns login history for a specific user
export async function getUserLoginHistory(req: Request, res: Response): Promise<void> {
  try {
    if (req.user!.actorType !== 'director') { res.status(403).json({ error: 'Director only' }); return }
    const { actorId } = req.params
    const actorType = (req.query.actorType as string) || 'personnel'
    const logs = await prisma.loginLog.findMany({
      where: { workspaceId: req.user!.workspaceId, actorId, actorType },
      orderBy: { loggedInAt: 'desc' },
      take: 100,
    })
    res.json(logs)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// GET /api/reports/user-analytics/overview
// Returns aggregate login stats for all personnel in the workspace
export async function getUserAnalyticsOverview(req: Request, res: Response): Promise<void> {
  try {
    if (req.user!.actorType !== 'director') { res.status(403).json({ error: 'Director only' }); return }
    const { workspaceId } = req.user!

    const [personnel, loginStats, taskStats, scores] = await Promise.all([
      // All active personnel
      prisma.personnel.findMany({
        where: { workspaceId, deletedAt: null },
        select: { id: true, name: true, department: { select: { name: true } } },
        orderBy: { name: 'asc' },
      }),
      // Login counts and last login per personnel (last 90 days)
      prisma.loginLog.groupBy({
        by: ['actorId'],
        where: {
          workspaceId,
          actorType: 'personnel',
          loggedInAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
        },
        _count: { _all: true },
        _max: { loggedInAt: true },
      }),
      // Task counts per personnel
      prisma.taskAssignment.groupBy({
        by: ['personnelId'],
        where: { task: { workspaceId, deletedAt: null }, personnelId: { not: null } },
        _count: { _all: true },
      }),
      // Derived gamification points per personnel
      computeWorkspaceScores(workspaceId),
    ])

    const loginMap = new Map(loginStats.map(l => [l.actorId, { count: l._count._all, lastLogin: l._max.loggedInAt }]))
    const taskMap  = new Map(taskStats.map(t => [t.personnelId!, t._count._all]))
    const pointsMap = new Map(scores.map(s => [s.id, s.totalPoints]))

    // Daily login activity for the whole workspace (last 30 days)
    const dailyLogins = await prisma.loginLog.groupBy({
      by: ['actorType'],
      where: { workspaceId, loggedInAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
      _count: { _all: true },
    })

    // Login trend: logins per day for last 30 days
    const loginTrend = await prisma.$queryRaw<Array<{ day: string; count: bigint }>>`
      SELECT DATE_TRUNC('day', "loggedInAt") AS day, COUNT(*) AS count
      FROM "LoginLog"
      WHERE "workspaceId" = ${workspaceId}
        AND "loggedInAt" >= NOW() - INTERVAL '30 days'
      GROUP BY DATE_TRUNC('day', "loggedInAt")
      ORDER BY day ASC
    `

    res.json({
      personnel: personnel.map(p => ({
        id: p.id,
        name: p.name,
        department: p.department.name,
        loginCount90d: loginMap.get(p.id)?.count ?? 0,
        lastLogin:     loginMap.get(p.id)?.lastLogin ?? null,
        taskCount:     taskMap.get(p.id) ?? 0,
        points:        pointsMap.get(p.id) ?? 0,
      })),
      totalLoginsLast30d: dailyLogins.reduce((s, r) => s + r._count._all, 0),
      loginTrend: loginTrend.map(r => ({ day: r.day, count: Number(r.count) })),
    })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// GET /api/reports/leaderboard
// Director-only: full ranked leaderboard + summary cards for the workspace.
export async function getLeaderboard(req: Request, res: Response): Promise<void> {
  try {
    if (req.user!.actorType !== 'director') { res.status(403).json({ error: 'Director only' }); return }
    const { workspaceId } = req.user!
    const requestedPeriod = typeof req.query.period === 'string' ? req.query.period : 'all'
    if (!['all', 'week', 'last_week', 'month', 'last_month'].includes(requestedPeriod)) {
      res.status(400).json({ error: 'Invalid leaderboard period' })
      return
    }
    const range = resolveScoreRange(requestedPeriod as ScorePeriod)

    const [scores, currentPoints] = await Promise.all([
      computeWorkspaceScores(workspaceId, range),
      getCurrentScoringPoints(workspaceId),
    ])

    // Summary cards
    const totalPointsEarned = scores.reduce((s, u) => s + u.totalPoints, 0)
    const scored            = scores.filter(u => u.totalPoints !== 0)
    const avgScore          = scores.length ? Math.round(totalPointsEarned / scores.length) : 0
    const topPerformer      = scores[0] && scores[0].totalPoints > 0 ? scores[0] : null

    // Most active department = highest summed points among departments
    const deptTotals = new Map<string, number>()
    for (const u of scores) deptTotals.set(u.department, (deptTotals.get(u.department) ?? 0) + u.totalPoints)
    let mostActiveDept: { name: string; points: number } | null = null
    for (const [name, points] of deptTotals) {
      if (!mostActiveDept || points > mostActiveDept.points) mostActiveDept = { name, points }
    }

    res.json({
      leaderboard: scores.map((u, i) => ({ ...u, rank: i + 1 })),
      summary: {
        topPerformer: topPerformer && { id: topPerformer.id, name: topPerformer.name, department: topPerformer.department, points: topPerformer.totalPoints },
        totalPointsEarned,
        avgScore,
        scoredUserCount: scored.length,
        mostActiveDept,
      },
      config: {
        epoch: SCORING_EPOCH,
        points: currentPoints,
        period: range.period,
        rangeStart: range.startDate,
        rangeEnd: range.endDate,
      },
    })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// GET /api/reports/my-score
// The signed-in user's own score + breakdown (personnel or director).
export async function getMyScore(req: Request, res: Response): Promise<void> {
  try {
    const { workspaceId, actorId, actorType } = req.user!
    const [scores, currentPoints] = await Promise.all([
      computeWorkspaceScores(workspaceId),
      getCurrentScoringPoints(workspaceId),
    ])
    const sorted = scores  // already sorted desc
    const idx = sorted.findIndex(s => s.id === actorId)
    const mine = idx >= 0 ? { ...sorted[idx], rank: idx + 1 } : null
    res.json({
      score: mine,
      totalUsers: sorted.length,
      actorType,
      config: { epoch: SCORING_EPOCH, points: currentPoints },
    })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// PUT /api/reports/scoring-settings
// Adds effective-dated rule versions. Existing event scores remain unchanged.
export async function updateScoringSettings(req: Request, res: Response): Promise<void> {
  try {
    if (req.user!.actorType !== 'director') { res.status(403).json({ error: 'Director only' }); return }
    const { workspaceId, actorId } = req.user!
    const submitted = req.body?.points as Record<string, unknown> | undefined
    if (!submitted || typeof submitted !== 'object') { res.status(400).json({ error: 'points is required' }); return }

    const next: Partial<Record<ScoringEventType, number>> = {}
    for (const eventType of SCORING_EVENT_TYPES) {
      if (!(eventType in submitted)) continue
      const value = Number(submitted[eventType])
      if (!Number.isInteger(value) || Math.abs(value) > 1000) {
        res.status(400).json({ error: `${eventType} must be a whole number between -1000 and 1000` }); return
      }
      const isReward = ['DAILY_LOGIN', 'TASK_UPDATE', 'ON_TIME_SUBMISSION'].includes(eventType)
      if ((isReward && value < 0) || (!isReward && value > 0)) {
        res.status(400).json({ error: `${eventType} has an invalid reward/penalty sign` }); return
      }
      next[eventType] = value
    }
    if (Object.keys(next).length === 0) { res.status(400).json({ error: 'No scoring values supplied' }); return }

    const current = await getCurrentScoringPoints(workspaceId)
    const changes = SCORING_EVENT_TYPES.filter(key => next[key] !== undefined && next[key] !== current[key])
    if (changes.length === 0) { res.json({ points: current, effectiveAt: null, changed: false }); return }

    const effectiveAt = new Date()
    await prisma.$transaction(async tx => {
      await tx.scoringRuleVersion.createMany({
        data: changes.map(eventType => ({
          workspaceId,
          eventType,
          points: next[eventType]!,
          effectiveAt,
          changedByDirectorId: actorId,
        })),
      })
      await tx.auditLog.create({
        data: {
          workspaceId,
          event: 'SCORING_RULES_UPDATED',
          actorType: 'director',
          actorDirectorId: actorId,
          payload: { effectiveAt: effectiveAt.toISOString(), changes: Object.fromEntries(changes.map(key => [key, { from: current[key], to: next[key] }])) },
        },
      })
    })
    res.json({ points: { ...current, ...next }, effectiveAt, changed: true })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// GET /api/reports/cancelled-task-reviews
export async function listCancelledTaskReviews(req: Request, res: Response): Promise<void> {
  try {
    if (req.user!.actorType !== 'director') { res.status(403).json({ error: 'Director only' }); return }
    const { workspaceId } = req.user!
    const status = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : 'PENDING'
    if (!['PENDING', 'DEDUCTED', 'NOT_DEDUCTED', 'ALL'].includes(status)) {
      res.status(400).json({ error: 'Invalid review status' }); return
    }
    const reviews = await prisma.taskCancellationReview.findMany({
      where: { workspaceId, ...(status === 'ALL' ? {} : { status }) },
      include: {
        task: {
          select: {
            id: true, title: true, cancelReason: true, cancelledAt: true,
            project: { select: { name: true, category: { select: { name: true } } } },
          },
        },
        recipients: { include: { personnel: { select: { id: true, name: true } } } },
        decidedByDirector: { select: { id: true, name: true } },
      },
      orderBy: [{ status: 'desc' }, { createdAt: 'desc' }],
    })
    const points = await getCurrentScoringPoints(workspaceId)
    res.json({ reviews, cancellationPenalty: points.CANCELLATION })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// POST /api/reports/cancelled-task-reviews/:taskId/decision
export async function decideCancelledTaskReview(req: Request, res: Response): Promise<void> {
  try {
    if (req.user!.actorType !== 'director') { res.status(403).json({ error: 'Director only' }); return }
    const { workspaceId, actorId } = req.user!
    const decision = String(req.body?.decision ?? '').toUpperCase()
    if (!['DEDUCT', 'DONT_DEDUCT'].includes(decision)) {
      res.status(400).json({ error: 'decision must be DEDUCT or DONT_DEDUCT' }); return
    }
    const review = await prisma.taskCancellationReview.findFirst({
      where: { taskId: req.params.taskId, workspaceId },
      include: { recipients: true, task: { select: { title: true } } },
    })
    if (!review) { res.status(404).json({ error: 'Cancelled task review not found' }); return }
    if (review.status !== 'PENDING') { res.status(409).json({ error: 'This cancelled task has already been reviewed' }); return }
    if (decision === 'DEDUCT' && review.recipients.length === 0) {
      res.status(400).json({ error: 'No responsible personnel is recorded for this task; choose Don’t deduct' }); return
    }

    const currentPoints = await getCurrentScoringPoints(workspaceId)
    const decidedAt = new Date()
    const status = decision === 'DEDUCT' ? 'DEDUCTED' : 'NOT_DEDUCTED'
    const penaltyPoints = decision === 'DEDUCT' ? currentPoints.CANCELLATION : null
    await prisma.$transaction(async tx => {
      const changed = await tx.taskCancellationReview.updateMany({
        where: { id: review.id, status: 'PENDING' },
        data: { status, penaltyPoints, decidedAt, decidedByDirectorId: actorId },
      })
      if (changed.count !== 1) throw new Error('Cancellation review was already decided')
      await tx.auditLog.create({
        data: {
          workspaceId,
          taskId: req.params.taskId,
          event: decision === 'DEDUCT' ? 'CANCELLATION_PENALTY_APPLIED' : 'CANCELLATION_PENALTY_WAIVED',
          actorType: 'director',
          actorDirectorId: actorId,
          payload: { taskTitle: review.task.title, penaltyPoints, recipientPersonnelIds: review.recipients.map(r => r.personnelId) },
        },
      })
    })
    res.json({ success: true, status, penaltyPoints, decidedAt })
  } catch (err) {
    console.error(err)
    if (err instanceof Error && err.message === 'Cancellation review was already decided') {
      res.status(409).json({ error: err.message }); return
    }
    res.status(500).json({ error: 'Internal server error' })
  }
}
