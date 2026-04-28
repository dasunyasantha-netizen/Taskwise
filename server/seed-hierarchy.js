/**
 * Wipes all task/project/personnel/department/layer data and seeds the
 * Sri Lanka Youth organisation hierarchy.
 *
 * Run: node seed-hierarchy.js
 */

const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')
const p = new PrismaClient()

const WORKSPACE_ID = '91397d3f-2ccb-4d7d-a7b9-5130151cbfa1'

// ── Hierarchy data ────────────────────────────────────────────────────────────

// Layer 1: each Director gets one "department" name in their layer
const L1_DIRECTORS = [
  'Director - Finance',
  'Director - Admin',
  'Director - Development',
  'Director - Training',
  'Chief Internal Auditor',
  'Provincial Director',   // parent for all PD-* groups
]

// Layer 2: DD-* and PD-*
const L2_DEPARTMENTS = [
  // Under Director - Finance
  'DD-Finance',
  // Under Director - Admin
  'DD-Operations',
  'DD-Services',
  // Under Director - Development
  'DD-Development',
  'DD-Promotion',
  // Under Director - Training
  'DD-Training',
  // Provincial Directors
  'PD-Western',
  'PD-Central',
  'PD-Southern',
  'PD-North',
  'PD-East',
  'PD-North Western',
  'PD-North Central',
  'PD-Uva',
  'PD-Sabaragamuwa',
]

// Layer 3: AD-*
const L3_DEPARTMENTS = [
  // Under DD-Finance
  'AD-Finance',
  'AD-Supply',
  // Under DD-Operations
  'AD-Legal',
  'AD-HR',
  // Under DD-Services
  'AD-Transport',
  'AD-Construction',
  'AD-Agri. & Entrep.',
  // Under DD-Development
  'AD-Special Projects',
  'AD-Cultural',
  'AD-Youth Organization',
  'AD-Sport',
  // Under DD-Promotion
  'AD-IT',
  'AD-Media - Nisco Video',
  'AD-Planning',
  // Under DD-Training
  'AD-Exam & Assesment',
  'AD-Carrier Guidance',
  'AD-Voccational Training',
  'AD-Foriegn & Edin',
  // Under PD-Western
  'AD-Colombo',
  'AD-Urben',
  'AD-Gampaha',
  'AD-Kalutara',
  // Under PD-Central
  'AD-Kandy',
  'AD-Matale',
  'AD-Nuwara Eliya',
  // Under PD-Southern
  'AD-Galle',
  'AD-Matara',
  'AD-Hambantota',
  // Under PD-North
  'AD-Jaffna',
  'AD-Kilinochchi',
  'AD-Mannar',
  'AD-Vavuniya',
  'AD-Mullaitivu',
  // Under PD-East
  'AD-Batticaloa',
  'AD-Ampara',
  'AD-Trincomalee',
  // Under PD-North Western
  'AD-Kurunegala',
  'AD-Puttalam',
  // Under PD-North Central
  'AD-Anuradhapura',
  'AD-Polonnaruwa',
  // Under PD-Uva
  'AD-Badulla',
  'AD-Monaragala',
  // Under PD-Sabaragamuwa
  'AD-Ratnapura',
  'AD-Kegalle',
]

async function main() {
  console.log('Wiping existing data...')

  // Delete in dependency order
  await p.notification.deleteMany({})
  await p.auditLog.deleteMany({})
  await p.taskComment.deleteMany({})
  await p.taskAssignment.deleteMany({})
  await p.task.deleteMany({})
  await p.project.deleteMany({})
  await p.groupMember.deleteMany({})
  await p.group.deleteMany({})
  await p.personnel.deleteMany({})
  await p.department.deleteMany({})
  await p.layer.deleteMany({ where: { workspaceId: WORKSPACE_ID } })

  console.log('Creating layers...')

  const [l1, l2, l3] = await Promise.all([
    p.layer.create({ data: { workspaceId: WORKSPACE_ID, number: 1, name: 'Directors' } }),
    p.layer.create({ data: { workspaceId: WORKSPACE_ID, number: 2, name: 'Deputy/Provincial Directors' } }),
    p.layer.create({ data: { workspaceId: WORKSPACE_ID, number: 3, name: 'Assistant Directors' } }),
  ])

  console.log('Creating Layer 1 departments (one per Director)...')
  for (const name of L1_DIRECTORS) {
    await p.department.create({ data: { name, layerId: l1.id, workspaceId: WORKSPACE_ID } })
  }

  console.log('Creating Layer 2 departments...')
  for (const name of L2_DEPARTMENTS) {
    await p.department.create({ data: { name, layerId: l2.id, workspaceId: WORKSPACE_ID } })
  }

  console.log('Creating Layer 3 departments...')
  for (const name of L3_DEPARTMENTS) {
    await p.department.create({ data: { name, layerId: l3.id, workspaceId: WORKSPACE_ID } })
  }

  // Update the existing Director (Chairman) — keep their credentials
  const existingDirector = await p.director.findFirst({ where: { workspaceId: WORKSPACE_ID } })
  if (existingDirector) {
    await p.director.update({
      where: { id: existingDirector.id },
      data: { name: 'Chairman' }
    })
    console.log(`Updated existing director → Chairman (phone: ${existingDirector.phone})`)
  }

  const total = L1_DIRECTORS.length + L2_DEPARTMENTS.length + L3_DEPARTMENTS.length
  console.log(`\nDone! Created 3 layers + ${total} departments.`)
  console.log(`  Layer 1 (Directors):              ${L1_DIRECTORS.length} departments`)
  console.log(`  Layer 2 (DD/PD):                  ${L2_DEPARTMENTS.length} departments`)
  console.log(`  Layer 3 (AD):                     ${L3_DEPARTMENTS.length} departments`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => p.$disconnect())
