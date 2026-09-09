/**
 * Integration tests for the four-level hierarchy (feature `four_level_hierarchy`).
 *
 * Exercises the real controllers against the test database so the office
 * category rules, the mandatory reporting manager, notice targeting and the
 * System Administrator feature toggle are all covered end to end — including
 * the guarantee that a company without the feature behaves exactly as before.
 *
 * Run with:  npm run test:hierarchy
 */
import 'dotenv/config'
import assert from 'assert'
import { execSync } from 'child_process'
import path from 'path'

const DEV_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/taskwise_db?schema=public'
const TEST_URL = DEV_URL.replace(/\/[^/?]+(\?|$)/, '/taskwise_test$1')
const ADMIN_URL = DEV_URL.replace(/\/[^/?]+(\?|$)/, '/postgres$1')
process.env.DATABASE_URL = TEST_URL
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret'
process.env.NODE_ENV = 'test'

const SERVER_ROOT = path.resolve(__dirname, '../..')

let passed = 0
let failed = 0
const failures: string[] = []
async function test(name: string, fn: () => Promise<void> | void) {
  try { await fn(); passed++; console.log('  ✓ ' + name) }
  catch (e) { failed++; failures.push(name); console.log('  ✗ ' + name + '\n       ' + (e as Error).message) }
}
function section(name: string) { console.log('\n' + name) }

function mockRes(): any {
  const r: any = { statusCode: 200, body: undefined }
  r.status = (c: number) => { r.statusCode = c; return r }
  r.json = (b: any) => { r.body = b; return r }
  return r
}
function mockReq(opts: any = {}): any {
  return {
    body: opts.body || {},
    params: opts.params || {},
    query: opts.query || {},
    user: opts.user,
    headers: {},
    method: opts.method || 'GET',
    originalUrl: '/test',
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
  }
}

async function main() {
  const { PrismaClient } = await import('@prisma/client')
  const admin = new PrismaClient({ datasources: { db: { url: ADMIN_URL } } })
  try { await admin.$executeRawUnsafe('CREATE DATABASE "taskwise_test"') } catch { /* exists */ }
  finally { await admin.$disconnect() }
  execSync('npx prisma migrate deploy', { cwd: SERVER_ROOT, env: { ...process.env, DATABASE_URL: TEST_URL }, stdio: 'ignore' })

  const prisma = (await import('../prisma')).default
  const bcrypt = (await import('bcryptjs')).default
  const ws = await import('../controllers/workspaceController')
  const notices = await import('../controllers/noticeController')
  const adminFeatures = await import('../controllers/adminFeatureController')
  const { FEATURES } = await import('../helpers/features')

  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "NoticeDismissal","Notice","CompanyFeature","Notification","AuditLog","LoginLog","Personnel","Department","Layer","Director","Company","Workspace" RESTART IDENTITY CASCADE'
  )
  const hash = (pw: string) => bcrypt.hash(pw, 4)

  // ---- Youth Council: four levels, feature enabled --------------------------
  const ycWs = await prisma.workspace.create({ data: { name: 'Youth Council' } })
  const ycCo = await prisma.company.create({
    data: { legalName: 'National Youth Services Council', registrationNumber: 'LEGACY-YC', prefix: 'YC', status: 'ACTIVE', allowUnprefixedLogin: true, workspaceId: ycWs.id },
  })
  await prisma.workspace.update({ where: { id: ycWs.id }, data: { companyId: ycCo.id } })
  await prisma.companyFeature.create({ data: { companyId: ycCo.id, featureKey: FEATURES.FOUR_LEVEL_HIERARCHY, enabled: true } })
  const ycLayer: Record<number, string> = {}
  for (const n of [1, 2, 3, 4]) {
    const l = await prisma.layer.create({ data: { workspaceId: ycWs.id, number: n, name: `Level ${n}` } })
    ycLayer[n] = l.id
  }
  const ycDirector = await prisma.director.create({
    data: { name: 'YC Chairman', phone: '0701111111', normalizedPhone: '94701111111', loginId: '0701111111', password: await hash('Dir@1234'), workspaceId: ycWs.id, companyId: ycCo.id, isChairman: true, isSyswiseAdmin: true },
  })
  const ycUser = { actorId: ycDirector.id, actorType: 'director', workspaceId: ycWs.id }

  // ---- Fair First: three levels, feature NOT enabled ------------------------
  const ffWs = await prisma.workspace.create({ data: { name: 'Fair First' } })
  const ffCo = await prisma.company.create({
    data: { legalName: 'Fair First Insurance', registrationNumber: 'REG-FF', prefix: 'FF', status: 'ACTIVE', workspaceId: ffWs.id },
  })
  await prisma.workspace.update({ where: { id: ffWs.id }, data: { companyId: ffCo.id } })
  const ffLayer: Record<number, string> = {}
  for (const n of [1, 2, 3]) {
    const l = await prisma.layer.create({ data: { workspaceId: ffWs.id, number: n, name: `Layer ${n}` } })
    ffLayer[n] = l.id
  }
  const ffDirector = await prisma.director.create({
    data: { name: 'FF Director', phone: '0702222222', normalizedPhone: '94702222222', loginId: 'FF0702222222', password: await hash('Dir@1234'), workspaceId: ffWs.id, companyId: ffCo.id },
  })
  const ffUser = { actorId: ffDirector.id, actorType: 'director', workspaceId: ffWs.id }

  const createDept = async (user: any, body: any) => {
    const res = mockRes(); await ws.createDepartment(mockReq({ body, user }), res); return res
  }
  const createPerson = async (user: any, body: any) => {
    const res = mockRes(); await ws.createPersonnel(mockReq({ body, user }), res); return res
  }

  // =========================================================================
  section('Office category on departments')

  await test('A level 2 department must declare Head Office or Provincial', async () => {
    const res = await createDept(ycUser, { name: 'Planning', layerId: ycLayer[2] })
    assert.equal(res.statusCode, 400)
    assert.match(res.body.error, /Head Office or Provincial/)
  })

  await test('An invalid category value is rejected', async () => {
    const res = await createDept(ycUser, { name: 'Planning', layerId: ycLayer[2], officeCategory: 'REGIONAL' })
    assert.equal(res.statusCode, 400)
  })

  let l1Dept = '', l2Head = '', l2Prov = '', l3Prov = '', l4Doctors = ''
  await test('Levels 2 and 3 accept both categories', async () => {
    const a = await createDept(ycUser, { name: 'Head Office Planning', layerId: ycLayer[2], officeCategory: 'HEAD_OFFICE' })
    const b = await createDept(ycUser, { name: 'Provincial Planning', layerId: ycLayer[2], officeCategory: 'PROVINCIAL' })
    const c = await createDept(ycUser, { name: 'Provincial Delivery', layerId: ycLayer[3], officeCategory: 'PROVINCIAL' })
    assert.equal(a.statusCode, 201); assert.equal(b.statusCode, 201); assert.equal(c.statusCode, 201)
    assert.equal(a.body.officeCategory, 'HEAD_OFFICE')
    l2Head = a.body.id; l2Prov = b.body.id; l3Prov = c.body.id
  })

  await test('Levels 1 and 4 reject a category', async () => {
    const one = await createDept(ycUser, { name: 'Executive', layerId: ycLayer[1], officeCategory: 'HEAD_OFFICE' })
    const four = await createDept(ycUser, { name: 'Doctors', layerId: ycLayer[4], officeCategory: 'PROVINCIAL' })
    assert.equal(one.statusCode, 400); assert.equal(four.statusCode, 400)
  })

  await test('Levels 1 and 4 are created untagged', async () => {
    const one = await createDept(ycUser, { name: 'Executive', layerId: ycLayer[1] })
    const four = await createDept(ycUser, { name: 'Doctors', layerId: ycLayer[4] })
    assert.equal(one.statusCode, 201); assert.equal(one.body.officeCategory, null)
    assert.equal(four.statusCode, 201); assert.equal(four.body.officeCategory, null)
    l1Dept = one.body.id; l4Doctors = four.body.id
  })

  await test('A company without the feature cannot use categories at all', async () => {
    const tagged = await createDept(ffUser, { name: 'Ops', layerId: ffLayer[2], officeCategory: 'HEAD_OFFICE' })
    assert.equal(tagged.statusCode, 400)
    assert.match(tagged.body.error, /not enabled/)
    const plain = await createDept(ffUser, { name: 'Ops', layerId: ffLayer[2] })
    assert.equal(plain.statusCode, 201)
    assert.equal(plain.body.officeCategory, null)
  })

  // =========================================================================
  section('Retagging a department')

  await test('A director can flip a department between categories, and it is audited', async () => {
    const res = mockRes()
    await ws.updateDepartment(mockReq({ params: { id: l2Prov }, body: { name: 'Provincial Planning', officeCategory: 'HEAD_OFFICE' }, user: ycUser }), res)
    assert.equal(res.statusCode, 200)
    assert.equal(res.body.officeCategory, 'HEAD_OFFICE')
    const log = await prisma.auditLog.findFirst({ where: { event: 'DEPARTMENT_RETAGGED' } })
    assert.ok(log, 'expected a DEPARTMENT_RETAGGED audit entry')
    // Put it back for the tests that follow.
    await ws.updateDepartment(mockReq({ params: { id: l2Prov }, body: { name: 'Provincial Planning', officeCategory: 'PROVINCIAL' }, user: ycUser }), mockRes())
  })

  await test('Renaming without mentioning the category keeps the existing tag', async () => {
    const res = mockRes()
    await ws.updateDepartment(mockReq({ params: { id: l2Prov }, body: { name: 'Provincial Planning Unit' }, user: ycUser }), res)
    assert.equal(res.statusCode, 200)
    assert.equal(res.body.officeCategory, 'PROVINCIAL')
  })

  // =========================================================================
  section('Mandatory reporting manager')

  let l1Person = '', l2HeadPerson = '', l2ProvPerson = '', l3Person = ''

  await test('A level 1 user is created without a manager', async () => {
    const res = await createPerson(ycUser, { name: 'Level One', phone: '0711000001', departmentId: l1Dept })
    assert.equal(res.statusCode, 201)
    assert.equal(res.body.supervisorId, null)
    l1Person = res.body.id
  })

  await test('A level 1 user cannot be given a manager', async () => {
    const res = await createPerson(ycUser, { name: 'Bad Level One', phone: '0711000002', departmentId: l1Dept, supervisorId: l1Person })
    assert.equal(res.statusCode, 400)
    assert.match(res.body.error, /report to the Director/)
  })

  await test('A level 2 user without a manager is rejected', async () => {
    const res = await createPerson(ycUser, { name: 'No Manager', phone: '0711000003', departmentId: l2Head })
    assert.equal(res.statusCode, 400)
    assert.match(res.body.error, /must report to a level 1 manager/)
  })

  await test('A level 2 user reporting to a level 1 manager is created', async () => {
    const a = await createPerson(ycUser, { name: 'HO Two', phone: '0711000004', departmentId: l2Head, supervisorId: l1Person })
    const b = await createPerson(ycUser, { name: 'Prov Two', phone: '0711000005', departmentId: l2Prov, supervisorId: l1Person })
    assert.equal(a.statusCode, 201); assert.equal(b.statusCode, 201)
    assert.equal(a.body.supervisorId, l1Person)
    l2HeadPerson = a.body.id; l2ProvPerson = b.body.id
  })

  await test('A manager two levels up is rejected', async () => {
    const res = await createPerson(ycUser, { name: 'Skip Level', phone: '0711000006', departmentId: l3Prov, supervisorId: l1Person })
    assert.equal(res.statusCode, 400)
    assert.match(res.body.error, /must report to a level 2 manager/)
  })

  await test('A Provincial level 3 user may report to a Head Office level 2 manager', async () => {
    const res = await createPerson(ycUser, { name: 'Cross Category', phone: '0711000007', departmentId: l3Prov, supervisorId: l2HeadPerson })
    assert.equal(res.statusCode, 201)
    l3Person = res.body.id
  })

  await test('A level 4 user must report to a level 3 manager', async () => {
    const bad = await createPerson(ycUser, { name: 'Doctor Bad', phone: '0711000008', departmentId: l4Doctors, supervisorId: l2ProvPerson })
    assert.equal(bad.statusCode, 400)
    const good = await createPerson(ycUser, { name: 'Doctor Good', phone: '0711000009', departmentId: l4Doctors, supervisorId: l3Person })
    assert.equal(good.statusCode, 201)
    assert.equal(good.body.supervisorId, l3Person)
  })

  await test('Level 4 users in one job-role department each report to their own level 3 manager', async () => {
    // A job-role department such as Doctors spans the whole company, so its
    // members answer to different level 3 officials. The manager is per person,
    // never per department.
    const secondL3 = await createPerson(ycUser, { name: 'Other Three', phone: '0711000020', departmentId: l3Prov, supervisorId: l2ProvPerson })
    assert.equal(secondL3.statusCode, 201)

    const a = await createPerson(ycUser, { name: 'Doctor A', phone: '0711000021', departmentId: l4Doctors, supervisorId: l3Person })
    const b = await createPerson(ycUser, { name: 'Doctor B', phone: '0711000022', departmentId: l4Doctors, supervisorId: secondL3.body.id })
    assert.equal(a.statusCode, 201)
    assert.equal(b.statusCode, 201)
    assert.equal(a.body.departmentId, b.body.departmentId)
    assert.notEqual(a.body.supervisorId, b.body.supervisorId)

    // And an existing member can be moved to a different level 3 official.
    const res = mockRes()
    await ws.updatePersonnel(mockReq({ params: { id: a.body.id }, body: { name: 'Doctor A', phone: '0711000021', supervisorId: secondL3.body.id }, user: ycUser }), res)
    assert.equal(res.statusCode, 200)
    assert.equal(res.body.supervisorId, secondL3.body.id)
  })

  await test('A company without the feature still creates users with no manager', async () => {
    const dept = await prisma.department.findFirst({ where: { workspaceId: ffWs.id } })
    const res = await createPerson(ffUser, { name: 'FF Staff', phone: '0713000001', departmentId: dept!.id })
    assert.equal(res.statusCode, 201)
    assert.equal(res.body.supervisorId, null)
  })

  // =========================================================================
  section('Existing users missing a manager are flagged, not forced')

  await test('An unrelated edit to a manager-less user still succeeds', async () => {
    const legacy = await prisma.personnel.create({
      data: { name: 'Legacy Two', phone: '0714000001', normalizedPhone: '94714000001', loginId: '0714000001', password: await hash('Pw@12345'), departmentId: l2Head, workspaceId: ycWs.id, companyId: ycCo.id },
    })
    const res = mockRes()
    await ws.updatePersonnel(mockReq({ params: { id: legacy.id }, body: { name: 'Legacy Two Renamed', phone: '0714000001' }, user: ycUser }), res)
    assert.equal(res.statusCode, 200)
    assert.equal(res.body.supervisorId, null)
  })

  await test('Explicitly clearing a manager on a managed level is rejected', async () => {
    const res = mockRes()
    await ws.updatePersonnel(mockReq({ params: { id: l3Person }, body: { name: 'Cross Category', phone: '0711000007', supervisorId: '' }, user: ycUser }), res)
    assert.equal(res.statusCode, 400)
    assert.match(res.body.error, /must report to a level 2 manager/)
  })

  // =========================================================================
  section('Moving between levels re-opens the reporting line')

  await test('A move that changes level is rejected while the old manager no longer fits', async () => {
    const res = mockRes()
    await ws.movePersonnel(mockReq({ params: { id: l3Person }, body: { departmentId: l2Prov }, user: ycUser }), res)
    assert.equal(res.statusCode, 400)
    assert.match(res.body.error, /must report to a level 1 manager/)
  })

  await test('The same move succeeds when a valid manager comes with it', async () => {
    const res = mockRes()
    await ws.movePersonnel(mockReq({ params: { id: l3Person }, body: { departmentId: l2Prov, supervisorId: l1Person }, user: ycUser }), res)
    assert.equal(res.statusCode, 200)
    assert.equal(res.body.supervisorId, l1Person)
    // Move back for later assertions.
    await ws.movePersonnel(mockReq({ params: { id: l3Person }, body: { departmentId: l3Prov, supervisorId: l2HeadPerson }, user: ycUser }), mockRes())
  })

  await test('A manager-less user can still be moved between Head Office and Provincial', async () => {
    // Changing someone's office category means moving them to a department in
    // the other category. That is a same-level move and must not be blocked by
    // the missing manager on a legacy account — those are flagged, not forced.
    const legacy = await prisma.personnel.create({
      data: { name: 'Legacy Uncategorised', phone: '0714000009', normalizedPhone: '94714000009', loginId: '0714000009', password: await hash('Pw@12345'), departmentId: l2Head, workspaceId: ycWs.id, companyId: ycCo.id },
    })
    const res = mockRes()
    await ws.movePersonnel(mockReq({ params: { id: legacy.id }, body: { departmentId: l2Prov }, user: ycUser }), res)
    assert.equal(res.statusCode, 200)
    assert.equal(res.body.departmentId, l2Prov)
    assert.equal(res.body.supervisorId, null)
  })

  await test('A move within the same level leaves the manager alone', async () => {
    const res = mockRes()
    await ws.movePersonnel(mockReq({ params: { id: l2ProvPerson }, body: { departmentId: l2Head }, user: ycUser }), res)
    assert.equal(res.statusCode, 200)
    assert.equal(res.body.supervisorId, l1Person)
  })

  // =========================================================================
  section('Manager candidates')

  await test('Candidates for a level come from exactly one level above', async () => {
    const res = mockRes()
    await ws.getManagerCandidates(mockReq({ query: { level: '4' }, user: ycUser }), res)
    assert.equal(res.statusCode, 200)
    assert.ok(res.body.length > 0, 'expected at least one level 3 candidate')
    // Every candidate sits at level 3 — never the caller's own level or higher.
    assert.equal(res.body.every((m: any) => m.department.layer.number === 3), true)
    assert.ok(res.body.some((m: any) => m.id === l3Person))
  })

  await test('Level 1 has no candidates — it reports to the Director', async () => {
    const res = mockRes()
    await ws.getManagerCandidates(mockReq({ query: { level: '1' }, user: ycUser }), res)
    assert.deepEqual(res.body, [])
  })

  await test('Candidates never cross into another company', async () => {
    const res = mockRes()
    await ws.getManagerCandidates(mockReq({ query: { level: '2' }, user: ffUser }), res)
    assert.equal(res.body.every((m: any) => m.id !== l1Person), true)
  })

  // =========================================================================
  section('Notice targeting by office category')

  await test('A category can only be attached to a level 2 or 3 notice', async () => {
    const bad = mockRes()
    await notices.createNotice(mockReq({ body: { message: 'Hi', audience: 'LAYER', layerNumber: 4, officeCategory: 'PROVINCIAL' }, user: ycUser }), bad)
    assert.equal(bad.statusCode, 400)
  })

  await test('Personnel see untargeted notices plus their own category', async () => {
    await notices.createNotice(mockReq({ body: { message: 'All of level 2', audience: 'LAYER', layerNumber: 2 }, user: ycUser }), mockRes())
    await notices.createNotice(mockReq({ body: { message: 'Provincial only', audience: 'LAYER', layerNumber: 2, officeCategory: 'PROVINCIAL' }, user: ycUser }), mockRes())

    const provincial = mockRes()
    await notices.getActiveNotices(mockReq({ user: { actorId: l2ProvPerson, actorType: 'personnel', workspaceId: ycWs.id, layerNumber: 2, departmentId: l2Prov } }), provincial)
    const provincialMessages = provincial.body.map((n: any) => n.message).sort()
    assert.deepEqual(provincialMessages, ['All of level 2', 'Provincial only'])

    const headOffice = mockRes()
    await notices.getActiveNotices(mockReq({ user: { actorId: l2HeadPerson, actorType: 'personnel', workspaceId: ycWs.id, layerNumber: 2, departmentId: l2Head } }), headOffice)
    assert.deepEqual(headOffice.body.map((n: any) => n.message), ['All of level 2'])
  })

  // =========================================================================
  section('System Administrator feature toggle')

  await test('The feature list reports every company against the catalog', async () => {
    const res = mockRes()
    await adminFeatures.listCompanyFeatures(mockReq({ user: ycUser }), res)
    assert.equal(res.statusCode, 200)
    assert.ok(res.body.catalog.some((f: any) => f.key === FEATURES.FOUR_LEVEL_HIERARCHY))
    const yc = res.body.companies.find((c: any) => c.prefix === 'YC')
    const ff = res.body.companies.find((c: any) => c.prefix === 'FF')
    assert.equal(yc.features[FEATURES.FOUR_LEVEL_HIERARCHY].enabled, true)
    assert.equal(ff.features[FEATURES.FOUR_LEVEL_HIERARCHY].enabled, false)
  })

  await test('An unknown feature key is rejected', async () => {
    const res = mockRes()
    await adminFeatures.setCompanyFeature(mockReq({ params: { companyId: ffCo.id, featureKey: 'teleportation' }, body: { enabled: true }, user: ycUser }), res)
    assert.equal(res.statusCode, 404)
  })

  await test('Granting a feature takes effect immediately and is audited', async () => {
    const res = mockRes()
    await adminFeatures.setCompanyFeature(mockReq({ params: { companyId: ffCo.id, featureKey: FEATURES.FOUR_LEVEL_HIERARCHY }, body: { enabled: true }, user: ycUser }), res)
    assert.equal(res.statusCode, 200)
    assert.equal(res.body.enabled, true)

    const dept = await createDept(ffUser, { name: 'Now Categorised', layerId: ffLayer[2], officeCategory: 'HEAD_OFFICE' })
    assert.equal(dept.statusCode, 201)

    const log = await prisma.auditLog.findFirst({ where: { event: 'COMPANY_FEATURE_ENABLED' } })
    assert.ok(log, 'expected a COMPANY_FEATURE_ENABLED audit entry')
  })

  await test('Revoking a feature restores the previous behaviour', async () => {
    const res = mockRes()
    await adminFeatures.setCompanyFeature(mockReq({ params: { companyId: ffCo.id, featureKey: FEATURES.FOUR_LEVEL_HIERARCHY }, body: { enabled: false }, user: ycUser }), res)
    assert.equal(res.statusCode, 200)
    const dept = await createDept(ffUser, { name: 'Categorised Again', layerId: ffLayer[2], officeCategory: 'HEAD_OFFICE' })
    assert.equal(dept.statusCode, 400)
  })

  await test('A non-boolean enabled value is rejected', async () => {
    const res = mockRes()
    await adminFeatures.setCompanyFeature(mockReq({ params: { companyId: ffCo.id, featureKey: FEATURES.FOUR_LEVEL_HIERARCHY }, body: { enabled: 'yes' }, user: ycUser }), res)
    assert.equal(res.statusCode, 400)
  })

  console.log(`\n${passed} passed, ${failed} failed`)
  await prisma.$disconnect()
  if (failed) { console.error('Failing tests: ' + failures.join(', ')); process.exit(1) }
}

main().catch(err => { console.error(err); process.exit(1) })
