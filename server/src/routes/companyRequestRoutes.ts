import { Router } from 'express'
import {
  createCompanyRequest, getCompanyRequestStatus, resubmitCompanyRequest,
  listCompanyRequests, getCompanyRequest, updateCompanyRequestStatus, downloadCompanyRequestDocument,
} from '../controllers/companyRequestController'
import { authenticateToken, requireSyswiseAdmin } from '../middleware/authMiddleware'

const router = Router()

router.post('/requests', createCompanyRequest)
router.post('/requests/status', getCompanyRequestStatus)
router.post('/requests/resubmit', resubmitCompanyRequest)

router.get('/admin/requests', authenticateToken, requireSyswiseAdmin, listCompanyRequests)
router.get('/admin/requests/:id', authenticateToken, requireSyswiseAdmin, getCompanyRequest)
router.get('/admin/requests/:id/document', authenticateToken, requireSyswiseAdmin, downloadCompanyRequestDocument)
router.post('/admin/requests/:id/actions', authenticateToken, requireSyswiseAdmin, updateCompanyRequestStatus)

export default router
