import { Router } from 'express'
import { deletionKeyMatches, handleDeletion, type DeletionEvent } from '../helpers/accountDeletion'

const router = Router()
const EVENTS: DeletionEvent[] = ['account.closed', 'account.purged']

// Called by SysWise only (server to server, X-Deletion-Key). Idempotent.
router.post('/account-deleted', async (req, res) => {
  if (!deletionKeyMatches(req.headers['x-deletion-key'])) {
    res.status(401).json({ error: 'Invalid deletion key' }); return
  }
  const userId = Number(req.body?.syswiseUserId)
  const event = req.body?.event as DeletionEvent
  if (!Number.isSafeInteger(userId) || userId <= 0 || !EVENTS.includes(event)) {
    res.status(400).json({ error: 'Invalid deletion request' }); return
  }
  try {
    await handleDeletion(userId, event)
    res.json({ ok: true })
  } catch (error) {
    console.error('account deletion failed', userId, event, error)
    res.status(500).json({ error: 'Deletion failed' })
  }
})

export default router
