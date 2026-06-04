import { Router } from 'express'
import {
  unifiedLogin, directorRegister, changePassword, getMe,
  setImpersonationPassword, startImpersonation, endImpersonation, listImpersonationSessions,
} from '../controllers/authController'
import {
  registrationOptions, registrationVerify,
  authenticationOptions, authenticationVerify,
  listCredentials, deleteCredential,
} from '../controllers/webAuthnController'
import { authenticateToken } from '../middleware/authMiddleware'

const router = Router()

router.post('/login',                   unifiedLogin)
router.post('/director/register',       directorRegister)
router.get('/me',                       authenticateToken, getMe)
router.post('/change-password',         authenticateToken, changePassword)

// Chairman impersonation
router.post('/impersonation-password',  authenticateToken, setImpersonationPassword)
router.post('/impersonate',             authenticateToken, startImpersonation)
router.post('/impersonate/end',         authenticateToken, endImpersonation)
router.get('/impersonation/sessions',   authenticateToken, listImpersonationSessions)

// WebAuthn / biometric login
router.get('/webauthn/register/options',  authenticateToken, registrationOptions)
router.post('/webauthn/register/verify',  authenticateToken, registrationVerify)
router.post('/webauthn/auth/options',     authenticationOptions)   // public — phone in body
router.post('/webauthn/auth/verify',      authenticationVerify)    // public
router.get('/webauthn/credentials',       authenticateToken, listCredentials)
router.delete('/webauthn/credentials/:id', authenticateToken, deleteCredential)

export default router
