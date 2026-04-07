import { Router } from 'express'
import { authenticateToken } from '../middleware/authMiddleware'
import { listProjects, getProject, createProject, updateProject, deleteProject } from '../controllers/projectController'

const router = Router()
router.use(authenticateToken)

router.get('/',     listProjects)
router.get('/:id',  getProject)
router.post('/',    createProject)
router.put('/:id',  updateProject)
router.delete('/:id', deleteProject)

export default router
