import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import prisma from '../prisma'
import { companyLoginPrefix, resolveLoginLookup } from '../helpers/phone'
import { getEnabledFeatures } from '../helpers/features'
import { ysoRole } from '../helpers/ysoAccess'
import { SUPPORT_PROOF_PREFIX, SUPPORT_PURPOSE } from './supportVerificationController'
import { fixedRoleMetadata, isRoleAlias } from '../helpers/fixedRoles'
import { TEST_WORKSPACE, testSandboxState, resetTestSandbox } from '../helpers/testSandbox'
import { localDate } from '../helpers/ysoRules'

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
    const input = /^TEST[A-Z0-9]+$/i.test(String(phone).trim()) ? String(phone).trim().toUpperCase() : phone
    const { loginId, lookupPhone, selector } = resolveLoginLookup(input)
    if (/^TEST[A-Z0-9]+$/.test(loginId)) {
      const state = await testSandboxState(TEST_WORKSPACE)
      if (!state?.enabled) { invalid(); return }
      if (localDate(state.lastResetAt) !== localDate()) await resetTestSandbox()
    }

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
      const assignment = await prisma.migrationRoleContact.findUnique({ where: { actorType_actorId_holderKey: { actorType: 'director', actorId: director.id, holderKey: '' } } })
      // Only the role-testing sandbox keeps password sign-in; every real company signs in through Pickiti.
      if (director.workspaceId !== TEST_WORKSPACE || assignment?.syswiseUserId || assignment?.legacyAccessRevokedAt) {
        res.status(401).json({ error: 'TaskWise sign-in has moved to Pickiti. Sign in with your Pickiti account.', code: 'syswise_signin_required' }); return
      }
      const token = signToken(director.id, 'director', director.workspaceId!)

      // Load workspace branding
      const workspace = director.workspaceId
        ? await prisma.workspace.findUnique({
            where: { id: director.workspaceId },
            select: { companyName: true, companyLogo: true }
          })
        : null
      const features = await getEnabledFeatures(director.workspaceId!)

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
          preferredLanguage: director.preferredLanguage,
          isChairman: director.isChairman,
          isSyswiseAdmin: director.isSyswiseAdmin,
          isCompanyAdmin: director.isCompanyAdmin,
          loginId: director.loginId || director.phone,
          companyId: director.companyId,
          companyPrefix: director.company?.prefix,
          companyName: workspace?.companyName,
          companyLogo: workspace?.companyLogo,
          features,
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
      const assignment = await prisma.migrationRoleContact.findUnique({ where: { actorType_actorId_holderKey: { actorType: 'personnel', actorId: personnel.id, holderKey: '' } } })
      if (personnel.workspaceId !== TEST_WORKSPACE || assignment?.syswiseUserId || assignment?.legacyAccessRevokedAt) {
        res.status(401).json({ error: 'TaskWise sign-in has moved to Pickiti. Sign in with your Pickiti account.', code: 'syswise_signin_required' }); return
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
      const features = await getEnabledFeatures(personnel.workspaceId)

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
          preferredLanguage: personnel.preferredLanguage,
          loginId: personnel.loginId || personnel.phone,
          companyId: personnel.companyId,
          companyPrefix: personnel.company?.prefix,
          layerNumber,
          departmentId: personnel.departmentId,
          isLetterAssigner: personnel.isLetterAssigner,
          companyName: workspace?.companyName,
          companyLogo: workspace?.companyLogo,
          mustChangePassword: personnel.mustChangePassword,
          ysoRole: ysoRole(personnel.department),
          features,
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
export async function directorRegister(_req: Request, res: Response): Promise<void> {
  // New companies are requested through Syswise approval; self-registration is closed.
  res.status(410).json({ error: 'Create a company through a company request instead.' })
}

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

// POST /api/auth/complete-forced-password-change
// The user already proved possession of the temporary password by signing in.
// This endpoint is available only while the personnel account is marked for a
// mandatory password change, so the temporary password is not requested twice.
export async function completeForcedPasswordChange(req: Request, res: Response): Promise<void> {
  try {
    const { actorId, actorType, workspaceId } = req.user!
    const { newPassword } = req.body
    if (actorType !== 'personnel') { res.status(403).json({ error: 'Personnel account required' }); return }
    if (!newPassword || typeof newPassword !== 'string') { res.status(400).json({ error: 'newPassword is required' }); return }
    if (newPassword.length < 8) { res.status(400).json({ error: 'New password must be at least 8 characters' }); return }

    const personnel = await prisma.personnel.findFirst({
      where: { id: actorId, workspaceId, deletedAt: null, isActive: true },
      select: { id: true, password: true, mustChangePassword: true },
    })
    if (!personnel) { res.status(404).json({ error: 'Account not found' }); return }
    if (!personnel.mustChangePassword) { res.status(409).json({ error: 'No mandatory password change is pending' }); return }
    if (await bcrypt.compare(newPassword, personnel.password)) {
      res.status(400).json({ error: 'New password must be different from the temporary password' }); return
    }

    await prisma.$transaction(async tx => {
      await tx.personnel.update({
        where: { id: personnel.id },
        data: { password: await bcrypt.hash(newPassword, 12), mustChangePassword: false },
      })
      await tx.auditLog.create({
        data: {
          workspaceId,
          event: 'FORCED_PASSWORD_CHANGE_COMPLETED',
          actorType: 'personnel',
          actorPersonnelId: personnel.id,
          payload: { mandatoryChangeCompleted: true },
        },
      })
    })
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
    const features = await getEnabledFeatures(workspaceId)
    const assignedContact = req.user!.authenticationMethod === 'syswise'
      ? await prisma.migrationRoleContact.findUnique({ where: { actorType_actorId_holderKey: { actorType, actorId, holderKey: req.user!.holderKey || '' } } }) : null
    const identityContact = { ...await fixedRoleMetadata(actorType, actorId, workspaceId), ...(assignedContact ? { syswiseUserId: req.user!.syswiseUserId, holderName: assignedContact.holderName || undefined, phone: assignedContact.phoneE164, email: assignedContact.email, mustChangePassword: false } : {}) }
    if (actorType === 'director') {
      const director = await prisma.director.findUnique({
        where: { id: actorId },
        select: { id: true, phone: true, email: true, nic: true, name: true, avatarUrl: true, preferredLanguage: true, workspaceId: true, isChairman: true, isSyswiseAdmin: true, isCompanyAdmin: true, loginId: true, companyId: true, company: { select: { prefix: true } } }
      })
      const workspace = workspaceId
        ? await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { companyName: true, companyLogo: true }
          })
        : null
      res.json({ actorId, actorType, workspaceId, ...director, companyPrefix: director?.company?.prefix, companyName: workspace?.companyName, companyLogo: workspace?.companyLogo, features, ...identityContact })
    } else {
      const personnel = await prisma.personnel.findUnique({
        where: { id: actorId },
        select: { id: true, phone: true, email: true, nic: true, name: true, avatarUrl: true, preferredLanguage: true, isLetterAssigner: true, departmentId: true, department: { include: { layer: true } }, workspaceId: true, loginId: true, companyId: true, company: { select: { prefix: true } } }
      })
      const workspace = workspaceId
        ? await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { companyName: true, companyLogo: true }
          })
        : null
      res.json({ actorId, actorType, workspaceId, ...personnel, layerNumber: personnel?.department.layer.number, ysoRole: ysoRole(personnel?.department), companyPrefix: personnel?.company?.prefix, companyName: workspace?.companyName, companyLogo: workspace?.companyLogo, features, ...identityContact })
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
          NOT: { fixedRole: { is: { directorId: { not: null }, workspace: { roleBasedIdentity: true } } } },
          OR: [{ company: null }, { company: { status: 'ACTIVE' } }],
        },
        select: {
          id: true, name: true, phone: true, email: true, loginId: true, workspaceId: true,
          department: { select: { name: true } },
          company: { select: { displayName: true, legalName: true, prefix: true } },
        },
      }),
    ])

    const contacts = await prisma.migrationRoleContact.findMany({
      where: { OR: [
        { actorType: 'director', actorId: { in: directors.map(d => d.id) } },
        { actorType: 'personnel', actorId: { in: personnel.map(p => p.id) } },
      ] }, select: { actorType: true, actorId: true, phoneE164: true, email: true },
    })
    const contactByRole = new Map(contacts.map(c => [`${c.actorType}:${c.actorId}`, c]))
    const targets = [
      ...directors.filter(d => d.workspaceId).map(d => ({
        id: d.id,
        actorType: 'director' as const,
        name: d.name,
        phone: d.phone,
        email: d.email,
        loginId: d.loginId || d.phone,
        workspaceId: d.workspaceId!,
        role: d.name,
        accessLabel: d.isCompanyAdmin ? 'Company administrator' : 'Company management',
        assignedPhone: contactByRole.get(`director:${d.id}`)?.phoneE164 || null,
        assignedEmail: contactByRole.get(`director:${d.id}`)?.email || null,
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
        role: p.name,
        accessLabel: 'Role',
        assignedPhone: contactByRole.get(`personnel:${p.id}`)?.phoneE164 || null,
        assignedEmail: contactByRole.get(`personnel:${p.id}`)?.email || null,
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
      res.status(400).json({ error: 'A valid target role is required' }); return
    }
    const validatedTargetActorType = targetActorType as 'director' | 'personnel'
    if (await isRoleAlias(validatedTargetActorType, targetActorId)) {
      res.status(409).json({ error: 'Select the unified Chairman management role.' }); return
    }
    if (!reason?.trim() || reason.trim().length < 5 || reason.trim().length > 500) {
      res.status(400).json({ error: 'Reason must be between 5 and 500 characters' }); return
    }
    if (!stepUpToken) {
      res.status(403).json({ error: 'Passkey verification is required' }); return
    }

    let stepUp: jwt.JwtPayload
    try {
      stepUp = jwt.verify(stepUpToken, process.env.JWT_SECRET!) as jwt.JwtPayload
    } catch {
      res.status(403).json({ error: 'Passkey verification expired. Verify again.' }); return
    }
    const stepUpAgeSeconds = Math.floor(Date.now() / 1000) - Number(stepUp.iat || 0)
    if (
      stepUp.adminId !== adminId ||
      stepUp.purpose !== SUPPORT_PURPOSE ||
      typeof stepUp.proofId !== 'string' ||
      stepUpAgeSeconds < 0 ||
      stepUpAgeSeconds > 300
    ) {
      res.status(403).json({ error: 'A recent passkey verification for this administrator is required' }); return
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
      res.status(404).json({ error: 'Active target role not found' }); return
    }

    const consumed = await prisma.director.updateMany({
      where: { id: adminId, isActive: true, isSyswiseAdmin: true, webAuthnChallenge: SUPPORT_PROOF_PREFIX + stepUp.proofId },
      data: { webAuthnChallenge: null },
    })
    if (!consumed.count) {
      res.status(403).json({ error: 'Passkey verification was already used or replaced. Verify again.' }); return
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
      ? target as typeof target & { isLetterAssigner: boolean; departmentId: string; department: { name: string; officeCategory: string | null; layer: { number: number } } }
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
    const features = await getEnabledFeatures(target.workspaceId)

    res.json({
      token,
      session: { id: session.id, startedAt: session.startedAt, expiresAt },
      user: {
        ...await fixedRoleMetadata(validatedTargetActorType, target.id, target.workspaceId),
        actorId: target.id,
        actorType: validatedTargetActorType,
        workspaceId: target.workspaceId,
        name: target.name,
        phone: target.phone,
        email: target.email,
          avatarUrl: target.avatarUrl,
          preferredLanguage: target.preferredLanguage,
        loginId: target.loginId || target.phone,
        ...(isPersonnel
          ? { layerNumber, departmentId: personnelTarget!.departmentId, isLetterAssigner: personnelTarget!.isLetterAssigner, mustChangePassword: false, ysoRole: ysoRole(personnelTarget!.department) }
          : {
              isChairman: (target as { isChairman?: boolean }).isChairman,
              isCompanyAdmin: (target as { isCompanyAdmin?: boolean }).isCompanyAdmin,
              isSyswiseAdmin: false,
            }),
        companyName: workspace?.companyName,
        companyLogo: workspace?.companyLogo,
        companyId: target.companyId,
        companyPrefix: companyLoginPrefix(target.company),
        features,
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
