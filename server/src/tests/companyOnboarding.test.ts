/**
 * Integration test suite for multi-company onboarding (spec §17).
 *
 * Runs against a dedicated `taskwise_test` database (never the dev DB). The
 * suite creates the database if needed, applies all migrations, truncates, then
 * exercises the real controllers via mock req/res objects so transactions, DB
 * constraints and audit writes are all covered.
 *
 * Run with:  npm run test:integration
 */
import 'dotenv/config'
import assert from 'assert'
import { execSync } from 'child_process'
import path from 'path'
import jwt from 'jsonwebtoken'

// ---- Point every app module at the test database BEFORE they are imported ----
const DEV_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/taskwise_db?schema=public'
const TEST_URL = DEV_URL.replace(/\/[^/?]+(\?|$)/, '/taskwise_test$1')
const ADMIN_URL = DEV_URL.replace(/\/[^/?]+(\?|$)/, '/postgres$1')
process.env.DATABASE_URL = TEST_URL
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret'
process.env.NODE_ENV = 'test'

// __dirname is server/src/tests -> server root is two levels up.
const SERVER_ROOT = path.resolve(__dirname, '../..')

// ---- Tiny test harness -------------------------------------------------------
let passed = 0
let failed = 0
const failures: string[] = []
async function test(name: string, fn: () => Promise<void> | void) {
  try { await fn(); passed++; console.log('  ✓ ' + name) }
  catch (e) { failed++; failures.push(name); console.log('  ✗ ' + name + '\n       ' + (e as Error).message) }
}
function section(name: string) { console.log('\n' + name) }

// ---- Express mock helpers ----------------------------------------------------
function mockRes(): any {
  const r: any = { statusCode: 200, body: undefined }
  r.status = (c: number) => { r.statusCode = c; return r }
  r.json = (b: any) => { r.body = b; return r }
  return r
}
function mockReq(opts: any = {}): any {
  const ip = opts.ip || '127.0.0.1'
  return {
    body: opts.body || {},
    params: opts.params || {},
    query: opts.query || {},
    user: opts.user,
    headers: opts.headers || {},
    method: opts.method || 'GET',
    originalUrl: opts.originalUrl || '/test',
    ip,
    socket: { remoteAddress: ip },
  }
}

async function main() {
  // Ensure database exists, then migrate.
  const { PrismaClient } = await import('@prisma/client')
  const admin = new PrismaClient({ datasources: { db: { url: ADMIN_URL } } })
  try { await admin.$executeRawUnsafe('CREATE DATABASE "taskwise_test"') } catch { /* exists */ }
  finally { await admin.$disconnect() }
  execSync('npx prisma migrate deploy', { cwd: SERVER_ROOT, env: { ...process.env, DATABASE_URL: TEST_URL }, stdio: 'ignore' })

  const prisma = (await import('../prisma')).default
  const bcrypt = (await import('bcryptjs')).default
  const companyCtrl = await import('../controllers/companyRequestController')
  const authCtrl = await import('../controllers/authController')
  const wsCtrl = await import('../controllers/workspaceController')
  const taskCtrl = await import('../controllers/taskController')
  const insuranceCtrl = await import('../controllers/insuranceController')
  const { FEATURES, requireFeature } = await import('../helpers/features')
  const { authenticateToken, requireSyswiseAdmin } = await import('../middleware/authMiddleware')

  // Fresh slate.
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "CompanyRequestAction","CompanyRequest","Notification","AuditLog","LoginLog","Personnel","Department","Layer","Director","Company","Workspace" RESTART IDENTITY CASCADE'
  )

  const hash = (pw: string) => bcrypt.hash(pw, 4)

  // ---- Seed the legacy Youth Council org ------------------------------------
  const ycWs = await prisma.workspace.create({ data: { name: 'Youth Council', companyName: 'Youth Council' } })
  const ycCompany = await prisma.company.create({
    data: { legalName: 'National Youth Services Council', displayName: 'Youth Council', registrationNumber: 'LEGACY-YC', prefix: 'YC', status: 'ACTIVE', allowUnprefixedLogin: true, workspaceId: ycWs.id },
  })
  await prisma.workspace.update({ where: { id: ycWs.id }, data: { companyId: ycCompany.id } })
  const ycLayers = []
  for (const n of [1, 2, 3]) ycLayers.push(await prisma.layer.create({ data: { workspaceId: ycWs.id, number: n, name: `Layer ${n}` } }))
  const ycDept = await prisma.department.create({ data: { name: 'Operations', layerId: ycLayers[0].id, workspaceId: ycWs.id } })
  // Syswise admin account on 0706786776 — seeded WITHOUT the flag; assigned below.
  const adminDir = await prisma.director.create({
    data: { name: 'Root Admin', phone: '0706786776', normalizedPhone: '94706786776', loginId: '0706786776', password: await hash('Admin@123'), workspaceId: ycWs.id, companyId: ycCompany.id, isActive: true },
  })
  // Regular Youth Council user on 0712345678 (unprefixed legacy login).
  const ycUser = await prisma.personnel.create({
    data: { name: 'YC User', phone: '0712345678', normalizedPhone: '94712345678', loginId: '0712345678', password: await hash('User@123'), departmentId: ycDept.id, workspaceId: ycWs.id, companyId: ycCompany.id, isActive: true },
  })
  // Existing NYSC user with a legacy short internal login code (not a real mobile number).
  const ycLegacyCode = await prisma.personnel.create({
    data: { name: 'Legacy Code User', phone: '07208', normalizedPhone: '947208', loginId: '07208', password: await hash('Legacy@123'), departmentId: ycDept.id, workspaceId: ycWs.id, companyId: ycCompany.id, isActive: true },
  })

  // =========================================================================
  section('Approval permissions')
  await test('The 0706786776 account can be assigned the Syswise administrator role', async () => {
    // Mirrors the migration's role assignment — by normalized phone, not a literal comparison at runtime.
    await prisma.director.updateMany({ where: { normalizedPhone: '94706786776' }, data: { isSyswiseAdmin: true } })
    const d = await prisma.director.findUnique({ where: { id: adminDir.id } })
    assert.equal(d?.isSyswiseAdmin, true)
  })

  const runMiddleware = async (user: any) => {
    const res = mockRes(); let nexted = false
    await requireSyswiseAdmin(mockReq({ user }), res, () => { nexted = true })
    return { res, nexted }
  }

  await test('Normal users cannot access the approval queue', async () => {
    const { res, nexted } = await runMiddleware({ actorId: ycUser.id, actorType: 'personnel', workspaceId: ycWs.id })
    assert.equal(nexted, false); assert.equal(res.statusCode, 403)
  })

  await test('Only a Syswise administrator passes the queue guard', async () => {
    const { res, nexted } = await runMiddleware({ actorId: adminDir.id, actorType: 'director', workspaceId: ycWs.id })
    assert.equal(nexted, true); assert.equal(res.statusCode, 200)
  })

  // =========================================================================
  section('Company request')
  const validBody = {
    company: { legalName: 'Valid Co', registrationNumber: 'REG-VALID-1', address: '1 Main St', industry: 'Retail', reason: 'We need task management.' },
    applicant: { firstName: 'Vin', lastName: 'Cent', email: 'valid@x.lk', phone: '0723334444', password: 'ValidPass1', confirmPassword: 'ValidPass1' },
  }

  await test('A valid request creates a pending request', async () => {
    const res = mockRes()
    await companyCtrl.createCompanyRequest(mockReq({ body: validBody, ip: '10.0.0.1' }), res)
    assert.equal(res.statusCode, 201)
    assert.equal(res.body.status, 'PENDING')
    assert.ok(res.body.reference)
    assert.ok(res.body.statusToken)
    const row = await prisma.companyRequest.findFirst({ where: { registrationNumber: 'REG-VALID-1' } })
    assert.equal(row?.status, 'PENDING')
  })

  await test('It does not create an active company or login', async () => {
    assert.equal(await prisma.company.count({ where: { registrationNumber: 'REG-VALID-1' } }), 0)
    assert.equal(await prisma.director.count({ where: { email: 'valid@x.lk' } }), 0)
    assert.equal(await prisma.personnel.count({ where: { normalizedPhone: '94723334444' } }), 0)
    const res = mockRes()
    await authCtrl.unifiedLogin(mockReq({ body: { phone: '0723334444', password: 'ValidPass1' } }), res)
    assert.equal(res.statusCode, 401)
  })

  await test('Passwords are never stored in plain text', async () => {
    const row = await prisma.companyRequest.findFirst({ where: { registrationNumber: 'REG-VALID-1' } })
    assert.ok(row!.applicantPasswordHash.startsWith('$2'))
    assert.notEqual(row!.applicantPasswordHash, 'ValidPass1')
  })

  await test('Duplicate requests are rejected while one is pending', async () => {
    const res = mockRes()
    await companyCtrl.createCompanyRequest(mockReq({ body: validBody, ip: '10.0.0.2' }), res)
    assert.equal(res.statusCode, 409)
  })

  await test('Invalid uploads are rejected', async () => {
    const res = mockRes()
    const body = { company: { ...validBody.company, registrationNumber: 'REG-BAD-DOC', supportingDocument: { name: 'x.exe', mimeType: 'application/x-msdownload', data: 'data:xxx' } }, applicant: { ...validBody.applicant, email: 'baddoc@x.lk', phone: '0723335555' } }
    await companyCtrl.createCompanyRequest(mockReq({ body, ip: '10.0.0.3' }), res)
    assert.equal(res.statusCode, 400)
  })

  await test('Public throttling works (6th call from one IP is blocked)', async () => {
    let last = mockRes()
    for (let i = 0; i < 6; i++) {
      last = mockRes()
      await companyCtrl.createCompanyRequest(mockReq({ body: validBody, ip: '10.9.9.9' }), last)
    }
    assert.equal(last.statusCode, 429)
  })

  await test('Applicants cannot view internal notes via the status endpoint', async () => {
    // Submit a fresh request and read its status token back.
    const sub = mockRes()
    await companyCtrl.createCompanyRequest(mockReq({ body: { company: { ...validBody.company, registrationNumber: 'REG-STATUS' }, applicant: { ...validBody.applicant, email: 'status@x.lk', phone: '0723336666' } }, ip: '10.0.0.4' }), sub)
    const ref = sub.body.reference
    const token = sub.body.statusToken
    const row = await prisma.companyRequest.findUnique({ where: { reference: ref } })
    await prisma.companyRequest.update({ where: { id: row!.id }, data: { internalNote: 'SECRET NOTE' } })
    const res = mockRes()
    await companyCtrl.getCompanyRequestStatus(mockReq({ body: { reference: ref, statusToken: token } }), res)
    assert.equal(res.statusCode, 200)
    assert.equal(JSON.stringify(res.body).includes('SECRET NOTE'), false)
  })

  // =========================================================================
  section('Prefix generation')
  const { generatePrefixCandidates, suggestAvailablePrefix } = await import('../helpers/prefix')
  await test('Fair First generates FF', () => assert.equal(generatePrefixCandidates('Fair First')[0], 'FF'))
  await test('Youth Council generates YC', () => assert.equal(generatePrefixCandidates('Youth Council')[0], 'YC'))
  await test('ABC Logistics generates AL', () => assert.equal(generatePrefixCandidates('ABC Logistics')[0], 'AL'))
  await test('One-word names generate a valid prefix (Dialog -> DI)', () => assert.equal(generatePrefixCandidates('Dialog')[0], 'DI'))
  await test('Legal suffixes are ignored (Fair First Pvt Ltd -> FF)', () => assert.equal(generatePrefixCandidates('Fair First Private Limited')[0], 'FF'))
  await test('Prefix uniqueness is checked case-insensitively', async () => {
    // "ff" already taken should be treated same as "FF".
    const chosen = await suggestAvailablePrefix('Fair First', async p => p.toUpperCase() === 'FF')
    assert.notEqual(chosen, 'FF')
    assert.match(chosen, /^[A-Z]{3,6}$/)
  })
  await test('Conflicts produce a meaningful letter-only alternative (ABC Logistics -> ABL)', async () => {
    const chosen = await suggestAvailablePrefix('ABC Logistics', async p => p === 'AL')
    assert.equal(chosen, 'ABL')
  })

  // =========================================================================
  section('Approval transaction')
  // Create the Fair First request through the real public endpoint. Applicant
  // phone deliberately equals the Youth Council user's phone (cross-company).
  const ffSub = mockRes()
  await companyCtrl.createCompanyRequest(mockReq({
    body: {
      company: { legalName: 'Fair First', registrationNumber: 'REG-FF', address: '9 Ocean Rd', industry: 'Insurance', reason: 'Adopting Syswise for our teams.' },
      applicant: { firstName: 'Fay', lastName: 'First', email: 'ff-admin@fairfirst.lk', phone: '0712345678', password: 'FairPass123', confirmPassword: 'FairPass123' },
    }, ip: '10.1.0.1',
  }), ffSub)
  const ffRequest = await prisma.companyRequest.findUnique({ where: { reference: ffSub.body.reference } })

  await test('Suggested prefix for Fair First is FF', () => assert.equal(ffRequest!.suggestedPrefix, 'FF'))

  const approveAs = (id: string, body: any) => {
    const res = mockRes()
    return companyCtrl.updateCompanyRequestStatus(mockReq({ params: { id }, body, user: { actorId: adminDir.id, actorType: 'director', workspaceId: ycWs.id } }), res).then(() => res)
  }

  let ffCompanyId = ''
  let ffAdminId = ''
  await test('Approval creates exactly one company and one administrator with the correct login ID', async () => {
    const res = await approveAs(ffRequest!.id, { action: 'approve' })
    assert.equal(res.statusCode, 200)
    assert.equal(res.body.loginId, 'FF0712345678')
    ffCompanyId = res.body.companyId
    ffAdminId = res.body.administratorDirectorId
    assert.equal(await prisma.company.count({ where: { prefix: 'FF' } }), 1)
    const dir = await prisma.director.findUnique({ where: { id: ffAdminId } })
    assert.equal(dir?.loginId, 'FF0712345678')
    assert.equal(dir?.isCompanyAdmin, true)
    assert.equal(dir?.isSyswiseAdmin, false)
  })

  await prisma.companyFeature.create({
    data: { companyId: ffCompanyId, featureKey: FEATURES.INSURANCE_MANAGEMENT, enabled: true },
  })

  await test('The approving administrator and time are recorded', async () => {
    const r = await prisma.companyRequest.findUnique({ where: { id: ffRequest!.id } })
    assert.equal(r?.status, 'APPROVED')
    assert.equal(r?.approvedByDirectorId, adminDir.id)
    assert.ok(r?.approvedAt)
    assert.equal(r?.companyId, ffCompanyId)
  })

  await test('Repeated approval does not create duplicate records (idempotent)', async () => {
    const res = await approveAs(ffRequest!.id, { action: 'approve' })
    assert.equal(res.statusCode, 200)
    assert.equal(res.body.alreadyApproved, true)
    assert.equal(await prisma.company.count({ where: { prefix: 'FF' } }), 1)
    assert.equal(await prisma.director.count({ where: { loginId: 'FF0712345678' } }), 1)
  })

  await test('An unavailable prefix cannot be approved and rolls back (no partial records)', async () => {
    // New request; pre-occupy the desired prefix, then try to approve with it.
    const sub = mockRes()
    await companyCtrl.createCompanyRequest(mockReq({ body: { company: { legalName: 'Zenith Zone', registrationNumber: 'REG-ZZ', address: 'z', industry: 'z', reason: 'zzzzz' }, applicant: { firstName: 'Zoe', lastName: 'Zed', email: 'zz@x.lk', phone: '0788887777', password: 'ZedPass123', confirmPassword: 'ZedPass123' } }, ip: '10.2.0.1' }), sub)
    const zzReq = await prisma.companyRequest.findUnique({ where: { reference: sub.body.reference } })
    await prisma.company.create({ data: { legalName: 'Taken', registrationNumber: 'REG-TAKEN', prefix: 'ZZ', status: 'ACTIVE' } })
    const companiesBefore = await prisma.company.count()
    const directorsBefore = await prisma.director.count()
    const res = await approveAs(zzReq!.id, { action: 'approve', prefix: 'ZZ' })
    assert.equal(res.statusCode, 400)
    assert.match(res.body.error, /no longer available/i)
    assert.equal(await prisma.company.count(), companiesBefore)
    assert.equal(await prisma.director.count(), directorsBefore)
    const after = await prisma.companyRequest.findUnique({ where: { id: zzReq!.id } })
    assert.notEqual(after?.status, 'APPROVED')
  })

  await test('Syswise admin can list requests across all companies', async () => {
    const res = mockRes()
    await companyCtrl.listCompanyRequests(mockReq({ query: {}, user: { actorId: adminDir.id, actorType: 'director', workspaceId: ycWs.id } }), res)
    const refs = res.body.requests.map((r: any) => r.reference)
    assert.ok(refs.includes(ffSub.body.reference))
  })

  // =========================================================================
  section('Login behaviour')
  const login = (phone: string, password: string) => {
    const res = mockRes()
    return authCtrl.unifiedLogin(mockReq({ body: { phone, password } }), res).then(() => res)
  }

  await test('Existing Youth Council login still works (unprefixed)', async () => {
    const res = await login('0712345678', 'User@123')
    assert.equal(res.statusCode, 200)
    assert.equal(res.body.user.actorType, 'personnel')
    assert.equal(res.body.user.actorId, ycUser.id)
  })

  await test('Existing short-code (non-mobile) login still works', async () => {
    // Guards against locking out NYSC users whose login IDs are internal codes like 07208.
    const res = await login('07208', 'Legacy@123')
    assert.equal(res.statusCode, 200)
    assert.equal(res.body.user.actorId, ycLegacyCode.id)
  })

  await test('Fair First login works using FF0712345678', async () => {
    const res = await login('FF0712345678', 'FairPass123')
    assert.equal(res.statusCode, 200)
    assert.equal(res.body.user.actorId, ffAdminId)
    assert.equal(res.body.user.companyPrefix, 'FF')
    assert.deepEqual(res.body.user.features, [FEATURES.INSURANCE_MANAGEMENT])
  })

  await test('Lowercase prefixes are handled consistently', async () => {
    const res = await login('ff0712345678', 'FairPass123')
    assert.equal(res.statusCode, 200)
    assert.equal(res.body.user.actorId, ffAdminId)
  })

  await test('Fair First users cannot log in using only 0712345678', async () => {
    // Unprefixed resolves to the Youth Council user; the FF password must not authenticate anyone.
    const res = await login('0712345678', 'FairPass123')
    assert.equal(res.statusCode, 401)
  })

  await test('Invalid / unknown prefixes are rejected', async () => {
    const res = await login('ZZ0712345678', 'FairPass123')
    assert.equal(res.statusCode, 401)
  })

  await test('Suspended-company users cannot log in', async () => {
    await prisma.company.update({ where: { id: ffCompanyId }, data: { status: 'SUSPENDED' } })
    const res = await login('FF0712345678', 'FairPass123')
    assert.equal(res.statusCode, 401)
    await prisma.company.update({ where: { id: ffCompanyId }, data: { status: 'ACTIVE' } })
  })

  await test('Inactive users cannot log in', async () => {
    await prisma.director.update({ where: { id: ffAdminId }, data: { isActive: false } })
    const res = await login('FF0712345678', 'FairPass123')
    assert.equal(res.statusCode, 401)
    await prisma.director.update({ where: { id: ffAdminId }, data: { isActive: true } })
  })

  await test('Login errors do not reveal account existence', async () => {
    const unknown = await login('YY0700000000', 'whatever1')
    const wrongPw = await login('FF0712345678', 'wrongpass1')
    assert.equal(unknown.body.error, 'Invalid login ID or password.')
    assert.equal(wrongPw.body.error, 'Invalid login ID or password.')
  })

  // =========================================================================
  section('Company user management')
  const ffWorkspace = await prisma.workspace.findFirst({ where: { companyId: ffCompanyId } })
  const ffLayer1 = await prisma.layer.findFirst({ where: { workspaceId: ffWorkspace!.id, number: 1 } })
  const ffDept = await prisma.department.create({ data: { name: 'Claims', layerId: ffLayer1!.id, workspaceId: ffWorkspace!.id } })
  const ffAdminUser = { actorId: ffAdminId, actorType: 'director', workspaceId: ffWorkspace!.id }
  const ycAdminUser = { actorId: adminDir.id, actorType: 'director', workspaceId: ycWs.id }

  await test('A Fair First administrator can create a Fair First user with an auto-generated login ID', async () => {
    const res = mockRes()
    await wsCtrl.createPersonnel(mockReq({ body: { name: 'FF Staff', phone: '0759999999', departmentId: ffDept.id, password: 'Staff@123' }, user: ffAdminUser }), res)
    assert.equal(res.statusCode, 201)
    assert.equal(res.body.loginId, 'FF0759999999')
    assert.equal(res.body.companyId, ffCompanyId)
    assert.equal(res.body.temporaryPassword, 'Staff@123')
  })

  await test('A blank password generates a unique shareable temporary password that is never stored in plain text', async () => {
    const res = mockRes()
    await wsCtrl.createPersonnel(mockReq({ body: { name: 'Generated Password User', phone: '0758888888', departmentId: ffDept.id }, user: ffAdminUser }), res)
    assert.equal(res.statusCode, 201)
    assert.equal(res.body.loginId, 'FF0758888888')
    assert.match(res.body.temporaryPassword, /^Tw!7[A-Za-z0-9_-]{8}$/)
    const stored = await prisma.personnel.findUniqueOrThrow({ where: { id: res.body.id } })
    assert.notEqual(stored.password, res.body.temporaryPassword)
    assert.equal(await bcrypt.compare(res.body.temporaryPassword, stored.password), true)
    assert.equal(stored.mustChangePassword, true)
  })

  await test('Duplicate normalized phone within Fair First is rejected', async () => {
    const res = mockRes()
    await wsCtrl.createPersonnel(mockReq({ body: { name: 'Dup', phone: '759999999', departmentId: ffDept.id, password: 'Staff@123' }, user: ffAdminUser }), res)
    assert.equal(res.statusCode, 409)
  })

  await test('The same phone can exist in another company', async () => {
    // 0759999999 already exists in Fair First; creating it under Youth Council must succeed.
    const res = mockRes()
    await wsCtrl.createPersonnel(mockReq({ body: { name: 'YC Staff', phone: '0759999999', departmentId: ycDept.id, password: 'Staff@123' }, user: ycAdminUser }), res)
    assert.equal(res.statusCode, 201)
    assert.equal(res.body.companyId, ycCompany.id)
    assert.equal(res.body.normalizedPhone, '94759999999')
    // Youth Council allows unprefixed login, so new users get the bare phone as login ID
    // (no YC prefix) — same convention as existing Youth Council users.
    assert.equal(res.body.loginId, '0759999999')
  })

  await test('A company administrator cannot create a user for another company', async () => {
    // FF admin passes a Youth Council department id — must be rejected (derived from token workspace).
    const res = mockRes()
    await wsCtrl.createPersonnel(mockReq({ body: { name: 'Cross', phone: '0761112222', departmentId: ycDept.id, password: 'Staff@123' }, user: ffAdminUser }), res)
    assert.equal(res.statusCode, 404)
  })

  await test('A company administrator cannot assign the Syswise administrator role', async () => {
    const before = await prisma.director.count({ where: { isSyswiseAdmin: true } })
    const res = mockRes()
    await wsCtrl.createPersonnel(mockReq({ body: { name: 'Sneaky', phone: '0762223333', departmentId: ffDept.id, password: 'Staff@123', isSyswiseAdmin: true }, user: ffAdminUser }), res)
    assert.equal(res.statusCode, 201)
    assert.equal(res.body.isSyswiseAdmin, undefined) // Personnel have no such field; flag is ignored.
    assert.equal(await prisma.director.count({ where: { isSyswiseAdmin: true } }), before)
  })

  // =========================================================================
  section('Fairfirst insurance management')
  const ffInsuranceStaff = await prisma.personnel.findFirstOrThrow({ where: { loginId: 'FF0759999999' } })
  const ffInsuranceUser = { actorId: ffInsuranceStaff.id, actorType: 'personnel', workspaceId: ffWorkspace!.id }

  await test('Insurance feature access is enabled only for Fairfirst', async () => {
    const guard = requireFeature(FEATURES.INSURANCE_MANAGEMENT)
    const ffRes = mockRes(); let ffNext = false
    await guard(mockReq({ user: ffInsuranceUser }), ffRes, () => { ffNext = true })
    assert.equal(ffNext, true)

    const ycRes = mockRes(); let ycNext = false
    await guard(mockReq({ user: ycAdminUser }), ycRes, () => { ycNext = true })
    assert.equal(ycNext, false)
    assert.equal(ycRes.statusCode, 403)
  })

  let motorQuotationId = ''
  await test('Any Fairfirst user can create a one-month motor quotation', async () => {
    const res = mockRes()
    await insuranceCtrl.createQuotation(mockReq({
      user: ffInsuranceUser,
      body: {
        quotationNumber: 'FF-Q-001', insuranceType: 'MOTOR', customerName: 'Test Customer', contactNumber: '0771234567',
        vehicleNumber: 'WP CAB-1234', vehicleMakeModel: 'Toyota Aqua', fuelType: 'Hybrid', vehicleUsage: 'Private',
        sumInsured: 8500000, premium: 125000,
      },
    }), res)
    assert.equal(res.statusCode, 201)
    assert.equal(res.body.createdByName, ffInsuranceStaff.name)
    assert.equal(res.body.status, 'ACTIVE')
    assert.equal(res.body.vehicleNumber, 'WP CAB-1234')
    motorQuotationId = res.body.id
    const issue = new Date(res.body.issueDate)
    const expiry = new Date(res.body.expiresAt)
    assert.ok(expiry > issue)
    assert.ok(expiry.getTime() - issue.getTime() >= 28 * 24 * 60 * 60 * 1000)
  })

  await test('A different Fairfirst user can edit the quotation', async () => {
    const res = mockRes()
    await insuranceCtrl.updateQuotation(mockReq({
      user: ffAdminUser,
      params: { id: motorQuotationId },
      body: {
        quotationNumber: 'FF-Q-001', insuranceType: 'MOTOR', customerName: 'Test Customer', contactNumber: '0771234567',
        vehicleNumber: 'WP CAB-1234', vehicleMakeModel: 'Toyota Aqua', fuelType: 'Hybrid', vehicleUsage: 'Private',
        sumInsured: 8500000, premium: 130000,
      },
    }), res)
    assert.equal(res.statusCode, 200)
    assert.equal(res.body.premium, 130000)
  })

  await test('Non-motor quotations store only suitable type-specific details', async () => {
    const res = mockRes()
    await insuranceCtrl.createQuotation(mockReq({
      user: ffInsuranceUser,
      body: {
        quotationNumber: 'FF-FIRE-001', insuranceType: 'FIRE', customerName: 'Property Owner', contactNumber: '0770001111',
        propertyAddress: '10 Main Street', propertyType: 'Building and contents', propertyUsage: 'Commercial',
        vehicleNumber: 'SHOULD-NOT-BE-STORED', sumInsured: 25000000, premium: 220000,
      },
    }), res)
    assert.equal(res.statusCode, 201)
    assert.equal(res.body.propertyAddress, '10 Main Street')
    assert.equal(res.body.vehicleNumber, null)
  })

  await test('An active quotation converts to a policy with a partial-payment balance', async () => {
    const res = mockRes()
    await insuranceCtrl.convertQuotation(mockReq({
      user: ffInsuranceUser,
      params: { id: motorQuotationId },
      body: { policyNumber: 'FF-P-001', premium: 130000, issueDate: '2026-08-05', expiryDate: '2027-08-04', paid: false, paymentAmount: 30000 },
    }), res)
    assert.equal(res.statusCode, 201)
    assert.equal(res.body.paymentAmount, 30000)
    assert.equal(res.body.remainingAmount, 100000)
    assert.equal(res.body.paid, false)
    const quote = await prisma.insuranceQuotation.findUniqueOrThrow({ where: { id: motorQuotationId } })
    assert.equal(quote.status, 'CONVERTED')
  })

  await test('A policy can be created directly and marked paid in full', async () => {
    const res = mockRes()
    await insuranceCtrl.createPolicy(mockReq({
      user: ffInsuranceUser,
      body: {
        policyNumber: 'FF-DIRECT-001', insuranceType: 'TRAVEL', customerName: 'Traveller', contactNumber: '+94770002222',
        passportNumber: 'N1234567', destination: 'Singapore', travelStartDate: '2026-09-01', travelEndDate: '2026-09-10',
        sumInsured: 5000000, premium: 15000, issueDate: '2026-08-05', expiryDate: '2026-09-10', paid: true, paymentAmount: 0,
      },
    }), res)
    assert.equal(res.statusCode, 201)
    assert.equal(res.body.paid, true)
    assert.equal(res.body.paymentAmount, 15000)
    assert.equal(res.body.remainingAmount, 0)
  })

  await test('An expired quotation can be renewed under a new manual number', async () => {
    const createRes = mockRes()
    await insuranceCtrl.createQuotation(mockReq({
      user: ffInsuranceUser,
      body: {
        quotationNumber: 'FF-OLD-001', insuranceType: 'CASUALTY', customerName: 'Renewal Customer', contactNumber: '0761234567',
        businessActivity: 'Retail', riskDescription: 'Public liability', sumInsured: 10000000, premium: 45000,
      },
    }), createRes)
    await prisma.insuranceQuotation.update({ where: { id: createRes.body.id }, data: { expiresAt: new Date('2026-01-01') } })
    const renewRes = mockRes()
    await insuranceCtrl.renewQuotation(mockReq({ user: ffAdminUser, params: { id: createRes.body.id }, body: { quotationNumber: 'FF-RENEW-001', premium: 47500 } }), renewRes)
    assert.equal(renewRes.statusCode, 201)
    assert.equal(renewRes.body.quotationNumber, 'FF-RENEW-001')
    assert.equal(renewRes.body.premium, 47500)
    const original = await prisma.insuranceQuotation.findUniqueOrThrow({ where: { id: createRes.body.id } })
    assert.equal(original.status, 'RENEWED')
    assert.equal(renewRes.body.renewedFromId, original.id)
  })

  await test('Insurance records remain isolated from other company workspaces', async () => {
    const quoteRes = mockRes(); await insuranceCtrl.listQuotations(mockReq({ user: ycAdminUser, query: {} }), quoteRes)
    const policyRes = mockRes(); await insuranceCtrl.listPolicies(mockReq({ user: ycAdminUser, query: {} }), policyRes)
    assert.deepEqual(quoteRes.body, [])
    assert.deepEqual(policyRes.body, [])
    assert.equal(await prisma.insuranceQuotation.count({ where: { workspaceId: ycWs.id } }), 0)
    assert.equal(await prisma.insurancePolicy.count({ where: { workspaceId: ycWs.id } }), 0)
  })

  // =========================================================================
  section('Director progress-update editing')
  const ffStaffForUpdate = await prisma.personnel.findFirstOrThrow({ where: { loginId: 'FF0759999999' } })
  const editProject = await prisma.project.create({
    data: { workspaceId: ffWorkspace!.id, directorId: ffAdminId, name: 'Progress Edit Test' },
  })
  const editTask = await prisma.task.create({
    data: { workspaceId: ffWorkspace!.id, projectId: editProject.id, title: 'Editable Progress', createdByDirectorId: ffAdminId },
  })
  const personnelUpdate = await prisma.taskProgressLog.create({
    data: {
      workspaceId: ffWorkspace!.id,
      taskId: editTask.id,
      authorType: 'personnel',
      authorPersonnelId: ffStaffForUpdate.id,
      note: 'Original personnel update',
    },
  })

  await test('A director can edit an update posted by personnel in the same workspace', async () => {
    const res = mockRes()
    await taskCtrl.updateProgressLog(mockReq({
      params: { id: editTask.id, logId: personnelUpdate.id },
      body: { note: 'Director corrected update' },
      user: ffAdminUser,
    }), res)
    assert.equal(res.statusCode, 200)
    assert.equal(res.body.note, 'Director corrected update')
    assert.ok(res.body.editedAt)
    assert.equal(res.body.authorPersonnelId, ffStaffForUpdate.id)
    const audit = await prisma.auditLog.findFirst({ where: { event: 'PROGRESS_LOG_EDITED', taskId: editTask.id } })
    assert.equal(audit?.actorDirectorId, ffAdminId)
    assert.equal((audit?.payload as any)?.previousNote, 'Original personnel update')
    assert.equal((audit?.payload as any)?.updatedNote, 'Director corrected update')
  })

  await test('Personnel cannot use the director progress-update edit endpoint', async () => {
    const res = mockRes()
    await taskCtrl.updateProgressLog(mockReq({
      params: { id: editTask.id, logId: personnelUpdate.id },
      body: { note: 'Unauthorized change' },
      user: { actorId: ffStaffForUpdate.id, actorType: 'personnel', workspaceId: ffWorkspace!.id },
    }), res)
    assert.equal(res.statusCode, 403)
    const stored = await prisma.taskProgressLog.findUniqueOrThrow({ where: { id: personnelUpdate.id } })
    assert.equal(stored.note, 'Director corrected update')
  })

  await test('A director cannot edit an update from another workspace', async () => {
    const res = mockRes()
    await taskCtrl.updateProgressLog(mockReq({
      params: { id: editTask.id, logId: personnelUpdate.id },
      body: { note: 'Cross-workspace change' },
      user: ycAdminUser,
    }), res)
    assert.equal(res.statusCode, 404)
  })

  // =========================================================================
  section('System Admin support access')
  await test('The global account directory excludes System Admin accounts', async () => {
    const res = mockRes()
    await authCtrl.listImpersonationTargets(mockReq({ user: ycAdminUser }), res)
    assert.equal(res.statusCode, 200)
    assert.equal(res.body.some((target: any) => target.id === adminDir.id), false)
    assert.equal(res.body.some((target: any) => target.id === ffAdminId && target.actorType === 'director'), true)
    assert.equal(res.body.some((target: any) => target.loginId === 'FF0759999999' && target.actorType === 'personnel'), true)
  })

  await test('Support access rejects a normal session token as step-up verification', async () => {
    const ffStaff = await prisma.personnel.findFirstOrThrow({ where: { loginId: 'FF0759999999' } })
    const passwordToken = jwt.sign(
      { actorId: adminDir.id, actorType: 'director', workspaceId: ycWs.id, authenticationMethod: 'password' },
      process.env.JWT_SECRET!,
      { expiresIn: '5m' },
    )
    const res = mockRes()
    await authCtrl.startImpersonation(mockReq({
      user: ycAdminUser,
      body: { targetActorId: ffStaff.id, targetActorType: 'personnel', reason: 'Approved support ticket', stepUpToken: passwordToken },
    }), res)
    assert.equal(res.statusCode, 401)
  })

  await test('Passkey-verified support access is cross-company, audited, and immediately revocable', async () => {
    const ffStaff = await prisma.personnel.findFirstOrThrow({ where: { loginId: 'FF0759999999' } })
    const stepUpToken = jwt.sign(
      { actorId: adminDir.id, actorType: 'director', workspaceId: ycWs.id, authenticationMethod: 'webauthn' },
      process.env.JWT_SECRET!,
      { expiresIn: '5m' },
    )
    const startRes = mockRes()
    await authCtrl.startImpersonation(mockReq({
      user: ycAdminUser,
      body: { targetActorId: ffStaff.id, targetActorType: 'personnel', reason: 'Approved support ticket TW-1042', stepUpToken },
      ip: '10.8.0.1',
    }), startRes)
    assert.equal(startRes.statusCode, 200)
    assert.equal(startRes.body.user.workspaceId, ffWorkspace!.id)
    assert.equal(startRes.body.user.impersonation.reason, 'Approved support ticket TW-1042')

    const claims = jwt.verify(startRes.body.token, process.env.JWT_SECRET!) as jwt.JwtPayload
    assert.equal(claims.adminId, adminDir.id)
    assert.equal(claims.actorId, ffStaff.id)
    assert.equal(Number(claims.exp) - Number(claims.iat), 15 * 60)

    const session = await prisma.impersonationSession.findUniqueOrThrow({ where: { id: claims.impersonationSessionId as string } })
    assert.equal(session.reason, 'Approved support ticket TW-1042')
    assert.ok(session.expiresAt)
    assert.ok(await prisma.auditLog.findFirst({ where: { event: 'IMPERSONATION_STARTED', actorDirectorId: adminDir.id } }))

    const revokeRes = mockRes()
    await authCtrl.revokeImpersonationSession(mockReq({
      user: ycAdminUser,
      params: { id: claims.impersonationSessionId },
    }), revokeRes)
    assert.equal(revokeRes.statusCode, 200)
    assert.ok(await prisma.auditLog.findFirst({ where: { event: 'IMPERSONATION_REVOKED', actorDirectorId: adminDir.id } }))

    const authRes = mockRes(); let nexted = false
    await authenticateToken(mockReq({ headers: { authorization: `Bearer ${startRes.body.token}` } }), authRes, () => { nexted = true })
    assert.equal(nexted, false)
    assert.equal(authRes.statusCode, 401)
  })

  // =========================================================================
  section('Data isolation')
  await test('Youth Council listing does not include Fair First users (and vice versa)', async () => {
    const ycRes = mockRes()
    await wsCtrl.getPersonnel(mockReq({ query: {}, user: ycAdminUser }), ycRes)
    const ycIds = ycRes.body.map((p: any) => p.companyId)
    assert.equal(ycIds.every((id: string) => id !== ffCompanyId), true)

    const ffRes = mockRes()
    await wsCtrl.getPersonnel(mockReq({ query: {}, user: ffAdminUser }), ffRes)
    const ffIds = ffRes.body.map((p: any) => p.companyId)
    assert.equal(ffIds.every((id: string) => id !== ycCompany.id), true)
    assert.ok(ffRes.body.length >= 1)
  })

  await test('Users cannot bypass isolation through object IDs', async () => {
    const ffStaff = await prisma.personnel.findFirst({ where: { companyId: ffCompanyId, loginId: 'FF0759999999' } })
    // Youth Council admin tries to move a Fair First person by id -> not found (scoped by workspace).
    const res = mockRes()
    await wsCtrl.movePersonnel(mockReq({ params: { id: ffStaff!.id }, body: { departmentId: ycDept.id }, user: ycAdminUser }), res)
    assert.equal(res.statusCode, 404)
  })

  await test('Cross-company department access is denied (departments scoped to workspace)', async () => {
    const res = mockRes()
    await wsCtrl.getDepartments(mockReq({ query: {}, user: ffAdminUser }), res)
    const ids = res.body.map((d: any) => d.id)
    assert.equal(ids.includes(ycDept.id), false)
    assert.equal(ids.includes(ffDept.id), true)
  })

  await test('New-request notifications target only Syswise administrators', async () => {
    const notifs = await prisma.notification.findMany({ where: { type: 'company_request_submitted' } })
    assert.ok(notifs.length >= 1)
    assert.equal(notifs.every(n => n.recipientDirectorId === adminDir.id), true)
  })

  await test('Audit log records the submission and approval and never stores secrets', async () => {
    const logs = await prisma.auditLog.findMany({ where: { event: { in: ['COMPANY_REQUEST_SUBMITTED', 'COMPANY_ADMINISTRATOR_CREATED'] } } })
    assert.ok(logs.length >= 2)
    const blob = JSON.stringify(logs)
    assert.equal(blob.includes('FairPass123'), false)
    assert.equal(blob.includes('$2'), false) // no bcrypt hashes leaked into audit payloads
  })

  // ---- Summary --------------------------------------------------------------
  console.log(`\n${passed} passed, ${failed} failed`)
  await prisma.$disconnect()
  if (failed) { console.error('Failing tests: ' + failures.join(', ')); process.exit(1) }
}

main().catch(err => { console.error(err); process.exit(1) })
