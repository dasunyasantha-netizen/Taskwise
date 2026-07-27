/**
 * Provision the Syswise system administrator (phone 0706786776).
 *
 * Run ONCE after `prisma migrate deploy`, on the server:
 *   cd /var/www/taskwise/server && node scripts/provision-syswise-admin.cjs
 *
 * Why a script and not the migration:
 *  - The account did not exist in production, so the migration's phone-based
 *    role grant matched nobody.
 *  - Director.workspaceId is UNIQUE (one director per workspace) and the tenant
 *    workspace is already taken, so the admin needs its OWN workspace.
 *  - That admin workspace must carry NO company, otherwise the legacy backfill
 *    would have produced a second "YC"-prefixed company and broken the migration.
 *    Creating it here, after the migration, avoids that entirely.
 *
 * Idempotent: re-running only ensures the role is set; it never resets the
 * password or creates duplicates. Set ADMIN_PASSWORD to choose the initial
 * password; otherwise a random temporary one is generated and printed once.
 */
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')
const crypto = require('crypto')

const PHONE_LOCAL = '0706786776'
const NORMALIZED = '94706786776'
const NAME = process.env.ADMIN_NAME || 'Syswise Administrator'

async function main() {
  const prisma = new PrismaClient()
  try {
    const existing = await prisma.director.findFirst({
      where: { OR: [{ loginId: PHONE_LOCAL }, { normalizedPhone: NORMALIZED }, { phone: PHONE_LOCAL }] },
    })
    if (existing) {
      await prisma.director.update({ where: { id: existing.id }, data: { isSyswiseAdmin: true, isActive: true } })
      console.log(`EXISTS: promoted director ${existing.id} (${existing.name}) to Syswise admin. Password unchanged.`)
      return
    }

    const ws = await prisma.workspace.create({ data: { name: 'Syswise Administration', companyName: 'Syswise' } })
    await prisma.layer.createMany({ data: [1, 2, 3].map(n => ({ workspaceId: ws.id, number: n, name: `Layer ${n}` })) })

    const tempPassword = process.env.ADMIN_PASSWORD || `Sw!${crypto.randomBytes(9).toString('base64url')}`
    const hashed = await bcrypt.hash(tempPassword, 12)

    const dir = await prisma.director.create({
      data: {
        name: NAME,
        phone: PHONE_LOCAL,
        normalizedPhone: NORMALIZED,
        loginId: PHONE_LOCAL,
        password: hashed,
        workspaceId: ws.id,
        companyId: null,
        isSyswiseAdmin: true,
        isCompanyAdmin: false,
        isActive: true,
      },
    })

    await prisma.auditLog.create({
      data: {
        workspaceId: ws.id,
        event: 'ADMINISTRATIVE_ROLE_CHANGED',
        actorType: 'system',
        payload: { action: 'Provisioned Syswise system administrator', directorId: dir.id, loginId: PHONE_LOCAL },
      },
    })

    console.log(`CREATED: Syswise admin director ${dir.id}`)
    console.log(`LOGIN_ID: ${PHONE_LOCAL}`)
    console.log(`TEMP_PASSWORD: ${tempPassword}`)
    console.log('ACTION REQUIRED: log in and change this password immediately (Settings → Change password).')
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(e => { console.error(e); process.exit(1) })
