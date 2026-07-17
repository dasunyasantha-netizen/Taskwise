import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import prisma from '../prisma'

function signToken(actorId: string, actorType: 'director' | 'personnel', workspaceId: string, extra?: object) {
  return jwt.sign(
    { actorId, actorType, workspaceId, ...extra },
    process.env.JWT_SECRET!,
    { expiresIn: '7d' }
  )
}

// POST /api/auth/login  — unified phone-based login (Director first, then Personnel)
export async function unifiedLogin(req: Request, res: Response): Promise<void> {
  try {
    const { phone, password } = req.body
    if (!phone || !password) {
      res.status(400).json({ error: 'phone and password are required' })
      return
    }

    // 1. Try Director
    const director = await prisma.director.findUnique({ where: { phone } })
    if (director) {
      if (!(await bcrypt.compare(password, director.password))) {
        res.status(401).json({ error: 'Invalid credentials' })
        return
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
          companyName: workspace?.companyName,
          companyLogo: workspace?.companyLogo,
        }
      })
      return
    }

    // 2. Try Personnel (phone globally unique)
    const personnel = await prisma.personnel.findUnique({
      where: { phone },
      include: { department: { include: { layer: true } } }
    })
    if (personnel?.deletedAt) {
      res.status(401).json({ error: 'Invalid credentials' })
      return
    }
    if (personnel) {
      if (!(await bcrypt.compare(password, personnel.password))) {
        res.status(401).json({ error: 'Invalid credentials' })
        return
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
          layerNumber,
          departmentId: personnel.departmentId,
          companyName: workspace?.companyName,
          companyLogo: workspace?.companyLogo,
          mustChangePassword: personnel.mustChangePassword,
        }
      })
      return
    }

    res.status(401).json({ error: 'Invalid credentials' })
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
    const existing = await prisma.director.findUnique({ where: { phone } })
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
        data: { phone, password: hashed, name, workspaceId: workspace.id }
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
        select: { id: true, phone: true, email: true, nic: true, name: true, avatarUrl: true, workspaceId: true, isChairman: true }
      })
      const workspace = workspaceId
        ? await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { companyName: true, companyLogo: true }
          })
        : null
      res.json({ actorId, actorType, workspaceId, ...director, companyName: workspace?.companyName, companyLogo: workspace?.companyLogo })
    } else {
      const personnel = await prisma.personnel.findUnique({
        where: { id: actorId },
        select: { id: true, phone: true, email: true, nic: true, name: true, avatarUrl: true, departmentId: true, workspaceId: true }
      })
      const workspace = workspaceId
        ? await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { companyName: true, companyLogo: true }
          })
        : null
      res.json({ actorId, actorType, workspaceId, ...personnel, companyName: workspace?.companyName, companyLogo: workspace?.companyLogo })
    }
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
}

// POST /api/auth/impersonation-password  — Chairman sets/changes their second impersonation password
export async function setImpersonationPassword(req: Request, res: Response): Promise<void> {
  try {
    const { actorId, actorType } = req.user!
    if (actorType !== 'director') { res.status(403).json({ error: 'Director access required' }); return }

    const director = await prisma.director.findUnique({ where: { id: actorId } })
    if (!director?.isChairman) { res.status(403).json({ error: 'Chairman access required' }); return }

    const { currentLoginPassword, newImpersonationPassword } = req.body
    if (!currentLoginPassword || !newImpersonationPassword) {
      res.status(400).json({ error: 'currentLoginPassword and newImpersonationPassword are required' }); return
    }
    if (newImpersonationPassword.length < 10) {
      res.status(400).json({ error: 'Impersonation password must be at least 10 characters' }); return
    }

    // Require verification of the Chairman's own login password first
    if (!(await bcrypt.compare(currentLoginPassword, director.password))) {
      res.status(401).json({ error: 'Login password is incorrect' }); return
    }

    const hash = await bcrypt.hash(newImpersonationPassword, 12)
    await prisma.director.update({ where: { id: actorId }, data: { impersonationPasswordHash: hash } })

    // Audit log
    await prisma.auditLog.create({
      data: {
        workspaceId: director.workspaceId!,
        event: 'IMPERSONATION_PASSWORD_SET',
        actorDirectorId: actorId,
        actorType: 'director',
        payload: { action: 'Chairman set or changed impersonation password' },
      }
    })

    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
}

// POST /api/auth/impersonate  — Chairman starts an impersonation session
export async function startImpersonation(req: Request, res: Response): Promise<void> {
  try {
    const { actorId, actorType } = req.user!
    if (actorType !== 'director') { res.status(403).json({ error: 'Director access required' }); return }

    const chairman = await prisma.director.findUnique({ where: { id: actorId } })
    if (!chairman?.isChairman) { res.status(403).json({ error: 'Chairman access required' }); return }
    if (!chairman.impersonationPasswordHash) {
      res.status(400).json({ error: 'Impersonation password not set. Please set it in Settings first.' }); return
    }

    const { targetIdentifier, impersonationPassword } = req.body
    if (!targetIdentifier || !impersonationPassword) {
      res.status(400).json({ error: 'targetIdentifier and impersonationPassword are required' }); return
    }

    // Verify impersonation password
    if (!(await bcrypt.compare(impersonationPassword, chairman.impersonationPasswordHash))) {
      await prisma.auditLog.create({
        data: {
          workspaceId: chairman.workspaceId!,
          event: 'IMPERSONATION_FAILED',
          actorDirectorId: actorId,
          actorType: 'director',
          payload: { action: 'Failed impersonation attempt', targetIdentifier },
        }
      })
      res.status(401).json({ error: 'Incorrect impersonation password' }); return
    }

    // Find target personnel by phone, email, name, or id — within same workspace
    const target = await prisma.personnel.findFirst({
      where: {
        workspaceId: chairman.workspaceId!,
        deletedAt: null,
        OR: [
          { id: targetIdentifier },
          { phone: targetIdentifier },
          { email: targetIdentifier },
          { name: { equals: targetIdentifier, mode: 'insensitive' } },
        ]
      },
      include: { department: { include: { layer: true } } }
    })

    if (!target) {
      res.status(404).json({ error: 'User not found in this workspace' }); return
    }

    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || null
    const userAgent = (req.headers['user-agent'] as string) || null

    // Create session record
    const session = await prisma.impersonationSession.create({
      data: {
        chairmanId: actorId,
        targetActorId: target.id,
        targetActorType: 'personnel',
        targetName: target.name,
        workspaceId: chairman.workspaceId!,
        ipAddress,
        userAgent,
      }
    })

    // Audit log — start
    await prisma.auditLog.create({
      data: {
        workspaceId: chairman.workspaceId!,
        event: 'IMPERSONATION_STARTED',
        actorDirectorId: actorId,
        actorType: 'director',
        payload: {
          action: `Chairman started impersonation of ${target.name}`,
          sessionId: session.id,
          targetId: target.id,
          targetName: target.name,
          ipAddress: ipAddress ?? undefined,
        },
      }
    })

    const layerNumber = target.department.layer.number

    // Issue impersonation JWT: actorId/actorType = target user, but with chairman fields embedded
    const token = signToken(target.id, 'personnel', chairman.workspaceId!, {
      layerNumber,
      departmentId: target.departmentId,
      impersonationSessionId: session.id,
      chairmanId: actorId,
      chairmanName: chairman.name,
    })

    const workspace = await prisma.workspace.findUnique({
      where: { id: chairman.workspaceId! },
      select: { companyName: true, companyLogo: true }
    })

    res.json({
      token,
      session: { id: session.id, startedAt: session.startedAt },
      user: {
        actorId: target.id,
        actorType: 'personnel',
        workspaceId: chairman.workspaceId,
        name: target.name,
        phone: target.phone,
        email: target.email,
        avatarUrl: target.avatarUrl,
        layerNumber,
        departmentId: target.departmentId,
        companyName: workspace?.companyName,
        companyLogo: workspace?.companyLogo,
        impersonation: {
          sessionId: session.id,
          chairmanId: actorId,
          chairmanName: chairman.name,
          startedAt: session.startedAt,
        }
      }
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
}

// POST /api/auth/impersonate/end  — Chairman ends the impersonation session
export async function endImpersonation(req: Request, res: Response): Promise<void> {
  try {
    const { chairmanId, impersonationSessionId, workspaceId } = req.user!
    if (!impersonationSessionId || !chairmanId) {
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
        actorDirectorId: chairmanId,
        actorType: 'director',
        payload: {
          action: `Chairman ended impersonation of ${session.targetName}`,
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

// GET /api/auth/impersonation/sessions  — Chairman views impersonation history
export async function listImpersonationSessions(req: Request, res: Response): Promise<void> {
  try {
    const { actorId, actorType } = req.user!
    if (actorType !== 'director') { res.status(403).json({ error: 'Director access required' }); return }

    const chairman = await prisma.director.findUnique({ where: { id: actorId } })
    if (!chairman?.isChairman) { res.status(403).json({ error: 'Chairman access required' }); return }

    const sessions = await prisma.impersonationSession.findMany({
      where: { workspaceId: chairman.workspaceId! },
      orderBy: { startedAt: 'desc' },
      take: 100,
    })

    res.json(sessions)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
}
