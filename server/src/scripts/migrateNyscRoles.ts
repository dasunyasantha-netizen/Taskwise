import 'dotenv/config'
import prisma from '../prisma'
import { migrateFixedRoles } from '../helpers/migrateFixedRoles'
import { syncMigrationContact } from '../controllers/migrationContactController'

async function main() {
  const workspaceId = process.argv.find(a => a.startsWith('--workspace='))?.slice('--workspace='.length)
  if (!workspaceId) throw new Error('Provide the exact reviewed NYSC workspace ID using --workspace=ID')
  const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId }, include: { company: true } })
  if (![workspace.companyName, workspace.company?.displayName, workspace.company?.legalName].some(n => n?.trim().toUpperCase() === 'NYSC')) throw new Error('This script is restricted to NYSC.')
  const apply = process.argv.includes('--apply')
  console.log(JSON.stringify(await migrateFixedRoles(prisma, workspaceId, apply), null, 2))
  if (apply) {
    const contacts = await prisma.migrationRoleContact.findMany({ where: { workspaceId } })
    let synced = 0
    for (const contact of contacts) if (await syncMigrationContact(contact)) synced++
    console.log(JSON.stringify({ contactsSynced: synced, contactsPending: contacts.length - synced }))
  }
  await prisma.$disconnect()
}
main().catch(async error => { console.error(error.message); await prisma.$disconnect(); process.exit(1) })
