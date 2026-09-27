/** Pure, versioned YSO policy. All calendar arithmetic uses Sri Lankan dates. */
export const RULE_VERSION = '2026-09-v1'
const DAY = 86400000
export const localDate = (date = new Date()) =>
  new Date(date.getTime() + 19800000).toISOString().slice(0, 10)
export const dateMs = (s: string) => Date.parse(s + 'T00:00:00Z')
export const addDays = (s: string, days: number) =>
  new Date(dateMs(s) + days * DAY).toISOString().slice(0, 10)
export const daysBetween = (a: string, b: string) =>
  Math.round((dateMs(b) - dateMs(a)) / DAY)
export const monthShift = (period: string, shift: number) => {
  const [y, m] = period.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1 + shift, 1)).toISOString().slice(0, 7)
}
export function validDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(dateMs(value)) &&
    new Date(dateMs(value)).toISOString().slice(0, 10) === value
  )
}
export function validPeriod(value: unknown): value is string {
  return typeof value === 'string' && /^20\d{2}-(0[1-9]|1[0-2])$/.test(value)
}
export function weekEnd(date: string) {
  const weekday = new Date(dateMs(date)).getUTCDay()
  return addDays(date, (7 - weekday) % 7)
}
export function requiredWeeks(period: string, startDate: string) {
  const result: string[] = []
  for (
    let day = period + '-01';
    day.slice(0, 7) === period;
    day = addDays(day, 1)
  ) {
    if (
      new Date(dateMs(day)).getUTCDay() === 0 &&
      addDays(day, -6) >= startDate
    )
      result.push(day)
  }
  return result
}
export const dueDate = (task: number, period: string) =>
  task === 3 ? monthShift(period, -1) + '-25' : monthShift(period, 1) + '-05'
export const deadlinePoints = (due: string, submittedAt: Date | string) => {
  const days = daysBetween(due, localDate(new Date(submittedAt)))
  return days <= 0 ? 1 : -Math.min(days, 5)
}
type Field = {
  key: string
  label: string
  type:
    | 'date'
    | 'month'
    | 'number'
    | 'text'
    | 'textarea'
    | 'checkbox'
    | 'select'
  options?: string[]
  min?: number
  max?: number
  optional?: boolean
}
const field = (
  key: string,
  label: string,
  type: Field['type'],
  extra: Partial<Field> = {}
): Field => ({ key, label, type, ...extra })
const date = field('date', 'Activity date', 'date')
const reference = field(
  'reference',
  'Unique activity / document reference',
  'text'
)
export const TASKS: {
  id: number
  title: string
  rule: string
  fields: Field[]
}[] = [
  {
    id: 1,
    title: 'NISCO member recruitment',
    rule: '+1 per registered member, only when online completion is ticked.',
    fields: [
      date,
      reference,
      field('members', 'Registered members', 'number', { min: 1 }),
      field('online', 'Online registration completed', 'checkbox'),
    ],
  },
  {
    id: 2,
    title: 'District officer meetings',
    rule: '+1 attended; approved leave 0; absent −5. Unmarked invitations become absent at month-end, subject to AD penalty confirmation.',
    fields: [
      field('meetingId', 'Scheduled meeting', 'select'),
      field('attendance', 'Attendance', 'select', {
        options: ['ATTENDED', 'APPROVED_LEAVE', 'ABSENT'],
      }),
    ],
  },
  {
    id: 3,
    title: 'Upcoming monthly programs',
    rule: 'Due on the 25th of the previous month. +1 on time, −1 per late calendar day, capped at −5.',
    fields: [
      field('month', 'Program month', 'month'),
      field('details', 'Program details', 'textarea'),
    ],
  },
  {
    id: 4,
    title: 'Monthly progress report',
    rule: 'Due on the 5th of the following month. +1 on time, −1 per late calendar day, capped at −5.',
    fields: [
      field('month', 'Month being reported', 'month'),
      field('details', 'Progress report', 'textarea'),
    ],
  },
  {
    id: 5,
    title: 'Sponsorship received',
    rule: '+1 per complete LKR 1,000 of approved credited funds, aggregated monthly.',
    fields: [
      date,
      reference,
      field('amount', 'Amount received (LKR)', 'number', { min: 1 }),
      field('sponsor', 'Sponsor name', 'text'),
      field('credited', 'Credited to the regional account', 'checkbox'),
    ],
  },
  {
    id: 6,
    title: 'Decentralized funds',
    rule: '+1 per complete LKR 5,000 of approved funds received, aggregated monthly.',
    fields: [
      date,
      reference,
      field('amount', 'Amount received (LKR)', 'number', { min: 1 }),
      field('source', 'Funding source', 'text'),
    ],
  },
  {
    id: 7,
    title: 'Regional board meetings',
    rule: '+1 per distinct attended meeting; maximum +5 per activity month. Further meetings remain valid.',
    fields: [
      date,
      reference,
      field('location', 'Meeting location', 'text'),
      field('attendees', 'Youth attendees', 'number', { min: 0 }),
    ],
  },
  {
    id: 8,
    title: 'District board representatives',
    rule: '+1 per representative sent. Use one entry per district meeting and list representative references.',
    fields: [
      date,
      reference,
      field('representatives', 'Representatives sent', 'number', { min: 1 }),
      field('details', 'Representative names / references', 'textarea'),
    ],
  },
  {
    id: 9,
    title: 'Divisional Secretariat reporting',
    rule: '+1 per covered Monday–Sunday week. Weeks belong to the month of their Sunday. Any missed required week causes one −5 monthly deduction after AD confirmation. Partial joining weeks are exempt.',
    fields: [date],
  },
  {
    id: 10,
    title: 'Cash advance settlements',
    rule: 'Register an advance, then record its settlement. +2 on time; otherwise −1 per late calendar day, without a cap. Confirmed overdue deductions are reconciled on settlement.',
    fields: [
      field('phase', 'Entry type', 'select', {
        options: ['ADVANCE', 'SETTLEMENT'],
      }),
      reference,
      field('date', 'Advance date', 'date'),
      field('dueDate', 'Settlement due date', 'date'),
      field('advanceId', 'Approved advance', 'select', { optional: true }),
      field('settlementDate', 'Settlement date', 'date', { optional: true }),
    ],
  },
  {
    id: 11,
    title: 'Program attendance',
    rule: '+1 per program per attendance day. Multiple different programs on the same day qualify.',
    fields: [date, field('program', 'Program name', 'text')],
  },
  {
    id: 12,
    title: 'Diploma qualification',
    rule: '+15 once per lifetime for a diploma of at least 1,200 hours, after certificate approval.',
    fields: [
      field('qualification', 'Diploma title', 'text'),
      field('institution', 'Institution', 'text'),
      field('date', 'Award date', 'date'),
      field('hours', 'Study hours', 'number', { min: 1200 }),
    ],
  },
  {
    id: 13,
    title: 'Degree qualification',
    rule: '+50 once per lifetime after certificate approval.',
    fields: [
      field('qualification', 'Degree title', 'text'),
      field('institution', 'Institution', 'text'),
      field('date', 'Award date', 'date'),
    ],
  },
  {
    id: 14,
    title: 'Postgraduate qualification',
    rule: '+75 once per lifetime after certificate approval. Qualification levels may be combined.',
    fields: [
      field('qualification', 'Postgraduate degree title', 'text'),
      field('institution', 'Institution', 'text'),
      field('date', 'Award date', 'date'),
    ],
  },
  {
    id: 15,
    title: 'AD performance evaluation',
    rule: 'One monthly evaluation, maximum 25 points. Each revision records the AD and rationale.',
    fields: [],
  },
]
export const CRITERIA = [
  { key: 'volunteer', label: 'Volunteer programs', max: 10 },
  { key: 'district', label: 'District success', max: 5 },
  { key: 'financial', label: 'Financial discipline', max: 3 },
  { key: 'relations', label: 'Human relations', max: 4 },
  { key: 'files', label: 'File maintenance', max: 3 },
]
export function validateData(
  task: number,
  input: unknown,
  today = localDate()
): Record<string, any> {
  const definition = TASKS.find((t) => t.id === task && task < 15)
  if (
    !definition ||
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input)
  )
    throw new Error('Invalid task or entry')
  const source = input as Record<string, unknown>,
    data: Record<string, any> = {}
  for (const f of definition.fields) {
    if (
      task === 10 &&
      source.phase === 'SETTLEMENT' &&
      ['reference', 'date', 'dueDate'].includes(f.key)
    )
      continue
    if (
      task === 10 &&
      source.phase === 'ADVANCE' &&
      ['advanceId', 'settlementDate'].includes(f.key)
    )
      continue
    const value = source[f.key]
    if (f.type === 'checkbox') {
      if (typeof value !== 'boolean')
        throw new Error(`${f.label} must be true or false`)
      data[f.key] = value
      continue
    }
    if (f.type === 'number') {
      if (
        typeof value !== 'number' ||
        !Number.isSafeInteger(value) ||
        value < (f.min ?? 0) ||
        value > (f.max ?? 1000000000)
      )
        throw new Error(`Invalid ${f.label}`)
      data[f.key] = value
      continue
    }
    if (
      typeof value !== 'string' ||
      !value.trim() ||
      value.length > (f.type === 'textarea' ? 10000 : 300)
    )
      throw new Error(`${f.label} is required (within the length limit)`)
    if (f.type === 'date' && !validDate(value))
      throw new Error(`Invalid ${f.label}`)
    if (f.type === 'date' && f.key !== 'dueDate' && value > today)
      throw new Error(`${f.label} cannot be in the future`)
    if (
      f.type === 'month' &&
      (!validPeriod(value) || value > monthShift(today.slice(0, 7), 12))
    )
      throw new Error('Invalid reporting month')
    if (f.options && !f.options.includes(value))
      throw new Error(`Invalid ${f.label}`)
    data[f.key] = value.trim()
  }
  if (task === 10 && data.phase === 'ADVANCE' && data.dueDate < data.date)
    throw new Error('Due date cannot precede the advance')
  return data
}
export function entryKey(task: number, data: Record<string, any>) {
  if (task === 2) return `2:${data.meetingId}`
  if (task === 3 || task === 4) return `${task}:${data.month}`
  if (task >= 12) return String(task)
  if (task === 9) return `9:${data.date}`
  if (task === 10 && data.phase === 'SETTLEMENT')
    return `10:settle:${data.advanceId}`
  if (task === 11)
    return `11:${String(data.program).trim().toLowerCase().replace(/\s+/g, ' ')}:${data.date}`
  return `${task}:${String(data.reference).trim().toLowerCase()}:`
}
export type Entry = {
  id: string
  task: number
  period: string
  data: any
  status: string
  submittedAt: Date | string
  supersededAt: Date | string | null
}
export type Meeting = {
  id: string
  date: string
  title: string
  cancelled: boolean
  invitees: any
}
export type Decision = {
  key: string
  outcome: string
  period: string
  task: number
}
export type Obligation = {
  key: string
  task: number
  period: string
  points: number
  reason: string
  blocked: boolean
  outcome?: string
}

/** A single pure projection drives preview, ledger reconciliation and analytics. */
export function projectScores(input: {
  entries: Entry[]
  meetings: Meeting[]
  decisions: Decision[]
  assessments: { period: string; scores: any }[]
  startDate: string
  today: string
  personnelId: string
}) {
  const {
    entries,
    meetings,
    decisions,
    assessments,
    startDate,
    today,
    personnelId,
  } = input
  const active = entries.filter((e) => !e.supersededAt)
  const approved = active.filter((e) => e.status === 'APPROVED')
  const pending = active.filter(
    (e) => e.status === 'PENDING' || e.status === 'SUBMITTED'
  )
  const totals: Record<string, number> = {},
    obligations: Obligation[] = []
  const add = (period: string, task: number, points: number) => {
    const k = `${period}/${task}`
    totals[k] = (totals[k] ?? 0) + points
  }
  const decide = (o: Obligation) => {
    const decision = decisions.find((d) => d.key === o.key)
    o.outcome = decision?.outcome
    obligations.push(o)
    // A new pending entry cannot itself erase a previously confirmed penalty.
    if (decision?.outcome === 'DEDUCT') add(o.period, o.task, o.points)
    return decision
  }
  const funds: Record<string, number> = {},
    board: Record<string, number> = {},
    weeks = new Set<string>()
  for (const e of approved) {
    const d = e.data
    switch (e.task) {
      case 1:
        add(e.period, 1, d.online ? d.members : 0)
        break
      case 2:
        if (!meetings.find((m) => m.id === d.meetingId)?.cancelled)
          add(
            e.period,
            2,
            d.attendance === 'ATTENDED'
              ? 1
              : d.attendance === 'ABSENT' &&
                  !decisions.some(
                    (x) =>
                      x.key === `meeting:${d.meetingId}` &&
                      x.outcome === 'EXEMPT'
                  )
                ? -5
                : 0
          )
        break
      case 3:
      case 4: {
        const points = deadlinePoints(dueDate(e.task, e.period), e.submittedAt)
        const exempt = decisions.some(
          (x) =>
            x.key === `report:${e.task}:${e.period}` && x.outcome === 'EXEMPT'
        )
        add(e.period, e.task, exempt && points < 0 ? 0 : points)
        break
      }
      case 5:
      case 6: {
        const k = `${e.period}/${e.task}`
        funds[k] =
          (funds[k] ?? 0) + (e.task === 5 && !d.credited ? 0 : d.amount)
        break
      }
      case 7:
        board[e.period] = (board[e.period] ?? 0) + 1
        break
      case 8:
        add(e.period, 8, d.representatives)
        break
      case 9:
        weeks.add(weekEnd(d.date))
        break
      case 11:
        add(e.period, 11, 1)
        break
      case 12:
      case 13:
      case 14:
        add(e.period, e.task, { 12: 15, 13: 50, 14: 75 }[e.task]!)
        break
    }
  }
  for (const [k, amount] of Object.entries(funds))
    totals[k] = Math.floor(amount / (k.endsWith('/5') ? 1000 : 5000))
  for (const [p, count] of Object.entries(board)) add(p, 7, Math.min(5, count))
  for (const week of weeks) add(week.slice(0, 7), 9, 1)
  for (const meeting of meetings.filter(
    (m) =>
      !m.cancelled &&
      m.date >= startDate &&
      m.date.slice(0, 7) < today.slice(0, 7) &&
      (m.invitees as string[]).includes(personnelId)
  )) {
    if (!approved.some((e) => e.task === 2 && e.data.meetingId === meeting.id))
      decide({
        key: `meeting:${meeting.id}`,
        task: 2,
        period: meeting.date.slice(0, 7),
        points: -5,
        reason: `Unmarked / unapproved attendance: ${meeting.title}`,
        blocked: pending.some(
          (e) => e.task === 2 && e.data.meetingId === meeting.id
        ),
      })
  }
  // Bound enrollment history to valid 20xx periods; never manufacture pre-enrollment duties.
  for (
    let p = startDate.slice(0, 7);
    p <= monthShift(today.slice(0, 7), 1);
    p = monthShift(p, 1)
  ) {
    for (const task of [3, 4]) {
      const due = dueDate(task, p)
      if (
        due < startDate ||
        daysBetween(due, today) <= 5 ||
        approved.some((e) => e.task === task && e.period === p)
      )
        continue
      decide({
        key: `report:${task}:${p}`,
        task,
        period: p,
        points: -5,
        reason: `Missing ${task === 3 ? 'program plan' : 'progress report'} for ${p} (due ${due})`,
        blocked: pending.some((e) => e.task === task && e.period === p),
      })
    }
    if (p < today.slice(0, 7)) {
      const missing = requiredWeeks(p, startDate).filter((w) => !weeks.has(w))
      if (missing.length)
        decide({
          key: `weeks:${p}`,
          task: 9,
          period: p,
          points: -5,
          reason: `Missing Secretariat weeks ending ${missing.join(', ')}`,
          blocked: missing.some((w) =>
            pending.some((e) => e.task === 9 && weekEnd(e.data.date) === w)
          ),
        })
    }
  }
  for (const advance of approved.filter(
    (e) => e.task === 10 && e.data.phase === 'ADVANCE'
  )) {
    const settlement = approved.find(
      (e) =>
        e.task === 10 &&
        e.data.phase === 'SETTLEMENT' &&
        e.data.advanceId === advance.id
    )
    let priorDeductions = 0,
      exemptDays = 0
    for (
      let p = advance.data.dueDate.slice(0, 7);
      p < today.slice(0, 7);
      p = monthShift(p, 1)
    ) {
      if (settlement && p >= settlement.period) break
      const lastDay = addDays(monthShift(p, 1) + '-01', -1)
      const from =
        advance.data.dueDate > p + '-01'
          ? advance.data.dueDate
          : addDays(p + '-01', -1)
      const days = Math.max(0, daysBetween(from, lastDay))
      if (!days) continue
      const o: Obligation = {
        key: `advance:${advance.id}:${p}`,
        task: 10,
        period: p,
        points: -days,
        reason: `Unsettled advance ${advance.data.reference}: ${days} overdue days in ${p}`,
        blocked: pending.some(
          (e) => e.task === 10 && e.data.advanceId === advance.id
        ),
      }
      const decision = decide(o)
      if (decision?.outcome === 'DEDUCT') priorDeductions += days
      if (decision?.outcome === 'EXEMPT') exemptDays += days
    }
    if (settlement) {
      const late = Math.max(
        0,
        daysBetween(advance.data.dueDate, settlement.data.settlementDate)
      )
      add(
        settlement.period,
        10,
        (late ? -Math.max(0, late - exemptDays) : 2) + priorDeductions
      )
    }
  }
  for (const a of assessments)
    add(
      a.period,
      15,
      CRITERIA.reduce((sum, c) => sum + (a.scores[c.key] ?? 0), 0)
    )
  return { totals, obligations }
}
