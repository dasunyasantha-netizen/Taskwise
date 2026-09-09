/**
 * Company feature entitlements, managed by a System Administrator.
 *
 * Features are opt-in: a company without a row for a key does not have that
 * feature. Turning one off leaves the row in place with `enabled = false` so the
 * history of the grant survives.
 */
import { Request, Response } from 'express'
import prisma from '../prisma'
import { FEATURE_CATALOG } from '../helpers/features'

const CATALOG_KEYS = new Set<string>(FEATURE_CATALOG.map(f => f.key))

// GET /api/admin/features — every company with the features it holds
export async function listCompanyFeatures(_req: Request, res: Response): Promise<void> {
  try {
    const companies = await prisma.company.findMany({
      orderBy: [{ status: 'asc' }, { legalName: 'asc' }],
      select: {
        id: true,
        legalName: true,
        displayName: true,
        prefix: true,
        status: true,
        workspaceId: true,
        features: { select: { featureKey: true, enabled: true, updatedAt: true } },
      },
    })

    res.json({
      catalog: FEATURE_CATALOG,
      companies: companies.map(company => ({
        id: company.id,
        name: company.displayName || company.legalName,
        legalName: company.legalName,
        prefix: company.prefix,
        status: company.status,
        hasWorkspace: company.workspaceId !== null,
        features: Object.fromEntries(
          FEATURE_CATALOG.map(f => {
            const row = company.features.find(r => r.featureKey === f.key)
            return [f.key, { enabled: row?.enabled === true, updatedAt: row?.updatedAt ?? null }]
          }),
        ),
      })),
    })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// PUT /api/admin/features/:companyId/:featureKey  body: { enabled: boolean }
export async function setCompanyFeature(req: Request, res: Response): Promise<void> {
  try {
    const { companyId, featureKey } = req.params
    const { enabled } = req.body
    if (typeof enabled !== 'boolean') { res.status(400).json({ error: 'enabled must be true or false' }); return }
    if (!CATALOG_KEYS.has(featureKey)) { res.status(404).json({ error: 'Unknown feature' }); return }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, legalName: true, workspaceId: true },
    })
    if (!company) { res.status(404).json({ error: 'Company not found' }); return }

    const previous = await prisma.companyFeature.findUnique({
      where: { companyId_featureKey: { companyId, featureKey } },
      select: { enabled: true },
    })

    const row = await prisma.companyFeature.upsert({
      where: { companyId_featureKey: { companyId, featureKey } },
      create: { companyId, featureKey, enabled },
      update: { enabled },
      select: { featureKey: true, enabled: true, updatedAt: true },
    })

    // Entitlement changes are audited against the company's own workspace where
    // it has one, otherwise against the administrator's.
    const auditWorkspaceId = company.workspaceId || req.user!.workspaceId
    if (auditWorkspaceId && previous?.enabled !== enabled) {
      await prisma.auditLog.create({
        data: {
          workspaceId: auditWorkspaceId,
          event: enabled ? 'COMPANY_FEATURE_ENABLED' : 'COMPANY_FEATURE_DISABLED',
          actorDirectorId: req.user!.actorId,
          actorType: 'director',
          payload: { companyId, companyName: company.legalName, featureKey, from: String(previous?.enabled ?? false), to: String(enabled) },
        },
      }).catch(() => {})
    }

    res.json({ companyId, ...row })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}
