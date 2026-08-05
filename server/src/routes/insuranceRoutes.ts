import { Router } from 'express'
import { authenticateToken } from '../middleware/authMiddleware'
import { FEATURES, requireFeature } from '../helpers/features'
import {
  getInsuranceSummary,
  listQuotations,
  getQuotation,
  createQuotation,
  updateQuotation,
  convertQuotation,
  renewQuotation,
  listPolicies,
  getPolicy,
  createPolicy,
  updatePolicy,
} from '../controllers/insuranceController'

const router = Router()
router.use(authenticateToken)
router.use(requireFeature(FEATURES.INSURANCE_MANAGEMENT))

router.get('/summary', getInsuranceSummary)
router.get('/quotations', listQuotations)
router.post('/quotations', createQuotation)
router.get('/quotations/:id', getQuotation)
router.put('/quotations/:id', updateQuotation)
router.post('/quotations/:id/convert', convertQuotation)
router.post('/quotations/:id/renew', renewQuotation)
router.get('/policies', listPolicies)
router.post('/policies', createPolicy)
router.get('/policies/:id', getPolicy)
router.put('/policies/:id', updatePolicy)

export default router
