import { Request, Response } from 'express'
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from '@simplewebauthn/server'
import type {
  RegistrationResponseJSON,
} from '@simplewebauthn/server'
import prisma from '../prisma'

const RP_NAME = 'TaskWise'
// On production this must be the actual domain; locally it's localhost
const RP_ID   = process.env.WEBAUTHN_RP_ID   || 'localhost'
const ORIGIN  = process.env.WEBAUTHN_ORIGIN  || 'http://localhost:3500'

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

// POST /api/auth/webauthn/auth/options and /auth/verify (public)
// Passkey sign-in to TaskWise is closed: everyone signs in through Pickiti,
// which holds its own passkeys.
export async function authenticationOptions(_req: Request, res: Response): Promise<void> {
  res.status(401).json({ error: 'TaskWise sign-in has moved to Pickiti. Sign in with your Pickiti account.', code: 'syswise_signin_required' })
}

export async function authenticationVerify(_req: Request, res: Response): Promise<void> {
  res.status(401).json({ error: 'TaskWise sign-in has moved to Pickiti. Sign in with your Pickiti account.', code: 'syswise_signin_required' })
}

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
