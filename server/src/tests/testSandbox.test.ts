import 'dotenv/config'
import assert from 'node:assert/strict'
import { Prisma } from '@prisma/client'
import prisma from '../prisma'
import { TEST_WORKSPACE, TEST_ACCOUNTS, testActorId, nextTestReset, samplePdf } from '../helpers/testSandbox'
import { downloadCertificate, uploadCertificate } from '../helpers/ysoDrive'

const base = 'http://localhost:4300/api'
async function api(path: string, token?: string, body?: unknown, method = body ? 'POST' : 'GET') {
  const res = await fetch(base + path, { method, headers: {
    'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }, body: body ? JSON.stringify(body) : undefined })
  const payload: any = await res.json()
  return { status: res.status, payload }
}
async function login(id: string) {
  const result = await api('/auth/login', undefined, { phone: id, password: 'test@123' })
  assert.equal(result.status, 200, JSON.stringify(result.payload))
  assert.equal(result.payload.user.workspaceId, TEST_WORKSPACE)
  return result.payload
}
async function realCounts() {
  const result: Record<string, number> = {}
  for (const model of Prisma.dmmf.datamodel.models.filter(m => m.fields.some(f => f.name === 'workspaceId' && f.kind === 'scalar'))) {
    const key = model.name[0].toLowerCase() + model.name.slice(1)
    result[key] = await (prisma as any)[key].count({ where: { workspaceId: { not: TEST_WORKSPACE } } })
  }
  return result
}
async function main() {
  const before = await realCounts()
  let feedbackId: string | undefined
  const chairman = await login('TESTCHAIRMAN')
  try {
    for (const [id] of TEST_ACCOUNTS) {
      const user = await login(id)
      assert.equal((await api('/auth/me', user.token)).status, 200)
      assert.equal((await api('/auth/migration-contact', user.token)).payload.required, false)
    }
    assert.equal((await login('testad')).user.ysoRole, 'AD')
    const yso = await login('TESTYSO'), ad = await login('TESTAD')
    assert.equal(yso.user.ysoRole, 'YSO')
    assert.equal((await api('/test-sandbox/reset', yso.token, {})).status, 403)
    assert.equal((await api('/test-sandbox/feedback', yso.token)).status, 403)
    assert.equal((await api('/letters/drive/connect', chairman.token, {})).status, 403)
    assert.equal((await api('/workspace/profile', yso.token, { name: 'Changed', phone: '0771111111' }, 'PUT')).status, 403)
    assert.equal((await api('/workspace/managed-users/' + testActorId('TESTYSO') + '/reset-password', chairman.token, {})).status, 403)
    assert.equal((await api('/auth/role-contacts/personnel/' + testActorId('TESTYSO'), chairman.token, {}, 'PUT')).status, 403)
    for (const actor of [chairman, yso, ad]) {
      const result = await api('/yso/dashboard', actor.token)
      assert.equal(result.status, 200, JSON.stringify(result.payload))
    }
    const pending = await prisma.ysoSubmission.findFirstOrThrow({ where: { workspaceId: TEST_WORKSPACE, personnelId: testActorId('TESTYSO'), status: 'PENDING' } })
    const review = await api(`/yso/submissions/${pending.id}/review`, ad.token, { action: 'APPROVE' })
    assert.equal(review.status, 200, JSON.stringify(review.payload))
    const document = samplePdf('Certificate upload verification')
    const file = await uploadCertificate(TEST_WORKSPACE, { bytes: document, name: 'test.pdf', mime: 'application/pdf' },
      { person: 'Test YSO', task: 'Qualification', date: '2026-10-04' })
    assert.deepEqual(await downloadCertificate(TEST_WORKSPACE, file), document)
    const feedback = await api('/test-sandbox/feedback', yso.token, {
      screen: 'Automated verification', expected: 'Retained after reset', actual: 'Feedback submitted', suggestion: 'Verification entry',
    })
    assert.equal(feedback.status, 201)
    feedbackId = feedback.payload.id
    const sample = await prisma.task.findFirstOrThrow({ where: { workspaceId: TEST_WORKSPACE } })
    await prisma.task.update({ where: { id: sample.id }, data: { title: 'Tester changed this sample', deletedAt: new Date() } })
    await prisma.task.create({ data: { workspaceId: TEST_WORKSPACE, projectId: sample.projectId, title: 'Temporary tester task', parentTaskId: sample.id } })
    assert.equal((await api('/test-sandbox/reset', chairman.token, {})).status, 200)
    assert.equal(await prisma.task.count({ where: { workspaceId: TEST_WORKSPACE } }), 70)
    assert.equal(await prisma.task.count({ where: { workspaceId: TEST_WORKSPACE, title: 'Temporary tester task' } }), 0)
    assert.equal(await prisma.testSandboxFile.count({ where: { workspaceId: TEST_WORKSPACE } }), 4)
    assert.ok(await prisma.testFeedback.findUnique({ where: { id: feedbackId } }))
    assert.equal(await prisma.letterAttachment.count({ where: { event: { workspaceId: TEST_WORKSPACE } } }), 3)
    assert.equal((await api('/test-sandbox/feedback', chairman.token)).payload.some((r: any) => r.id === feedbackId), true)
    // Simulate a missed midnight reset; login must recover before accepting work.
    await prisma.testSandbox.update({ where: { workspaceId: TEST_WORKSPACE }, data: { lastResetAt: new Date(Date.now() - 86400000) } })
    await login('TESTYSO')
    assert.equal(await prisma.task.count({ where: { workspaceId: TEST_WORKSPACE } }), 70)
    assert.ok(await prisma.testFeedback.findUnique({ where: { id: feedbackId } }))
    assert.deepEqual(await realCounts(), before, 'Real company row counts must remain unchanged')
    assert.equal(nextTestReset(new Date('2026-10-04T18:29:59Z')).toISOString(), '2026-10-04T18:30:00.000Z')
    assert.equal(nextTestReset(new Date('2026-10-04T18:30:00Z')).toISOString(), '2026-10-05T18:30:00.000Z')
    console.log('Passed: 10 logins, role scope, YSO approval, local documents, feedback retention, reset restoration, missed-reset recovery, and real-company isolation.')
  } finally {
    if (feedbackId) await prisma.testFeedback.deleteMany({ where: { id: feedbackId, workspaceId: TEST_WORKSPACE } })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => prisma.$disconnect())
