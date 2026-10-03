/** Real WebAuthn signatures and controllers, isolated local PostgreSQL only. */
import 'dotenv/config'
import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto'
import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import jwt from 'jsonwebtoken'
import { isoCBOR } from '@simplewebauthn/server/helpers'

const original = new URL(process.env.DATABASE_URL!)
if (!['localhost', '127.0.0.1'].includes(original.hostname)) throw new Error('Support tests require local PostgreSQL')
const adminUrl = new URL(original); adminUrl.pathname = '/postgres'
const testUrl = new URL(original); testUrl.pathname = '/taskwise_support_test'
process.env.DATABASE_URL = testUrl.toString()
process.env.JWT_SECRET = 'isolated-support-tests-only'
process.env.WEBAUTHN_RP_ID = 'localhost'
process.env.WEBAUTHN_ORIGIN = 'http://localhost:3517'
process.env.PORT = '4317'
delete process.env.SYSWISE_BASE_URL
delete process.env.SYSWISE_TASKWISE_SERVICE_KEY
const res = () => { const r: any = { statusCode: 200 }; r.status = (c: number) => { r.statusCode = c; return r }; r.json = (b: any) => { r.body = b; return r }; r.on = () => r; return r }
const req = (body: any = {}, user?: any) => ({ body, user, headers: {}, socket: { remoteAddress: '127.0.0.1' }, method: 'GET' } as any)

async function main() {
  const { PrismaClient } = await import('@prisma/client')
  const adminDb = new PrismaClient({ datasources: { db: { url: adminUrl.toString() } } })
  try { await adminDb.$executeRawUnsafe('CREATE DATABASE "taskwise_support_test"') } catch (e: any) { if (!String(e.message).includes('already exists')) throw e }
  await adminDb.$disconnect()
  execSync('npx prisma migrate deploy', { cwd: path.resolve(__dirname, '../..'), env: process.env, stdio: 'ignore' })
  const db = (await import('../prisma')).default
  const verification = await import('../controllers/supportVerificationController')
  const auth = await import('../controllers/authController')
  const webauthn = await import('../controllers/webAuthnController')
  const middleware = await import('../middleware/authMiddleware')
  await db.$executeRawUnsafe('TRUNCATE TABLE "MigrationRoleContact","WebAuthnCredential","Personnel","Director","Company","Workspace" RESTART IDENTITY CASCADE')
  const workspace = await db.workspace.create({ data: { name: 'Support company', companyName: 'Support company' } })
  const adminWorkspace = await db.workspace.create({ data: { name: 'Platform support' } })
  const admin = await db.director.create({ data: { name: 'Support administrator', phone: '0771111111', password: 'unused-fixture-hash', isSyswiseAdmin: true, workspaceId: adminWorkspace.id } })
  const target = await db.director.create({ data: { name: 'Chairman', phone: '07101', loginId: '07101', password: 'unused-fixture-hash', workspaceId: workspace.id } })
  const layer = await db.layer.create({ data: { name: 'Management', number: 2, workspaceId: workspace.id } })
  const department = await db.department.create({ data: { name: 'Provincial Director', layerId: layer.id, workspaceId: workspace.id } })
  const personnel = await db.personnel.create({ data: { name: 'Chairman', phone: '07106', loginId: '07106', password: 'unused-fixture-hash', departmentId: department.id, workspaceId: workspace.id } })
  for (const [actorType, actorId, workspaceId, uid, phoneE164] of [
    ['director', admin.id, adminWorkspace.id, 1000, '+94771111111'],
    ['director', target.id, workspace.id, 1001, '+94772222222'],
    ['personnel', personnel.id, workspace.id, 1002, '+94773333333'],
  ] as const) await db.migrationRoleContact.create({ data: { actorType, actorId, workspaceId, syswiseUserId: uid, country: 'LK', phoneE164 } })
  const who = { actorId: admin.id, actorType: 'director' as const, workspaceId: adminWorkspace.id, authenticationMethod: 'syswise', syswiseUserId: 1000, assignmentVersion: 1 }
  const adminToken = jwt.sign(who, process.env.JWT_SECRET!, { expiresIn: '1h' })
  const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const jwk = keys.publicKey.export({ format: 'jwk' })
  const publicKey = isoCBOR.encode(new Map<number, number | Uint8Array>([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x!, 'base64url')], [-3, Buffer.from(jwk.y!, 'base64url')]]))
  const credentialId = randomBytes(32).toString('base64url')
  await db.webAuthnCredential.create({ data: { actorId: admin.id, actorType: 'director', credentialId, publicKey: Buffer.from(publicKey).toString('base64url'), counter: BigInt(0), deviceType: 'singleDevice', backedUp: false } })
  if (process.argv.includes('--serve')) {
    const cacheDir = path.resolve(__dirname, '../../../.cache'); mkdirSync(cacheDir, { recursive: true })
    writeFileSync(path.join(cacheDir, 'support-fixture.json'), JSON.stringify({
      adminToken, adminUser: { ...who, name: admin.name, phone: '+94771111111', isSyswiseAdmin: true, features: [] },
      credentialId: Buffer.from(credentialId, 'base64url').toString('base64'),
      privateKey: keys.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
    }))
    await import('../index'); console.log('Isolated support fixture ready'); return
  }
  let counter = 0, passed = 0
  const test = async (name: string, fn: () => Promise<void>) => { await fn(); console.log('PASS ' + name); passed++ }
  const assertion = (challenge: string, options: { origin?: string; uv?: boolean; id?: string } = {}) => {
    const clientData = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin: options.origin || process.env.WEBAUTHN_ORIGIN }))
    const authenticatorData = Buffer.alloc(37); createHash('sha256').update('localhost').digest().copy(authenticatorData)
    authenticatorData[32] = options.uv === false ? 1 : 5; authenticatorData.writeUInt32BE(++counter, 33)
    const signature = sign('sha256', Buffer.concat([authenticatorData, createHash('sha256').update(clientData).digest()]), keys.privateKey)
    return { id: options.id || credentialId, rawId: credentialId, type: 'public-key', clientExtensionResults: {}, response: {
      clientDataJSON: clientData.toString('base64url'), authenticatorData: authenticatorData.toString('base64url'), signature: signature.toString('base64url'),
    } }
  }
  const options = async () => { const r = res(); await verification.supportVerificationOptions(req({}, who), r); assert.equal(r.statusCode, 200); return r.body }
  const authorize = async (token: string) => { const r = res(); let allowed = false; const request = req(); request.headers.authorization = 'Bearer ' + token; await middleware.authenticateToken(request, r, () => { allowed = true }); return { allowed, r, request } }
  const proof = async () => { const o = await options(); const r = res(); await verification.supportVerificationVerify(req({ response: assertion(o.challenge) }, who), r); assert.equal(r.statusCode, 200); return r.body.stepUpToken }
  const start = async (token?: string, actorType = 'director', actorId = target.id) => { const r = res(); await auth.startImpersonation(req({ targetActorId: actorId, targetActorType: actorType, reason: 'Investigating approved support ticket', stepUpToken: token }, who), r); return r }
  await test('migrated admin remains authenticated but legacy passkey login is blocked', async () => {
    assert.equal((await authorize(adminToken)).allowed, true)
    const r = res(); await webauthn.authenticationOptions(req({ phone: admin.phone }), r); assert.equal(r.statusCode, 401)
  })
  await test('directory lists fixed roles with assigned contacts rather than legacy phone codes', async () => {
    const r = res(); await auth.listImpersonationTargets(req({}, who), r)
    assert.equal(r.body.length, 2); assert.ok(r.body.every((t: any) => t.role === 'Chairman'))
    assert.equal(r.body.find((t: any) => t.actorType === 'personnel').assignedPhone, '+94773333333')
  })
  await test('support options use the signed-in migrated administrator passkey', async () => { const o = await options(); assert.equal(o.allowCredentials[0].id, credentialId); assert.equal(o.userVerification, 'required') })
  await test('missing proof is a forbidden step-up, not an expired login', async () => { assert.equal((await start()).statusCode, 403); assert.equal((await authorize(adminToken)).allowed, true) })
  await test('normal passkey login JWT cannot be used as a support proof', async () => { const token = jwt.sign({ ...who, authenticationMethod: 'webauthn' }, process.env.JWT_SECRET!); assert.equal((await start(token)).statusCode, 403) })
  for (const [name, flags] of [['wrong origin', { origin: 'https://attacker.example' }], ['missing biometric or screen-lock verification', { uv: false }], ['different actor credential', { id: 'wrong-credential' }]] as const) {
    await test('rejects ' + name + ' without expiring the admin login', async () => {
      const o = await options(), r = res(); await verification.supportVerificationVerify(req({ response: assertion(o.challenge, flags) }, who), r)
      assert.equal(r.statusCode, 403); assert.equal((await authorize(adminToken)).allowed, true)
    })
  }
  await test('expired support challenge is rejected', async () => {
    const o = await options(); await db.director.update({ where: { id: admin.id }, data: { webAuthnChallenge: 'support-challenge:' + JSON.stringify({ challenge: o.challenge, expiresAt: Date.now() - 1 }) } })
    const r = res(); await verification.supportVerificationVerify(req({ response: assertion(o.challenge) }, who), r); assert.equal(r.statusCode, 403)
  })
  await test('valid real WebAuthn assertion yields a purpose-bound proof, never a login token', async () => {
    const token = await proof(); assert.equal((await authorize(token)).allowed, false)
    const r = await start(token); assert.equal(r.statusCode, 200); assert.equal(r.body.user.name, 'Chairman')
    assert.ok(r.body.user.impersonation); assert.equal((await authorize(r.body.token)).allowed, true)
    assert.equal((await start(token)).statusCode, 403)
    assert.equal(await db.auditLog.count({ where: { event: 'IMPERSONATION_STARTED' } }), 1)
  })
  await test('verified migrated personnel role opens without password change or login', async () => {
    const r = await start(await proof(), 'personnel', personnel.id)
    assert.equal(r.statusCode, 200); assert.equal(r.body.user.mustChangePassword, false); assert.equal((await authorize(r.body.token)).allowed, true)
    const me = res(); await auth.getMe(req({}, jwt.verify(r.body.token, process.env.JWT_SECRET!)), me); assert.equal(me.body.actorId, personnel.id)
    const sessions = await db.impersonationSession.findMany({ orderBy: { startedAt: 'asc' } }); assert.equal(sessions[0].endReason, 'superseded')
    await db.impersonationSession.update({ where: { id: sessions[1].id }, data: { expiresAt: new Date(Date.now() - 1) } })
    assert.equal((await authorize(r.body.token)).allowed, false)
  })
  await test('support access cannot invoke system administrator routes', async () => {
    let allowed = false; const r = res(); await middleware.requireSyswiseAdmin(req({}, { ...who, impersonationSessionId: 'support-fixture' }), r, () => { allowed = true }); assert.equal(allowed, false); assert.equal(r.statusCode, 403)
  })
  await test('replayed assertion cannot issue another proof', async () => {
    const o = await options(), response = assertion(o.challenge), a = res(), b = res()
    await verification.supportVerificationVerify(req({ response }, who), a); assert.equal(a.statusCode, 200)
    await verification.supportVerificationVerify(req({ response }, who), b); assert.equal(b.statusCode, 403)
  })
  await test('expired or mismatched administrator proof cannot start support', async () => {
    for (const token of [jwt.sign({ purpose: verification.SUPPORT_PURPOSE, adminId: admin.id, proofId: 'x' }, process.env.JWT_SECRET!, { expiresIn: -1 }), jwt.sign({ purpose: verification.SUPPORT_PURPOSE, adminId: target.id, proofId: 'x' }, process.env.JWT_SECRET!)]) assert.equal((await start(token)).statusCode, 403)
  })
  await test('disabled target cannot be opened with a valid proof', async () => {
    const token = await proof(); await db.director.update({ where: { id: target.id }, data: { isActive: false } })
    assert.equal((await start(token)).statusCode, 404)
  })
  await db.$disconnect(); console.log(`${passed} support access checks passed`)
}
main().catch(error => { console.error(error); process.exit(1) })
