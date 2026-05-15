import { Router } from 'express'
import { authenticateToken } from '../middleware/authMiddleware'
import { listNotifications, markRead, markAllRead, getVapidKey, savePushSubscription, removePushSubscription } from '../controllers/notificationController'

const router = Router()

router.get('/vapid-public-key', getVapidKey)

router.use(authenticateToken)

router.get('/',                    listNotifications)
router.post('/read-all',           markAllRead)
router.post('/push-subscribe',     savePushSubscription)
router.delete('/push-subscribe',   removePushSubscription)
router.post('/:id/read',           markRead)

export default router
