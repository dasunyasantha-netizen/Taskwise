import { Router } from 'express'
import { authenticateToken, requireSyswiseAdmin } from '../middleware/authMiddleware'
import { listCompanyFeatures, setCompanyFeature } from '../controllers/adminFeatureController'

const router = Router()
router.use(authenticateToken, requireSyswiseAdmin)

router.get('/features',                            listCompanyFeatures)
router.put('/features/:companyId/:featureKey',     setCompanyFeature)

export default router
