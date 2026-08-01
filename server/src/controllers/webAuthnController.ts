import { Request, Response } from 'express'
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server'
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from '@simplewebauthn/server'
import jwt from 'jsonwebtoken'
import prisma from '../prisma'
import { resolveLoginLookup } from '../helpers/phone'

const RP_NAME = 'TaskWise'
// On production this must be the actual domain; locally it's localhost
const RP_ID   = process.env.WEBAUTHN_RP_ID   || 'localhost'
const ORIGIN  = process.env.WEBAUTHN_ORIGIN  || 'http://localhost:3500'

function signToken(actorId: string, actorType: 'director' | 'personnel', workspaceId: string, extra?: object) {
  return jwt.sign(
    { actorId, actorType, workspaceId, ...extra },
    process.env.JWT_SECRET!,
    { expiresIn: '7d' }
  )
}

// ─── helpers ─────────────────────────────────────────────────────────────────

async function getActor(actorId: string, actorType: string) {
  if (actorType === 'director') {
    return prisma.director.findUnique({ where: { id: actorId } })
  }
  return prisma.personnel.findUnique({
    where: { id: actorId },
    include: { department: { include: { layer: true } } }
  })
}

async function saveChallenge(actorId: string, actorType: string, challenge: string) {
  if (actorType === 'director') {
    await prisma.director.update({ where: { id: actorId }, data: { webAuthnChallenge: challenge } })
  } else {
    await prisma.personnel.update({ where: { id: actorId }, data: { webAuthnChallenge: challenge } })
  }
}

async function clearChallenge(actorId: string, actorType: string) {
  if (actorType === 'director') {
    await prisma.director.update({ where: { id: actorId }, data: { webAuthnChallenge: null } })
  } else {
    await prisma.personnel.update({ where: { id: actorId }, data: { webAuthnChallenge: null } })
  }
}

// ─── REGISTRATION ─────────────────────────────────────────────────────────────

// GET /api/auth/webauthn/register/options  (requires JWT)
export async function registrationOptions(req: Request, res: Response): Promise<void> {
  try {
    const { actorId, actorType } = req.user!
    const actor = await getActor(actorId, actorType)
    if (!actor) { res.status(404).json({ error: 'User not found' }); return }

    // Existing credentials for this actor (to exclude them so the user isn't prompted to re-register)
    const existingCreds = await prisma.webAuthnCredential.findMany({
      where: { actorId, actorType },
      select: { credentialId: true, transports: true },
    })

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userName: (actor as { phone: string }).phone,
      userDisplayName: (actor as { name: string }).name,
      attestationType: 'none',
      excludeCredentials: existingCreds.map(c => ({
        id: c.credentialId,
        transports: c.transports ? JSON.parse(c.transports) : undefined,
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    })

    await saveChallenge(actorId, actorType, options.challenge)
    res.json(options)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
}

// POST /api/auth/webauthn/register/verify  (requires JWT)
export async function registrationVerify(req: Request, res: Response): Promise<void> {
  try {
    const { actorId, actorType } = req.user!
    const actor = await getActor(actorId, actorType)
    if (!actor) { res.status(404).json({ error: 'User not found' }); return }

    const challenge = (actor as { webAuthnChallenge?: string | null }).webAuthnChallenge
    if (!challenge) { res.status(400).json({ error: 'No pending challenge' }); return }

    const body: RegistrationResponseJSON = req.body.response
    const deviceName: string | undefined  = req.body.deviceName

    let verification
    try {
      verification = await verifyRegistrationResponse({
        response: body,
        expectedChallenge: challenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
      })
    } catch (err) {
      await clearChallenge(actorId, actorType)
      res.status(400).json({ error: (err as Error).message }); return
    }

    if (!verification.verified || !verification.registrationInfo) {
      await clearChallenge(actorId, actorType)
      res.status(400).json({ error: 'Verification failed' }); return
    }

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo

    await prisma.webAuthnCredential.create({
      data: {
        actorId,
        actorType,
        credentialId: credential.id,
        publicKey:    Buffer.from(credential.publicKey).toString('base64url'),
        counter:      BigInt(credential.counter),
        deviceType:   credentialDeviceType,
        backedUp:     credentialBackedUp,
        transports:   credential.transports ? JSON.stringify(credential.transports) : null,
        deviceName:   deviceName || null,
      },
    })

    await clearChallenge(actorId, actorType)
    res.json({ verified: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
}

// ─── AUTHENTICATION ───────────────────────────────────────────────────────────

// POST /api/auth/webauthn/auth/options  (public — phone sent in body to identify user)
export async function authenticationOptions(req: Request, res: Response): Promise<void> {
  try {
    const { phone } = req.body
    if (!phone) { res.status(400).json({ error: 'phone is required' }); return }

    const { loginId, lookupPhone } = resolveLoginLookup(phone)

    // Find actor by login ID (legacy raw codes and prefixed mobile logins both supported)
    let actorId: string, actorType: string
    const director = await prisma.director.findFirst({ where: { OR: [{ loginId }, { phone: lookupPhone }], isActive: true }, include: { company: true } })
    if (director) {
      if (director.company && director.company.status !== 'ACTIVE') {
        res.status(404).json({ error: 'User not found' }); return
      }
      actorId = director.id; actorType = 'director'
    } else {
      const personnel = await prisma.personnel.findFirst({ where: { OR: [{ loginId }, { phone: lookupPhone }], isActive: true }, include: { company: true } })
      if (!personnel || personnel.deletedAt) {
        res.status(404).json({ error: 'User not found' }); return
      }
      if (personnel.company && personnel.company.status !== 'ACTIVE') {
        res.status(404).json({ error: 'User not found' }); return
      }
      actorId = personnel.id; actorType = 'personnel'
    }

    const creds = await prisma.webAuthnCredential.findMany({
      where: { actorId, actorType },
      select: { credentialId: true, transports: true },
    })

    if (creds.length === 0) {
      res.status(404).json({ error: 'No passkeys registered for this account' }); return
    }

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      userVerification: 'required',
      allowCredentials: creds.map(c => ({
        id: c.credentialId,
        transports: c.transports ? JSON.parse(c.transports) : undefined,
      })),
    })

    await saveChallenge(actorId, actorType, options.challenge)
    res.json({ ...options, _actorId: actorId, _actorType: actorType })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
}

// POST /api/auth/webauthn/auth/verify  (public)
export async function authenticationVerify(req: Request, res: Response): Promise<void> {
  try {
    const { actorId, actorType, response } = req.body as {
      actorId: string
      actorType: string
      response: AuthenticationResponseJSON
    }
    if (!actorId || !actorType || !response) {
      res.status(400).json({ error: 'actorId, actorType and response are required' }); return
    }

    const actor = await getActor(actorId, actorType) as Record<string, unknown> | null
    if (!actor) { res.status(404).json({ error: 'User not found' }); return }

    const challenge = (actor as { webAuthnChallenge?: string | null }).webAuthnChallenge
    if (!challenge) { res.status(400).json({ error: 'No pending challenge' }); return }

    const credRecord = await prisma.webAuthnCredential.findUnique({
      where: { credentialId: response.id },
    })
    if (!credRecord || credRecord.actorId !== actorId) {
      await clearChallenge(actorId, actorType)
      res.status(400).json({ error: 'Credential not found' }); return
    }

    let verification
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        credential: {
          id:         credRecord.credentialId,
          publicKey:  Buffer.from(credRecord.publicKey, 'base64url'),
          counter:    Number(credRecord.counter),
          transports: credRecord.transports ? JSON.parse(credRecord.transports) : undefined,
        },
        requireUserVerification: true,
      })
    } catch (err) {
      await clearChallenge(actorId, actorType)
      res.status(400).json({ error: (err as Error).message }); return
    }

    if (!verification.verified) {
      await clearChallenge(actorId, actorType)
      res.status(400).json({ error: 'Verification failed' }); return
    }

    // Update counter to guard against cloned authenticators
    await prisma.webAuthnCredential.update({
      where: { credentialId: credRecord.credentialId },
      data: {
        counter:    BigInt(verification.authenticationInfo.newCounter),
        lastUsedAt: new Date(),
      },
    })
    await clearChallenge(actorId, actorType)

    // Issue a full session token — same shape as password login
    if (actorType === 'director') {
      const dir = actor as { id: string; workspaceId?: string; name: string; phone: string; email?: string | null; avatarUrl?: string | null; loginId?: string | null; companyId?: string | null; isChairman: boolean; isSyswiseAdmin: boolean; isCompanyAdmin: boolean }
      const workspace = dir.workspaceId
        ? await prisma.workspace.findUnique({ where: { id: dir.workspaceId }, select: { companyName: true, companyLogo: true } })
        : null
      const token = signToken(dir.id, 'director', dir.workspaceId!, { authenticationMethod: 'webauthn' })
      res.json({
        token,
        user: {
          actorId: dir.id, actorType: 'director', workspaceId: dir.workspaceId,
          name: dir.name, phone: dir.phone, email: dir.email, avatarUrl: dir.avatarUrl,
          isChairman: dir.isChairman,
          isSyswiseAdmin: dir.isSyswiseAdmin,
          isCompanyAdmin: dir.isCompanyAdmin,
          loginId: dir.loginId || dir.phone,
          companyId: dir.companyId,
          companyName: workspace?.companyName, companyLogo: workspace?.companyLogo,
        },
      })
    } else {
      const per = actor as { id: string; workspaceId: string; name: string; phone: string; email?: string | null; avatarUrl?: string | null; mustChangePassword: boolean; departmentId: string; department: { layer: { number: number } } }
      const layerNumber = per.department.layer.number
      const workspace = await prisma.workspace.findUnique({ where: { id: per.workspaceId }, select: { companyName: true, companyLogo: true } })
      const token = signToken(per.id, 'personnel', per.workspaceId, { layerNumber, departmentId: per.departmentId, authenticationMethod: 'webauthn' })
      res.json({
        token,
        mustChangePassword: per.mustChangePassword,
        user: {
          actorId: per.id, actorType: 'personnel', workspaceId: per.workspaceId,
          name: per.name, phone: per.phone, email: per.email, avatarUrl: per.avatarUrl,
          layerNumber, departmentId: per.departmentId,
          companyName: workspace?.companyName, companyLogo: workspace?.companyLogo,
          mustChangePassword: per.mustChangePassword,
        },
      })
    }
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
}

// ─── LIST / DELETE credentials ────────────────────────────────────────────────

// GET /api/auth/webauthn/credentials  (requires JWT)
export async function listCredentials(req: Request, res: Response): Promise<void> {
  try {
    const { actorId, actorType } = req.user!
    const creds = await prisma.webAuthnCredential.findMany({
      where: { actorId, actorType },
      select: { id: true, deviceName: true, deviceType: true, backedUp: true, createdAt: true, lastUsedAt: true },
      orderBy: { createdAt: 'desc' },
    })
    res.json(creds)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
}

// DELETE /api/auth/webauthn/credentials/:id  (requires JWT)
export async function deleteCredential(req: Request, res: Response): Promise<void> {
  try {
    const { actorId, actorType } = req.user!
    const { id } = req.params
    const cred = await prisma.webAuthnCredential.findUnique({ where: { id } })
    if (!cred || cred.actorId !== actorId || cred.actorType !== actorType) {
      res.status(404).json({ error: 'Credential not found' }); return
    }
    await prisma.webAuthnCredential.delete({ where: { id } })
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
}
