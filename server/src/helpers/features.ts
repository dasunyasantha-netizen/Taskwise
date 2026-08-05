import { NextFunction, Request, Response } from 'express'
import prisma from '../prisma'

export const FEATURES = {
  INSURANCE_MANAGEMENT: 'insurance_management',
} as const

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
