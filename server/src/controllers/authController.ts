import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import prisma from '../prisma'
import { companyLoginPrefix, normalizeSriLankanPhone, resolveLoginLookup } from '../helpers/phone'

function signToken(
  actorId: string,
  actorType: 'director' | 'personnel',
  workspaceId: string,
  extra?: object,
  expiresIn: jwt.SignOptions['expiresIn'] = '7d',
) {
  return jwt.sign(
    { actorId, actorType, workspaceId, ...extra },
    process.env.JWT_SECRET!,
    { expiresIn }
  )
}

type LoginAccount = {
  loginId: string | null
  companyId: string | null
  company: { prefix: string; allowUnprefixedLogin: boolean; status: string } | null
}

/**
 * Deterministically resolve which account a login ID refers to.
 *
 * The same phone number may legitimately exist in multiple companies, so a
 * lookup by phone can return several candidates. This picks the correct one:
 *  - Prefixed login (e.g. FF0712345678): only an account whose company prefix
 *    matches exactly. A company user can never be resolved via another
 *    company's prefix, nor via the bare phone.
 *  - Unprefixed login (e.g. 0712345678): only a legacy account (no company) or
 *    a company that explicitly allows unprefixed login (Youth Council). This
 *    prevents a prefixed-company user who shares the phone from shadowing — and
 *    thereby breaking — an existing unprefixed Youth Council login.
 */
export function selectAccountByLogin<T extends LoginAccount>(
  candidates: T[],
  parsed: { prefix: string | null; localPhone: string },
): T | null {
  if (parsed.prefix) {
    return candidates.find(c => c.company?.prefix?.toUpperCase() === parsed.prefix) || null
  }
  const legacy = candidates.filter(c => !c.companyId || c.company?.allowUnprefixedLogin)
  return legacy.find(c => c.loginId === parsed.localPhone) || legacy[0] || null
}

// POST /api/auth/login  — unified phone-based login (Director first, then Personnel)
export async function unifiedLogin(req: Request, res: Response): Promise<void> {
  try {
    const { phone, password } = req.body
    if (!phone || !password) {
      res.status(400).json({ error: 'phone and password are required' })
      return
    }
    const invalid = () => res.status(401).json({ error: 'Invalid login ID or password.' })
    const { loginId, lookupPhone, selector } = resolveLoginLookup(phone)

    // 1. Try Director
    const directorCandidates = await prisma.director.findMany({
      where: { OR: [{ loginId }, { phone: lookupPhone }] },
      include: { company: true },
    })
    const director = selectAccountByLogin(directorCandidates, selector)
    if (director) {
      if (!director.isActive) {
        invalid(); return
      }
      if (director.company && director.company.status !== 'ACTIVE') {
        invalid(); return
      }
      if (!(await bcrypt.compare(password, director.password))) {
        invalid(); return
      }
      const token = signToken(director.id, 'director', director.workspaceId!)

      // Load workspace branding
      const workspace = director.workspaceId
        ? await prisma.workspace.findUnique({
            where: { id: director.workspaceId },
            select: { companyName: true, companyLogo: true }
          })
        : null

      // Log login event (fire-and-forget — don't block the response)
      prisma.loginLog.create({ data: {
        workspaceId: director.workspaceId!,
        actorId: director.id, actorType: 'director', actorName: director.name,
        ipAddress: req.ip || req.headers['x-forwarded-for']?.toString(),
        userAgent: req.headers['user-agent'],
      }}).catch(() => {})

      res.json({
        token,
        user: {
          actorId: director.id,
          actorType: 'director',
          workspaceId: director.workspaceId,
          name: director.name,
          phone: director.phone,
          email: director.email,
          avatarUrl: director.avatarUrl,
          isChairman: director.isChairman,
          isSyswiseAdmin: director.isSyswiseAdmin,
          isCompanyAdmin: director.isCompanyAdmin,
          loginId: director.loginId || director.phone,
          companyId: director.companyId,
          companyPrefix: director.company?.prefix,
          companyName: workspace?.companyName,
          companyLogo: workspace?.companyLogo,
        }
      })
      return
    }

    // 2. Try Personnel
    const personnelCandidates = await prisma.personnel.findMany({
      where: { deletedAt: null, OR: [{ loginId }, { phone: lookupPhone }] },
      include: { department: { include: { layer: true } }, company: true }
    })
    const personnel = selectAccountByLogin(personnelCandidates, selector)
    if (personnel) {
      if (!personnel.isActive) {
        invalid(); return
      }
      if (personnel.company && personnel.company.status !== 'ACTIVE') {
        invalid(); return
      }
      if (!(await bcrypt.compare(password, personnel.password))) {
        invalid(); return
      }
      const layerNumber = personnel.department.layer.number
      const token = signToken(personnel.id, 'personnel', personnel.workspaceId, {
        layerNumber,
        departmentId: personnel.departmentId,
      })

      // Load workspace branding
      const workspace = await prisma.workspace.findUnique({
        where: { id: personnel.workspaceId },
        select: { companyName: true, companyLogo: true }
      })

      // Log login event (fire-and-forget)
      prisma.loginLog.create({ data: {
        workspaceId: personnel.workspaceId,
        actorId: personnel.id, actorType: 'personnel', actorName: personnel.name,
        ipAddress: req.ip || req.headers['x-forwarded-for']?.toString(),
        userAgent: req.headers['user-agent'],
      }}).catch(() => {})

      res.json({
        token,
        mustChangePassword: personnel.mustChangePassword,
        user: {
          actorId: personnel.id,
          actorType: 'personnel',
          workspaceId: personnel.workspaceId,
          name: personnel.name,
          phone: personnel.phone,
          email: personnel.email,
          avatarUrl: personnel.avatarUrl,
          loginId: personnel.loginId || personnel.phone,
          companyId: personnel.companyId,
          companyPrefix: personnel.company?.prefix,
          layerNumber,
          departmentId: personnel.departmentId,
          companyName: workspace?.companyName,
          companyLogo: workspace?.companyLogo,
          mustChangePassword: personnel.mustChangePassword,
        }
      })
      return
    }

    invalid()
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
}

// POST /api/auth/director/register  — Director creates their workspace (blocked in production UI)
export async function directorRegister(req: Request, res: Response): Promise<void> {
  try {
    const { phone, password, name, workspaceName } = req.body
    if (!phone || !password || !name) {
      res.status(400).json({ error: 'phone, password, and name are required' })
      return
    }
    const normalized = normalizeSriLankanPhone(phone)
    const existing = await prisma.director.findFirst({ where: { OR: [{ loginId: normalized.local }, { phone: normalized.local }] } })
    if (existing) {
      res.status(409).json({ error: 'Phone already registered' })
      return
    }
    const hashed = await bcrypt.hash(password, 12)
    const director = await prisma.$transaction(async tx => {
      const workspace = await tx.workspace.create({
        data: { name: workspaceName || `${name}'s Workspace` }
      })
      await tx.layer.createMany({
        data: [
          { workspaceId: workspace.id, number: 1, name: 'Layer 1' },
          { workspaceId: workspace.id, number: 2, name: 'Layer 2' },
          { workspaceId: workspace.id, number: 3, name: 'Layer 3' },
        ]
      })
      const dir = await tx.director.create({
        data: { phone: normalized.local, normalizedPhone: normalized.canonical, loginId: normalized.local, password: hashed, name, workspaceId: workspace.id }
      })
      return dir
    })
    const token = signToken(director.id, 'director', director.workspaceId!)
    res.status(201).json({
      token,
      user: {
        actorId: director.id,
        actorType: 'director',
        workspaceId: director.workspaceId,
        name: director.name,
        phone: director.phone,
      }
    })
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'P2002') { res.status(409).json({ error: 'Phone already registered' }); return }
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
}

// POST /api/auth/change-password
export async function changePassword(req: Request, res: Response): Promise<void> {
  try {
    const { actorId, actorType } = req.user!
    const { currentPassword, newPassword } = req.body
    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'currentPassword and newPassword are required' }); return
    }
    if (newPassword.length < 8) {
      res.status(400).json({ error: 'New password must be at least 8 characters' }); return
    }

    if (actorType === 'director') {
      const director = await prisma.director.findUnique({ where: { id: actorId } })
      if (!director || !(await bcrypt.compare(currentPassword, director.password))) {
        res.status(401).json({ error: 'Current password is incorrect' }); return
      }
      await prisma.director.update({ where: { id: actorId }, data: { password: await bcrypt.hash(newPassword, 12) } })
    } else {
      const personnel = await prisma.personnel.findUnique({ where: { id: actorId } })
      if (!personnel || !(await bcrypt.compare(currentPassword, personnel.password))) {
        res.status(401).json({ error: 'Current password is incorrect' }); return
      }
      await prisma.personnel.update({
        where: { id: actorId },
        data: { password: await bcrypt.hash(newPassword, 12), mustChangePassword: false }
      })
    }
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
}

// GET /api/auth/me
export async function getMe(req: Request, res: Response): Promise<void> {
  try {
    const { actorId, actorType, workspaceId } = req.user!
    if (actorType === 'director') {
      const director = await prisma.director.findUnique({
        where: { id: actorId },
        select: { id: true, phone: true, email: true, nic: true, name: true, avatarUrl: true, workspaceId: true, isChairman: true, isSyswiseAdmin: true, isCompanyAdmin: true, loginId: true, companyId: true, company: { select: { prefix: true } } }
      })
      const workspace = workspaceId
        ? await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { companyName: true, companyLogo: true }
          })
        : null
      res.json({ actorId, actorType, workspaceId, ...director, companyPrefix: director?.company?.prefix, companyName: workspace?.companyName, companyLogo: workspace?.companyLogo })
    } else {
      const personnel = await prisma.personnel.findUnique({
        where: { id: actorId },
        select: { id: true, phone: true, email: true, nic: true, name: true, avatarUrl: true, departmentId: true, workspaceId: true, loginId: true, companyId: true, company: { select: { prefix: true } } }
      })
      const workspace = workspaceId
        ? await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { companyName: true, companyLogo: true }
          })
        : null
      res.json({ actorId, actorType, workspaceId, ...personnel, companyPrefix: personnel?.company?.prefix, companyName: workspace?.companyName, companyLogo: workspace?.companyLogo })
    }
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
}

// GET /api/auth/impersonation/users — active accounts visible only to System Admins
export async function listImpersonationTargets(req: Request, res: Response): Promise<void> {
  try {
    const adminId = req.user!.actorId
    const [directors, personnel] = await Promise.all([
      prisma.director.findMany({
        where: {
          isActive: true,
          isSyswiseAdmin: false,
          id: { not: adminId },
          OR: [{ company: null }, { company: { status: 'ACTIVE' } }],
        },
        select: {
          id: true, name: true, phone: true, email: true, loginId: true, workspaceId: true,
          isCompanyAdmin: true,
          company: { select: { displayName: true, legalName: true, prefix: true } },
        },
      }),
      prisma.personnel.findMany({
        where: {
          isActive: true,
          deletedAt: null,
          OR: [{ company: null }, { company: { status: 'ACTIVE' } }],
        },
        select: {
          id: true, name: true, phone: true, email: true, loginId: true, workspaceId: true,
          department: { select: { name: true } },
          company: { select: { displayName: true, legalName: true, prefix: true } },
        },
      }),
    ])

    const targets = [
      ...directors.filter(d => d.workspaceId).map(d => ({
        id: d.id,
        actorType: 'director' as const,
        name: d.name,
        phone: d.phone,
        email: d.email,
        loginId: d.loginId || d.phone,
        workspaceId: d.workspaceId!,
        role: d.isCompanyAdmin ? 'Company administrator' : 'Director',
        companyName: d.company?.displayName || d.company?.legalName || 'Legacy workspace',
        companyPrefix: d.company?.prefix || null,
      })),
      ...personnel.map(p => ({
        id: p.id,
        actorType: 'personnel' as const,
        name: p.name,
        phone: p.phone,
        email: p.email,
        loginId: p.loginId || p.phone,
        workspaceId: p.workspaceId,
        role: p.department.name,
        companyName: p.company?.displayName || p.company?.legalName || 'Legacy workspace',
        companyPrefix: p.company?.prefix || null,
      })),
    ].sort((a, b) => a.companyName.localeCompare(b.companyName) || a.name.localeCompare(b.name))

    res.json(targets)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
}

// POST /api/auth/impersonate — System Admin starts a 15-minute support session
export async function startImpersonation(req: Request, res: Response): Promise<void> {
  try {
    const { actorId: adminId } = req.user!
    const admin = await prisma.director.findUnique({ where: { id: adminId } })
    if (!admin?.isSyswiseAdmin || !admin.isActive) {
      res.status(403).json({ error: 'System administrator access required' }); return
    }

    const { targetActorId, targetActorType, reason, stepUpToken } = req.body as {
      targetActorId?: string
      targetActorType?: 'director' | 'personnel'
      reason?: string
      stepUpToken?: string
    }
    if (!targetActorId || !['director', 'personnel'].includes(targetActorType || '')) {
      res.status(400).json({ error: 'A valid target account is required' }); return
    }
    const validatedTargetActorType = targetActorType as 'director' | 'personnel'
    if (!reason?.trim() || reason.trim().length < 5 || reason.trim().length > 500) {
      res.status(400).json({ error: 'Reason must be between 5 and 500 characters' }); return
    }
    if (!stepUpToken) {
      res.status(401).json({ error: 'Passkey verification is required' }); return
    }

    let stepUp: jwt.JwtPayload
    try {
      stepUp = jwt.verify(stepUpToken, process.env.JWT_SECRET!) as jwt.JwtPayload
    } catch {
      res.status(401).json({ error: 'Passkey verification expired. Verify again.' }); return
    }
    const stepUpAgeSeconds = Math.floor(Date.now() / 1000) - Number(stepUp.iat || 0)
    if (
      stepUp.actorId !== adminId ||
      stepUp.actorType !== 'director' ||
      stepUp.authenticationMethod !== 'webauthn' ||
      stepUpAgeSeconds < 0 ||
      stepUpAgeSeconds > 300
    ) {
      res.status(401).json({ error: 'A recent passkey verification for this administrator is required' }); return
    }

    const target = validatedTargetActorType === 'director'
      ? await prisma.director.findFirst({
          where: {
            id: targetActorId,
            isActive: true,
            isSyswiseAdmin: false,
            workspaceId: { not: null },
            OR: [{ company: null }, { company: { status: 'ACTIVE' } }],
          },
          include: { company: true },
        })
      : await prisma.personnel.findFirst({
          where: {
            id: targetActorId,
            isActive: true,
            deletedAt: null,
            OR: [{ company: null }, { company: { status: 'ACTIVE' } }],
          },
          include: { department: { include: { layer: true } }, company: true },
        })

    if (!target || !target.workspaceId) {
      res.status(404).json({ error: 'Active target account not found' }); return
    }

    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || null
    const userAgent = (req.headers['user-agent'] as string) || null
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000)

    // An administrator may have only one active support session at a time.
    await prisma.impersonationSession.updateMany({
      where: { adminId, endedAt: null },
      data: { endedAt: new Date(), endReason: 'superseded' },
    })

    const session = await prisma.impersonationSession.create({
      data: {
        adminId,
        targetActorId: target.id,
        targetActorType: validatedTargetActorType,
        targetName: target.name,
        workspaceId: target.workspaceId,
        reason: reason.trim(),
        expiresAt,
        ipAddress,
        userAgent,
      }
    })

    await prisma.auditLog.create({
      data: {
        workspaceId: target.workspaceId,
        event: 'IMPERSONATION_STARTED',
        actorDirectorId: adminId,
        actorType: 'director',
        payload: {
          action: `System administrator started support access as ${target.name}`,
          sessionId: session.id,
          targetId: target.id,
          targetName: target.name,
          targetActorType: validatedTargetActorType,
          reason: reason.trim(),
          expiresAt: expiresAt.toISOString(),
          ipAddress: ipAddress ?? undefined,
        },
      }
    })

    const isPersonnel = validatedTargetActorType === 'personnel'
    const personnelTarget = isPersonnel
      ? target as typeof target & { departmentId: string; department: { layer: { number: number } } }
      : null
    const layerNumber = personnelTarget?.department.layer.number
    const token = signToken(target.id, validatedTargetActorType, target.workspaceId, {
      ...(isPersonnel ? { layerNumber, departmentId: personnelTarget!.departmentId } : {}),
      impersonationSessionId: session.id,
      adminId,
      adminName: admin.name,
    }, '15m')

    const workspace = await prisma.workspace.findUnique({
      where: { id: target.workspaceId },
      select: { companyName: true, companyLogo: true }
    })

    res.json({
      token,
      session: { id: session.id, startedAt: session.startedAt, expiresAt },
      user: {
        actorId: target.id,
        actorType: validatedTargetActorType,
        workspaceId: target.workspaceId,
        name: target.name,
        phone: target.phone,
        email: target.email,
        avatarUrl: target.avatarUrl,
        loginId: target.loginId || target.phone,
        ...(isPersonnel
          ? { layerNumber, departmentId: personnelTarget!.departmentId, mustChangePassword: false }
          : {
              isChairman: (target as { isChairman?: boolean }).isChairman,
              isCompanyAdmin: (target as { isCompanyAdmin?: boolean }).isCompanyAdmin,
              isSyswiseAdmin: false,
            }),
        companyName: workspace?.companyName,
        companyLogo: workspace?.companyLogo,
        companyId: target.companyId,
        companyPrefix: companyLoginPrefix(target.company),
        impersonation: {
          sessionId: session.id,
          adminId,
          adminName: admin.name,
          startedAt: session.startedAt,
          expiresAt,
          reason: reason.trim(),
        }
      }
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
}

// POST /api/auth/impersonate/end — System Admin ends the support session
export async function endImpersonation(req: Request, res: Response): Promise<void> {
  try {
    const { adminId, impersonationSessionId, workspaceId } = req.user!
    if (!impersonationSessionId || !adminId) {
      res.status(400).json({ error: 'Not in an impersonation session' }); return
    }

    const session = await prisma.impersonationSession.findUnique({ where: { id: impersonationSessionId } })
    if (!session || session.endedAt) {
      res.json({ success: true }); return // already ended
    }

    const endReason = (req.body?.reason as string) || 'exit'

    await prisma.impersonationSession.update({
      where: { id: impersonationSessionId },
      data: { endedAt: new Date(), endReason }
    })

    await prisma.auditLog.create({
      data: {
        workspaceId: workspaceId || session.workspaceId,
        event: 'IMPERSONATION_ENDED',
        actorDirectorId: adminId,
        actorType: 'director',
        payload: {
          action: `System administrator ended support access as ${session.targetName}`,
          sessionId: session.id,
          targetId: session.targetActorId,
          targetName: session.targetName,
          endReason,
          durationSeconds: Math.round((Date.now() - session.startedAt.getTime()) / 1000),
        },
      }
    })

    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
}

// GET /api/auth/impersonation/sessions — System Admin views global support-access history
export async function listImpersonationSessions(req: Request, res: Response): Promise<void> {
  try {
    const now = new Date()
    await prisma.impersonationSession.updateMany({
      where: {
        endedAt: null,
        OR: [
          { expiresAt: { lte: now } },
          { expiresAt: null, startedAt: { lte: new Date(now.getTime() - 15 * 60 * 1000) } },
        ],
      },
      data: { endedAt: now, endReason: 'expired' },
    })

    const sessions = await prisma.impersonationSession.findMany({
      orderBy: { startedAt: 'desc' },
      take: 100,
      include: { admin: { select: { name: true } } },
    })

    res.json(sessions.map(s => ({ ...s, adminName: s.admin.name, admin: undefined })))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
}

// POST /api/auth/impersonation/sessions/:id/revoke — immediately ends an active session
export async function revokeImpersonationSession(req: Request, res: Response): Promise<void> {
  try {
    const adminId = req.user!.actorId
    const session = await prisma.impersonationSession.findUnique({ where: { id: req.params.id } })
    if (!session) {
      res.status(404).json({ error: 'Support-access session not found' }); return
    }
    if (session.endedAt) {
      res.json({ success: true }); return
    }

    await prisma.$transaction([
      prisma.impersonationSession.update({
        where: { id: session.id },
        data: { endedAt: new Date(), endReason: 'revoked' },
      }),
      prisma.auditLog.create({
        data: {
          workspaceId: session.workspaceId,
          event: 'IMPERSONATION_REVOKED',
          actorDirectorId: adminId,
          actorType: 'director',
          payload: {
            action: `System administrator revoked support access as ${session.targetName}`,
            sessionId: session.id,
            targetId: session.targetActorId,
            targetName: session.targetName,
            targetActorType: session.targetActorType,
          },
        },
      }),
    ])
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
}
