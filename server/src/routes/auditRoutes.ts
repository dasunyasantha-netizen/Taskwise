import { Router } from 'express'
import { authenticateToken } from '../middleware/authMiddleware'
import {
  decideCancelledTaskReview,
  getLeaderboard,
  getMyScore,
  getOverdue,
  getPersonnelQueueReport,
  getProgress,
  getRecentUpdates,
  getUserAnalyticsOverview,
  getUserLoginHistory,
  listAuditLogs,
  listCancelledTaskReviews,
  updateScoringSettings,
} from '../controllers/auditController'

const router = Router()
router.use(authenticateToken)

router.get('/',                                  listAuditLogs)
router.get('/overdue',                           getOverdue)
router.get('/progress',                          getProgress)
router.get('/recent-updates',                    getRecentUpdates)
router.get('/queue/:personnelId',                getPersonnelQueueReport)
router.get('/user-analytics/overview',           getUserAnalyticsOverview)
router.get('/user-analytics/logins/:actorId',   getUserLoginHistory)
router.get('/leaderboard',                       getLeaderboard)
router.get('/my-score',                          getMyScore)
router.put('/scoring-settings',                  updateScoringSettings)
router.get('/cancelled-task-reviews',            listCancelledTaskReviews)
router.post('/cancelled-task-reviews/:taskId/decision', decideCancelledTaskReview)

export default router
