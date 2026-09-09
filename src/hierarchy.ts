/**
 * Four-level hierarchy — client-side rules, mirroring server/src/helpers/hierarchy.ts.
 *
 * Companies without the `four_level_hierarchy` feature keep three levels, an
 * optional supervisor, no office category, and the word "Layer". Every helper
 * here takes the signed-in user so the two experiences never leak into each
 * other.
 */
import type { AuthUser, Department, Layer, Personnel } from './types'

export const FOUR_LEVEL_FEATURE = 'four_level_hierarchy'

export type OfficeCategory = 'HEAD_OFFICE' | 'PROVINCIAL'

export const OFFICE_CATEGORY_OPTIONS: Array<{ value: OfficeCategory; label: string }> = [
  { value: 'HEAD_OFFICE', label: 'Head Office' },
  { value: 'PROVINCIAL', label: 'Provincial' },
]

export function officeCategoryLabel(value?: string | null): string | null {
  return OFFICE_CATEGORY_OPTIONS.find(o => o.value === value)?.label ?? null
}

/** Levels whose departments carry a Head Office / Provincial category. */
export function levelTakesCategory(level: number): boolean {
  return level === 2 || level === 3
}

/** Levels whose users must name a reporting manager one level above them. */
export function levelNeedsManager(level: number): boolean {
  return level === 2 || level === 3 || level === 4
}

export function hasFourLevelHierarchy(user?: Pick<AuthUser, 'features'> | null): boolean {
  return user?.features?.includes(FOUR_LEVEL_FEATURE) === true
}

/**
 * What a tier is called for this user. Four-level companies read "Level"; every
 * other company keeps the existing "Layer" wording.
 */
export function tierWord(user?: Pick<AuthUser, 'features'> | null): 'Level' | 'Layer' {
  return hasFourLevelHierarchy(user) ? 'Level' : 'Layer'
}

export function tierLabel(user: Pick<AuthUser, 'features'> | null | undefined, level: number): string {
  return `${tierWord(user)} ${level}`
}

/** A person is flagged when their level requires a manager and none is set. */
export function needsManager(
  user: Pick<AuthUser, 'features'> | null | undefined,
  level: number | undefined,
  supervisorId?: string | null,
): boolean {
  if (!hasFourLevelHierarchy(user) || level === undefined) return false
  return levelNeedsManager(level) && !supervisorId
}

export function departmentLevel(dept: Department | undefined, layers: Layer[]): number | undefined {
  if (!dept) return undefined
  return layers.find(l => l.id === dept.layerId)?.number
}

export function personnelLevel(person: Personnel, departments: Department[], layers: Layer[]): number | undefined {
  const dept = departments.find(d => d.id === person.departmentId)
  return departmentLevel(dept, layers)
}
