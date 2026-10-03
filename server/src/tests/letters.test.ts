import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID, randomBytes } from 'crypto'
import { execFileSync } from 'child_process'
import path from 'path'
import express from 'express'
import jwt from 'jsonwebtoken'
import sharp from 'sharp'
import { PrismaClient } from '@prisma/client'
import { today, days, encrypt, decrypt } from '../helpers/letters'

const url = new URL(process.env.DATABASE_URL!)
assert.ok(
  ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname),
  'Letter tests require local PostgreSQL'
)
url.pathname = '/taskwise_letters_test'
process.env.DATABASE_URL = url.toString()
process.env.JWT_SECRET = 'local-letter-test-secret'
process.env.LETTER_ENCRYPTION_KEY = randomBytes(32).toString('hex')
function pdfFixture() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 400] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  const stream = 'BT /F1 20 Tf 30 300 Td (Letter preview test) Tj ET'
  objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
  let data = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(data))
    data += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = Buffer.byteLength(data)
  data += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => String(n).padStart(10, '0') + ' 00000 n ')
    .join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return Buffer.from(data)
}
async function main() {
  const adminUrl = new URL(url)
  adminUrl.pathname = '/postgres'
  const admin = new PrismaClient({
    datasources: { db: { url: adminUrl.toString() } },
  })
  try {
    await admin.$executeRawUnsafe('CREATE DATABASE taskwise_letters_test')
  } catch (e: any) {
    if (!String(e.message).includes('already exists')) throw e
  } finally {
    await admin.$disconnect()
  }
  execFileSync(
    process.execPath,
    [
      path.resolve(__dirname, '../../node_modules/prisma/build/index.js'),
      'migrate',
      'deploy',
    ],
    { cwd: path.resolve(__dirname, '../..'), env: process.env, stdio: 'pipe' }
  )
  const db = (await import('../prisma')).default,
    router = (await import('../routes/letterRoutes')).default,
    authRouter = (await import('../routes/authRoutes')).default
  const app = express()
  app.use('/api/auth', express.json(), authRouter)
  app.use('/api/letters', router)
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>((r) => server.once('listening', r))
  const base = `http://127.0.0.1:${(server.address() as any).port}/api/letters`,
    run = Date.now().toString()
  const ws = await db.workspace.create({
      data: { name: 'Letter tests ' + run },
    }),
    otherWS = await db.workspace.create({
      data: { name: 'Other letter workspace ' + run },
    })
  const layer = await db.layer.create({
      data: { workspaceId: ws.id, number: 1, name: 'Staff' },
    }),
    dept = await db.department.create({
      data: { workspaceId: ws.id, layerId: layer.id, name: 'Office' },
    })
  const createPerson = (name: string) =>
    db.personnel.create({
      data: {
        workspaceId: ws.id,
        departmentId: dept.id,
        name,
        phone: run + name,
        password: 'not-a-login-hash',
      },
    })
  const logger = await createPerson('Logger'),
    assignee = await createPerson('Assignee'),
    other = await createPerson('Other'),
    secondLogger = await createPerson('Second Logger')
  const director = await db.director.create({
    data: {
      workspaceId: ws.id,
      name: 'Director',
      phone: run,
      password: 'not-a-login-hash',
    },
  })
  const foreign = await db.director.create({
    data: {
      workspaceId: otherWS.id,
      name: 'Foreign Director',
      phone: run + 'x',
      password: 'not-a-login-hash',
    },
  })
  const tokens = {
    logger: jwt.sign(
      { actorId: logger.id, actorType: 'personnel', workspaceId: ws.id },
      process.env.JWT_SECRET!
    ),
    assignee: jwt.sign(
      { actorId: assignee.id, actorType: 'personnel', workspaceId: ws.id },
      process.env.JWT_SECRET!
    ),
    other: jwt.sign(
      { actorId: other.id, actorType: 'personnel', workspaceId: ws.id },
      process.env.JWT_SECRET!
    ),
    second: jwt.sign(
      { actorId: secondLogger.id, actorType: 'personnel', workspaceId: ws.id },
      process.env.JWT_SECRET!
    ),
    director: jwt.sign(
      { actorId: director.id, actorType: 'director', workspaceId: ws.id },
      process.env.JWT_SECRET!
    ),
    foreign: jwt.sign(
      { actorId: foreign.id, actorType: 'director', workspaceId: otherWS.id },
      process.env.JWT_SECRET!
    ),
  }
  async function call(
    who: keyof typeof tokens,
    route: string,
    body?: any,
    expected = 200,
    method = body === undefined ? 'GET' : 'POST'
  ) {
    const r = await fetch(base + route, {
        method,
        headers: {
          Authorization: 'Bearer ' + tokens[who],
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      data = (await r.json()) as any
    assert.equal(r.status, expected, `${who} ${route}: ${JSON.stringify(data)}`)
    return data
  }
  let passed = 0
  const check = async (name: string, fn: () => Promise<void>) => {
    await fn()
    passed++
    console.log('✓ ' + name)
  }
  const yesterday = new Date(Date.now() - 3 * 86400000)
    .toISOString()
    .slice(0, 10)
  const png = await sharp({
      create: { width: 1600, height: 1000, channels: 3, background: '#e9eef5' },
    })
      .png()
      .toBuffer(),
    file = { name: 'incoming.png', base64: png.toString('base64') }
  const incoming = (extra: any = {}) => ({
    requestId: randomUUID(),
    sender: 'External Council',
    subject: 'Community hall request',
    receivedDate: yesterday,
    channel: 'PHYSICAL',
    notes: 'Action required',
    files: [file],
    ...extra,
  })
  let id = '',
    reference = ''
  const get = (who: keyof typeof tokens = 'logger') => call(who, '/' + id)
  const event = async (
    who: keyof typeof tokens,
    kind: string,
    extra: any = {},
    expected = 201
  ) => {
    const t = await get(who)
    return call(
      who,
      '/' + id + '/events',
      {
        requestId: randomUUID(),
        version: t.version,
        kind,
        notes: 'Test event',
        files: [],
        ...extra,
      },
      expected
    )
  }
  try {
    await check(
      'documents are refused and never stored while Drive is disconnected',
      async () => {
        await db.letterSettings.upsert({
          where: { workspaceId: ws.id },
          create: { workspaceId: ws.id, connected: false },
          update: { connected: false },
        })
        const before = await db.letterAttachment.count()
        const r = await call('director', '/', incoming(), 409)
        assert.match(r.error, /contact your administrator/i)
        assert.equal(await db.letterAttachment.count(), before)
        await call('director', '/', incoming({ files: [] }), 201)
        await db.letterSettings.update({
          where: { workspaceId: ws.id },
          data: { connected: true },
        })
      }
    )
    await check('profile language is validated, scoped, and returned in later sessions', async () => {
      const auth = async (who: keyof typeof tokens, route: string, method = 'GET', language?: string) => {
        const response = await fetch(base.replace('/letters', '/auth') + route, {
          method,
          headers: { Authorization: 'Bearer ' + tokens[who], 'Content-Type': 'application/json' },
          body: language === undefined ? undefined : JSON.stringify({ language }),
        })
        return { status: response.status, body: await response.json() as any }
      }
      assert.equal((await auth('director', '/me')).body.preferredLanguage, 'en')
      assert.equal((await auth('director', '/language', 'PUT', 'fr')).status, 400)
      assert.equal((await auth('director', '/language', 'PUT', 'si')).body.preferredLanguage, 'si')
      assert.equal((await auth('director', '/me')).body.preferredLanguage, 'si')
      assert.equal((await auth('logger', '/me')).body.preferredLanguage, 'en')
      assert.equal((await auth('logger', '/language', 'PUT', 'si')).status, 200)
      assert.equal((await auth('logger', '/me')).body.preferredLanguage, 'si')
      assert.equal((await auth('director', '/language', 'PUT', 'en')).status, 200)
      assert.equal((await auth('director', '/me')).body.preferredLanguage, 'en')
    })
    await check(
      'only Director can grant Logger permission; ordinary staff cannot log',
      async () => {
        await call('logger', '/', incoming(), 403)
        await call(
          'logger',
          '/loggers/' + logger.id,
          { enabled: true },
          403,
          'PUT'
        )
        await call(
          'director',
          '/loggers/' + logger.id,
          { enabled: true },
          200,
          'PUT'
        )
        await call(
          'director',
          '/loggers/' + secondLogger.id,
          { enabled: true },
          200,
          'PUT'
        )
        await call(
          'foreign',
          '/loggers/' + logger.id,
          { enabled: true },
          404,
          'PUT'
        )
      }
    )
    await check(
      'one reference, default owner, received date and immutable server timestamp',
      async () => {
        const body = incoming(),
          r = await call('logger', '/', body, 201)
        id = r.id
        reference = r.reference
        const t = await get()
        assert.match(reference, /^TW-LTR-20\d\d-\d{6}$/)
        assert.equal(t.assignedTo, 'personnel:' + logger.id)
        assert.equal(t.events.length, 1)
        assert.equal(t.firstReceivedDate, yesterday)
        assert.equal(t.entryDelayDays, days(yesterday, today()))
        assert.equal((await call('logger', '/', body, 201)).id, id)
        await call('logger', '/', { ...body, subject: 'Changed' }, 409)
        assert.equal((await get()).events.length, 1)
      }
    )
    await check(
      'logger can assign a new letter to someone else on entry',
      async () => {
        const r = await call(
          'logger',
          '/',
          incoming({ subject: 'Assigned on entry', personKey: 'personnel:' + assignee.id }),
          201
        )
        const t = await call('assignee', '/' + r.id)
        assert.equal(t.assignedTo, 'personnel:' + assignee.id)
        assert.equal(t.createdBy, 'personnel:' + logger.id)
        assert.ok(
          await db.notification.findFirst({
            where: { recipientPersonnelId: assignee.id, payload: { path: ['threadId'], equals: r.id } },
          })
        )
        await call('logger', '/', incoming({ personKey: 'personnel:not-real' }), 400)
      }
    )
    await check(
      'concurrent registrations receive distinct references',
      async () => {
        const rows = await Promise.all(
          Array.from({ length: 5 }, (_, i) =>
            call(
              'director',
              '/',
              incoming({ subject: 'Concurrency ' + i, files: [] }),
              201
            )
          )
        )
        assert.equal(new Set(rows.map((r) => r.reference)).size, 5)
      }
    )
    await check(
      'private threads and files stay within workspace and viewing permissions',
      async () => {
        await call('other', '/' + id, undefined, 404)
        await call('foreign', '/' + id, undefined, 404)
        assert.equal((await call('other', '/')).total, 0)
        const t = await get(),
          f = t.events[0].attachments[0]
        const response = await fetch(`${base}/files/${f.id}/original`, {
          headers: { Authorization: 'Bearer ' + tokens.other },
        })
        assert.equal(response.status, 404)
        assert.equal((await get('second')).id, id)
        assert.ok(!JSON.stringify(t).includes('base64'))
        assert.ok(!JSON.stringify(t).includes('original":'))
      }
    )
    await check(
      'handover preserves a chronological chain and grants the new assignee access',
      async () => {
        await event('logger', 'TRANSFER', {
          personKey: 'personnel:' + assignee.id,
        })
        const t = await get('assignee')
        assert.equal(t.assignedTo, 'personnel:' + assignee.id)
        assert.equal(t.events[1].fromAssigneeName, 'Logger')
        assert.equal(t.events[1].toAssigneeName, 'Assignee')
        assert.ok(t.events[1].previousAssignedAt)
        await event(
          'second',
          'TRANSFER',
          { personKey: 'personnel:' + other.id },
          403
        )
        await event(
          'assignee',
          'TRANSFER',
          { personKey: 'director:' + foreign.id },
          400
        )
        await call('assignee', '/', incoming(), 403)
      }
    )
    await check(
      'assignee can transfer directly; stale concurrent changes are rejected',
      async () => {
        const t = await get('assignee'),
          body = {
            kind: 'TRANSFER',
            personKey: 'personnel:' + other.id,
            notes: 'Handover',
            files: [],
            version: t.version,
            requestId: randomUUID(),
          }
        await call('assignee', '/' + id + '/events', body, 201)
        await call('assignee', '/' + id + '/events', body, 201)
        await call(
          'assignee',
          '/' + id + '/events',
          {
            ...body,
            requestId: randomUUID(),
            personKey: 'personnel:' + logger.id,
          },
          409
        )
        assert.equal((await get('other')).assignedTo, 'personnel:' + other.id)
      }
    )
    await check(
      'outgoing reply requires evidence and closes the original reference',
      async () => {
        await event('other', 'OUTGOING', { correspondenceDate: today() }, 400)
        await event('other', 'OUTGOING', {
          correspondenceDate: today(),
          files: [file],
        })
        const t = await get('other')
        assert.equal(t.status, 'CLOSED')
        assert.equal(t.reference, reference)
        assert.ok(t.closedAt)
        assert.equal(t.assigneeAgeDays, 0)
        await event(
          'other',
          'TRANSFER',
          { personKey: 'personnel:' + assignee.id },
          409
        )
      }
    )
    await check(
      'only Director or original enterer can receive a reply and reopen',
      async () => {
        await event('other', 'INCOMING', { receivedDate: today() }, 403)
        await event('second', 'INCOMING', { receivedDate: today() }, 403)
        await call(
          'director',
          '/loggers/' + logger.id,
          { enabled: false },
          200,
          'PUT'
        )
        await call('logger', '/', incoming(), 403)
        await event('logger', 'INCOMING', {
          receivedDate: today(),
          files: [file],
        })
        const t = await get()
        assert.equal(t.status, 'OPEN')
        assert.equal(t.reference, reference)
        assert.equal(t.assignedTo, 'personnel:' + other.id)
        assert.equal(t.closedAt, null)
      }
    )
    await check(
      'invalid dates, reversed chronology and spoofed file types are rejected',
      async () => {
        await event('logger', 'INCOMING', { receivedDate: '2026-02-30' }, 400)
        await event('logger', 'INCOMING', { receivedDate: yesterday }, 400)
        await event(
          'other',
          'OUTGOING',
          { correspondenceDate: yesterday, files: [file] },
          400
        )
        await event(
          'other',
          'NOTE',
          {
            files: [
              {
                name: 'bad.pdf',
                base64: Buffer.from('<script>alert(1)</script>').toString(
                  'base64'
                ),
              },
            ],
          },
          400
        )
      }
    )
    await check(
      'Director settings encrypt secrets and never serialize them to staff',
      async () => {
        await call('logger', '/settings', undefined, 403)
        const r = await call(
          'director',
          '/settings',
          {
            folderId: 'test_folder_123456789',
            clientId: 'test.apps.googleusercontent.com',
            clientSecret: 'test-oauth-secret',
            entryDelayDays: 2,
            assigneeDays: 7,
          },
          200,
          'PUT'
        )
        assert.equal(r.hasClientSecret, true)
        assert.ok(!JSON.stringify(r).includes('test-oauth-secret'))
        const config = await db.letterSettings.findUniqueOrThrow({
          where: { workspaceId: ws.id },
        })
        assert.notEqual(config.encryptedSecret, 'test-oauth-secret')
        assert.equal(decrypt(config.encryptedSecret!), 'test-oauth-secret')
        assert.equal(decrypt(encrypt('roundtrip')), 'roundtrip')
        await call('assignee', '/drive/connect', {}, 403)
        const connection = await call('director', '/drive/connect', {})
        assert.ok(connection.url.startsWith('https://accounts.google.com/'))
        assert.equal(
          new URL(connection.url).searchParams.get('access_type'),
          'offline'
        )
        const invalid = await fetch(
          base + '/drive/callback?state=not-valid&code=fake'
        )
        assert.equal(invalid.status, 400)
      }
    )
    await check(
      'deactivated users cannot read or change letters with an old token',
      async () => {
        await db.personnel.update({
          where: { id: assignee.id },
          data: { isActive: false },
        })
        // The session check refuses deactivated roles before the letters routes run
        await call('assignee', '/' + id, undefined, 401)
        await call('assignee', '/context', undefined, 401)
        await db.personnel.update({
          where: { id: assignee.id },
          data: { isActive: true },
        })
      }
    )
    await check(
      'Director metrics expose entry delays and assignee bottlenecks',
      async () => {
        await db.letterThread.update({
          where: { id },
          data: { assignedAt: new Date(Date.now() - 10 * 86400000) },
        })
        const r = await call('director', '/')
        assert.ok(r.metrics.overdue >= 1)
        assert.ok(r.metrics.lateEntries >= 1)
        assert.ok(
          r.metrics.holders.some(
            (h: any) => h.name === 'Other' && h.maxDays >= 10
          )
        )
      }
    )
    await check(
      'actual background image and PDF renderers produce lightweight previews',
      async () => {
        const { renderLetterPreview } = await import('../helpers/letterWorker')
        const image = await renderLetterPreview(png, 'image/png')
        assert.equal(image.pageCount, 1)
        assert.equal(
          (await sharp(Buffer.from(image.pages[0], 'base64')).metadata())
            .format,
          'webp'
        )
        const pdf = await renderLetterPreview(pdfFixture(), 'application/pdf')
        assert.equal(pdf.pageCount, 1)
        assert.ok(pdf.pages[0].length > 100)
        await assert.rejects(() =>
          renderLetterPreview(
            Buffer.from('%PDF-1.4 invalid'),
            'application/pdf'
          )
        )
      }
    )
    await check(
      'preview queue survives unavailable Drive; originals remain downloadable',
      async () => {
        const { processLetterJob } = await import('../helpers/letterWorker')
        for (let n = 0; n < 40; n++) {
          if (!(await processLetterJob('preview'))) break
        }
        for (let n = 0; n < 40; n++) {
          if (!(await processLetterJob('upload'))) break
        }
        const t = await get(),
          f = t.events[0].attachments[0]
        assert.equal(f.previewState, 'READY')
        assert.equal(f.uploadState, 'BLOCKED')
        assert.equal(f.previews.length, 1)
        const r = await fetch(`${base}/files/${f.id}/1`, {
          headers: { Authorization: 'Bearer ' + tokens.logger },
        })
        assert.equal(r.status, 200)
        assert.match(r.headers.get('content-type') || '', /image\/webp/)
        const original = await fetch(`${base}/files/${f.id}/original`, {
          headers: { Authorization: 'Bearer ' + tokens.logger },
        })
        assert.equal(original.status, 200)
        assert.ok(Buffer.from(await original.arrayBuffer()).equals(png))
      }
    )
    await check(
      'threads have gap-free event sequence and assignment notifications',
      async () => {
        const t = await get()
        assert.deepEqual(
          t.events.map((e: any) => e.sequence),
          Array.from({ length: t.version }, (_, i) => i + 1)
        )
        assert.equal(
          t.events.filter((e: any) => e.kind === 'OUTGOING').length,
          1
        )
        assert.ok(
          (await db.notification.count({
            where: { workspaceId: ws.id, type: 'letter_update' },
          })) >= 3
        )
      }
    )
    await check(
      'Drive retry reuses its reserved file ID after a lost upload response',
      async () => {
        const { OAuth2Client } = await import('google-auth-library')
        const originalToken = OAuth2Client.prototype.getAccessToken,
          originalFetch = global.fetch
        const { processLetterJob } = await import('../helpers/letterWorker')
        const f = (await get()).events[0].attachments[0]
        await db.letterSettings.update({
          where: { workspaceId: ws.id },
          data: {
            connected: true,
            encryptedRefreshToken: encrypt('test-refresh'),
          },
        })
        await db.letterAttachment.update({
          where: { id: f.id },
          data: {
            uploadState: 'PENDING',
            uploadNextAt: new Date(),
            uploadAttempts: 0,
          },
        })
        let reserved = 0,
          uploads = 0
        const stored = await db.letterAttachment.findUniqueOrThrow({
          where: { id: f.id },
        })
        OAuth2Client.prototype.getAccessToken = (async () => ({
          token: 'mock-token',
        })) as any
        global.fetch = (async (input: any, init: any) => {
          const endpoint = String(input)
          if (!endpoint.startsWith('https://www.googleapis.com/'))
            return originalFetch(input, init)
          if (endpoint.includes('generateIds')) {
            reserved++
            return new Response(
              JSON.stringify({ ids: ['reserved-test-' + f.id] }),
              { status: 200 }
            )
          }
          if (endpoint.includes('uploadType=multipart')) {
            uploads++
            const body = Buffer.from(init.body).toString()
            assert.ok(body.includes('reserved-test-' + f.id))
            assert.ok(body.includes(stored.sha256))
            assert.ok(!body.includes('"permissions"'))
            if (uploads === 1)
              throw new Error(
                'Simulated lost response after Drive accepted file'
              )
            return new Response('{}', { status: 409 })
          }
          return new Response(
            JSON.stringify({
              id: 'reserved-test-' + f.id,
              size: String(stored.size),
              appProperties: {
                taskwiseAttachmentId: f.id,
                sha256: stored.sha256,
              },
            }),
            { status: 200 }
          )
        }) as any
        try {
          await processLetterJob('upload')
          const retry = await db.letterAttachment.findUniqueOrThrow({
            where: { id: f.id },
          })
          assert.equal(retry.uploadState, 'PENDING')
          assert.ok(retry.driveFileId)
          await db.letterAttachment.update({
            where: { id: f.id },
            data: { uploadNextAt: new Date(0) },
          })
          await processLetterJob('upload')
          assert.equal(
            (
              await db.letterAttachment.findUniqueOrThrow({
                where: { id: f.id },
              })
            ).uploadState,
            'READY'
          )
          assert.equal(reserved, 1)
          assert.equal(uploads, 2)
        } finally {
          global.fetch = originalFetch
          OAuth2Client.prototype.getAccessToken = originalToken
          await db.letterSettings.update({
            where: { workspaceId: ws.id },
            data: { connected: false, encryptedRefreshToken: null },
          })
        }
      }
    )
    console.log(`\n${passed} letter integration scenarios passed.`)
  } finally {
    server.close()
    await db.$disconnect()
  }
}
main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
