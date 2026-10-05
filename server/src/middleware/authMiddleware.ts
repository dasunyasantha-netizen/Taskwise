import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import prisma from '../prisma'
import { fixedRoleMetadata, usesFixedRoles, isRoleAlias } from '../helpers/fixedRoles'
import { TEST_WORKSPACE, testSandboxState, resetTestSandbox } from '../helpers/testSandbox'
import { localDate } from '../helpers/ysoRules'
import { requestContext } from '../helpers/requestContext'

export interface AuthPayload {
  roleBasedIdentity?: boolean
  roleId?: string
  personnelRoleId?: string
  actorId: string
  actorType: 'director' | 'personnel'
  workspaceId: string
  iat?: number
  exp?: number
  layerNumber?: number  // Personnel only: which layer they belong to (1, 2, or 3)
  departmentId?: string // Personnel only: their department
  // Support-access fields — present only in short-lived System Admin sessions
  impersonationSessionId?: string
  adminId?: string
  adminName?: string
  authenticationMethod?: 'password' | 'webauthn' | 'syswise'
  syswiseUserId?: number
  assignmentVersion?: number
  holderKey?: string    // which holder of a shared role signed in ('' = main holder)
  holderName?: string
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload
    }
  }
}

const SRI_LANKA_UTC_OFFSET_MS = 5.5 * 60 * 60 * 1000

function startOfTodayInSriLankaUtcMs(now = new Date()): number {
  const sriLankaNow = new Date(now.getTime() + SRI_LANKA_UTC_OFFSET_MS)
  const sriLankaDayStart = Date.UTC(
    sriLankaNow.getUTCFullYear(),
    sriLankaNow.getUTCMonth(),
    sriLankaNow.getUTCDate(),
  )
  return sriLankaDayStart - SRI_LANKA_UTC_OFFSET_MS
}

export async function authenticateToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers['authorization']
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    res.status(401).json({ error: 'No token provided' })
    return
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as AuthPayload
    if (!payload.actorId || !payload.workspaceId || !['director', 'personnel'].includes(payload.actorType)) {
      res.status(401).json({ error: 'Invalid session' }); return
    }
    if (!payload.iat || payload.iat * 1000 < startOfTodayInSriLankaUtcMs()) {
      res.status(401).json({ error: 'Session expired. Please sign in again.' })
      return
    }
    if (payload.workspaceId === TEST_WORKSPACE) {
      const state = await testSandboxState(payload.workspaceId)
      if (!state?.enabled) { res.status(403).json({ error: 'Test company is disabled' }); return }
      if (localDate(state.lastResetAt) !== localDate()) {
        try { await resetTestSandbox() }
        catch { res.status(503).json({ error: 'Test company reset pending. Please try again shortly.' }); return }
        res.status(401).json({ error: 'Test company reset. Please sign in again.' }); return
      }
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
          (/\/letters\/(drive|settings)/.test(req.originalUrl) ||
           /\/auth\/(migration-contact|role-contacts|change-password|webauthn\/register)/.test(req.originalUrl) ||
           /\/workspace\/profile|\/reset-password(?:\?|$)/.test(req.originalUrl) ||
           /\/workspace\/.*(contact|role)/.test(req.originalUrl))) {
        res.status(403).json({ error: 'Real integrations and identity changes are disabled in the test company.' }); return
      }
    }
    const actor = payload.actorType === 'director'
      ? await prisma.director.findFirst({ where: { id: payload.actorId, workspaceId: payload.workspaceId, isActive: true }, select: { company: { select: { status: true } } } })
      : await prisma.personnel.findFirst({ where: { id: payload.actorId, workspaceId: payload.workspaceId, isActive: true, deletedAt: null }, select: { company: { select: { status: true } } } })
    if (!actor || (actor.company && actor.company.status !== 'ACTIVE')) {
      res.status(401).json({ error: 'This role is no longer active.' }); return
    }
    const contact = await prisma.migrationRoleContact.findUnique({ where: { actorType_actorId_holderKey: {
      actorType: payload.actorType, actorId: payload.actorId, holderKey: payload.authenticationMethod === 'syswise' ? payload.holderKey || '' : '' } } })
    if (await isRoleAlias(payload.actorType, payload.actorId)) {
      res.status(401).json({ error: 'Open the unified Chairman role through Syswise.', code: 'syswise_signin_required' }); return
    }
    if (payload.authenticationMethod === 'syswise') {
      if (!contact || contact.workspaceId !== payload.workspaceId || contact.assignmentVersion !== payload.assignmentVersion ||
          !payload.syswiseUserId || contact.syswiseUserId !== payload.syswiseUserId) {
        res.status(401).json({ error: 'Your role assignment changed. Open Taskwise from Syswise again.' }); return
      }
    } else if (!payload.impersonationSessionId && (contact?.syswiseUserId || contact?.legacyAccessRevokedAt || await usesFixedRoles(payload.workspaceId))) {
      res.status(401).json({ error: 'Sign in through Syswise to open this role.', code: 'syswise_signin_required' }); return
    }
    if (payload.impersonationSessionId) {
      if (!payload.adminId) {
        res.status(401).json({ error: 'Invalid support-access session' })
        return
      }
      const session = await prisma.impersonationSession.findUnique({
        where: { id: payload.impersonationSessionId },
      })
      const expiresAt = session?.expiresAt || (session ? new Date(session.startedAt.getTime() + 15 * 60 * 1000) : null)
      if (
        !session ||
        session.endedAt ||
        session.adminId !== payload.adminId ||
        session.targetActorId !== payload.actorId ||
        session.targetActorType !== payload.actorType ||
        !expiresAt ||
        expiresAt.getTime() <= Date.now()
      ) {
        if (session && !session.endedAt && expiresAt && expiresAt.getTime() <= Date.now()) {
          prisma.impersonationSession.update({
            where: { id: session.id },
            data: { endedAt: new Date(), endReason: 'expired' },
          }).catch(() => {})
        }
        res.status(401).json({ error: 'Support-access session expired or ended' })
        return
      }

      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        res.on('finish', () => {
          prisma.auditLog.create({
            data: {
              workspaceId: session.workspaceId,
              event: 'IMPERSONATION_ACTION',
              actorDirectorId: payload.adminId,
              actorType: 'director',
              payload: {
                action: `${req.method} ${req.originalUrl}`,
                sessionId: session.id,
                targetId: session.targetActorId,
                targetName: session.targetName,
                targetActorType: session.targetActorType,
                statusCode: String(res.statusCode),
              },
            },
          }).catch(() => {})
        })
      }
    }
    const holderName = payload.authenticationMethod === 'syswise' ? contact?.holderName || undefined : undefined
    req.user = { ...payload, holderName, ...await fixedRoleMetadata(payload.actorType, payload.actorId, payload.workspaceId) }
    requestContext.run({ holderName }, next)
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}

export function requireDirector(req: Request, res: Response, next: NextFunction): void {
  const u = req.user
  if (!u) { res.status(403).json({ error: 'Director access required' }); return }
  if (u.actorType !== 'director') {
    res.status(403).json({ error: 'Director access required' })
    return
  }
  next()
}

export async function requireChairman(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.user?.actorType !== 'director') {
      res.status(403).json({ error: 'Chairman access required' })
      return
    }
    const chairman = await prisma.director.findFirst({
      where: {
        id: req.user.actorId,
        workspaceId: req.user.workspaceId,
        isChairman: true,
        isActive: true,
      },
      select: { id: true },
    })
    if (!chairman) {
      res.status(403).json({ error: 'Chairman access required' })
      return
    }
    next()
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
}

export async function requireSyswiseAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.user?.actorType !== 'director' || req.user.impersonationSessionId) {
      res.status(403).json({ error: 'System administrator access required' })
      return
    }
    const director = await prisma.director.findUnique({
      where: { id: req.user.actorId },
      select: { isSyswiseAdmin: true, isActive: true },
    })
    if (!director?.isSyswiseAdmin || !director.isActive) {
      res.status(403).json({ error: 'System administrator access required' })
      return
    }
    next()
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
}
