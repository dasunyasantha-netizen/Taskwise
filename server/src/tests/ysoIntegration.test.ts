/** Runs only against a dedicated local database; no existing workspace is mutated. */
import 'dotenv/config'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import express from 'express'
import jwt from 'jsonwebtoken'
import { PrismaClient } from '@prisma/client'
import { localDate, addDays } from '../helpers/ysoRules'

const source = new URL(
  process.env.DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5432/taskwise_db'
)
if (!['localhost', '127.0.0.1', '[::1]'].includes(source.hostname))
  throw new Error('YSO integration tests require a local PostgreSQL server')
source.pathname = '/taskwise_yso_test'
process.env.DATABASE_URL = source.toString()
process.env.JWT_SECRET = 'isolated-yso-integration-test-secret'
// Certificate scans go to a (mocked) Google Drive connection
process.env.LETTER_ENCRYPTION_KEY = '11'.repeat(32)
process.env.LETTER_GOOGLE_CLIENT_ID = 'test-client'
process.env.LETTER_GOOGLE_CLIENT_SECRET = 'test-secret'
let passed = 0
async function main() {
  const adminUrl = new URL(source)
  adminUrl.pathname = '/postgres'
  const admin = new PrismaClient({
    datasources: { db: { url: adminUrl.toString() } },
  })
  try {
    await admin.$executeRawUnsafe('CREATE DATABASE taskwise_yso_test')
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
  const db = (await import('../prisma')).default
  const router = (await import('../routes/ysoRoutes')).default
  const app = express()
  app.use(express.json({ limit: '2mb' }))
  app.use('/api/yso', router)
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const address = server.address() as { port: number },
    base = `http://127.0.0.1:${address.port}/api/yso`
  const runId = Date.now().toString(),
    today = localDate(),
    old = addDays(today, -70)
  const workspace = await db.workspace.create({
    data: { name: 'YSO integration ' + runId },
  })
  const company = await db.company.create({
    data: {
      legalName: 'YSO test',
      registrationNumber: runId,
      prefix: 'Y' + runId,
      workspaceId: workspace.id,
    },
  })
  await db.workspace.update({
    where: { id: workspace.id },
    data: { companyId: company.id },
  })
  await db.companyFeature.create({
    data: {
      companyId: company.id,
      featureKey: 'four_level_hierarchy',
      enabled: true,
    },
  })
  const l3 = await db.layer.create({
    data: { workspaceId: workspace.id, number: 3, name: 'AD' },
  })
  const l4 = await db.layer.create({
    data: { workspaceId: workspace.id, number: 4, name: 'Officers' },
  })
  const adDept = await db.department.create({
    data: {
      workspaceId: workspace.id,
      layerId: l3.id,
      name: 'Colombo',
      officeCategory: 'PROVINCIAL',
    },
  })
  const ysoDept = await db.department.create({
    data: { workspaceId: workspace.id, layerId: l4.id, name: 'YSO' },
  })
  const doctorDept = await db.department.create({
    data: { workspaceId: workspace.id, layerId: l4.id, name: 'Doctors' },
  })
  const person = (name: string, dept: string, supervisorId?: string) =>
    db.personnel.create({
      data: {
        workspaceId: workspace.id,
        companyId: company.id,
        departmentId: dept,
        name,
        phone: `${runId}-${name}`,
        password: 'not-a-login-hash',
        supervisorId,
        createdAt: new Date(old + 'T00:00:00Z'),
      },
    })
  const ad = await person('AD', adDept.id),
    ad2 = await person('Other AD', adDept.id),
    yso = await person('YSO', ysoDept.id, ad.id),
    other = await person('Other YSO', ysoDept.id, ad2.id),
    doctor = await person('Doctor', doctorDept.id, ad.id)
  const director = await db.director.create({
    data: {
      name: 'Director',
      phone: runId,
      password: 'not-a-login-hash',
      workspaceId: workspace.id,
      companyId: company.id,
    },
  })
  const token = (id: string, type = 'personnel', ws = workspace.id) =>
    jwt.sign(
      { actorId: id, actorType: type, workspaceId: ws },
      process.env.JWT_SECRET!
    )
  const tokens = {
    yso: token(yso.id),
    ad: token(ad.id),
    ad2: token(ad2.id),
    director: token(director.id, 'director'),
    doctor: token(doctor.id),
    cross: token(ad.id, 'personnel', 'another-workspace'),
  }
  async function call(
    who: keyof typeof tokens,
    route: string,
    body?: unknown,
    expected = 200
  ) {
    const response = await fetch(base + route, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Authorization: `Bearer ${tokens[who]}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const data = await response.json()
    assert.equal(response.status, expected, `${route}: ${JSON.stringify(data)}`)
    return data as any
  }
  async function check(name: string, fn: () => Promise<void>) {
    await fn()
    passed++
    console.log(`✓ ${name}`)
  }
  const points = async (task: number) =>
    (
      await db.ysoScoreEntry.aggregate({
        where: { personnelId: yso.id, task },
        _sum: { points: true },
      })
    )._sum.points ?? 0
  const submit = (task: number, data: any, previousId?: string) =>
    call('yso', '/submissions', { task, data, previousId }, 201)
  const review = (id: string, action = 'APPROVE', feedback = '') =>
    call('ad', `/submissions/${id}/review`, { action, feedback })
  try {
    await check(
      'feature gate, role gate, director read-only and cross-workspace isolation',
      async () => {
        await call('doctor', '/dashboard', undefined, 403)
        // A token for another workspace is refused by the session check before YSO scoping
        await call('cross', '/dashboard', undefined, 401)
        await call(
          'director',
          `/people/${yso.id}/activate`,
          { startDate: old },
          403
        )
        await call('ad2', `/people/${yso.id}/activate`, { startDate: old }, 403)
        await call('yso', '/submissions', { task: 1, data: {} }, 409)
        await call('ad', `/people/${yso.id}/activate`, { startDate: old })
        await call('ad2', `/people/${other.id}/activate`, { startDate: old })
        await db.companyFeature.updateMany({
          where: { companyId: company.id },
          data: { enabled: false },
        })
        await call('yso', '/dashboard', undefined, 403)
        await db.companyFeature.updateMany({
          where: { companyId: company.id },
          data: { enabled: true },
        })
      }
    )
    await check(
      'YSOs require a Provincial AD and cannot choose their own approver',
      async () => {
        const { resolveSupervisor } = await import('../helpers/hierarchy')
        const { updatePersonnel } = await import(
          '../controllers/workspaceController'
        )
        const headDept = await db.department.create({
          data: {
            workspaceId: workspace.id,
            layerId: l3.id,
            name: 'Head Office',
            officeCategory: 'HEAD_OFFICE',
          },
        })
        const head = await person('Head Officer', headDept.id)
        const result = await resolveSupervisor({
          fourLevel: true,
          workspaceId: workspace.id,
          level: 4,
          departmentName: 'YSO',
          provided: head.id,
          isCreate: true,
        })
        assert.ok('error' in result)
        const response: any = {
          statusCode: 200,
          status(code: number) {
            this.statusCode = code
            return this
          },
          json(body: unknown) {
            this.body = body
            return this
          },
        }
        await updatePersonnel(
          {
            user: {
              actorId: yso.id,
              actorType: 'personnel',
              workspaceId: workspace.id,
            },
            params: { id: yso.id },
            body: { supervisorId: ad2.id },
          } as any,
          response
        )
        assert.equal(response.statusCode, 403)
        await db.personnel.update({
          where: { id: doctor.id },
          data: { supervisorId: head.id },
        })
        response.statusCode = 200
        await updatePersonnel(
          {
            user: {
              actorId: director.id,
              actorType: 'director',
              workspaceId: workspace.id,
            },
            params: { id: doctor.id },
            body: { departmentId: ysoDept.id },
          } as any,
          response
        )
        assert.equal(response.statusCode, 400)
      }
    )
    let registration: any
    await check(
      'submission records four-state history and zero points before approval',
      async () => {
        registration = await submit(1, {
          date: today,
          reference: 'N1',
          members: 10,
          online: true,
        })
        assert.equal(registration.status, 'PENDING')
        assert.equal(await points(1), 0)
        const events = await db.ysoAuditEvent.findMany({
          where: { personnelId: yso.id },
          orderBy: { createdAt: 'asc' },
        })
        assert.ok(events.some((e) => e.event === 'SUBMITTED'))
        assert.ok(events.some((e) => e.event === 'PENDING'))
        await call(
          'ad2',
          `/submissions/${registration.id}/review`,
          { action: 'APPROVE' },
          403
        )
        await call(
          'director',
          `/submissions/${registration.id}/review`,
          { action: 'APPROVE' },
          403
        )
      }
    )
    await check(
      'concurrent approvals award once and retain original timestamp',
      async () => {
        const responses = await Promise.all(
          [1, 2].map(() =>
            fetch(base + `/submissions/${registration.id}/review`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${tokens.ad}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ action: 'APPROVE' }),
            })
          )
        )
        assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409])
        assert.equal(await points(1), 10)
        const saved = await db.ysoSubmission.findUniqueOrThrow({
          where: { id: registration.id },
        })
        assert.equal(saved.submittedAt.toISOString(), registration.submittedAt)
      }
    )
    await check(
      'duplicate business keys rejected; approved correction replaces rather than adds',
      async () => {
        await call(
          'yso',
          '/submissions',
          {
            task: 1,
            data: { date: today, reference: 'n1', members: 10, online: true },
          },
          409
        )
        const corrected = await submit(
          1,
          { date: today, reference: 'N1', members: 7, online: true },
          registration.id
        )
        assert.equal(await points(1), 10)
        await review(corrected.id)
        assert.equal(await points(1), 7)
        registration = corrected
      }
    )
    await check(
      'revocation records a reversal and requires a reason',
      async () => {
        await call(
          'ad',
          `/submissions/${registration.id}/review`,
          { action: 'REVOKE' },
          400
        )
        await review(registration.id, 'REVOKE', 'Incorrect member count')
        assert.equal(await points(1), 0)
        const retried = await submit(
          1,
          { date: today, reference: 'N1', members: 7, online: false },
          registration.id
        )
        await review(retried.id)
        assert.equal(await points(1), 0)
      }
    )
    await check(
      'monthly sponsorship aggregation and six-meeting cap work through approval API',
      async () => {
        for (let i = 0; i < 2; i++) {
          const e = await submit(5, {
            date: today,
            reference: 'F' + i,
            amount: 500,
            sponsor: 'Sponsor',
            credited: true,
          })
          await review(e.id)
        }
        assert.equal(await points(5), 1)
        for (let i = 0; i < 6; i++) {
          const e = await submit(7, {
            date: today,
            reference: 'M' + i,
            location: 'Office',
            attendees: 10,
          })
          await review(e.id)
        }
        assert.equal(await points(7), 5)
      }
    )
    await check('distinct same-day programs each count', async () => {
      for (const reference of ['Program A', 'Program B']) {
        const e = await submit(11, {
          date: today,
          reference,
          program: reference,
        })
        await review(e.id)
      }
      assert.equal(await points(11), 2)
      await call(
        'yso',
        '/submissions',
        {
          task: 11,
          data: {
            date: today,
            program: ' program  a ',
            reference: 'different-reference',
          },
        },
        409
      )
    })
    await check(
      'AD schedules a meeting, YSO marks attendance, cancellation reverses credit',
      async () => {
        const meeting = await call(
          'ad',
          '/meetings',
          {
            title: 'Officer meeting',
            date: today,
            location: 'District office',
            invitees: [yso.id],
          },
          201
        )
        await call(
          'ad',
          '/meetings',
          {
            title: 'Bad invite',
            date: today,
            location: 'Office',
            invitees: [other.id],
          },
          400
        )
        const e = await submit(2, {
          meetingId: meeting.id,
          attendance: 'ATTENDED',
        })
        await review(e.id)
        assert.equal(await points(2), 1)
        await call('ad', `/meetings/${meeting.id}/cancel`, {
          reason: 'Recorded in error',
        })
        assert.equal(await points(2), 0)
      }
    )
    await check(
      'weekly penalties require AD decision; exemptions reverse confirmed deduction',
      async () => {
        const dashboard = await call('ad', '/dashboard'),
          obligation = dashboard.obligations.find((o: any) => o.task === 9)
        assert.ok(obligation)
        await call('ad', `/people/${yso.id}/penalty`, {
          key: obligation.key,
          outcome: 'DEDUCT',
          reason: 'Verified missed reporting weeks',
        })
        assert.equal(await points(9), -5)
        await call('ad', `/people/${yso.id}/penalty`, {
          key: obligation.key,
          outcome: 'EXEMPT',
          reason: 'Approved leave',
        })
        assert.equal(await points(9), 0)
      }
    )
    await check(
      'two-stage advance accepts settlement only after advance approval',
      async () => {
        const e = await submit(10, {
          phase: 'ADVANCE',
          date: today,
          dueDate: today,
          reference: 'ADV-1',
        })
        await call(
          'yso',
          '/submissions',
          {
            task: 10,
            data: {
              phase: 'SETTLEMENT',
              advanceId: e.id,
              settlementDate: today,
            },
          },
          400
        )
        await review(e.id)
        const settlement = await submit(10, {
          phase: 'SETTLEMENT',
          advanceId: e.id,
          settlementDate: today,
        })
        await review(settlement.id)
        assert.equal(await points(10), 2)
        await call(
          'ad',
          `/submissions/${e.id}/review`,
          { action: 'REVOKE', feedback: 'Cannot revoke linked advance' },
          409
        )
      }
    )
    await check(
      'certificate scans go to Google Drive only, with access checks and rollback',
      async () => {
        const { OAuth2Client } = await import('google-auth-library')
        const { encrypt } = await import('../helpers/letters')
        const originalToken = OAuth2Client.prototype.getAccessToken,
          originalFetch = global.fetch
        const data = {
          date: today,
          qualification: 'Diploma',
          institution: 'Institute',
          hours: 1200,
        }
        const pdf = Buffer.from('%PDF-1.4\n%%EOF')
        const scan = { name: 'certificate.pdf', base64: pdf.toString('base64') }
        // Drive not connected: rejected before anything is created
        const before = await db.ysoSubmission.count({ where: { workspaceId: workspace.id } })
        await call('yso', '/submissions', { task: 12, data, attachment: scan }, 409)
        assert.equal(await db.ysoSubmission.count({ where: { workspaceId: workspace.id } }), before)
        await db.letterSettings.upsert({
          where: { workspaceId: workspace.id },
          create: { workspaceId: workspace.id, connected: true, folderId: 'letters-folder-0001', encryptedRefreshToken: encrypt('test-refresh') },
          update: { connected: true, folderId: 'letters-folder-0001', encryptedRefreshToken: encrypt('test-refresh') },
        })
        const drive = { uploads: 0, folders: 0, deleted: [] as string[], parents: [] as string[] }
        OAuth2Client.prototype.getAccessToken = (async () => ({ token: 'mock-token' })) as any
        global.fetch = (async (input: any, init: any = {}) => {
          const url = String(input)
          if (!url.startsWith('https://www.googleapis.com/')) return originalFetch(input, init)
          if (url.includes('uploadType=multipart')) {
            drive.uploads++
            const body = Buffer.from(init.body).toString('latin1')
            assert.ok(body.includes('%PDF-1.4'))
            drive.parents.push(JSON.parse(body.split('\r\n\r\n')[1].split('\r\n')[0]).parents[0])
            return new Response(JSON.stringify({ id: 'drive-cert-' + drive.uploads }), { status: 200 })
          }
          if (init.method === 'DELETE') {
            drive.deleted.push(url.split('/files/')[1].split('?')[0])
            return new Response(null, { status: 204 })
          }
          if (init.method === 'POST' && url.includes('/drive/v3/files?')) {
            drive.folders++
            return new Response(JSON.stringify({ id: 'yso-cert-folder' }), { status: 200 })
          }
          if (url.includes('alt=media'))
            return new Response(pdf, { status: 200 })
          if (url.includes('/files/yso-cert-folder'))
            return new Response(JSON.stringify({ id: 'yso-cert-folder', trashed: false }), { status: 200 })
          return new Response('{}', { status: 404 })
        }) as any
        try {
          await call(
            'yso',
            '/submissions',
            {
              task: 12,
              data,
              attachment: {
                name: 'bad.pdf',
                base64: Buffer.from('<html>bad</html>').toString('base64'),
              },
            },
            400
          )
          assert.equal(drive.uploads, 0)
          const e = await call('yso', '/submissions', { task: 12, data, attachment: scan }, 201)
          assert.equal(drive.uploads, 1)
          assert.equal(drive.folders, 1)
          assert.deepEqual(drive.parents, ['yso-cert-folder'])
          assert.equal(
            (await db.letterSettings.findUniqueOrThrow({ where: { workspaceId: workspace.id } })).ysoFolderId,
            'yso-cert-folder'
          )
          await review(e.id)
          assert.equal(await points(12), 15)
          const file = await db.ysoAttachment.findUniqueOrThrow({
            where: { submissionId: e.id },
          })
          assert.equal(file.driveFileId, 'drive-cert-1')
          assert.equal(file.size, pdf.length)
          assert.ok(!('bytes' in file), 'certificate bytes must not be stored')
          const download = await fetch(base + `/certificates/${file.id}`, {
            headers: { Authorization: `Bearer ${tokens.ad}` },
          })
          assert.equal(download.status, 200)
          assert.deepEqual(Buffer.from(await download.arrayBuffer()), pdf)
          await call('ad2', `/certificates/${file.id}`, undefined, 404)
          // Repeat lifetime award is refused and its freshly uploaded scan removed again
          await call('yso', '/submissions', { task: 12, data, attachment: scan }, 409)
          assert.deepEqual(drive.deleted, ['drive-cert-2'])
          await call('yso', '/submissions', { task: 12, data }, 409)
        } finally {
          global.fetch = originalFetch
          OAuth2Client.prototype.getAccessToken = originalToken
        }
      }
    )
    await check(
      'Task 15 enforces criterion caps and revisions replace monthly assessment',
      async () => {
        const period = today.slice(0, 7),
          scores = {
            volunteer: 10,
            district: 5,
            financial: 3,
            relations: 4,
            files: 3,
          }
        await call(
          'ad',
          `/people/${yso.id}/assessment`,
          { period, scores: { ...scores, volunteer: 11 }, rationale: 'Test' },
          400
        )
        await call('ad', `/people/${yso.id}/assessment`, {
          period,
          scores,
          rationale: 'All criteria verified',
        })
        assert.equal(await points(15), 25)
        await call('ad', `/people/${yso.id}/assessment`, {
          period,
          scores: { ...scores, volunteer: 8 },
          rationale: 'Revised volunteer evidence',
        })
        assert.equal(await points(15), 23)
      }
    )
    await check(
      'read-only Director dashboard and AD dashboards expose no other team or password',
      async () => {
        const adView = await call('ad', '/dashboard')
        assert.equal(adView.people.length, 1)
        assert.equal(adView.people[0].id, yso.id)
        const directorView = await call('director', '/dashboard')
        assert.equal(directorView.people.length, 2)
        assert.equal(
          JSON.stringify(directorView).includes('not-a-login-hash'),
          false
        )
      }
    )
    await check(
      'supervisor transfer routes existing pending work to new AD with original audit intact',
      async () => {
        const e = await submit(1, {
          date: today,
          reference: 'TRANSFER',
          members: 1,
          online: true,
        })
        await db.personnel.update({
          where: { id: yso.id },
          data: { supervisorId: ad2.id },
        })
        await call(
          'ad',
          `/submissions/${e.id}/review`,
          { action: 'APPROVE' },
          403
        )
        await call('ad2', `/submissions/${e.id}/review`, { action: 'APPROVE' })
        assert.equal(
          (await db.ysoSubmission.findUniqueOrThrow({ where: { id: e.id } }))
            .assignedAdId,
          ad.id
        )
        assert.ok(
          (
            await db.ysoScoreEntry.findMany({
              where: { personnelId: yso.id, task: 1 },
            })
          ).every((row) => row.adId === ad.id)
        )
      }
    )
    console.log(`\n${passed} YSO integration scenarios passed.`)
  } finally {
    server.close()
    await db.$disconnect()
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
