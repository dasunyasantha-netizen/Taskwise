import { Router } from 'express'
import { authenticateToken } from '../middleware/authMiddleware'
import { listAuditLogs, getOverdue, getProgress, getPersonnelQueueReport, getRecentUpdates, getUserLoginHistory, getUserAnalyticsOverview } from '../controllers/auditController'

const router = Router()
router.use(authenticateToken)

router.get('/',                                  listAuditLogs)
router.get('/overdue',                           getOverdue)
router.get('/progress',                          getProgress)
router.get('/recent-updates',                    getRecentUpdates)
router.get('/queue/:personnelId',                getPersonnelQueueReport)
router.get('/user-analytics/overview',           getUserAnalyticsOverview)
router.get('/user-analytics/logins/:actorId',   getUserLoginHistory)

export default router
