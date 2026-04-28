/**
 * Creates one sample personnel per department.
 * Phone format: 07XNNNNNN where X=layer, NNNNNN=sequential
 * Password: Test@1234 (same for all)
 * Run: node seed-personnel.js
 */

const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')
const p = new PrismaClient()

const WORKSPACE_ID = '91397d3f-2ccb-4d7d-a7b9-5130151cbfa1'

// Short slug from dept name for the phone suffix & display name
function slug(name) {
  return name
    .replace(/^(AD|DD|PD)-/i, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 6)
    .toLowerCase()
}

// Map dept name → phone number (deterministic, 10 digits starting with 07)
function phone(index, layer) {
  const base = layer === 1 ? 7100 : layer === 2 ? 7200 : 7300
  return `0${base + index}`
}

async function main() {
  const departments = await p.department.findMany({
    include: { layer: true },
    orderBy: [{ layer: { number: 'asc' } }, { name: 'asc' }],
  })

  const hash = await bcrypt.hash('Test@1234', 10)

  console.log(`Creating ${departments.length} personnel...`)

  const counters = { 1: 0, 2: 0, 3: 0 }

  for (const dept of departments) {
    const layer = dept.layer.number
    const idx = ++counters[layer]
    const ph = phone(idx, layer)
    const name = dept.name
      .replace(/^(Director - |Chief |Provincial )/, '')
      .replace(/^(DD|PD|AD)-/, '')
      .trim()
    const fullName = `${name} Officer`

    await p.personnel.create({
      data: {
        workspaceId: WORKSPACE_ID,
        departmentId: dept.id,
        name: fullName,
        phone: ph,
        password: hash,
      },
    })

    console.log(`  L${layer} | ${dept.name.padEnd(28)} → ${fullName.padEnd(28)} | ${ph}`)
  }

  console.log('\nAll personnel created. Password for all: Test@1234')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => p.$disconnect())
