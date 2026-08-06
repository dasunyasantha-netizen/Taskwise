import { Router } from 'express'
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

const router = Router()

router.post('/login',                   unifiedLogin)
router.post('/director/register',       directorRegister)
router.get('/me',                       authenticateToken, getMe)
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
