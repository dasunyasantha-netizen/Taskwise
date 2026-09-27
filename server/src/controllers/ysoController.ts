import { Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import prisma from '../prisma'
import { AuthPayload } from '../middleware/authMiddleware'
import {
  TASKS,
  CRITERIA,
  localDate,
  validDate,
  validPeriod,
  validateData,
  entryKey,
  weekEnd,
  projectScores,
  RULE_VERSION,
} from '../helpers/ysoRules'

type DB = Prisma.TransactionClient
class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
  }
}
const fail = (status: number, message: string): never => {
  throw new HttpError(status, message)
}
const department = { include: { layer: true } } as const
async function scope(db: DB, actor: AuthPayload) {
  const where = {
    workspaceId: actor.workspaceId,
    department: {
      name: { equals: 'YSO', mode: 'insensitive' as const },
      layer: { number: 4 },
    },
  }
  if (actor.actorType === 'director') {
    const director = await db.director.findFirst({
      where: {
        id: actor.actorId,
        workspaceId: actor.workspaceId,
        isActive: true,
      },
    })
    if (!director) fail(403, 'Director access is unavailable')
    return {
      role: 'DIRECTOR',
      people: await db.personnel.findMany({
        where,
        include: {
          department,
          ysoProfile: true,
          supervisor: { include: { department } },
        },
      }),
    }
  }
  const me = await db.personnel.findFirst({
    where: {
      id: actor.actorId,
      workspaceId: actor.workspaceId,
      isActive: true,
      deletedAt: null,
    },
    include: { department },
  })
  if (!me) return fail(403, 'Active personnel account required')
  const isYso =
    me.department.layer.number === 4 &&
    me.department.name.toUpperCase() === 'YSO'
  const isAd =
    me.department.layer.number === 3 &&
    me.department.officeCategory === 'PROVINCIAL'
  if (!isYso && !isAd)
    return fail(403, 'This module is for YSOs, Provincial ADs and the Director')
  const people = await db.personnel.findMany({
    where: { ...where, ...(isYso ? { id: me.id } : { supervisorId: me.id }) },
    include: {
      department,
      ysoProfile: true,
      supervisor: { include: { department } },
    },
  })
  return { role: isYso ? 'YSO' : 'AD', people }
}
async function subject(
  db: DB,
  actor: AuthPayload,
  id: string,
  role: 'AD' | 'YSO'
) {
  const s = await scope(db, actor)
  if (s.role !== role)
    return fail(
      403,
      role === 'AD'
        ? 'Only the assigned Provincial AD can change this record'
        : 'Only the YSO can submit activities'
    )
  const person = s.people.find((p) => p.id === id && p.isActive && !p.deletedAt)
  if (!person) return fail(403, 'This YSO is outside your reporting scope')
  const manager = person.supervisor
  if (
    !manager ||
    !manager.isActive ||
    manager.deletedAt ||
    manager.department.layer.number !== 3 ||
    manager.department.officeCategory !== 'PROVINCIAL'
  )
    return fail(
      409,
      'Assign an active Level 3 Provincial AD before using YSO reporting'
    )
  return person
}
async function audit(
  db: DB,
  actor: AuthPayload,
  event: string,
  data: Prisma.InputJsonValue,
  personnelId?: string
) {
  await db.ysoAuditEvent.create({
    data: {
      workspaceId: actor.workspaceId,
      actorId: actor.actorId,
      event,
      data,
      personnelId,
    },
  })
}
async function notify(
  db: DB,
  actor: AuthPayload,
  id: string,
  title: string,
  message: string
) {
  await db.notification.create({
    data: {
      workspaceId: actor.workspaceId,
      recipientPersonnelId: id,
      recipientType: 'personnel',
      type: 'yso_update',
      title,
      message,
      payload: { view: 'yso_performance' },
    },
  })
}
async function material(db: DB, workspaceId: string, id: string) {
  const [entries, meetings, decisions, assessments] = await Promise.all([
    db.ysoSubmission.findMany({ where: { workspaceId, personnelId: id } }),
    db.ysoMeeting.findMany({ where: { workspaceId } }),
    db.ysoPenaltyDecision.findMany({ where: { workspaceId, personnelId: id } }),
    db.ysoAssessment.findMany({ where: { workspaceId, personnelId: id } }),
  ])
  return { entries, meetings, decisions, assessments }
}
async function reconcile(
  db: DB,
  actor: AuthPayload,
  person: {
    id: string
    supervisorId: string | null
    ysoProfile: { startDate: string } | null
  },
  reason: string
) {
  if (!person.ysoProfile) return
  const records = await material(db, actor.workspaceId, person.id)
  const { totals } = projectScores({
    ...records,
    personnelId: person.id,
    startDate: person.ysoProfile.startDate,
    today: localDate(),
  })
  const old = await db.ysoScoreEntry.findMany({
    where: { workspaceId: actor.workspaceId, personnelId: person.id },
    orderBy: { createdAt: 'asc' },
  })
  const balances = new Map<string, number>(),
    attributedAds = new Map<string, string>()
  for (const row of old) {
    const key = `${row.period}/${row.task}`
    balances.set(key, (balances.get(key) ?? 0) + row.points)
    // Corrections retain the original district attribution even after transfers.
    if (!attributedAds.has(key)) attributedAds.set(key, row.adId)
  }
  for (const key of new Set([...Object.keys(totals), ...balances.keys()])) {
    const difference = (totals[key] ?? 0) - (balances.get(key) ?? 0)
    if (!difference) continue
    const [period, task] = key.split('/')
    const originalEntry = records.entries
      .filter((e) => e.period === period && e.task === Number(task))
      .sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime())[0]
    const adId =
      attributedAds.get(key) ??
      originalEntry?.assignedAdId ??
      person.supervisorId!
    await db.ysoScoreEntry.create({
      data: {
        workspaceId: actor.workspaceId,
        personnelId: person.id,
        adId,
        period,
        task: Number(task),
        points: difference,
        reason,
        ruleVersion: RULE_VERSION,
      },
    })
  }
}
// Serialize mutations within a workspace: review retries cannot double-award points,
// and caps/aggregate funds remain correct under concurrent approvals.
async function mutation<T>(actor: AuthPayload, run: (db: DB) => Promise<T>) {
  return prisma.$transaction(
    async (db) => {
      await db.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${actor.workspaceId}))`
      return run(db)
    },
    { timeout: 20000 }
  )
}
function handler(fn: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response) => {
    try {
      await fn(req, res)
    } catch (error) {
      if (error instanceof HttpError) {
        res.status(error.status).json({ error: error.message })
        return
      }
      console.error('YSO operation failed', error)
      res
        .status(500)
        .json({ error: 'Unable to complete the YSO operation. Please retry.' })
    }
  }
}
function text(value: unknown, label: string, max = 2000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    return fail(400, `${label} is required (maximum ${max} characters)`)
  return value.trim()
}
function period(value: unknown): string {
  if (!validPeriod(value)) return fail(400, 'Invalid month')
  return value
}

export const getYsoDashboard = handler(async (req, res) => {
  const actor = req.user!,
    s = await scope(prisma, actor),
    ids = s.people.map((p) => p.id)
  const [entries, meetings, decisions, assessments, ledger, events, ads] =
    await Promise.all([
      prisma.ysoSubmission.findMany({
        where: { workspaceId: actor.workspaceId, personnelId: { in: ids } },
        include: {
          attachment: { select: { id: true, name: true, mime: true } },
        },
        orderBy: { submittedAt: 'desc' },
      }),
      prisma.ysoMeeting.findMany({
        where: { workspaceId: actor.workspaceId },
        orderBy: { date: 'desc' },
      }),
      prisma.ysoPenaltyDecision.findMany({
        where: { workspaceId: actor.workspaceId, personnelId: { in: ids } },
      }),
      prisma.ysoAssessment.findMany({
        where: { workspaceId: actor.workspaceId, personnelId: { in: ids } },
      }),
      prisma.ysoScoreEntry.findMany({
        where: { workspaceId: actor.workspaceId, personnelId: { in: ids } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.ysoAuditEvent.findMany({
        where: { workspaceId: actor.workspaceId, personnelId: { in: ids } },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      prisma.personnel.findMany({
        where: {
          workspaceId: actor.workspaceId,
          department: { layer: { number: 3 }, officeCategory: 'PROVINCIAL' },
          ...(s.role === 'DIRECTOR'
            ? {}
            : {
                id: {
                  in: s.people
                    .map((p) => p.supervisorId)
                    .filter((id): id is string => !!id),
                },
              }),
        },
        select: {
          id: true,
          name: true,
          isActive: true,
          department: { select: { name: true } },
        },
      }),
    ])
  const obligations = s.people.flatMap((p) =>
    p.ysoProfile
      ? projectScores({
          entries: entries.filter((e) => e.personnelId === p.id),
          meetings,
          decisions: decisions.filter((d) => d.personnelId === p.id),
          assessments: assessments.filter((a) => a.personnelId === p.id),
          startDate: p.ysoProfile.startDate,
          personnelId: p.id,
          today: localDate(),
        }).obligations.map((o) => ({ ...o, personnelId: p.id }))
      : []
  )
  const visibleMeetings = meetings.filter(
    (m) =>
      s.role === 'DIRECTOR' ||
      m.adId === actor.actorId ||
      (m.invitees as string[]).some((id) => ids.includes(id))
  )
  res.json({
    role: s.role,
    today: localDate(),
    tasks: TASKS,
    criteria: CRITERIA,
    ruleVersion: RULE_VERSION,
    people: s.people.map((p) => ({
      id: p.id,
      name: p.name,
      active: p.isActive && !p.deletedAt,
      adId: p.supervisorId,
      adName: p.supervisor?.name,
      district: p.supervisor?.department.name,
      startDate: p.ysoProfile?.startDate,
      managerValid:
        !!p.supervisor &&
        p.supervisor.isActive &&
        !p.supervisor.deletedAt &&
        p.supervisor.department.layer.number === 3 &&
        p.supervisor.department.officeCategory === 'PROVINCIAL',
    })),
    entries,
    meetings: visibleMeetings.map((m) => ({
      ...m,
      invitees: (m.invitees as string[]).filter(
        (id) => s.role === 'DIRECTOR' || ids.includes(id)
      ),
    })),
    decisions,
    assessments,
    ledger,
    obligations,
    events,
    ads: ads.map((a) => ({
      id: a.id,
      name: a.name,
      active: a.isActive,
      district: a.department.name,
    })),
  })
})

export const activateYso = handler(async (req, res) => {
  const result = await mutation(req.user!, async (db) => {
    const person = await subject(db, req.user!, req.params.id, 'AD')
    const startDate = req.body.startDate ?? localDate()
    if (
      !validDate(startDate) ||
      startDate < localDate(person.createdAt) ||
      startDate > localDate()
    )
      return fail(
        400,
        'Reporting must start between the joining date and today'
      )
    const profile = await db.ysoProfile.upsert({
      where: { personnelId: person.id },
      create: {
        workspaceId: req.user!.workspaceId,
        personnelId: person.id,
        startDate,
      },
      update: {},
    })
    await audit(
      db,
      req.user!,
      'REPORTING_ACTIVATED',
      { startDate: profile.startDate },
      person.id
    )
    return profile
  })
  res.json(result)
})

export const submitYso = handler(async (req, res) => {
  const actor = req.user!
  const result = await mutation(actor, async (db) => {
    const person = await subject(db, actor, actor.actorId, 'YSO')
    if (!person.ysoProfile)
      return fail(
        409,
        'Your AD must activate reporting before your first submission'
      )
    const task = Number(req.body.task)
    let data: Record<string, any>
    try {
      data = validateData(task, req.body.data)
    } catch (e) {
      return fail(400, (e as Error).message)
    }
    if (task < 12 && data.date && data.date < person.ysoProfile.startDate)
      return fail(400, 'Activity precedes your reporting start date')
    let entryPeriod =
      task === 3 || task === 4
        ? data.month
        : task >= 12
          ? localDate().slice(0, 7)
          : task === 9
            ? weekEnd(data.date).slice(0, 7)
            : String(data.date ?? '').slice(0, 7)
    if (task === 2) {
      const meeting = await db.ysoMeeting.findFirst({
        where: {
          id: data.meetingId,
          workspaceId: actor.workspaceId,
          cancelled: false,
        },
      })
      if (!meeting || !(meeting.invitees as string[]).includes(person.id))
        return fail(400, 'Choose an active meeting you were invited to')
      if (
        meeting.date > localDate() ||
        meeting.date < person.ysoProfile.startDate
      )
        return fail(
          400,
          'Attendance is available on or after the meeting date, within your reporting period'
        )
      entryPeriod = meeting.date.slice(0, 7)
    }
    if (task === 10 && data.phase === 'SETTLEMENT') {
      const advance = await db.ysoSubmission.findFirst({
        where: {
          id: data.advanceId,
          workspaceId: actor.workspaceId,
          personnelId: person.id,
          task: 10,
          status: 'APPROVED',
          supersededAt: null,
        },
      })
      if (!advance || (advance.data as any).phase !== 'ADVANCE')
        return fail(400, 'Choose an approved advance')
      if (data.settlementDate < (advance.data as any).date)
        return fail(400, 'Settlement cannot precede the advance')
      entryPeriod = data.settlementDate.slice(0, 7)
    }
    if (
      !validPeriod(entryPeriod) ||
      entryPeriod < person.ysoProfile.startDate.slice(0, 7)
    )
      return fail(400, 'Invalid reporting period')
    const businessKey = entryKey(task, data)
    const existing = await db.ysoSubmission.findMany({
      where: {
        workspaceId: actor.workspaceId,
        personnelId: person.id,
        businessKey,
        supersededAt: null,
      },
      orderBy: { submittedAt: 'desc' },
    })
    if (existing.some((e) => ['PENDING', 'SUBMITTED'].includes(e.status)))
      return fail(409, 'This activity is already awaiting AD approval')
    let previousId: string | undefined
    if (existing.length) {
      if (
        !req.body.previousId ||
        !existing.some((e) => e.id === req.body.previousId)
      )
        return fail(
          409,
          'This activity already exists. Use Correct / Resubmit from its history'
        )
      previousId = req.body.previousId
    } else if (req.body.previousId)
      return fail(
        400,
        'A correction must retain the original activity reference / reporting month'
      )
    if (task === 10 && data.phase === 'ADVANCE' && previousId) {
      const dependent = await db.ysoSubmission.findMany({
        where: {
          workspaceId: actor.workspaceId,
          personnelId: person.id,
          task: 10,
          supersededAt: null,
          status: { in: ['PENDING', 'APPROVED'] },
        },
      })
      if (dependent.some((e) => (e.data as any).advanceId === previousId))
        return fail(409, 'An advance with a settlement cannot be revised')
    }
    const submitted = await db.ysoSubmission.create({
      data: {
        workspaceId: actor.workspaceId,
        personnelId: person.id,
        assignedAdId: person.supervisorId!,
        task,
        period: entryPeriod,
        businessKey,
        data,
        previousId,
        status: 'SUBMITTED',
      },
    })
    if (task >= 12) {
      const upload = req.body.attachment
      if (
        !upload ||
        typeof upload.base64 !== 'string' ||
        upload.base64.length > 1400000 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(upload.base64)
      )
        return fail(400, 'Upload a PDF, PNG or JPEG certificate up to 1 MB')
      const bytes = Buffer.from(upload.base64, 'base64')
      const mime =
        bytes.subarray(0, 5).toString() === '%PDF-'
          ? 'application/pdf'
          : bytes
                .subarray(0, 8)
                .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
            ? 'image/png'
            : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
              ? 'image/jpeg'
              : ''
      if (!mime || bytes.length > 1048576)
        return fail(400, 'Unsupported certificate format or file exceeds 1 MB')
      await db.ysoAttachment.create({
        data: {
          submissionId: submitted.id,
          name: text(upload.name, 'Certificate filename', 180).replace(
            /[\r\n\\/]/g,
            '_'
          ),
          mime,
          bytes,
        },
      })
    }
    await audit(
      db,
      actor,
      'SUBMITTED',
      {
        submissionId: submitted.id,
        submittedAt: submitted.submittedAt.toISOString(),
        previousId: previousId ?? null,
      },
      person.id
    )
    const queued = await db.ysoSubmission.update({
      where: { id: submitted.id },
      data: { status: 'PENDING', queuedAt: new Date() },
    })
    await audit(
      db,
      actor,
      'PENDING',
      { submissionId: submitted.id, assignedAdId: person.supervisorId },
      person.id
    )
    await notify(
      db,
      actor,
      person.supervisorId!,
      'YSO submission awaiting approval',
      `${person.name} submitted Task ${task}. Open YSO Performance to review.`
    )
    // A pending correction does not retract an existing award. Missing-duty decisions
    // are reconciled only when reviewed, not when the YSO merely uploads a new version.
    return queued
  })
  res.status(201).json(result)
})

export const reviewYso = handler(async (req, res) => {
  const actor = req.user!
  const result = await mutation(actor, async (db) => {
    const entry = await db.ysoSubmission.findFirst({
      where: { id: req.params.id, workspaceId: actor.workspaceId },
    })
    if (!entry) return fail(404, 'Submission not found')
    const person = await subject(db, actor, entry.personnelId, 'AD')
    const action = req.body.action
    if (!['APPROVE', 'REJECT', 'REVOKE'].includes(action))
      return fail(400, 'Invalid review action')
    const revoke = action === 'REVOKE'
    if (
      entry.supersededAt ||
      (revoke ? entry.status !== 'APPROVED' : entry.status !== 'PENDING')
    )
      return fail(409, 'This entry has already been reviewed or superseded')
    const feedback = revoke
      ? text(req.body.feedback, 'Reason for revoking approval')
      : typeof req.body.feedback === 'string'
        ? req.body.feedback.trim().slice(0, 2000)
        : null
    if (
      entry.task === 10 &&
      (entry.data as any).phase === 'ADVANCE' &&
      revoke
    ) {
      const dependent = await db.ysoSubmission.findMany({
        where: {
          workspaceId: actor.workspaceId,
          personnelId: person.id,
          task: 10,
          supersededAt: null,
          status: { in: ['PENDING', 'APPROVED'] },
        },
      })
      if (dependent.some((e) => (e.data as any).advanceId === entry.id))
        return fail(409, 'Review or revoke the linked settlement first')
    }
    if (action === 'APPROVE') {
      if (entry.task === 2) {
        const meeting = await db.ysoMeeting.findFirst({
          where: {
            id: (entry.data as any).meetingId,
            workspaceId: actor.workspaceId,
            cancelled: false,
          },
        })
        if (!meeting)
          return fail(
            409,
            'This meeting was cancelled; reject the attendance entry'
          )
      }
      await db.ysoSubmission.updateMany({
        where: {
          workspaceId: actor.workspaceId,
          personnelId: person.id,
          businessKey: entry.businessKey,
          id: { not: entry.id },
          supersededAt: null,
        },
        data: { supersededAt: new Date() },
      })
    }
    const reviewed = await db.ysoSubmission.update({
      where: { id: entry.id },
      data: {
        status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
        reviewedAt: new Date(),
        reviewedById: actor.actorId,
        feedback,
      },
    })
    await audit(
      db,
      actor,
      action,
      {
        submissionId: entry.id,
        feedback,
        originalSubmittedAt: entry.submittedAt.toISOString(),
        assignedAdId: entry.assignedAdId,
      },
      person.id
    )
    await reconcile(db, actor, person, `${action} submission ${entry.id}`)
    await notify(
      db,
      actor,
      person.id,
      action === 'APPROVE' ? 'YSO entry approved' : 'YSO entry needs attention',
      `Task ${entry.task}: ${action.toLowerCase()}. ${feedback ?? ''}`
    )
    return reviewed
  })
  res.json(result)
})

export const downloadYsoCertificate = handler(async (req, res) => {
  const s = await scope(prisma, req.user!)
  const file = await prisma.ysoAttachment.findFirst({
    where: {
      id: req.params.id,
      submission: {
        workspaceId: req.user!.workspaceId,
        personnelId: { in: s.people.map((p) => p.id) },
      },
    },
  })
  if (!file) return fail(404, 'Certificate not found')
  res.setHeader('Content-Type', file.mime)
  res.setHeader(
    'Content-Disposition',
    `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`
  )
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Cache-Control', 'private, no-store')
  res.send(file.bytes)
})

export const createYsoMeeting = handler(async (req, res) => {
  const actor = req.user!
  const result = await mutation(actor, async (db) => {
    const s = await scope(db, actor)
    if (s.role !== 'AD')
      return fail(403, 'Only Provincial ADs schedule meetings')
    const date = req.body.date
    if (!validDate(date) || date < localDate())
      return fail(400, 'Schedule a meeting for today or a future date')
    const invitees = req.body.invitees
    if (
      !Array.isArray(invitees) ||
      !invitees.length ||
      new Set(invitees).size !== invitees.length ||
      invitees.some(
        (id) =>
          typeof id !== 'string' ||
          !s.people.some(
            (p) => p.id === id && p.isActive && !p.deletedAt && p.ysoProfile
          )
      )
    )
      return fail(
        400,
        'Select active YSOs with reporting enabled from your team'
      )
    const meeting = await db.ysoMeeting.create({
      data: {
        workspaceId: actor.workspaceId,
        adId: actor.actorId,
        date,
        title: text(req.body.title, 'Meeting title', 200),
        location: text(req.body.location, 'Meeting location', 300),
        invitees,
      },
    })
    await audit(db, actor, 'MEETING_SCHEDULED', {
      meetingId: meeting.id,
      date,
      invitees,
    })
    for (const id of invitees)
      await notify(
        db,
        actor,
        id,
        'District officer meeting scheduled',
        `${meeting.title}: ${date}, ${meeting.location}`
      )
    return meeting
  })
  res.status(201).json(result)
})

export const cancelYsoMeeting = handler(async (req, res) => {
  const actor = req.user!
  await mutation(actor, async (db) => {
    const s = await scope(db, actor)
    if (s.role !== 'AD') return fail(403, 'AD access required')
    const meeting = await db.ysoMeeting.findFirst({
      where: {
        id: req.params.id,
        workspaceId: actor.workspaceId,
        adId: actor.actorId,
      },
    })
    if (!meeting) return fail(404, 'Meeting not found')
    const reason = text(req.body.reason, 'Cancellation reason')
    await db.ysoMeeting.update({
      where: { id: meeting.id },
      data: { cancelled: true },
    })
    await audit(db, actor, 'MEETING_CANCELLED', {
      meetingId: meeting.id,
      reason,
    })
    const people = await db.personnel.findMany({
      where: {
        workspaceId: actor.workspaceId,
        id: { in: meeting.invitees as string[] },
      },
      include: { ysoProfile: true },
    })
    for (const person of people) {
      await reconcile(db, actor, person, `Meeting cancelled: ${reason}`)
      await notify(
        db,
        actor,
        person.id,
        'Meeting cancelled',
        `${meeting.title}: ${reason}`
      )
    }
  })
  res.json({ ok: true })
})

export const assessYso = handler(async (req, res) => {
  const actor = req.user!
  const result = await mutation(actor, async (db) => {
    const person = await subject(db, actor, req.params.id, 'AD'),
      p = period(req.body.period)
    if (
      !person.ysoProfile ||
      p < person.ysoProfile.startDate.slice(0, 7) ||
      p > localDate().slice(0, 7)
    )
      return fail(400, 'Choose an active reporting month')
    const scores: Record<string, number> = {}
    for (const c of CRITERIA) {
      const value = req.body.scores?.[c.key]
      if (!Number.isInteger(value) || value < 0 || value > c.max)
        return fail(400, `${c.label} must be between 0 and ${c.max}`)
      scores[c.key] = value
    }
    const rationale = text(req.body.rationale, 'Assessment rationale')
    const assessment = await db.ysoAssessment.upsert({
      where: { personnelId_period: { personnelId: person.id, period: p } },
      create: {
        workspaceId: actor.workspaceId,
        personnelId: person.id,
        adId: actor.actorId,
        period: p,
        scores,
        rationale,
      },
      update: { adId: actor.actorId, scores, rationale },
    })
    await audit(
      db,
      actor,
      'ASSESSMENT_RECORDED',
      { period: p, scores, rationale },
      person.id
    )
    await reconcile(db, actor, person, `Monthly AD evaluation: ${p}`)
    await notify(
      db,
      actor,
      person.id,
      'Monthly performance evaluation updated',
      `${p}: ${Object.values(scores).reduce((a, b) => a + b, 0)} / 25. ${rationale}`
    )
    return assessment
  })
  res.json(result)
})

export const decideYsoPenalty = handler(async (req, res) => {
  const actor = req.user!
  const result = await mutation(actor, async (db) => {
    const person = await subject(db, actor, req.params.id, 'AD')
    if (!person.ysoProfile) return fail(409, 'Reporting has not been activated')
    const records = await material(db, actor.workspaceId, person.id)
    const projection = projectScores({
      ...records,
      startDate: person.ysoProfile.startDate,
      personnelId: person.id,
      today: localDate(),
    })
    const obligation = projection.obligations.find(
      (o) => o.key === req.body.key
    )
    if (!obligation || obligation.blocked)
      return fail(
        409,
        'Review the pending submission first, or refresh this obligation'
      )
    if (!['DEDUCT', 'EXEMPT'].includes(req.body.outcome))
      return fail(400, 'Choose deduction or exemption')
    const reason = text(req.body.reason, 'Decision reason')
    const data = {
      workspaceId: actor.workspaceId,
      personnelId: person.id,
      key: obligation.key,
      task: obligation.task,
      period: obligation.period,
      outcome: req.body.outcome,
      reason,
      adId: actor.actorId,
    }
    const decision = await db.ysoPenaltyDecision.upsert({
      where: {
        personnelId_key: { personnelId: person.id, key: obligation.key },
      },
      create: data,
      update: data,
    })
    await audit(
      db,
      actor,
      'PENALTY_DECISION',
      { ...data, points: obligation.points },
      person.id
    )
    await reconcile(db, actor, person, `${data.outcome}: ${reason}`)
    return decision
  })
  res.json(result)
})
