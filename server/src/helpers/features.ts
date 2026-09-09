import { NextFunction, Request, Response } from 'express'
import prisma from '../prisma'

export const FEATURES = {
  INSURANCE_MANAGEMENT: 'insurance_management',
  /**
   * Four organisational levels instead of three. Levels 2 and 3 split into Head
   * Office and Provincial departments, level 4 holds job-role departments, and
   * a reporting manager becomes mandatory when creating a level 2, 3 or 4 user.
   * Enabled for Youth Council only.
   */
  FOUR_LEVEL_HIERARCHY: 'four_level_hierarchy',
} as const

export type FeatureKey = (typeof FEATURES)[keyof typeof FEATURES]

/**
 * Every feature a System Administrator can grant, in the order the admin screen
 * lists them. A company with no row for a key does not have that feature.
 */
export const FEATURE_CATALOG: ReadonlyArray<{ key: FeatureKey; name: string; description: string }> = [
  {
    key: FEATURES.INSURANCE_MANAGEMENT,
    name: 'Insurance management',
    description: 'Quotations, policies and renewals, with a monthly insurance report.',
  },
  {
    key: FEATURES.FOUR_LEVEL_HIERARCHY,
    name: 'Four-level hierarchy',
    description:
      'Adds a fourth level of job-role departments, splits levels 2 and 3 into Head Office and Provincial, and requires a reporting manager when creating a level 2, 3 or 4 user.',
  },
]

export async function getEnabledFeatures(workspaceId: string): Promise<string[]> {
  const rows = await prisma.companyFeature.findMany({
    where: {
      enabled: true,
      company: { workspaceId, status: 'ACTIVE' },
    },
    select: { featureKey: true },
    orderBy: { featureKey: 'asc' },
  })
  return rows.map(row => row.featureKey)
}

export function requireFeature(featureKey: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' })
        return
      }
      const entitlement = await prisma.companyFeature.findFirst({
        where: {
          featureKey,
          enabled: true,
          company: { workspaceId: req.user.workspaceId, status: 'ACTIVE' },
        },
        select: { id: true },
      })
      if (!entitlement) {
        res.status(403).json({ error: 'This feature is not enabled for your company' })
        return
      }
      next()
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  }
}
