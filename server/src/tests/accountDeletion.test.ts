/**
 * SysWise account deletion receiver. Runs against the dedicated `taskwise_test`
 * database (created and migrated here, like companyOnboarding.test.ts).
 */
import 'dotenv/config'
import assert from 'assert'
import path from 'path'
import { execSync } from 'child_process'

const DEV_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/taskwise_db?schema=public'
const TEST_URL = DEV_URL.replace(/\/[^/?]+(\?|$)/, '/taskwise_test$1')
const ADMIN_URL = DEV_URL.replace(/\/[^/?]+(\?|$)/, '/postgres$1')
process.env.DATABASE_URL = TEST_URL
const SERVER_ROOT = path.resolve(__dirname, '../..')

async function main() {
  const { PrismaClient } = await import('@prisma/client')
  const admin = new PrismaClient({ datasources: { db: { url: ADMIN_URL } } })
  try { await admin.$executeRawUnsafe('CREATE DATABASE "taskwise_test"') } catch { /* exists */ }
  finally { await admin.$disconnect() }
  execSync('npx prisma migrate deploy', { cwd: SERVER_ROOT, env: { ...process.env, DATABASE_URL: TEST_URL }, stdio: 'ignore' })

  const prisma = (await import('../prisma')).default
  const { deletionKeyMatches, handleDeletion } = await import('../helpers/accountDeletion')

  process.env.SYSWISE_DELETION_KEY = 'right-key'
  assert.equal(deletionKeyMatches('right-key'), true)
  assert.equal(deletionKeyMatches('wrong-key'), false)
  process.env.SYSWISE_DELETION_KEY = ''
  assert.equal(deletionKeyMatches(''), false)

  const LEAVER = 990601
  const COLLEAGUE = 990602
  await prisma.migrationRoleContact.deleteMany({ where: { actorId: { startsWith: 'deletion-test-' } } })
  const role = (actorId: string, syswiseUserId: number | null, email = 'office@example.test') =>
    prisma.migrationRoleContact.create({ data: { actorType: 'personnel', actorId, workspaceId: 'w1', country: 'LK',
      phoneE164: '+94771234567', email, syswiseUserId } })
  const mine = await role('deletion-test-mine', LEAVER)
  // Same phone and shared company email, but held by a different, live person.
  const theirs = await role('deletion-test-theirs', COLLEAGUE)
  const unclaimed = await role('deletion-test-unclaimed', null)

  await handleDeletion(LEAVER, 'account.closed')
  const after = async (id: string) => (await prisma.migrationRoleContact.findUniqueOrThrow({ where: { id } }))
  assert.equal((await after(mine.id)).syswiseUserId, null, "the closed account's roles are unlinked")
  assert.equal((await after(theirs.id)).syswiseUserId, COLLEAGUE, "another person's role is untouched")
  assert.equal((await after(unclaimed.id)).syswiseUserId, null)
  assert.equal((await after(mine.id)).phoneE164, '+94771234567', 'the company keeps its role assignment')

  await handleDeletion(LEAVER, 'account.purged') // idempotent
  assert.equal((await after(theirs.id)).syswiseUserId, COLLEAGUE)

  await prisma.migrationRoleContact.deleteMany({ where: { actorId: { startsWith: 'deletion-test-' } } })
  await prisma.$disconnect()
  console.log('accountDeletion: all checks passed')
}

main().catch((error) => { console.error(error); process.exit(1) })
