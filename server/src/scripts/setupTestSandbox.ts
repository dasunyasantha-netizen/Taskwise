import 'dotenv/config'
import prisma from '../prisma'
import { resetTestSandbox, TEST_ACCOUNTS, TEST_WORKSPACE } from '../helpers/testSandbox'

async function main() {
  if (process.argv.includes('--inspect')) {
    console.log(JSON.stringify(await prisma.workspace.findMany({ select: {
      id: true, name: true, companyName: true, roleBasedIdentity: true,
      _count: { select: { projects: true, layers: true } },
    } }), null, 2))
    return
  }
  await resetTestSandbox(true)
  console.log(`Ready: ${TEST_WORKSPACE}`)
  console.log(['TESTCHAIRMAN', ...TEST_ACCOUNTS.map(a => a[0])].join(', '))
  console.log('Password: test@123. Daily reset restores sample data; feedback is retained.')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => prisma.$disconnect())
