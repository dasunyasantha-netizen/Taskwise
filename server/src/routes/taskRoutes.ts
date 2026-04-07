import { Router } from 'express'
import { authenticateToken } from '../middleware/authMiddleware'
import {
  listTasks, getTask, createTask, updateTask, deleteTask,
  assignTask, startTask, submitTask, returnTask, approveTask, rejectTask, reopenTask, cancelTask,
  getSubtasks, getComments, addComment, getTaskHistory,
} from '../controllers/taskController'

const router = Router()
router.use(authenticateToken)

router.get('/',                   listTasks)
router.post('/',                  createTask)
router.get('/:id',                getTask)
router.put('/:id',                updateTask)
router.delete('/:id',             deleteTask)

router.post('/:id/assign',        assignTask)
router.post('/:id/start',         startTask)
router.post('/:id/submit',        submitTask)
router.post('/:id/return',        returnTask)
router.post('/:id/approve',       approveTask)
router.post('/:id/reject',        rejectTask)
router.post('/:id/reopen',        reopenTask)
router.post('/:id/cancel',        cancelTask)

router.get('/:id/subtasks',       getSubtasks)
router.get('/:id/comments',       getComments)
router.post('/:id/comments',      addComment)
router.get('/:id/history',        getTaskHistory)

export default router
