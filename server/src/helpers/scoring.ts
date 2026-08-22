import { Prisma } from '@prisma/client'
import prisma from '../prisma'

// ─────────────────────────────────────────────────────────────────────────────
// Gamification scoring engine (DERIVED — no stored ledger)
//
// Every point event is computed on read from data the app already records:
//   • LoginLog        → daily login rewards
//   • TaskProgressLog → task-update rewards (capped 1 per task per day)
//   • AuditLog        → on-time / overdue submission and rejection penalties
//
// Scores only count activity on or after SCORING_EPOCH, so the leaderboard is
// fair against the point at which activity tracking became reliable.
// ─────────────────────────────────────────────────────────────────────────────

/** Points only accrue for events on or after this date (workspace go-live for scoring). */
export const SCORING_EPOCH = '2026-07-17'

export const POINTS = {
  DAILY_LOGIN:        1,   // per calendar day the user logs in
  TASK_UPDATE:        2,   // per task updated (max one credit per task per day)
  ON_TIME_SUBMISSION: 5,   // per task submitted on or before its deadline
  OVERDUE_PER_DAY:   -2,   // per day a submission is late
  REJECTION:         -5,   // per task rejected by a director / chairman
  CANCELLATION:      -5,   // applied only after a director approves the deduction
} as const

export type ScoringEventType = keyof typeof POINTS
export type ScoringPoints = Record<ScoringEventType, number>
export const SCORING_EVENT_TYPES = Object.keys(POINTS) as ScoringEventType[]

/** Current values are for future events and display only; historic events use their effective version. */
export async function getCurrentScoringPoints(workspaceId: string): Promise<ScoringPoints> {
  const versions = await prisma.scoringRuleVersion.findMany({
    where: { workspaceId, effectiveAt: { lte: new Date() } },
    orderBy: { effectiveAt: 'desc' },
  })
  const current = { ...POINTS } as ScoringPoints
  const seen = new Set<string>()
  for (const version of versions) {
    if (version.eventType in current && !seen.has(version.eventType)) {
      current[version.eventType as ScoringEventType] = version.points
      seen.add(version.eventType)
    }
  }
  return current
}

export type ScorePeriod = 'all' | 'week' | 'last_week' | 'month' | 'last_month'

/** TaskWise currently operates on Sri Lanka calendar time (UTC+05:30). */
export const SCORING_UTC_OFFSET_MINUTES = 330

export interface ScoreRange {
  period: ScorePeriod
  start: Date
  endExclusive: Date
  startDate: string
  endDate: string
}

const offsetMs = SCORING_UTC_OFFSET_MINUTES * 60 * 1000

const localCalendarDay = (date: Date): Date => {
  const shifted = new Date(date.getTime() + offsetMs)
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()))
}

const localMidnightToUtc = (localDate: Date): Date => new Date(localDate.getTime() - offsetMs)

const dateKey = (date: Date): string => date.toISOString().slice(0, 10)

/** Resolve calendar periods. Weeks run Monday-Sunday; months use calendar boundaries. */
export function resolveScoreRange(period: ScorePeriod, now = new Date()): ScoreRange {
  const today = localCalendarDay(now)
  const epochDay = new Date(`${SCORING_EPOCH}T00:00:00Z`)
  let startDay = new Date(epochDay)
  let endDayExclusive = new Date(today)
  endDayExclusive.setUTCDate(endDayExclusive.getUTCDate() + 1)

  if (period === 'week' || period === 'last_week') {
    startDay = new Date(today)
    const daysSinceMonday = (startDay.getUTCDay() + 6) % 7
    startDay.setUTCDate(startDay.getUTCDate() - daysSinceMonday)
    if (period === 'last_week') startDay.setUTCDate(startDay.getUTCDate() - 7)
    endDayExclusive = new Date(startDay)
    endDayExclusive.setUTCDate(endDayExclusive.getUTCDate() + 7)
  } else if (period === 'month' || period === 'last_month') {
    const monthOffset = period === 'last_month' ? -1 : 0
    startDay = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + monthOffset, 1))
    endDayExclusive = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + monthOffset + 1, 1))
  }

  if (startDay < epochDay) startDay = epochDay
  const inclusiveEnd = new Date(endDayExclusive)
  inclusiveEnd.setUTCDate(inclusiveEnd.getUTCDate() - 1)

  return {
    period,
    start: localMidnightToUtc(startDay),
    endExclusive: localMidnightToUtc(endDayExclusive),
    startDate: dateKey(startDay),
    endDate: dateKey(inclusiveEnd),
  }
}

export interface UserScore {
  id: string
  name: string
  department: string
  avatarUrl: string | null
  loginDays: number
  taskUpdates: number
  onTimeCount: number
  overdueDays: number
  rejectionCount: number
  cancellationCount: number
  deadlineDeductionCount: number
  loginPoints: number
  taskUpdatePoints: number
  onTimePoints: number
  overduePoints: number
  rejectionPoints: number
  cancellationPoints: number
  /** Points removed by director deadline-extension deductions (positive magnitude). */
  deadlineDeductionPoints: number
  /** Positive points only (logins + updates + on-time). */
  earned: number
  /** Negative points only (overdue + rejections), as a positive magnitude. */
  deductions: number
  /** Net total = earned − deductions. Uncapped, may be negative. */
  totalPoints: number
}

interface RawRow {
  id: string
  name: string
  department: string | null
  avatarUrl: string | null
  login_days: bigint | number
  task_updates: bigint | number
  ontime_count: bigint | number
  overdue_days: bigint | number
  rejection_count: bigint | number
  cancellation_count: bigint | number
  deadline_deduction_count: bigint | number
  login_points: bigint | number
  task_update_points: bigint | number
  ontime_points: bigint | number
  overdue_points: bigint | number
  rejection_points: bigint | number
  cancellation_points: bigint | number
  deadline_deduction_points: bigint | number
}

const n = (v: bigint | number | null): number => (v == null ? 0 : Number(v))

/**
 * Compute per-personnel scores for a whole workspace in a single query.
 * Returns rows sorted by totalPoints descending (highest first).
 */
export async function computeWorkspaceScores(
  workspaceId: string,
  range: ScoreRange = resolveScoreRange('all'),
): Promise<UserScore[]> {
  const { start, endExclusive } = range

  const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    WITH daily_login_events AS (
      SELECT "actorId" AS pid,
             DATE("loggedInAt" + INTERVAL '5 hours 30 minutes') AS local_day,
             MIN("loggedInAt") AS event_at
      FROM "LoginLog"
      WHERE "workspaceId" = ${workspaceId} AND "actorType" = 'personnel'
        AND "loggedInAt" >= ${start} AND "loggedInAt" < ${endExclusive}
      GROUP BY "actorId", DATE("loggedInAt" + INTERVAL '5 hours 30 minutes')
    ),
    login_pts AS (
      SELECT pid, COUNT(*) AS login_days,
        SUM(COALESCE((
          SELECT rv.points FROM "ScoringRuleVersion" rv
          WHERE rv."workspaceId" = ${workspaceId} AND rv."eventType" = 'DAILY_LOGIN'
            AND rv."effectiveAt" <= e.event_at
          ORDER BY rv."effectiveAt" DESC LIMIT 1
        ), ${POINTS.DAILY_LOGIN})) AS login_points
      FROM daily_login_events e GROUP BY pid
    ),
    daily_update_events AS (
        SELECT "authorPersonnelId" AS pid, "taskId",
               DATE("logDate" + INTERVAL '5 hours 30 minutes') AS local_day,
               MIN("logDate") AS event_at
        FROM "TaskProgressLog"
        WHERE "workspaceId" = ${workspaceId}
          AND "authorType" = 'personnel'
          AND "authorPersonnelId" IS NOT NULL
          AND "logDate" >= ${start} AND "logDate" < ${endExclusive}
        GROUP BY "authorPersonnelId", "taskId", DATE("logDate" + INTERVAL '5 hours 30 minutes')
    ),
    update_pts AS (
      SELECT pid, COUNT(*) AS task_updates,
        SUM(COALESCE((
          SELECT rv.points FROM "ScoringRuleVersion" rv
          WHERE rv."workspaceId" = ${workspaceId} AND rv."eventType" = 'TASK_UPDATE'
            AND rv."effectiveAt" <= e.event_at
          ORDER BY rv."effectiveAt" DESC LIMIT 1
        ), ${POINTS.TASK_UPDATE})) AS task_update_points
      FROM daily_update_events e GROUP BY pid
    ),
    submit_pts AS (
      SELECT a."actorPersonnelId" AS pid,
        COUNT(*) FILTER (WHERE DATE(a."createdAt" + INTERVAL '5 hours 30 minutes') <= DATE(t."deadline")) AS ontime_count,
        COALESCE(SUM(GREATEST(0, DATE(a."createdAt" + INTERVAL '5 hours 30 minutes') - DATE(t."deadline"))), 0) AS overdue_days,
        COALESCE(SUM(CASE WHEN DATE(a."createdAt" + INTERVAL '5 hours 30 minutes') <= DATE(t."deadline") THEN
          COALESCE((SELECT rv.points FROM "ScoringRuleVersion" rv
            WHERE rv."workspaceId" = ${workspaceId} AND rv."eventType" = 'ON_TIME_SUBMISSION'
              AND rv."effectiveAt" <= a."createdAt"
            ORDER BY rv."effectiveAt" DESC LIMIT 1), ${POINTS.ON_TIME_SUBMISSION})
          ELSE 0 END), 0) AS ontime_points,
        COALESCE(SUM(GREATEST(0, DATE(a."createdAt" + INTERVAL '5 hours 30 minutes') - DATE(t."deadline")) *
          COALESCE((SELECT rv.points FROM "ScoringRuleVersion" rv
            WHERE rv."workspaceId" = ${workspaceId} AND rv."eventType" = 'OVERDUE_PER_DAY'
              AND rv."effectiveAt" <= a."createdAt"
            ORDER BY rv."effectiveAt" DESC LIMIT 1), ${POINTS.OVERDUE_PER_DAY})), 0) AS overdue_points
      FROM "AuditLog" a
      JOIN "Task" t ON t.id = a."taskId"
      WHERE a."workspaceId" = ${workspaceId}
        AND a.event = 'TASK_SUBMITTED'
        AND a."actorPersonnelId" IS NOT NULL
        AND a."createdAt" >= ${start}
        AND a."createdAt" < ${endExclusive}
        AND t."deadline" IS NOT NULL
      GROUP BY a."actorPersonnelId"
    ),
    reject_pts AS (
      SELECT t."actedById" AS pid, COUNT(*) AS rejection_count,
        SUM(COALESCE((SELECT rv.points FROM "ScoringRuleVersion" rv
          WHERE rv."workspaceId" = ${workspaceId} AND rv."eventType" = 'REJECTION'
            AND rv."effectiveAt" <= a."createdAt"
          ORDER BY rv."effectiveAt" DESC LIMIT 1), ${POINTS.REJECTION})) AS rejection_points
      FROM "AuditLog" a
      JOIN "Task" t ON t.id = a."taskId"
      WHERE a."workspaceId" = ${workspaceId}
        AND a.event = 'TASK_REJECTED'
        AND a."createdAt" >= ${start}
        AND a."createdAt" < ${endExclusive}
        AND t."actedByType" = 'personnel'
        AND t."actedById" IS NOT NULL
      GROUP BY t."actedById"
    ),
    cancellation_pts AS (
      SELECT cr."personnelId" AS pid, COUNT(*) AS cancellation_count,
        SUM(r."penaltyPoints") AS cancellation_points
      FROM "TaskCancellationReview" r
      JOIN "TaskCancellationPenaltyRecipient" cr ON cr."reviewId" = r.id
      WHERE r."workspaceId" = ${workspaceId} AND r.status = 'DEDUCTED'
        AND r."decidedAt" >= ${start} AND r."decidedAt" < ${endExclusive}
      GROUP BY cr."personnelId"
    ),
    deadline_deduction_pts AS (
      SELECT "penalizedPersonnelId" AS pid,
        COUNT(*) AS deadline_deduction_count,
        SUM("pointsDeducted") AS deadline_deduction_points
      FROM "DeadlineExtension"
      WHERE "workspaceId" = ${workspaceId}
        AND "penalizedPersonnelId" IS NOT NULL
        AND "pointsDeducted" > 0
        AND "createdAt" >= ${start} AND "createdAt" < ${endExclusive}
      GROUP BY "penalizedPersonnelId"
    )
    SELECT
      p.id, p.name, p."avatarUrl", d.name AS department,
      COALESCE(l.login_days, 0)       AS login_days,
      COALESCE(u.task_updates, 0)     AS task_updates,
      COALESCE(s.ontime_count, 0)     AS ontime_count,
      COALESCE(s.overdue_days, 0)     AS overdue_days,
      COALESCE(r.rejection_count, 0)  AS rejection_count,
      COALESCE(c.cancellation_count, 0) AS cancellation_count,
      COALESCE(dd.deadline_deduction_count, 0) AS deadline_deduction_count,
      COALESCE(l.login_points, 0) AS login_points,
      COALESCE(u.task_update_points, 0) AS task_update_points,
      COALESCE(s.ontime_points, 0) AS ontime_points,
      COALESCE(s.overdue_points, 0) AS overdue_points,
      COALESCE(r.rejection_points, 0) AS rejection_points,
      COALESCE(c.cancellation_points, 0) AS cancellation_points,
      COALESCE(dd.deadline_deduction_points, 0) AS deadline_deduction_points
    FROM "Personnel" p
    LEFT JOIN "Department" d ON d.id = p."departmentId"
    LEFT JOIN login_pts  l ON l.pid = p.id
    LEFT JOIN update_pts u ON u.pid = p.id
    LEFT JOIN submit_pts s ON s.pid = p.id
    LEFT JOIN reject_pts r ON r.pid = p.id
    LEFT JOIN cancellation_pts c ON c.pid = p.id
    LEFT JOIN deadline_deduction_pts dd ON dd.pid = p.id
    WHERE p."workspaceId" = ${workspaceId} AND p."deletedAt" IS NULL
  `)

  return rows
    .map<UserScore>(r => {
      const loginDays      = n(r.login_days)
      const taskUpdates    = n(r.task_updates)
      const onTimeCount    = n(r.ontime_count)
      const overdueDays    = n(r.overdue_days)
      const rejectionCount = n(r.rejection_count)
      const cancellationCount = n(r.cancellation_count)
      const deadlineDeductionCount = n(r.deadline_deduction_count)
      const loginPoints = n(r.login_points)
      const taskUpdatePoints = n(r.task_update_points)
      const onTimePoints = n(r.ontime_points)
      const overduePoints = n(r.overdue_points)
      const rejectionPoints = n(r.rejection_points)
      const cancellationPoints = n(r.cancellation_points)
      // Stored as a positive magnitude (the number a director chose to deduct).
      const deadlineDeductionPoints = n(r.deadline_deduction_points)

      const earned = loginPoints + taskUpdatePoints + onTimePoints
      const deductions = -(overduePoints + rejectionPoints + cancellationPoints) + deadlineDeductionPoints

      return {
        id: r.id,
        name: r.name,
        department: r.department ?? '—',
        avatarUrl: r.avatarUrl,
        loginDays, taskUpdates, onTimeCount, overdueDays, rejectionCount, cancellationCount, deadlineDeductionCount,
        loginPoints, taskUpdatePoints, onTimePoints, overduePoints, rejectionPoints, cancellationPoints, deadlineDeductionPoints,
        earned,
        deductions,
        totalPoints: earned - deductions,
      }
    })
    .sort((a, b) => b.totalPoints - a.totalPoints)
}

/**
 * Current available point balance (all-time) for one personnel — used to validate
 * and preview a deadline-extension deduction. Returns 0 when the person has no score.
 */
export async function getPersonnelAvailablePoints(workspaceId: string, personnelId: string): Promise<number> {
  const scores = await computeWorkspaceScores(workspaceId)
  return scores.find(s => s.id === personnelId)?.totalPoints ?? 0
}
