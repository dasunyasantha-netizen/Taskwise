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
} as const

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
}

const n = (v: bigint | number | null): number => (v == null ? 0 : Number(v))

/**
 * Compute per-personnel scores for a whole workspace in a single query.
 * Returns rows sorted by totalPoints descending (highest first).
 */
export async function computeWorkspaceScores(workspaceId: string): Promise<UserScore[]> {
  const epoch = new Date(`${SCORING_EPOCH}T00:00:00Z`)

  const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    WITH login_pts AS (
      SELECT "actorId" AS pid, COUNT(DISTINCT DATE("loggedInAt")) AS login_days
      FROM "LoginLog"
      WHERE "workspaceId" = ${workspaceId}
        AND "actorType" = 'personnel'
        AND "loggedInAt" >= ${epoch}
      GROUP BY "actorId"
    ),
    update_pts AS (
      SELECT pid, COUNT(*) AS task_updates FROM (
        SELECT DISTINCT "authorPersonnelId" AS pid, "taskId", DATE("logDate") AS d
        FROM "TaskProgressLog"
        WHERE "workspaceId" = ${workspaceId}
          AND "authorType" = 'personnel'
          AND "authorPersonnelId" IS NOT NULL
          AND "logDate" >= ${epoch}
      ) daily_updates
      GROUP BY pid
    ),
    submit_pts AS (
      SELECT a."actorPersonnelId" AS pid,
        COUNT(*) FILTER (WHERE DATE(a."createdAt") <= DATE(t."deadline")) AS ontime_count,
        COALESCE(SUM(GREATEST(0, DATE(a."createdAt") - DATE(t."deadline"))), 0) AS overdue_days
      FROM "AuditLog" a
      JOIN "Task" t ON t.id = a."taskId"
      WHERE a."workspaceId" = ${workspaceId}
        AND a.event = 'TASK_SUBMITTED'
        AND a."actorPersonnelId" IS NOT NULL
        AND a."createdAt" >= ${epoch}
        AND t."deadline" IS NOT NULL
      GROUP BY a."actorPersonnelId"
    ),
    reject_pts AS (
      SELECT t."actedById" AS pid, COUNT(*) AS rejection_count
      FROM "AuditLog" a
      JOIN "Task" t ON t.id = a."taskId"
      WHERE a."workspaceId" = ${workspaceId}
        AND a.event = 'TASK_REJECTED'
        AND a."createdAt" >= ${epoch}
        AND t."actedByType" = 'personnel'
        AND t."actedById" IS NOT NULL
      GROUP BY t."actedById"
    )
    SELECT
      p.id, p.name, p."avatarUrl", d.name AS department,
      COALESCE(l.login_days, 0)       AS login_days,
      COALESCE(u.task_updates, 0)     AS task_updates,
      COALESCE(s.ontime_count, 0)     AS ontime_count,
      COALESCE(s.overdue_days, 0)     AS overdue_days,
      COALESCE(r.rejection_count, 0)  AS rejection_count
    FROM "Personnel" p
    LEFT JOIN "Department" d ON d.id = p."departmentId"
    LEFT JOIN login_pts  l ON l.pid = p.id
    LEFT JOIN update_pts u ON u.pid = p.id
    LEFT JOIN submit_pts s ON s.pid = p.id
    LEFT JOIN reject_pts r ON r.pid = p.id
    WHERE p."workspaceId" = ${workspaceId} AND p."deletedAt" IS NULL
  `)

  return rows
    .map<UserScore>(r => {
      const loginDays      = n(r.login_days)
      const taskUpdates    = n(r.task_updates)
      const onTimeCount    = n(r.ontime_count)
      const overdueDays    = n(r.overdue_days)
      const rejectionCount = n(r.rejection_count)

      const earned =
        loginDays   * POINTS.DAILY_LOGIN +
        taskUpdates * POINTS.TASK_UPDATE +
        onTimeCount * POINTS.ON_TIME_SUBMISSION
      const deductions =
        overdueDays    * -POINTS.OVERDUE_PER_DAY +   // -POINTS.OVERDUE_PER_DAY = +2
        rejectionCount * -POINTS.REJECTION           // -POINTS.REJECTION = +5

      return {
        id: r.id,
        name: r.name,
        department: r.department ?? '—',
        avatarUrl: r.avatarUrl,
        loginDays, taskUpdates, onTimeCount, overdueDays, rejectionCount,
        earned,
        deductions,
        totalPoints: earned - deductions,
      }
    })
    .sort((a, b) => b.totalPoints - a.totalPoints)
}
