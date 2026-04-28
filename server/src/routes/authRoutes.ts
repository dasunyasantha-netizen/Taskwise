import { Router } from 'express'
import { unifiedLogin, directorRegister, changePassword, getMe } from '../controllers/authController'
import { authenticateToken } from '../middleware/authMiddleware'

const router = Router()

router.post('/login',             unifiedLogin)
router.post('/director/register', directorRegister)
router.get('/me',                 authenticateToken, getMe)
router.post('/change-password',   authenticateToken, changePassword)

export default router
