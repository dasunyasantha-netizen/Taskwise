import { Router } from 'express'
import prisma from '../prisma'
import { authenticateToken } from '../middleware/authMiddleware'
import { nextTestReset, resetTestSandbox, testSandboxState } from '../helpers/testSandbox'

const router = Router()
router.use(authenticateToken)
router.use(async (req, res, next) => {
  try {
    const state = await testSandboxState(req.user!.workspaceId)
    if (!state?.enabled) { res.status(404).json({ error: 'Test company required' }); return }
    next()
  } catch { res.status(503).json({ error: 'Test company unavailable' }) }
})
router.get('/', async (req, res) => {
  try {
    const state = await testSandboxState(req.user!.workspaceId)
    res.json({ nextResetAt: nextTestReset(), lastResetAt: state!.lastResetAt,
      canReset: req.user!.actorType === 'director' })
  } catch { res.status(503).json({ error: 'Test status unavailable' }) }
})
router.post('/reset', async (req, res) => {
  if (req.user!.actorType !== 'director' || req.user!.impersonationSessionId) {
    res.status(403).json({ error: 'Test Chairman access required' }); return
  }
  try { await resetTestSandbox(true); res.json({ ok: true }) }
  catch { res.status(503).json({ error: 'Reset failed. Sample data was not changed.' }) }
})
router.post('/feedback', async (req, res) => {
  const values: Record<string, string> = {}
  for (const key of ['screen', 'expected', 'actual', 'suggestion']) {
    const value = req.body?.[key]
    if (typeof value !== 'string' || !value.trim() || value.length > 2000) {
      res.status(400).json({ error: `${key} must contain 1-2000 characters` }); return
    }
    values[key] = value.trim()
  }
  try {
    const actor = req.user!.actorType === 'director'
      ? await prisma.director.findUnique({ where: { id: req.user!.actorId } })
      : await prisma.personnel.findUnique({ where: { id: req.user!.actorId } })
    const feedback = await prisma.testFeedback.create({ data: {
      workspaceId: req.user!.workspaceId, role: actor!.loginId || actor!.name,
      screen: values.screen, expected: values.expected, actual: values.actual, suggestion: values.suggestion,
    } })
    res.status(201).json({ id: feedback.id })
  } catch { res.status(503).json({ error: 'Feedback could not be saved' }) }
})
router.get('/feedback', async (req, res) => {
  if (req.user!.actorType !== 'director') { res.status(403).json({ error: 'Test Chairman access required' }); return }
  try {
    res.json(await prisma.testFeedback.findMany({ where: { workspaceId: req.user!.workspaceId },
      orderBy: { createdAt: 'desc' }, take: 500 }))
  } catch { res.status(503).json({ error: 'Feedback unavailable' }) }
})
export default router
