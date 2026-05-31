import { Router } from 'express'
import { authenticateToken } from '../middleware/authMiddleware'
import { getActiveNotices, getAllNotices, createNotice, deleteNotice, dismissNotice } from '../controllers/noticeController'

const router = Router()
router.use(authenticateToken)

router.get('/',           getActiveNotices)
router.get('/all',        getAllNotices)
router.post('/',          createNotice)
router.delete('/:id',     deleteNotice)
router.post('/:id/dismiss', dismissNotice)

export default router
