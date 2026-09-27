import { Router } from 'express'
import { authenticateToken } from '../middleware/authMiddleware'
import { requireFeature, FEATURES } from '../helpers/features'
import {
  getYsoDashboard,
  activateYso,
  submitYso,
  reviewYso,
  downloadYsoCertificate,
  createYsoMeeting,
  cancelYsoMeeting,
  assessYso,
  decideYsoPenalty,
} from '../controllers/ysoController'
const router = Router()
router.use(authenticateToken, requireFeature(FEATURES.FOUR_LEVEL_HIERARCHY))
router.get('/dashboard', getYsoDashboard)
router.post('/people/:id/activate', activateYso)
router.post('/submissions', submitYso)
router.post('/submissions/:id/review', reviewYso)
router.get('/certificates/:id', downloadYsoCertificate)
router.post('/meetings', createYsoMeeting)
router.post('/meetings/:id/cancel', cancelYsoMeeting)
router.post('/people/:id/assessment', assessYso)
router.post('/people/:id/penalty', decideYsoPenalty)
export default router
