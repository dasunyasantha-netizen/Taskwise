import { Router } from 'express'
import { authenticateToken } from '../middleware/authMiddleware'
import { listAuditLogs, getOverdue, getProgress, getPersonnelQueueReport } from '../controllers/auditController'

const router = Router()
router.use(authenticateToken)

router.get('/',                       listAuditLogs)
router.get('/overdue',                getOverdue)
router.get('/progress',               getProgress)
router.get('/queue/:personnelId',      getPersonnelQueueReport)

export default router
