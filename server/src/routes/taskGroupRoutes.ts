import { Router } from 'express'
import { authenticateToken, requireDirector } from '../middleware/authMiddleware'
import {
  listTaskGroups, getTaskGroup, createTaskGroup, updateTaskGroup, deleteTaskGroup,
  addTaskGroupMember, removeTaskGroupMember,
  createGroupProject, assignGroupTask,
  getGroupMonitor, getMemberTaskHistory,
  closeGroupTask, listGroupProjects,
} from '../controllers/taskGroupController'

const router = Router()
router.use(authenticateToken)

// Group CRUD
router.get('/',           listTaskGroups)
router.post('/',          requireDirector, createTaskGroup)
router.get('/projects',   listGroupProjects)
router.get('/:id',        getTaskGroup)
router.put('/:id',        requireDirector, updateTaskGroup)
router.delete('/:id',     requireDirector, deleteTaskGroup)

// Members
router.post('/:id/members',          requireDirector, addTaskGroupMember)
router.delete('/:id/members/:pid',   requireDirector, removeTaskGroupMember)

// Projects & Tasks
router.post('/:id/projects',     requireDirector, createGroupProject)
router.post('/:id/assign-task',  requireDirector, assignGroupTask)

// Monitor
router.get('/:id/monitor',                                    getGroupMonitor)
router.get('/:id/tasks/:taskId/members/:memberId/history',    getMemberTaskHistory)

// Close group task
router.post('/tasks/:taskId/close',  requireDirector, closeGroupTask)

export default router
