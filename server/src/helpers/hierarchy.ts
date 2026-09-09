/**
 * Four-level hierarchy rules — feature `four_level_hierarchy`.
 *
 *   Level 1  no category, reports to the Director
 *   Level 2  Head Office | Provincial, reports to a level 1 user
 *   Level 3  Head Office | Provincial, reports to a level 2 user
 *   Level 4  no category, job-role departments, reports to a level 3 user
 *
 * Head Office and Provincial hold identical permissions and data access; the
 * category is a classification used for grouping, filtering and reporting.
 *
 * Companies without the feature keep three levels, an optional supervisor and
 * no office category. Every rule below is a no-op for them, so their behaviour
 * is unchanged.
 */
import prisma from '../prisma'
import { FEATURES } from './features'

export const OFFICE_CATEGORIES = ['HEAD_OFFICE', 'PROVINCIAL'] as const
export type OfficeCategory = (typeof OFFICE_CATEGORIES)[number]

/** Levels whose departments carry a Head Office / Provincial category. */
export const CATEGORISED_LEVELS = [2, 3]

/** Levels whose users must name a reporting manager one level above them. */
export const MANAGED_LEVELS = [2, 3, 4]

export const MAX_LEVEL = 4

export function isOfficeCategory(value: unknown): value is OfficeCategory {
  return typeof value === 'string' && (OFFICE_CATEGORIES as readonly string[]).includes(value)
}

export function levelTakesCategory(level: number): boolean {
  return CATEGORISED_LEVELS.includes(level)
}

export function levelNeedsManager(level: number): boolean {
  return MANAGED_LEVELS.includes(level)
}

/** True when this workspace's company is entitled to the four-level hierarchy. */
export async function isFourLevelWorkspace(workspaceId: string): Promise<boolean> {
  const entitlement = await prisma.companyFeature.findFirst({
    where: {
      featureKey: FEATURES.FOUR_LEVEL_HIERARCHY,
      enabled: true,
      company: { workspaceId, status: 'ACTIVE' },
    },
    select: { id: true },
  })
  return entitlement !== null
}

type Resolved<T> = { error: string } | { value: T }

/**
 * Validate the Head Office / Provincial tag being written to a department.
 *
 * `provided` is the raw request value; `undefined` means the caller did not
 * mention it, which on an update leaves the existing tag alone.
 */
export function resolveDepartmentCategory(opts: {
  fourLevel: boolean
  level: number
  provided: unknown
  current?: string | null
  isCreate: boolean
}): Resolved<string | null> {
  const { fourLevel, level, provided, current, isCreate } = opts
  const supplied = provided === undefined || provided === null || provided === '' ? null : provided

  if (!fourLevel) {
    if (supplied !== null) return { error: 'Office categories are not enabled for this company' }
    return { value: null }
  }

  if (!levelTakesCategory(level)) {
    if (supplied !== null) {
      return { error: `Only level ${CATEGORISED_LEVELS.join(' and ')} departments carry a Head Office or Provincial category` }
    }
    return { value: null }
  }

  // Levels 2 and 3 require a category, but an update that does not mention it
  // keeps whatever the department already has.
  if (provided === undefined && !isCreate) return { value: current ?? null }
  if (!isOfficeCategory(supplied)) {
    return { error: `A level ${level} department must be Head Office or Provincial` }
  }
  return { value: supplied }
}

/**
 * Validate the reporting manager being written to a personnel record.
 *
 * Under the feature a manager sits exactly one level above the person, which
 * makes reporting cycles structurally impossible. `undefined` means the caller
 * did not mention it: on an update the current manager stands, so existing
 * users missing one are flagged in the UI rather than blocked here.
 */
export async function resolveSupervisor(opts: {
  fourLevel: boolean
  workspaceId: string
  level: number
  subjectId?: string
  provided: unknown
  current?: string | null
  isCreate: boolean
}): Promise<Resolved<string | null>> {
  const { fourLevel, workspaceId, level, subjectId, provided, current, isCreate } = opts
  const supplied = provided === undefined || provided === null || provided === '' ? null : String(provided)

  if (!fourLevel) {
    // Unchanged behaviour for every other company: free-form and optional.
    if (provided === undefined) return { value: current ?? null }
    return { value: supplied }
  }

  if (!levelNeedsManager(level)) {
    if (supplied !== null) return { error: 'Level 1 users report to the Director and cannot have a reporting manager' }
    return { value: null }
  }

  if (provided === undefined && !isCreate) return { value: current ?? null }
  if (supplied === null) return { error: `A level ${level} user must report to a level ${level - 1} manager` }
  if (subjectId && supplied === subjectId) return { error: 'A user cannot report to themselves' }

  const manager = await prisma.personnel.findFirst({
    where: { id: supplied, workspaceId, deletedAt: null },
    select: { id: true, department: { select: { layer: { select: { number: true } } } } },
  })
  if (!manager) return { error: 'Reporting manager not found' }
  if (manager.department?.layer?.number !== level - 1) {
    return { error: `A level ${level} user must report to a level ${level - 1} manager` }
  }
  return { value: supplied }
}

/** The level a person sits at, or null when their department has no layer. */
export async function personnelLevel(personnelId: string, workspaceId: string): Promise<number | null> {
  const person = await prisma.personnel.findFirst({
    where: { id: personnelId, workspaceId, deletedAt: null },
    select: { department: { select: { layer: { select: { number: true } } } } },
  })
  return person?.department?.layer?.number ?? null
}
