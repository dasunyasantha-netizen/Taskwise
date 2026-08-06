import { Router } from 'express'
import { authenticateToken, requireChairman, requireDirector } from '../middleware/authMiddleware'
import {
  getWorkspace, updateWorkspace, updateProfile, getLayers, updateLayer, uploadAvatar,
  getDepartments, createDepartment, updateDepartment, deleteDepartment,
  getPersonnel, createPersonnel, updatePersonnel, movePersonnel, deletePersonnel, getPersonnelQueue,
  getPersonnelAboveMe, getManagedUsers, resetManagedUserPassword,
} from '../controllers/workspaceController'

const router = Router()
router.use(authenticateToken)

router.get('/',                                    getWorkspace)
router.put('/',                                    requireDirector, updateWorkspace)
router.put('/profile',                             updateProfile)
router.get('/layers',                              getLayers)
router.put('/layers/:id',                          requireDirector, updateLayer)
router.post('/avatar',                             uploadAvatar)

router.get('/departments',                         getDepartments)
router.post('/departments',                        requireDirector, createDepartment)
router.put('/departments/:id',                     requireDirector, updateDepartment)
router.delete('/departments/:id',                  requireDirector, deleteDepartment)

router.get('/personnel',                           getPersonnel)
router.get('/personnel/above-me',                  getPersonnelAboveMe)
router.post('/personnel',                          requireDirector, createPersonnel)
router.put('/personnel/:id',                       updatePersonnel)
router.put('/personnel/:id/move',                  requireDirector, movePersonnel)
router.delete('/personnel/:id',                    requireDirector, deletePersonnel)
router.get('/personnel/:id/queue',                 getPersonnelQueue)

router.get('/managed-users',                       requireChairman, getManagedUsers)
router.post('/managed-users/:id/reset-password',   requireChairman, resetManagedUserPassword)

export default router
