import { Router } from 'express'
import { directorRegister, directorLogin, personnelLogin, changePassword, getMe } from '../controllers/authController'
import { authenticateToken } from '../middleware/authMiddleware'

const router = Router()

router.post('/director/register', directorRegister)
router.post('/director/login',    directorLogin)
router.post('/personnel/login',   personnelLogin)
router.get('/me',                 authenticateToken, getMe)
router.post('/change-password',   authenticateToken, changePassword)

export default router
