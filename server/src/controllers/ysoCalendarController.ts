import { Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import prisma from '../prisma'
import { ysoScope, HttpError } from './ysoController'
import { buildTaskVisibilityFilter } from '../helpers/visibility'
import { ensure, scope as letterScope, visibility, LetterError } from '../helpers/letters'
import { calendarEntry, calendarRange, CalendarEvent } from '../helpers/ysoCalendar'
import { addDays, localDate, monthShift, validDate, TASKS } from '../helpers/ysoRules'

const safe = (fn: (req: Request, res: Response) => Promise<void>) => async (req: Request, res: Response) => {
  try { await fn(req, res) } catch (e: any) {
    if (e instanceof LetterError || e instanceof HttpError) { res.status(e.status).json({ error: e.message }); return }
    console.error('YSO calendar failed', e)
    res.status(500).json({ error: 'Could not load or save your calendar. Please retry.' })
  }
}
async function owner(req: Request) {
  ensure(req.user?.actorType === 'personnel', 403, 'Calendar entries are available to YSOs only')
  const scope = await ysoScope(prisma, req.user!)
  ensure(scope.role === 'YSO', 403, 'Calendar entries are available to YSOs only')
  return { actor: req.user!, person: scope.people[0] }
}

export const getYsoCalendar = safe(async (req, res) => {
  const { actor, person } = await owner(req)
  const { from, to } = calendarRange(req.query.period)
  const inRange = (date: string) => date >= from && date <= to
  const taskVisibility = await buildTaskVisibilityFilter('personnel', actor.actorId, actor.workspaceId, person.department.layer.number, person.departmentId)
  const letters = await letterScope(prisma, actor)
  const [tasks, letterEvents, openLetters, settings, meetings, entries, submissions] = await Promise.all([
    prisma.task.findMany({
      where: { workspaceId: actor.workspaceId, deletedAt: null, status: { not: 'CANCELLED' },
        deadline: { gte: new Date(from + 'T00:00:00+05:30'), lt: new Date(addDays(to, 1) + 'T00:00:00+05:30') },
        AND: [taskVisibility as Prisma.TaskWhereInput], project: { deletedAt: null } },
      select: { id: true, title: true, deadline: true, project: { select: { name: true } } },
    }),
    prisma.letterEvent.findMany({
      where: { workspaceId: actor.workspaceId, thread: visibility(actor.workspaceId, letters),
        OR: [{ receivedDate: { gte: from, lte: to } }, { correspondenceDate: { gte: from, lte: to } },
          { kind: 'TRANSFER', createdAt: { gte: new Date(from + 'T00:00:00+05:30'), lt: new Date(addDays(to, 1) + 'T00:00:00+05:30') } }] },
      select: { id: true, kind: true, receivedDate: true, correspondenceDate: true, createdAt: true,
        thread: { select: { id: true, reference: true, subject: true } } },
    }),
    prisma.letterThread.findMany({ where: { AND: [visibility(actor.workspaceId, letters), { status: 'OPEN', assignedTo: letters.key }] },
      select: { id: true, subject: true, reference: true, assignedAt: true } }),
    prisma.letterSettings.findUnique({ where: { workspaceId: actor.workspaceId }, select: { assigneeDays: true } }),
    prisma.ysoMeeting.findMany({ where: { workspaceId: actor.workspaceId, cancelled: false, date: { gte: from, lte: to }, invitees: { array_contains: [actor.actorId] } } }),
    prisma.ysoCalendarEntry.findMany({ where: { workspaceId: actor.workspaceId, personnelId: actor.actorId, date: { gte: from, lte: to } } }),
    prisma.ysoSubmission.findMany({ where: { workspaceId: actor.workspaceId, personnelId: actor.actorId, supersededAt: null, status: { not: 'REJECTED' } }, select: { id: true, task: true, data: true, period: true, status: true } }),
  ])
  const events: CalendarEvent[] = tasks.map(task => ({ id: 'task:' + task.id, source: 'task', sourceId: task.id, title: task.title,
    date: localDate(task.deadline!), detail: 'Task deadline', project: task.project.name }))
  for (const e of letterEvents) {
    const dates = new Map<string, string>()
    if (e.receivedDate) dates.set(e.receivedDate, 'Letter received')
    if (e.correspondenceDate && !dates.has(e.correspondenceDate)) dates.set(e.correspondenceDate, e.kind === 'OUTGOING' ? 'Outgoing reply' : 'Letter dated')
    if (e.kind === 'TRANSFER') dates.set(localDate(e.createdAt), 'Letter assigned')
    for (const [date, detail] of dates) {
      if (inRange(date)) events.push({ id: `letter:${e.id}:${date}`, source: 'letter', sourceId: e.thread.id, title: e.thread.subject, date,
        detail, notes: e.thread.reference })
    }
  }
  for (const letter of openLetters) {
    const date = addDays(localDate(letter.assignedAt), settings?.assigneeDays ?? 7)
    if (inRange(date)) events.push({ id: 'follow-up:' + letter.id, source: 'letter', sourceId: letter.id, title: letter.subject, date, detail: 'Letter follow-up', notes: letter.reference })
  }
  for (const meeting of meetings) events.push({ id: 'meeting:' + meeting.id, source: 'meeting', title: meeting.title, date: meeting.date, notes: meeting.location, detail: 'District meeting' })
  for (const entry of entries) events.push({ id: 'personal:' + entry.id, sourceId: entry.id, source: 'personal', detail: 'Personal entry',
    title: entry.title, date: entry.date, startTime: entry.startTime, endTime: entry.endTime, notes: entry.notes })
  for (const submission of submissions) {
    const data = submission.data as Record<string, unknown>
    for (const key of ['date', 'dueDate', 'settlementDate']) {
      const date = data[key]
      if (validDate(date) && inRange(date)) events.push({ id: `activity:${submission.id}:${key}`, source: 'reporting', date,
        title: TASKS.find(t => t.id === submission.task)?.title || 'YSO activity', detail: key === 'dueDate' ? 'Settlement due' : 'YSO activity', notes: typeof data.reference === 'string' ? data.reference : '' })
    }
  }
  if (person.ysoProfile) {
    // Monthly plan/report deadlines are policy dates, not invented project dates.
    for (const month of [from.slice(0, 7), req.query.period as string, to.slice(0, 7)]) {
      for (const [date, task, reportingPeriod] of [[month + '-25', 3, monthShift(month, 1)], [month + '-05', 4, monthShift(month, -1)]] as const) {
        if (date >= person.ysoProfile.startDate && inRange(date)) events.push({ id: `deadline:${task}:${date}`, source: 'reporting', date,
          title: TASKS.find(t => t.id === task)!.title, detail: 'Reporting deadline', notes: reportingPeriod })
      }
    }
  }
  const unique = [...new Map(events.map(e => [e.id, e])).values()]
  res.set('Cache-Control', 'no-store').json({ events: unique.sort((a, b) => a.date.localeCompare(b.date) || (a.startTime || '').localeCompare(b.startTime || '') || a.title.localeCompare(b.title)) })
})

const save = (editing: boolean) => safe(async (req, res) => {
  const { actor } = await owner(req), data = calendarEntry(req.body || {})
  const result = await prisma.$transaction(async db => {
    if (editing) {
      const existing = await db.ysoCalendarEntry.findFirst({ where: { id: req.params.id, workspaceId: actor.workspaceId, personnelId: actor.actorId } })
      ensure(existing, 404, 'Calendar entry not found')
    }
    const entry = editing
      ? await db.ysoCalendarEntry.update({ where: { id: req.params.id }, data })
      : await db.ysoCalendarEntry.create({ data: { ...data, workspaceId: actor.workspaceId, personnelId: actor.actorId } })
    await db.ysoAuditEvent.create({ data: { workspaceId: actor.workspaceId, personnelId: actor.actorId, actorId: actor.adminId || actor.actorId,
      event: editing ? 'CALENDAR_ENTRY_UPDATED' : 'CALENDAR_ENTRY_CREATED', data: { entryId: entry.id, date: entry.date, ...(actor.impersonationSessionId ? { supportSessionId: actor.impersonationSessionId } : {}) } } })
    return entry
  })
  res.status(editing ? 200 : 201).json(result)
})
export const createYsoCalendarEntry = save(false)
export const updateYsoCalendarEntry = save(true)
export const deleteYsoCalendarEntry = safe(async (req, res) => {
  const { actor } = await owner(req)
  await prisma.$transaction(async db => {
    const deleted = await db.ysoCalendarEntry.deleteMany({ where: { id: req.params.id, workspaceId: actor.workspaceId, personnelId: actor.actorId } })
    ensure(deleted.count === 1, 404, 'Calendar entry not found')
    await db.ysoAuditEvent.create({ data: { workspaceId: actor.workspaceId, personnelId: actor.actorId, actorId: actor.adminId || actor.actorId, event: 'CALENDAR_ENTRY_DELETED',
      data: { entryId: req.params.id, ...(actor.impersonationSessionId ? { supportSessionId: actor.impersonationSessionId } : {}) } } })
  })
  res.json({ deleted: true })
})
