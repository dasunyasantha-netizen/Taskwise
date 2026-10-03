/** Real controllers and PostgreSQL, always a dedicated local identity test DB. */
import 'dotenv/config'
import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import path from 'node:path'
import jwt from 'jsonwebtoken'
const original = new URL(process.env.DATABASE_URL!)
if (!['localhost', '127.0.0.1'].includes(original.hostname)) throw new Error('Identity tests require local PostgreSQL')
const adminUrl = new URL(original); adminUrl.pathname = '/postgres'
const testUrl = new URL(original); testUrl.pathname = '/taskwise_identity_test'
process.env.DATABASE_URL = testUrl.toString()
process.env.JWT_SECRET = 'isolated-identity-tests-only'
process.env.SYSWISE_BASE_URL = 'http://127.0.0.1:8019'
process.env.SYSWISE_TASKWISE_SERVICE_KEY = 'local-identity-fixture-key'
process.env.PORT = '4309'
const res = () => { const r: any = { statusCode: 200 }; r.status = (c: number) => { r.statusCode = c; return r }; r.json = (b: any) => { r.body = b; return r }; r.setHeader = () => r; return r }
const req = (body: any = {}, user?: any, params: any = {}) => ({ body, user, params, headers: {}, ip: '127.0.0.1' } as any)

async function main() {
  const { PrismaClient } = await import('@prisma/client')
  const admin = new PrismaClient({ datasources: { db: { url: adminUrl.toString() } } })
  try { await admin.$executeRawUnsafe('CREATE DATABASE "taskwise_identity_test"') } catch (e: any) { if (!String(e.message).includes('already exists')) throw e }
  await admin.$disconnect()
  execSync('npx prisma migrate deploy', { cwd: path.resolve(__dirname, '../..'), env: process.env, stdio: 'ignore' })
  const db = (await import('../prisma')).default
  const bcrypt = (await import('bcryptjs')).default
  const sso = await import('../controllers/syswiseController')
  const contacts = await import('../controllers/migrationContactController')
  const auth = await import('../controllers/authController')
  const { authenticateToken } = await import('../middleware/authMiddleware')
  await db.$executeRawUnsafe('TRUNCATE TABLE "MigrationRoleContact","LoginLog","AuditLog","Personnel","Director","Company","Workspace" RESTART IDENTITY CASCADE')
  const hash = await bcrypt.hash('Legacy-Test!123', 4)
  const companyA = await db.company.create({ data: { legalName: 'Identity Company A', registrationNumber: 'identity-a', prefix: 'IDA' } })
  const companyB = await db.company.create({ data: { legalName: 'Identity Company B', registrationNumber: 'identity-b', prefix: 'IDB' } })
  const workspaceA = await db.workspace.create({ data: { name: 'Company A', companyId: companyA.id } })
  const workspaceB = await db.workspace.create({ data: { name: 'Company B', companyId: companyB.id } })
  await db.company.update({ where: { id: companyA.id }, data: { workspaceId: workspaceA.id } })
  await db.company.update({ where: { id: companyB.id }, data: { workspaceId: workspaceB.id } })
  const director = await db.director.create({ data: { name: 'Director Position', phone: '0771234500', loginId: 'IDA0771234500', password: hash, workspaceId: workspaceA.id, companyId: companyA.id } })
  const layer = await db.layer.create({ data: { workspaceId: workspaceB.id, number: 3, name: 'Officers' } })
  const department = await db.department.create({ data: { workspaceId: workspaceB.id, layerId: layer.id, name: 'YSO' } })
  const person = await db.personnel.create({ data: { name: 'YSO Position', phone: '0771234500', loginId: 'IDB0771234500', password: hash, workspaceId: workspaceB.id, companyId: companyB.id, departmentId: department.id } })
  const ca = await db.migrationRoleContact.create({ data: { actorType: 'director', actorId: director.id, workspaceId: workspaceA.id, companyId: companyA.id, country: 'LK', phoneE164: '+94771234500' } })
  const cb = await db.migrationRoleContact.create({ data: { actorType: 'personnel', actorId: person.id, workspaceId: workspaceB.id, companyId: companyB.id, country: 'LK', phoneE164: '+94771234500' } })
  if (process.argv.includes('--serve')) {
    const singleCompany = await db.company.create({ data: { legalName: 'Single Role Company', registrationNumber: 'identity-single', prefix: 'IDS' } })
    const singleWorkspace = await db.workspace.create({ data: { name: 'Single Role Company', companyId: singleCompany.id } })
    await db.company.update({ where: { id: singleCompany.id }, data: { workspaceId: singleWorkspace.id } })
    const single = await db.director.create({ data: { name: 'Single Director Position', phone: '0771234600', loginId: 'IDS0771234600', password: hash, workspaceId: singleWorkspace.id, companyId: singleCompany.id } })
    const singleContact = await db.migrationRoleContact.create({ data: { actorType: 'director', actorId: single.id, workspaceId: singleWorkspace.id, companyId: singleCompany.id, country: 'LK', phoneE164: '+94771234600' } })
    const reviewerLayer = await db.layer.create({ data: { workspaceId: workspaceA.id, number: 3, name: 'Reviewers' } })
    const reviewerDepartment = await db.department.create({ data: { workspaceId: workspaceA.id, layerId: reviewerLayer.id, name: 'Reviewer' } })
    const reviewer = await db.personnel.create({ data: { name: 'Reviewer Position', phone: '0771234500', password: hash, workspaceId: workspaceA.id, companyId: companyA.id, departmentId: reviewerDepartment.id } })
    const reviewerContact = await db.migrationRoleContact.create({ data: { actorType: 'personnel', actorId: reviewer.id, workspaceId: workspaceA.id, companyId: companyA.id, country: 'LK', phoneE164: '+94771234500' } })
    for (const c of [ca, cb, singleContact, reviewerContact]) assert.equal(await contacts.syncMigrationContact(c), true)
    await import('../index')
    console.log('Isolated Taskwise identity fixture ready')
    return
  }
  let passed = 0
  const test = async (name: string, run: () => Promise<void>) => { await run(); console.log('PASS ' + name); passed++ }
  const fetchReal = globalThis.fetch
  const assignments = [ca, cb].map(c => ({ actorType: c.actorType, actorId: c.actorId, workspaceId: c.workspaceId, assignmentVersion: 1 }))
  globalThis.fetch = async () => new Response(JSON.stringify({ user: { id: 99 }, roles: assignments }), { status: 200 })
  let choice: any, directorToken: string, personnelToken: string
  await test('exchange maps two existing positions without creating people', async () => {
    const r = res(); await sso.exchangeSyswiseCode(req({ code: 'a'.repeat(43) }), r)
    assert.equal(r.statusCode, 200); assert.equal(r.body.roles.length, 2)
    assert.equal(await db.director.count(), 1); assert.equal(await db.personnel.count(), 1); choice = r.body
  })
  await test('company selection issues correct director and YSO permissions', async () => {
    const a = res(); await sso.selectSyswiseRole(req({ selectionToken: choice.selectionToken, contactId: ca.id }), a)
    const b = res(); await sso.selectSyswiseRole(req({ selectionToken: choice.selectionToken, contactId: cb.id }), b)
    assert.equal(a.statusCode, 200); assert.equal(a.body.user.actorId, director.id)
    assert.equal(a.body.user.actorType, 'director'); assert.equal(b.body.user.actorType, 'personnel')
    assert.equal(b.body.user.departmentId, department.id); directorToken = a.body.token; personnelToken = b.body.token
  })
  const authorize = async (token: string) => { const r = res(); let allowed = false; await authenticateToken({ headers: { authorization: 'Bearer ' + token } } as any, r, () => { allowed = true }); return { allowed, r } }
  await test('choice token cannot be used as an app session', async () => { assert.equal((await authorize(choice.selectionToken)).r.statusCode, 401) })
  await test('normal linked session is authorized', async () => { assert.equal((await authorize(personnelToken)).allowed, true) })
  await test('linked profile reload retains identity contact and sign-in method', async () => {
    const r = res(); await auth.getMe(req({}, jwt.verify(personnelToken, process.env.JWT_SECRET!)), r)
    assert.equal(r.body.syswiseUserId, 99); assert.equal(r.body.phone, '+94771234500')
    assert.equal(r.body.mustChangePassword, false)
  })
  await test('linked profile changes preserve legacy credentials and role contact', async () => {
    const profile = await import('../controllers/workspaceController')
    const identity = jwt.verify(personnelToken, process.env.JWT_SECRET!)
    const reject = res(); await profile.updateProfile(req({ name: 'YSO Position', phone: '+14155552671' }, identity), reject)
    assert.equal(reject.statusCode, 400)
    const ok = res(); await profile.updateProfile(req({ name: 'Updated Position' }, identity), ok)
    assert.equal(ok.statusCode, 200)
    const actor = await db.personnel.findUniqueOrThrow({ where: { id: person.id } })
    assert.equal(actor.phone, '0771234500'); assert.equal(actor.loginId, 'IDB0771234500'); assert.equal(actor.password, hash)
  })
  await test('forged foreign role and expired selector are denied', async () => {
    const limited = jwt.sign({ purpose: 'taskwise-role-choice', syswiseUserId: 99, assignments: [assignments[0]] }, process.env.JWT_SECRET!)
    const r = res(); await sso.selectSyswiseRole(req({ selectionToken: limited, contactId: cb.id }), r); assert.equal(r.statusCode, 403)
    const expired = jwt.sign({ purpose: 'taskwise-role-choice', syswiseUserId: 99, assignments }, process.env.JWT_SECRET!, { expiresIn: -1 })
    const e = res(); await sso.selectSyswiseRole(req({ selectionToken: expired, contactId: ca.id }), e); assert.equal(e.statusCode, 401)
  })
  await test('inactive companies cannot authorize existing sessions', async () => {
    await db.company.update({ where: { id: companyA.id }, data: { status: 'SUSPENDED' } })
    assert.equal((await authorize(directorToken)).r.statusCode, 401)
    await db.company.update({ where: { id: companyA.id }, data: { status: 'ACTIVE' } })
  })
  await test('directors cannot assign roles in another company', async () => {
    const r = res(); await contacts.assignMigrationContact(req({ country: 'LK', phone: '+94771234501' }, { actorType: 'director', actorId: director.id, workspaceId: workspaceA.id }, { actorType: 'personnel', actorId: person.id }), r)
    assert.equal(r.statusCode, 403)
  })
  await test('supervisors can assign only direct reports', async () => {
    const supervisor = await db.personnel.create({ data: { name: 'Supervisor', phone: '0771234502', password: hash, workspaceId: workspaceB.id, companyId: companyB.id, departmentId: department.id } })
    const who = { actorType: 'personnel', actorId: supervisor.id, workspaceId: workspaceB.id }
    const first = res(); await contacts.assignMigrationContact(req({ country: 'LK', phone: '+94771234501' }, who, { actorType: 'personnel', actorId: person.id }), first); assert.equal(first.statusCode, 403)
    await db.personnel.update({ where: { id: person.id }, data: { supervisorId: supervisor.id } })
    const r = res(); await contacts.assignMigrationContact(req({ country: 'LK', phone: '+94771234501' }, who, { actorType: 'personnel', actorId: person.id }), r)
    assert.equal(r.statusCode, 200)
    const changed = await db.migrationRoleContact.findUniqueOrThrow({ where: { id: cb.id } }); assert.equal(changed.assignmentVersion, 2)
    assert.ok(changed.legacyAccessRevokedAt)
  })
  await test('reassignment revokes both old SSO and legacy sessions', async () => {
    assert.equal((await authorize(personnelToken)).r.statusCode, 401)
    const legacy = jwt.sign({ actorId: person.id, actorType: 'personnel', workspaceId: workspaceB.id }, process.env.JWT_SECRET!)
    assert.equal((await authorize(legacy)).r.statusCode, 401)
    const r = res(); await auth.unifiedLogin(req({ phone: 'IDB0771234500', password: 'Legacy-Test!123' }), r); assert.equal(r.statusCode, 401)
  })
  await test('old role chooser cannot reopen a reassigned position', async () => {
    const r = res(); await sso.selectSyswiseRole(req({ selectionToken: choice.selectionToken, contactId: cb.id }), r); assert.equal(r.statusCode, 403)
  })
  await test('unchanged legacy account and password continue working', async () => {
    const r = res(); await auth.unifiedLogin(req({ phone: 'IDA0771234500', password: 'Legacy-Test!123' }), r); assert.equal(r.statusCode, 200)
  })
  await test('service outages do not issue a session or alter an assignment', async () => {
    globalThis.fetch = async () => { throw new Error('fixture outage') }
    const r = res(); await sso.exchangeSyswiseCode(req({ code: 'b'.repeat(43) }), r); assert.equal(r.statusCode, 503); assert.equal(r.body.token, undefined)
  })
  globalThis.fetch = fetchReal
  await db.$disconnect()
  console.log(`${passed} identity migration checks passed`)
}
main().catch(e => { console.error(e.message); process.exit(1) })
