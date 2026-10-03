import 'dotenv/config'
import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import jwt from 'jsonwebtoken'

const original = new URL(process.env.DATABASE_URL!)
if (!['localhost', '127.0.0.1'].includes(original.hostname)) throw new Error('Fixed-role tests require local PostgreSQL')
const adminUrl = new URL(original); adminUrl.pathname = '/postgres'
const testUrl = new URL(original); testUrl.pathname = '/taskwise_roles_test'
process.env.DATABASE_URL = testUrl.toString()
process.env.JWT_SECRET = 'isolated-fixed-role-tests-only'
process.env.PORT = '4327'
delete process.env.SYSWISE_BASE_URL
delete process.env.SYSWISE_TASKWISE_SERVICE_KEY
const req = (body: any = {}, user?: any, params: any = {}) => ({ body, user, params, headers: {}, method: 'GET', ip: '127.0.0.1' } as any)
const res = () => { const r: any = { statusCode: 200 }; r.status = (c: number) => { r.statusCode = c; return r }; r.json = (b: any) => { r.body = b; return r }; r.setHeader = () => r; return r }

async function main() {
  const { PrismaClient } = await import('@prisma/client')
  const adminDb = new PrismaClient({ datasources: { db: { url: adminUrl.toString() } } })
  try { await adminDb.$executeRawUnsafe('CREATE DATABASE "taskwise_roles_test"') } catch (e: any) { if (!String(e.message).includes('already exists')) throw e }
  await adminDb.$disconnect()
  execSync('npx prisma migrate deploy', { cwd: path.resolve(__dirname, '../..'), env: process.env, stdio: 'ignore' })
  const db = (await import('../prisma')).default
  const { migrateFixedRoles } = await import('../helpers/migrateFixedRoles')
  const roles = await import('../controllers/fixedRoleController')
  const contacts = await import('../controllers/migrationContactController')
  const auth = await import('../controllers/authController')
  const webauthn = await import('../controllers/webAuthnController')
  const sso = await import('../controllers/syswiseController')
  const workspaceController = await import('../controllers/workspaceController')
  const notifications = await import('../controllers/notificationController')
  const { authenticateToken } = await import('../middleware/authMiddleware')
  await db.$executeRawUnsafe('TRUNCATE TABLE "WorkspaceRole","MigrationRoleContact","WebAuthnCredential","Personnel","Director","Company","Workspace" RESTART IDENTITY CASCADE')
  const hash = await (await import('bcryptjs')).default.hash('Legacy-Fixture!123', 4)
  const company = await db.company.create({ data: { legalName: 'NYSC', displayName: 'NYSC', registrationNumber: 'roles-fixture', prefix: 'YC', allowUnprefixedLogin: true } })
  const workspace = await db.workspace.create({ data: { name: 'NYSC', companyName: 'NYSC', companyId: company.id } })
  await db.company.update({ where: { id: company.id }, data: { workspaceId: workspace.id } })
  const layer = await db.layer.create({ data: { name: 'Management', number: 1, workspaceId: workspace.id } })
  const department = await db.department.create({ data: { name: 'Administration', layerId: layer.id, workspaceId: workspace.id } })
  const director = await db.director.create({ data: { name: 'Chairman', phone: '0770000000', loginId: '0770000000', password: hash, workspaceId: workspace.id, companyId: company.id, isChairman: true } })
  const positions = []
  for (const [name, phone] of [['Chairman', '0770000001'], ['Secretary', '0770000002'], ['Assistant secretary', '0770000003']]) positions.push(await db.personnel.create({ data: { name, phone, loginId: phone, password: hash, workspaceId: workspace.id, companyId: company.id, departmentId: department.id } }))
  const [chairman, secretary, assistant] = positions
  await db.personnel.update({ where: { id: secretary.id }, data: { supervisorId: chairman.id } })
  const chairContact = await db.migrationRoleContact.create({ data: { actorType: 'director', actorId: director.id, workspaceId: workspace.id, companyId: company.id, country: 'LK', phoneE164: '+94771234500', syswiseUserId: 2000 } })
  const secretaryContact = await db.migrationRoleContact.create({ data: { actorType: 'personnel', actorId: secretary.id, workspaceId: workspace.id, companyId: company.id, country: 'LK', phoneE164: '+94771234501', syswiseUserId: 2001 } })
  const project = await db.project.create({ data: { name: 'Preserved project', directorId: director.id, workspaceId: workspace.id } })
  const task = await db.task.create({ data: { title: 'Preserved Chairman task', projectId: project.id, workspaceId: workspace.id, createdByPersonnelId: chairman.id, approvalById: chairman.id, approvalByType: 'personnel', status: 'SUBMITTED' } })
  const assignment = await db.taskAssignment.create({ data: { taskId: task.id, personnelId: chairman.id } })
  const comment = await db.taskComment.create({ data: { taskId: task.id, authorPersonnelId: chairman.id, authorType: 'personnel', content: 'Preserved historic comment' } })
  const notification = await db.notification.create({ data: { workspaceId: workspace.id, recipientPersonnelId: chairman.id, recipientType: 'personnel', type: 'task_submitted_for_approval', title: 'Approval', message: 'Preserved notification', taskId: task.id } })
  const who = { actorId: director.id, actorType: 'director', workspaceId: workspace.id, authenticationMethod: 'syswise', syswiseUserId: 2000, assignmentVersion: 1 }
  const personnelWho = { actorId: secretary.id, actorType: 'personnel', workspaceId: workspace.id, authenticationMethod: 'syswise', syswiseUserId: 2001, assignmentVersion: 1 }
  const authorize = async (user: any) => { const token = typeof user === 'string' ? user : jwt.sign(user, process.env.JWT_SECRET!); const r = res(); let allowed = false; const request = req(); request.headers.authorization = 'Bearer ' + token; await authenticateToken(request, r, () => { allowed = true }); return { allowed, r, request } }
  let passed = 0
  const test = async (name: string, run: () => Promise<void>) => { await run(); console.log('PASS ' + name); passed++ }
  await test('dry run makes no changes', async () => { const r = await migrateFixedRoles(db, workspace.id); assert.equal(r.fixedRoles, 3); assert.equal(await db.workspaceRole.count(), 0); assert.equal((await db.workspace.findUniqueOrThrow({ where: { id: workspace.id } })).roleBasedIdentity, false) })
  await migrateFixedRoles(db, workspace.id, true)
  if (process.argv.includes('--serve')) {
    const cache = path.resolve(__dirname, '../../../.cache'); mkdirSync(cache, { recursive: true })
    const token = jwt.sign(who, process.env.JWT_SECRET!, { expiresIn: '1h' })
    const me = res(); await auth.getMe(req({}, who), me)
    writeFileSync(path.join(cache, 'roles-fixture.json'), JSON.stringify({ token, user: me.body, workspaceId: workspace.id, departmentId: department.id }))
    await import('../index'); console.log('Isolated fixed role fixture ready'); return
  }
  await test('each personnel record becomes one fixed role; Chairman has both backing records', async () => {
    assert.equal(await db.workspaceRole.count(), 3)
    const role = await db.workspaceRole.findUniqueOrThrow({ where: { personnelId: chairman.id } }); assert.equal(role.directorId, director.id)
    assert.equal(await db.personnel.count(), 3); assert.equal(await db.director.count(), 1)
  })
  await test('tasks, assignments, comments, reporting relationships and notifications keep original IDs', async () => {
    assert.equal((await db.task.findUniqueOrThrow({ where: { id: task.id } })).createdByPersonnelId, chairman.id)
    assert.equal((await db.taskAssignment.findUniqueOrThrow({ where: { id: assignment.id } })).personnelId, chairman.id)
    assert.equal((await db.taskComment.findUniqueOrThrow({ where: { id: comment.id } })).authorPersonnelId, chairman.id)
    assert.equal((await db.personnel.findUniqueOrThrow({ where: { id: secretary.id } })).supervisorId, chairman.id)
    assert.equal((await db.notification.findUniqueOrThrow({ where: { id: notification.id } })).recipientPersonnelId, chairman.id)
  })
  await test('collected contacts are retained and dummy phones are never auto-assigned', async () => {
    assert.equal((await db.migrationRoleContact.findUniqueOrThrow({ where: { id: chairContact.id } })).phoneE164, '+94771234500')
    assert.equal((await db.migrationRoleContact.findUniqueOrThrow({ where: { id: secretaryContact.id } })).phoneE164, '+94771234501')
    assert.equal(await db.migrationRoleContact.count(), 2)
    assert.equal((await db.personnel.findUniqueOrThrow({ where: { id: assistant.id } })).password, hash)
  })
  await test('re-running conversion is idempotent', async () => { await migrateFixedRoles(db, workspace.id, true); assert.equal(await db.workspaceRole.count(), 3); assert.equal(await db.auditLog.count({ where: { event: 'FIXED_ROLES_MIGRATED' } }), 1) })
  await test('support and assignment directories expose one Chairman', async () => {
    for (const fn of [auth.listImpersonationTargets, contacts.getManagedMigrationContacts]) {
      const r = res(); await fn(req({}, { ...who, actorId: 'platform-admin' }), r)
      assert.equal(r.body.filter((v: any) => v.name === 'Chairman').length, 1)
    }
  })
  await test('the merged Chairman retains management access and role metadata', async () => {
    const check = await authorize(who); assert.equal(check.allowed, true); assert.equal(check.request.user.personnelRoleId, chairman.id)
    const me = res(); await auth.getMe(check.request, me); assert.equal(me.body.isChairman, true); assert.equal(me.body.roleId, chairman.id)
    const n = res(); await notifications.listNotifications(check.request, n); assert.ok(n.body.some((v: any) => v.id === notification.id))
  })
  await test('shared sign-in selects the canonical Chairman and ordinary role with their existing data IDs', async () => {
    for (const [contact, user] of [[chairContact, who], [secretaryContact, personnelWho]] as const) {
      const proof = jwt.sign({ purpose: 'taskwise-role-choice', syswiseUserId: user.syswiseUserId,
        assignments: [{ actorId: user.actorId, actorType: user.actorType, workspaceId: workspace.id, assignmentVersion: 1 }] }, process.env.JWT_SECRET!)
      const r = res(); await sso.selectSyswiseRole(req({ selectionToken: proof, contactId: contact.id }), r)
      assert.equal(r.statusCode, 200); assert.equal(r.body.user.actorId, user.actorId); assert.equal(r.body.user.roleBasedIdentity, true)
      assert.equal((await authorize(r.body.token)).allowed, true)
    }
    const n = res(); const check = await authorize(who)
    await notifications.markRead({ ...check.request, params: { id: notification.id } }, n)
    assert.equal((await db.notification.findUniqueOrThrow({ where: { id: notification.id } })).isRead, true)
  })
  await test('merged source role cannot be selected or accessed separately, and its backing history cannot be deleted', async () => {
    const alias = await db.migrationRoleContact.create({ data: { actorType: 'personnel', actorId: chairman.id, workspaceId: workspace.id, country: 'LK', phoneE164: '+94771234500', syswiseUserId: 2000 } })
    const proof = jwt.sign({ purpose: 'taskwise-role-choice', syswiseUserId: 2000,
      assignments: [{ actorId: chairman.id, actorType: 'personnel', workspaceId: workspace.id, assignmentVersion: 1 }] }, process.env.JWT_SECRET!)
    const r = res(); await sso.selectSyswiseRole(req({ selectionToken: proof, contactId: alias.id }), r); assert.equal(r.statusCode, 403)
    const remove = res(); await workspaceController.deletePersonnel(req({}, who, { id: chairman.id }), remove); assert.equal(remove.statusCode, 403)
    await db.migrationRoleContact.delete({ where: { id: alias.id } })
  })
  await test('unassigned and assigned NYSC positions both reject old passwords and JWTs', async () => {
    for (const p of [secretary, assistant, chairman]) {
      const r = res(); await auth.unifiedLogin(req({ phone: p.loginId, password: 'Legacy-Fixture!123' }), r); assert.equal(r.statusCode, 401); assert.equal(r.body.code, 'syswise_signin_required')
      assert.equal((await authorize({ actorId: p.id, actorType: 'personnel', workspaceId: workspace.id })).allowed, false)
      const options = res(); await webauthn.authenticationOptions(req({ phone: p.loginId }), options); assert.equal(options.statusCode, 401)
    }
  })
  await test('only Director can assign phones; a supervisor cannot assign a direct report', async () => {
    await db.personnel.update({ where: { id: assistant.id }, data: { supervisorId: secretary.id } })
    const r = res(); await contacts.assignMigrationContact(req({ country: 'LK', phone: '+94771234502' }, personnelWho, { actorType: 'personnel', actorId: assistant.id }), r); assert.equal(r.statusCode, 403)
    const own = res(); await contacts.saveMigrationContact(req({ country: 'LK', phone: '+94771234502' }, personnelWho), own); assert.equal(own.statusCode, 403)
    const old = res(); await workspaceController.updatePersonnel(req({ phone: '0771234502' }, personnelWho, { id: secretary.id }), old); assert.equal(old.statusCode, 403)
  })
  await test('Director assignment preserves data and invalidates old linked sessions on reassignment', async () => {
    const r = res(); await contacts.assignMigrationContact(req({ country: 'LK', phone: '+94771234502' }, who, { actorType: 'personnel', actorId: secretary.id }), r); assert.equal(r.statusCode, 200)
    assert.equal((await authorize(personnelWho)).allowed, false)
    assert.equal((await db.personnel.findUniqueOrThrow({ where: { id: secretary.id } })).supervisorId, chairman.id)
  })
  await test('multiple new roles can be created in one department without credentials or phones', async () => {
    for (const name of ['Assistant A', 'Assistant B']) { const r = res(); await roles.saveFixedRole(req({ name, departmentId: department.id }, who), r); assert.equal(r.statusCode, 201) }
    const created = await db.personnel.findMany({ where: { name: { in: ['Assistant A', 'Assistant B'] } } }); assert.equal(created.length, 2); assert.ok(created.every(p => p.phone === '' && !p.normalizedPhone))
  })
  await test('Director creates Letter Assigner directly under Chairman and controls its permission', async () => {
    await db.companyFeature.create({ data: { companyId: company.id, featureKey: 'four_level_hierarchy', enabled: true } })
    const layer2 = await db.layer.create({ data: { workspaceId: workspace.id, number: 2, name: 'Head Office' } })
    const letters = await db.department.create({ data: { workspaceId: workspace.id, layerId: layer2.id, name: 'Correspondence', officeCategory: 'HEAD_OFFICE' } })
    const body = { name: 'Letter Assigner', departmentId: letters.id, supervisorId: chairman.id, isLetterAssigner: true }
    for (const denied of [personnelWho, { ...who, impersonationSessionId: 'support-session' }]) {
      const r = res(); await roles.saveFixedRole(req(body, denied), r); assert.equal(r.statusCode, 403)
    }
    const invalid = res(); await roles.saveFixedRole(req({ ...body, isLetterAssigner: 'true' }, who), invalid); assert.equal(invalid.statusCode, 400)
    const r = res(); await roles.saveFixedRole(req(body, who), r); assert.equal(r.statusCode, 201)
    const position = await db.personnel.findUniqueOrThrow({ where: { id: r.body.id } })
    assert.equal(position.supervisorId, chairman.id); assert.equal(position.isLetterAssigner, true); assert.equal(position.phone, '')
    const listing = res(); await roles.listFixedRoles(req({}, who), listing); assert.equal(listing.body.find((v: any) => v.id === position.id).isLetterAssigner, true)
    const updated = res(); await roles.saveFixedRole(req({ name: position.name, departmentId: letters.id }, who, { id: position.id }), updated)
    assert.equal(updated.statusCode, 200); assert.equal((await db.personnel.findUniqueOrThrow({ where: { id: position.id } })).isLetterAssigner, true)
    await roles.saveFixedRole(req({ ...body, isLetterAssigner: false }, who, { id: position.id }), res())
    assert.equal((await db.personnel.findUniqueOrThrow({ where: { id: position.id } })).isLetterAssigner, false)
    assert.ok(await db.auditLog.findFirst({ where: { workspaceId: workspace.id, event: 'ROLE_CREATED', payload: { path: ['roleId'], equals: position.id } } }))
  })
  await test('role rename updates both Chairman backing records without moving history', async () => {
    const r = res(); await roles.saveFixedRole(req({ name: 'Executive Chairman', departmentId: department.id }, who, { id: chairman.id }), r); assert.equal(r.statusCode, 200)
    assert.equal((await db.personnel.findUniqueOrThrow({ where: { id: chairman.id } })).name, 'Executive Chairman')
    assert.equal((await db.director.findUniqueOrThrow({ where: { id: director.id } })).name, 'Executive Chairman')
    assert.equal((await db.taskAssignment.findUniqueOrThrow({ where: { id: assignment.id } })).personnelId, chairman.id)
    await roles.saveFixedRole(req({ name: 'Chairman', departmentId: department.id }, who, { id: chairman.id }), res())
  })
  await test('other companies keep their existing access model', async () => {
    const w = await db.workspace.create({ data: { name: 'Other company' } }); const d = await db.director.create({ data: { name: 'Other director', phone: '0770000099', password: hash, workspaceId: w.id } })
    assert.equal((await authorize({ actorId: d.id, actorType: 'director', workspaceId: w.id })).allowed, true)
  })
  await test('conflicting Chairman contacts stop conversion without data loss', async () => {
    await db.migrationRoleContact.create({ data: { actorType: 'personnel', actorId: chairman.id, workspaceId: workspace.id, country: 'LK', phoneE164: '+94779999999' } })
    const count = await db.workspaceRole.count(); await assert.rejects(migrateFixedRoles(db, workspace.id, true), /different collected contacts/); assert.equal(await db.workspaceRole.count(), count)
  })
  await db.$disconnect(); console.log(`${passed} fixed role checks passed`)
}
main().catch(error => { console.error(error); process.exit(1) })
