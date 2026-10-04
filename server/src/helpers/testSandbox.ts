import { Prisma } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { createHash } from 'crypto'
import prisma from '../prisma'
import { localDate, addDays, entryKey, projectScores, RULE_VERSION } from './ysoRules'

export const TEST_WORKSPACE = 'taskwise-company-testing-v1'
const COMPANY = 'taskwise-test-company-v1'
export const TEST_ACCOUNTS = [
  ['TESTDIRECTOR', 'Director', 1, null, null],
  ['TESTDD', 'Deputy Director', 2, 'HEAD_OFFICE', 'TESTDIRECTOR'],
  ['TESTPD', 'Provincial Director', 2, 'PROVINCIAL', 'TESTDIRECTOR'],
  ['TESTADHO', 'Assistant Director - Head Office', 3, 'HEAD_OFFICE', 'TESTDD'],
  ['TESTAD', 'Assistant Director - Provincial', 3, 'PROVINCIAL', 'TESTPD'],
  ['TESTYSO', 'Youth Services Officer', 4, null, 'TESTAD'],
  ['TESTYSO2', 'Youth Services Officer 2', 4, null, 'TESTAD'],
  ['TESTLOGGER', 'Letter Logger', 1, null, null],
  ['TESTASSIGNER', 'Letter Assigner', 1, null, null],
] as const
export const testActorId = (login: string) => `taskwise-test-${login.toLowerCase()}`
export function nextTestReset(at = new Date()) {
  return new Date(Date.parse(addDays(localDate(at), 1) + 'T00:00:00+05:30'))
}

// Delete only rows owned by this sandbox, including children without workspaceId.
async function clearSamples(db: Prisma.TransactionClient) {
  const workspaceId = TEST_WORKSPACE
  const task = { workspaceId }
  const thread = { workspaceId }
  await db.letterPreview.deleteMany({ where: { attachment: { event: { workspaceId } } } })
  await db.letterAttachment.deleteMany({ where: { event: { workspaceId } } })
  await db.letterAccess.deleteMany({ where: { thread } })
  await db.letterEvent.deleteMany({ where: { workspaceId } })
  await db.letterThread.deleteMany({ where: { workspaceId } })
  await db.taskCancellationPenaltyRecipient.deleteMany({ where: { review: { workspaceId } } })
  await db.taskCancellationReview.deleteMany({ where: { workspaceId } })
  await db.taskAssignment.deleteMany({ where: { task } })
  await db.taskComment.deleteMany({ where: { task } })
  await db.taskGroupMember.deleteMany({ where: { group: { workspaceId } } })
  await db.taskGroupProject.deleteMany({ where: { group: { workspaceId } } })
  await db.ysoAttachment.deleteMany({ where: { submission: { workspaceId } } })
  await db.testSandboxFile.deleteMany({ where: { workspaceId } })
  const models = ['notification', 'auditLog', 'taskProgressLog', 'deadlineExtension',
    'taskChain', 'scoringRuleVersion', 'ysoSubmission', 'ysoAssessment',
    'ysoPenaltyDecision', 'ysoScoreEntry', 'ysoAuditEvent', 'ysoMeeting',
    'ysoCalendarEntry', 'ysoProfile', 'loginLog', 'pushSubscription',
    'impersonationSession', 'migrationRoleContact', 'letterOAuthState',
    'letterSettings', 'letterCounter'] as const
  for (const model of models) await (db[model] as any).deleteMany({ where: { workspaceId } })
  await db.noticeDismissal.deleteMany({ where: { notice: { workspaceId } } })
  await db.notice.deleteMany({ where: { workspaceId } })
  await db.task.updateMany({ where: { workspaceId }, data: { parentTaskId: null, groupTaskId: null } })
  await db.task.deleteMany({ where: { workspaceId } })
  await db.project.deleteMany({ where: { workspaceId } })
  await db.projectCategory.deleteMany({ where: { workspaceId } })
  await db.taskGroup.deleteMany({ where: { workspaceId } })
  await db.insurancePolicy.updateMany({ where: { workspaceId }, data: { renewedFromId: null } })
  await db.insurancePolicy.deleteMany({ where: { workspaceId } })
  await db.insuranceQuotation.updateMany({ where: { workspaceId }, data: { renewedFromId: null } })
  await db.insuranceQuotation.deleteMany({ where: { workspaceId } })
  const actors = await db.personnel.findMany({ where: { workspaceId }, select: { id: true } })
  const directors = await db.director.findMany({ where: { workspaceId }, select: { id: true } })
  await db.webAuthnCredential.deleteMany({ where: { actorId: { in: [...actors, ...directors].map(a => a.id) } } })
  await db.workspaceRole.deleteMany({ where: { workspaceId } })
  await db.personnel.updateMany({ where: { workspaceId }, data: { supervisorId: null } })
  await db.personnel.deleteMany({ where: { workspaceId } })
  await db.director.deleteMany({ where: { workspaceId } })
  await db.department.deleteMany({ where: { workspaceId } })
  await db.layer.deleteMany({ where: { workspaceId } })
}

async function seedSamples(db: Prisma.TransactionClient, password: string) {
  const workspaceId = TEST_WORKSPACE
  const date = localDate(), period = date.slice(0, 7)
  await db.workspace.upsert({ where: { id: workspaceId }, create: {
    id: workspaceId, name: 'Taskwise Test Company', companyName: 'TEST COMPANY',
  }, update: { name: 'Taskwise Test Company', companyName: 'TEST COMPANY', companyLogo: null, roleBasedIdentity: false } })
  await db.company.upsert({ where: { id: COMPANY }, create: {
    id: COMPANY, legalName: 'Taskwise Test Company', displayName: 'TEST COMPANY',
    registrationNumber: 'TASKWISE-SANDBOX-V1', prefix: 'TEST', allowUnprefixedLogin: true,
    workspaceId,
  }, update: { status: 'ACTIVE', allowUnprefixedLogin: true, workspaceId } })
  await db.workspace.upsert({ where: { id: workspaceId }, create: {
    id: workspaceId, name: 'Taskwise Test Company', companyName: 'TEST COMPANY', companyId: COMPANY,
  }, update: { companyName: 'TEST COMPANY', roleBasedIdentity: false, companyId: COMPANY } })
  await db.companyFeature.deleteMany({ where: { companyId: COMPANY } })
  await db.companyFeature.create({ data: { companyId: COMPANY, featureKey: 'four_level_hierarchy' } })
  const chairmanId = testActorId('TESTCHAIRMAN')
  await db.director.create({ data: { id: chairmanId, workspaceId, companyId: COMPANY,
    name: 'Test Chairman', phone: '', loginId: 'TESTCHAIRMAN', password,
    isChairman: true, isCompanyAdmin: true } })
  for (const [number, name] of [[1, 'Directors'], [2, 'Deputy / Provincial Directors'],
    [3, 'Assistant Directors'], [4, 'Job Roles']] as const)
    await db.layer.create({ data: { id: `${workspaceId}-layer-${number}`, workspaceId, number, name } })
  for (const [login, name, level, officeCategory, supervisor] of TEST_ACCOUNTS) {
    const departmentId = login.startsWith('TESTYSO') ? `${workspaceId}-YSO` : `${workspaceId}-${login}`
    await db.department.upsert({ where: { id: departmentId }, create: {
      id: departmentId, workspaceId, layerId: `${workspaceId}-layer-${level}`,
      name: login.startsWith('TESTYSO') ? 'YSO' : name, officeCategory,
    }, update: {} })
    await db.personnel.create({ data: { id: testActorId(login), workspaceId, companyId: COMPANY,
      departmentId, name: `Test ${name}`, phone: '', loginId: login, password,
      supervisorId: supervisor ? testActorId(supervisor) : null,
      isLetterLogger: login === 'TESTLOGGER', isLetterAssigner: login === 'TESTASSIGNER' } })
  }
  const category = await db.projectCategory.create({ data: { workspaceId, directorId: chairmanId,
    name: 'Youth Programmes', description: 'Fictional sample projects', color: '#159570' } })
  for (const [index, name] of ['Youth Leadership Workshop', 'Community Sports Programme'].entries()) {
    const project = await db.project.create({ data: { workspaceId, directorId: chairmanId,
      categoryId: category.id, name, description: 'Sample programme for company role testing' } })
    for (const [login, , , , supervisor] of TEST_ACCOUNTS.filter(a => !a[0].includes('LOGGER') && !a[0].includes('ASSIGNER'))) {
      for (const [i, status] of ['ASSIGNED', 'IN_PROGRESS', 'SUBMITTED', 'RETURNED', 'APPROVED'].entries()) {
        const deadline = new Date(Date.now() + (i === 1 ? -2 : i + 1) * 86400000)
        const task = await db.task.create({ data: { workspaceId, projectId: project.id,
          title: `${['Prepare activity plan', 'Confirm venue arrangements', 'Review participant list',
            'Revise programme budget', 'Submit completion report'][i]} - ${login}`,
          description: `Sample ${name.toLowerCase()} task. Coordinate attendance, resources and approvals.`,
          status, priority: i === 1 ? 'HIGH' : 'MEDIUM', deadline, originalDeadline: deadline,
          createdByDirectorId: chairmanId,
          approvalById: supervisor ? testActorId(supervisor) : chairmanId,
          approvalByType: supervisor ? 'personnel' : 'director',
          actedById: status === 'ASSIGNED' ? null : testActorId(login),
          actedByType: status === 'ASSIGNED' ? null : 'personnel',
          startedAt: status === 'ASSIGNED' ? null : new Date(),
          returnReason: status === 'RETURNED' ? 'Please include transport costs and the revised participant count.' : null,
          returnedAt: status === 'RETURNED' ? new Date() : null,
        } })
        await db.taskAssignment.create({ data: { taskId: task.id, personnelId: testActorId(login) } })
        await db.taskComment.create({ data: { taskId: task.id, authorDirectorId: chairmanId,
          authorType: 'director', content: 'Please coordinate with the programme team and update progress.' } })
        if (i === 1) await db.taskProgressLog.create({ data: { taskId: task.id, workspaceId,
          authorPersonnelId: testActorId(login), authorType: 'personnel', note: 'Venue confirmed; awaiting the final participant list.' } })
        await db.auditLog.create({ data: { workspaceId, taskId: task.id, event: 'TASK_CREATED',
          actorDirectorId: chairmanId, actorType: 'director', payload: { sample: true, project: index } } })
        if (status === 'ASSIGNED') await db.notification.create({ data: { workspaceId,
          recipientPersonnelId: testActorId(login), recipientType: 'personnel', taskId: task.id,
          type: 'task_assigned', title: 'New sample task', message: task.title } })
      }
    }
  }
  for (const login of ['TESTYSO', 'TESTYSO2']) {
    const personnelId = testActorId(login), adId = testActorId('TESTAD')
    await db.ysoProfile.create({ data: { workspaceId, personnelId, startDate: period + '-01' } })
    await db.ysoCalendarEntry.create({ data: { workspaceId, personnelId, date,
      title: 'Youth club coordination visit', startTime: '09:00', endTime: '11:00', notes: 'Sample field visit' } })
    for (const [i, status] of ['PENDING', 'APPROVED', 'REJECTED'].entries()) {
      const reference = `SAMPLE-${login}-${i + 1}`
      await db.ysoSubmission.create({ data: { workspaceId, personnelId, assignedAdId: adId,
        task: 5, period, businessKey: entryKey(5, { reference }), status,
        data: { date, reference, amount: (i + 1) * 5000, sponsor: 'Sample Community Foundation', credited: true },
        queuedAt: new Date(), reviewedById: i ? adId : null, reviewedAt: i ? new Date() : null,
        feedback: status === 'REJECTED' ? 'Confirm the credited amount before resubmitting.' : null } })
    }
    for (const task of [12, 13]) {
      const bytes = samplePdf(task === 12 ? 'Sample youth development diploma' : 'Sample community development degree')
      const stored = await db.testSandboxFile.create({ data: { workspaceId, bytes } })
      await db.ysoSubmission.create({ data: { workspaceId, personnelId, assignedAdId: adId,
        task, period, businessKey: String(task), status: task === 12 ? 'APPROVED' : 'PENDING',
        data: { qualification: task === 12 ? 'Youth Development Diploma' : 'Community Development Degree',
          institution: 'Sample Training Institute', date, ...(task === 12 ? { hours: 1200 } : {}) },
        queuedAt: new Date(), reviewedById: task === 12 ? adId : null,
        reviewedAt: task === 12 ? new Date() : null,
        attachment: { create: { name: 'sample-certificate.pdf', mime: 'application/pdf',
          size: bytes.length, driveFileId: stored.id } },
      } })
    }
    await db.ysoAssessment.create({ data: { workspaceId, personnelId, adId, period,
      scores: { volunteer: 8, district: 4, financial: 2, relations: 3, files: 3 },
      rationale: 'Sample evaluation for testing' } })
  }
  await db.ysoMeeting.create({ data: { workspaceId, adId: testActorId('TESTAD'),
    title: 'Monthly programme review', date, location: 'Sample District Office',
    invitees: ['TESTYSO', 'TESTYSO2'].map(testActorId) } })
  for (const login of ['TESTYSO', 'TESTYSO2']) {
    const personnelId = testActorId(login)
    const result = projectScores({ personnelId, startDate: period + '-01', today: date,
      entries: await db.ysoSubmission.findMany({ where: { workspaceId, personnelId } }),
      meetings: await db.ysoMeeting.findMany({ where: { workspaceId } }), decisions: [],
      assessments: await db.ysoAssessment.findMany({ where: { workspaceId, personnelId } }),
    })
    for (const [key, points] of Object.entries(result.totals)) {
      const [entryPeriod, task] = key.split('/')
      if (points) await db.ysoScoreEntry.create({ data: { workspaceId, personnelId,
        adId: testActorId('TESTAD'), period: entryPeriod, task: Number(task), points,
        reason: 'Approved sample records', ruleVersion: RULE_VERSION } })
    }
  }
  for (const [i, subject] of ['Request for youth workshop support', 'Community sports venue approval', 'Programme expenditure clarification'].entries()) {
    const assignedTo = `personnel:${testActorId(i === 1 ? 'TESTDD' : 'TESTAD')}`
    const thread = await db.letterThread.create({ data: { workspaceId,
      reference: `TEST/${date.slice(0, 4)}/${String(i + 1).padStart(4, '0')}`, subject,
      sender: 'Sample Community Centre', channel: 'PHYSICAL',
      createdBy: `personnel:${testActorId('TESTLOGGER')}`, createdByName: 'Test Letter Logger',
      assignedTo, assignedToName: i === 1 ? 'Test Deputy Director' : 'Test Assistant Director - Provincial',
      firstReceivedDate: date, latestReceivedDate: date } })
    const event = await db.letterEvent.create({ data: { threadId: thread.id, workspaceId,
      requestId: `sample-letter-${i}`, requestHash: `sample-${i}`, sequence: 1, kind: 'INCOMING',
      actorKey: `personnel:${testActorId('TESTLOGGER')}`, actorName: 'Test Letter Logger',
      notes: 'Please review the proposed programme and confirm next steps.', correspondent: 'Sample Community Centre', receivedDate: date } })
    const original = samplePdf(subject)
    await db.letterAttachment.create({ data: { eventId: event.id, name: 'sample-request.pdf',
      mime: 'application/pdf', size: original.length, original,
      sha256: createHash('sha256').update(original).digest('hex'), uploadState: 'READY' } })
    for (const actorKey of [assignedTo, `personnel:${testActorId('TESTLOGGER')}`, `personnel:${testActorId('TESTASSIGNER')}`])
      await db.letterAccess.create({ data: { threadId: thread.id, actorKey } })
  }
  await db.letterCounter.create({ data: { workspaceId, year: Number(date.slice(0, 4)), value: 3 } })
  await db.letterSettings.create({ data: { workspaceId } })
}

export function samplePdf(subject: string) {
  const escaped = subject.replace(/[\\()]/g, '\\$&')
  const stream = `BT /F1 16 Tf 50 760 Td (SAMPLE DOCUMENT - TASKWISE TEST COMPANY) Tj 0 -40 Td /F1 12 Tf (${escaped}) Tj 0 -30 Td (Fictional programme request for testing and review.) Tj ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ]
  let result = '%PDF-1.4\n', offsets = [0]
  for (const [i, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(result))
    result += `${i + 1} 0 obj\n${object}\nendobj\n`
  }
  const xref = Buffer.byteLength(result)
  result += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(result)
}

export async function resetTestSandbox(force = false) {
  const password = await bcrypt.hash('test@123', 12)
  return prisma.$transaction(async db => {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(43001600)`
    const state = await db.testSandbox.findUnique({ where: { workspaceId: TEST_WORKSPACE } })
    if (!force && (!state?.enabled || localDate(state.lastResetAt) === localDate())) return false
    // Both the explicit registry and company identity must match before any deletion.
    const workspace = await db.workspace.findUnique({ where: { id: TEST_WORKSPACE } })
    if (workspace && (!state || workspace.companyId !== COMPANY)) throw new Error('Sandbox identity mismatch')
    if (workspace) await clearSamples(db)
    await seedSamples(db, password)
    await db.testSandbox.upsert({ where: { workspaceId: TEST_WORKSPACE },
      create: { workspaceId: TEST_WORKSPACE }, update: { lastResetAt: new Date(), enabled: true } })
    return true
  }, { timeout: 60000, maxWait: 60000 })
}

export async function testSandboxState(workspaceId: string) {
  if (workspaceId !== TEST_WORKSPACE) return null
  return prisma.testSandbox.findUnique({ where: { workspaceId } })
}

export function startTestSandboxWorker() {
  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try { await resetTestSandbox() } catch (error) { console.error('Test sandbox reset failed', error) }
    finally { running = false }
  }
  void tick()
  setInterval(tick, 30000).unref()
}
