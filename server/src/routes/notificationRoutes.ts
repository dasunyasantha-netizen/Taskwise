import { Router } from 'express'
import { authenticateToken } from '../middleware/authMiddleware'
import { listNotifications, markRead, markAllRead } from '../controllers/notificationController'

const router = Router()
router.use(authenticateToken)

router.get('/',               listNotifications)
router.post('/read-all',      markAllRead)
router.post('/:id/read',      markRead)

export default router
