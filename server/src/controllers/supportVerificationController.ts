import { Request, Response } from 'express'
import { randomBytes } from 'node:crypto'
import jwt from 'jsonwebtoken'
import { generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server'
import prisma from '../prisma'

const CHALLENGE_PREFIX = 'support-challenge:'
export const SUPPORT_PROOF_PREFIX = 'support-proof:'
export const SUPPORT_PURPOSE = 'taskwise-support-access'
const RP_ID = process.env.WEBAUTHN_RP_ID || 'localhost'
const ORIGIN = process.env.WEBAUTHN_ORIGIN || 'http://localhost:3500'

// Uses the administrator's authenticated actor ID, never a legacy login ID.
// The challenge and proof share the existing temporary WebAuthn field; their
// prefixes separate them from registration and public login ceremonies.
export async function supportVerificationOptions(req: Request, res: Response): Promise<void> {
  try {
    const { actorId } = req.user!
    const credentials = await prisma.webAuthnCredential.findMany({ where: { actorId, actorType: 'director' } })
    if (!credentials.length) {
      res.status(400).json({ error: 'No passkeys registered. Register a passkey in Settings before using support access.' }); return
    }
    const options = await generateAuthenticationOptions({
      rpID: RP_ID, userVerification: 'required',
      allowCredentials: credentials.map(c => ({ id: c.credentialId, transports: c.transports ? JSON.parse(c.transports) : undefined })),
    })
    await prisma.director.update({ where: { id: actorId }, data: {
      webAuthnChallenge: CHALLENGE_PREFIX + JSON.stringify({ challenge: options.challenge, expiresAt: Date.now() + 300_000 }),
    } })
    res.json(options)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not begin support verification.' })
  }
}

export async function supportVerificationVerify(req: Request, res: Response): Promise<void> {
  try {
    const { actorId } = req.user!
    const actor = await prisma.director.findUnique({ where: { id: actorId } })
    const stored = actor?.webAuthnChallenge
    if (!actor?.isSyswiseAdmin || !actor.isActive || req.user!.impersonationSessionId) {
      res.status(403).json({ error: 'System administrator access required' }); return
    }
    if (!stored?.startsWith(CHALLENGE_PREFIX)) {
      res.status(403).json({ error: 'No pending support verification. Verify again.' }); return
    }
    const pending = JSON.parse(stored.slice(CHALLENGE_PREFIX.length)) as { challenge: string; expiresAt: number }
    // Claim once, before checking the assertion, so concurrent/replayed responses fail.
    const claimed = await prisma.director.updateMany({ where: { id: actorId, webAuthnChallenge: stored }, data: { webAuthnChallenge: null } })
    if (!claimed.count || pending.expiresAt <= Date.now()) {
      res.status(403).json({ error: 'Support verification expired. Verify again.' }); return
    }
    const response = req.body?.response
    const credential = response?.id && await prisma.webAuthnCredential.findUnique({ where: { credentialId: response.id } })
    if (!credential || credential.actorId !== actorId || credential.actorType !== 'director') {
      res.status(403).json({ error: 'This passkey does not belong to your administrator account.' }); return
    }
    let verification
    try {
      verification = await verifyAuthenticationResponse({
        response, expectedChallenge: pending.challenge, expectedOrigin: ORIGIN, expectedRPID: RP_ID,
        requireUserVerification: true,
        credential: { id: credential.credentialId, publicKey: Buffer.from(credential.publicKey, 'base64url'),
          counter: Number(credential.counter), transports: credential.transports ? JSON.parse(credential.transports) : undefined },
      })
    } catch {
      res.status(403).json({ error: 'Passkey verification failed. Verify again.' }); return
    }
    if (!verification.verified) {
      res.status(403).json({ error: 'Passkey verification failed. Verify again.' }); return
    }
    const proofId = randomBytes(32).toString('base64url')
    await prisma.$transaction([
      prisma.webAuthnCredential.update({ where: { credentialId: credential.credentialId }, data: {
        counter: BigInt(verification.authenticationInfo.newCounter), lastUsedAt: new Date(),
      } }),
      prisma.director.update({ where: { id: actorId }, data: { webAuthnChallenge: SUPPORT_PROOF_PREFIX + proofId } }),
    ])
    // Deliberately lacks the actor/session claims required by authenticateToken.
    const stepUpToken = jwt.sign({ purpose: SUPPORT_PURPOSE, adminId: actorId, proofId }, process.env.JWT_SECRET!, { expiresIn: '5m' })
    res.json({ stepUpToken })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not verify support access.' })
  }
}
