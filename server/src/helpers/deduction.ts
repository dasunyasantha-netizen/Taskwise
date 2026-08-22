// ─────────────────────────────────────────────────────────────────────────────
// Point-deduction validation for the deadline-extension flow.
//
// A director may optionally deduct points from a task's assignee while extending
// the deadline. The amount must be a whole number, zero or positive, and never
// more than the assignee currently has. Pure + side-effect free so it can be
// unit tested and reused on both the request path and (mirrored) the client.
// ─────────────────────────────────────────────────────────────────────────────

export interface DeductionValidation {
  /** Normalised whole-number points to deduct (0 = no deduction). */
  points: number
  /** Present only when the input is invalid; `points` is 0 in that case. */
  error?: string
}

/**
 * Validate an optional "points to deduct" value against the assignee's balance.
 *
 * - undefined / null / '' → no deduction (points 0, no error).
 * - Must be a whole number ≥ 0; negatives and fractions are rejected.
 * - A positive amount must not exceed `availablePoints`.
 */
export function validatePointsToDeduct(rawPoints: unknown, availablePoints: number): DeductionValidation {
  if (rawPoints === undefined || rawPoints === null || rawPoints === '') return { points: 0 }

  const num = typeof rawPoints === 'number' ? rawPoints : Number(rawPoints)
  if (!Number.isFinite(num) || !Number.isInteger(num)) {
    return { points: 0, error: 'Points to deduct must be a whole number' }
  }
  if (num < 0) return { points: 0, error: 'Points to deduct cannot be negative' }
  if (num === 0) return { points: 0 }
  if (num > availablePoints) {
    return { points: 0, error: `Cannot deduct ${num} points — the assignee only has ${availablePoints} available` }
  }
  return { points: num }
}
