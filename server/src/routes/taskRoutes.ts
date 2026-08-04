import { Router } from 'express'
import { authenticateToken } from '../middleware/authMiddleware'
import {
  listTasks, getTask, createTask, updateTask, deleteTask,
  assignTask, acceptTask, reassignTask, startTask, submitTask,
  returnTask, approveTask, rejectTask, reopenTask, cancelTask,
  changeAssignees,
  assignNextTasks, getTaskChain, getPreviousHistory,
  getSubtasks, getComments, addComment, getTaskHistory,
  getProgressLogs, addProgressLog, updateProgressLog,
  extendDeadline, getDeadlineExtensions,
} from '../controllers/taskController'

const router = Router()
router.use(authenticateToken)

router.get('/',                   listTasks)
router.post('/',                  createTask)
router.get('/:id',                getTask)
router.put('/:id',                updateTask)
router.delete('/:id',             deleteTask)

router.post('/:id/assign',        assignTask)
router.post('/:id/accept',        acceptTask)
router.post('/:id/reassign',      reassignTask)
router.post('/:id/start',         startTask)
router.post('/:id/submit',        submitTask)
router.post('/:id/return',        returnTask)
router.post('/:id/approve',       approveTask)
router.post('/:id/reject',        rejectTask)
router.post('/:id/reopen',        reopenTask)
router.post('/:id/cancel',        cancelTask)
router.post('/:id/change-assignees', changeAssignees)

router.get('/:id/subtasks',        getSubtasks)
router.get('/:id/comments',        getComments)
router.post('/:id/comments',       addComment)
router.get('/:id/history',         getTaskHistory)
router.get('/:id/progress-logs',        getProgressLogs)
router.post('/:id/progress-logs',       addProgressLog)
router.put('/:id/progress-logs/:logId', updateProgressLog)
router.post('/:id/extend-deadline',     extendDeadline)
router.get('/:id/deadline-extensions',  getDeadlineExtensions)
router.post('/:id/assign-next',         assignNextTasks)
router.get('/:id/chain',                getTaskChain)
router.get('/:id/previous-history',     getPreviousHistory)

export default router
