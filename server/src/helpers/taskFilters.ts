// ─────────────────────────────────────────────────────────────────────────────
// Task list filtering helpers
//
// The Tasks page hides completed/dead work (APPROVED, CANCELLED) by default, but
// users can opt back in. The exclusion is enforced in the query layer (see
// listTasks) rather than only hidden in the UI, so the API never ships those
// rows unless they were explicitly asked for.
// ─────────────────────────────────────────────────────────────────────────────

/** Statuses the Tasks page omits on a default (no-filter) load. */
export const DEFAULT_EXCLUDED_TASK_STATUSES = ['APPROVED', 'CANCELLED'] as const

export type TaskStatusWhere = string | { notIn: string[] } | undefined

/**
 * Resolve the Prisma `status` clause for a task query.
 *
 * - An explicit single `status` always wins — asking for exactly "APPROVED"
 *   returns approved tasks even though they are excluded by default.
 * - Otherwise a comma-separated `excludeStatus` becomes a `NOT IN` filter.
 * - Returns `undefined` when no status constraint applies (show everything).
 */
export function resolveTaskStatusWhere(status?: string, excludeStatus?: string): TaskStatusWhere {
  if (status) return status
  if (excludeStatus) {
    const excluded = excludeStatus
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
    if (excluded.length > 0) return { notIn: excluded }
  }
  return undefined
}
