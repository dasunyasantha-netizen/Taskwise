import { Router } from 'express'
import prisma from '../prisma'
import {
  unifiedLogin, directorRegister, changePassword, completeForcedPasswordChange, getMe,
  listImpersonationTargets, startImpersonation, endImpersonation, listImpersonationSessions, revokeImpersonationSession,
} from '../controllers/authController'
import {
  registrationOptions, registrationVerify,
  authenticationOptions, authenticationVerify,
  listCredentials, deleteCredential,
} from '../controllers/webAuthnController'
import { authenticateToken, requireSyswiseAdmin } from '../middleware/authMiddleware'
import { getMigrationContact, saveMigrationContact } from '../controllers/migrationContactController'

const router = Router()

router.post('/login',                   unifiedLogin)
router.post('/director/register',       directorRegister)
router.get('/me',                       authenticateToken, getMe)
router.get('/migration-contact',        authenticateToken, getMigrationContact)
router.post('/migration-contact',       authenticateToken, saveMigrationContact)
router.put('/language', authenticateToken, async (req, res) => {
  const { actorId, actorType, workspaceId, impersonationSessionId } = req.user!
  const language = req.body?.language
  if (language !== 'en' && language !== 'si') { res.status(400).json({ error: 'Choose English or Sinhala.' }); return }
  if (impersonationSessionId) { res.status(403).json({ error: 'Profile preferences cannot be changed during support access.' }); return }
  try {
    const result = actorType === 'director'
      ? await prisma.director.updateMany({
          where: { id: actorId, workspaceId, isActive: true },
          data: { preferredLanguage: language },
        })
      : await prisma.personnel.updateMany({
          where: { id: actorId, workspaceId, isActive: true, deletedAt: null },
          data: { preferredLanguage: language },
        })
    if (!result.count) { res.status(403).json({ error: 'Active account required.' }); return }
    res.json({ preferredLanguage: language })
  } catch {
    res.status(500).json({ error: 'Could not save language preference.' })
  }
})
router.post('/change-password',         authenticateToken, changePassword)
router.post('/complete-forced-password-change', authenticateToken, completeForcedPasswordChange)

// System Admin support access. The end route is called with the short-lived
// impersonation token, while all discovery/start routes require the real admin token.
router.get('/impersonation/users',      authenticateToken, requireSyswiseAdmin, listImpersonationTargets)
router.post('/impersonate',             authenticateToken, requireSyswiseAdmin, startImpersonation)
router.post('/impersonate/end',         authenticateToken, endImpersonation)
router.get('/impersonation/sessions',   authenticateToken, requireSyswiseAdmin, listImpersonationSessions)
router.post('/impersonation/sessions/:id/revoke', authenticateToken, requireSyswiseAdmin, revokeImpersonationSession)

// WebAuthn / biometric login
router.get('/webauthn/register/options',  authenticateToken, registrationOptions)
router.post('/webauthn/register/verify',  authenticateToken, registrationVerify)
router.post('/webauthn/auth/options',     authenticationOptions)   // public — phone in body
router.post('/webauthn/auth/verify',      authenticationVerify)    // public
router.get('/webauthn/credentials',       authenticateToken, listCredentials)
router.delete('/webauthn/credentials/:id', authenticateToken, deleteCredential)

export default router
