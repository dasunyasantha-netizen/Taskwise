import crypto from 'node:crypto'
import prisma from '../prisma'

// SysWise account deletion. SysWise calls POST /api/syswise/account-deleted with
// `account.closed` when someone deletes their account and `account.purged` 30
// days later. Taskwise positions, people and tasks belong to the company, so
// both events only unlink the SysWise account from every role it held. That ends
// its Taskwise sessions at once (authMiddleware compares this id); SysWise keeps
// the position away from whoever gets the phone number next, and the company
// reassigns it.
export type DeletionEvent = 'account.closed' | 'account.purged'

export function deletionKeyMatches(presented: unknown): boolean {
  const key = process.env.SYSWISE_DELETION_KEY || ''
  if (!key || typeof presented !== 'string') return false
  const a = Buffer.from(presented)
  const b = Buffer.from(key)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export async function handleDeletion(syswiseUserId: number, _event: DeletionEvent): Promise<void> {
  await prisma.migrationRoleContact.updateMany({ where: { syswiseUserId }, data: { syswiseUserId: null } })
}
