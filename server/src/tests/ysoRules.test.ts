import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  deadlinePoints,
  dueDate,
  weekEnd,
  requiredWeeks,
  projectScores,
  validateData,
  validDate,
  entryKey,
  Entry,
} from '../helpers/ysoRules'

let sequence = 0
const entry = (
  task: number,
  data: any = {},
  extra: Partial<Entry> = {}
): Entry => ({
  id: `e${++sequence}`,
  task,
  data,
  period: '2026-09',
  status: 'APPROVED',
  submittedAt: '2026-09-01T00:00:00Z',
  supersededAt: null,
  ...extra,
})
const score = (
  entries: Entry[],
  extra: Partial<Parameters<typeof projectScores>[0]> = {}
) =>
  projectScores({
    entries,
    meetings: [],
    decisions: [],
    assessments: [],
    startDate: '2026-09-01',
    today: '2026-10-15',
    personnelId: 'yso',
    ...extra,
  })

test('only online-completed NISCO registrations earn points', () => {
  assert.equal(
    score([
      entry(1, { members: 10, online: false }),
      entry(1, { members: 3, online: true }),
    ]).totals['2026-09/1'],
    3
  )
})
test('pending, submitted, rejected and superseded entries do not score', () => {
  for (const status of ['PENDING', 'SUBMITTED', 'REJECTED'])
    assert.equal(
      score([entry(1, { members: 9, online: true }, { status })]).totals[
        '2026-09/1'
      ],
      undefined
    )
  assert.equal(
    score([
      entry(1, { members: 9, online: true }, { supersededAt: new Date() }),
    ]).totals['2026-09/1'],
    undefined
  )
})
test('plan and progress-report periods have distinct deadlines', () => {
  assert.equal(dueDate(3, '2026-10'), '2026-09-25')
  assert.equal(dueDate(4, '2026-09'), '2026-10-05')
  assert.equal(dueDate(3, '2026-01'), '2025-12-25')
})
test('deadline is inclusive through 23:59:59 Sri Lanka time', () => {
  assert.equal(deadlinePoints('2026-09-25', '2026-09-25T18:29:59.999Z'), 1)
  assert.equal(deadlinePoints('2026-09-25', '2026-09-25T18:30:00.000Z'), -1)
  assert.equal(deadlinePoints('2026-09-25', '2026-09-30T12:00:00Z'), -5)
  assert.equal(deadlinePoints('2026-09-25', '2026-10-15T00:00:00Z'), -5)
})
test('money is aggregated before flooring, and uncredited funds are excluded', () => {
  const r = score([
    entry(5, { amount: 500, credited: true }),
    entry(5, { amount: 500, credited: true }),
    entry(5, { amount: 5000, credited: false }),
    entry(6, { amount: 2500 }),
    entry(6, { amount: 2500 }),
  ])
  assert.equal(r.totals['2026-09/5'], 1)
  assert.equal(r.totals['2026-09/6'], 1)
})
test('regional meetings cap at five while all six records remain valid', () => {
  const entries = Array.from({ length: 6 }, () => entry(7))
  assert.equal(score(entries).totals['2026-09/7'], 5)
  assert.equal(entries.length, 6)
  entries[0].status = 'REJECTED'
  assert.equal(score(entries).totals['2026-09/7'], 5)
})
test('multiple different programs on the same day each earn a point', () => {
  assert.equal(
    score([
      entry(11, { date: '2026-09-10', reference: 'a' }),
      entry(11, { date: '2026-09-10', reference: 'b' }),
    ]).totals['2026-09/11'],
    2
  )
  assert.notEqual(
    entryKey(11, { date: '2026-09-10', program: 'a' }),
    entryKey(11, { date: '2026-09-10', program: 'b' })
  )
})
test('same program is case-insensitive and cannot produce duplicate daily credit', () => {
  assert.equal(
    entryKey(11, { date: '2026-09-10', program: ' Youth  Club ' }),
    entryKey(11, { date: '2026-09-10', program: 'youth club' })
  )
})
test('a week belongs to its Sunday month including year boundaries', () => {
  assert.equal(weekEnd('2026-09-28'), '2026-10-04')
  assert.equal(weekEnd('2026-09-27'), '2026-09-27')
  assert.equal(weekEnd('2026-12-31'), '2027-01-03')
})
test('full weeks only are required after joining, including five-Sunday months', () => {
  assert.deepEqual(requiredWeeks('2026-09', '2026-09-01'), [
    '2026-09-13',
    '2026-09-20',
    '2026-09-27',
  ])
  assert.equal(requiredWeeks('2026-11', '2026-01-01').length, 5)
})
test('four visits in one week count once and do not satisfy four weeks', () => {
  const r = score(
    ['07', '08', '09', '10'].map((day) => entry(9, { date: `2026-09-${day}` }))
  )
  assert.equal(r.totals['2026-09/9'], 1)
  assert.match(
    r.obligations.find((o) => o.task === 9)!.reason,
    /2026-09-20, 2026-09-27/
  )
})
test('missed weeks produce one monthly deduction only after AD confirmation', () => {
  const r = score([], {
    decisions: [
      { key: 'weeks:2026-09', period: '2026-09', task: 9, outcome: 'DEDUCT' },
    ],
  })
  assert.equal(r.totals['2026-09/9'], -5)
  assert.equal(score([]).totals['2026-09/9'], undefined)
})
test('pending evidence blocks new penalty decisions without wiping existing deductions', () => {
  const e = entry(9, { date: '2026-09-07' }, { status: 'PENDING' })
  assert.equal(score([e]).obligations.find((o) => o.task === 9)!.blocked, true)
  assert.equal(
    score([e], {
      decisions: [
        { key: 'weeks:2026-09', period: '2026-09', task: 9, outcome: 'DEDUCT' },
      ],
    }).totals['2026-09/9'],
    -5
  )
})
test('unmarked meeting becomes an absent assessment only after month-end', () => {
  const meeting = {
    id: 'm1',
    title: 'District',
    date: '2026-09-15',
    invitees: ['yso'],
    cancelled: false,
  }
  assert.equal(
    score([], { meetings: [meeting], today: '2026-09-30' }).obligations.some(
      (o) => o.task === 2
    ),
    false
  )
  const r = score([], {
    meetings: [meeting],
    decisions: [
      { key: 'meeting:m1', period: '2026-09', task: 2, outcome: 'DEDUCT' },
    ],
  })
  assert.equal(r.totals['2026-09/2'], -5)
})
test('attendance approval replaces missing-meeting penalty rather than adding to it', () => {
  const r = score([entry(2, { meetingId: 'm1', attendance: 'ATTENDED' })], {
    meetings: [
      {
        id: 'm1',
        title: 'District',
        date: '2026-09-15',
        invitees: ['yso'],
        cancelled: false,
      },
    ],
    decisions: [
      { key: 'meeting:m1', period: '2026-09', task: 2, outcome: 'DEDUCT' },
    ],
  })
  assert.equal(r.totals['2026-09/2'], 1)
})
test('cancelled meetings remove attendance awards and absence penalties', () => {
  assert.equal(
    score([entry(2, { meetingId: 'm1', attendance: 'ATTENDED' })], {
      meetings: [
        {
          id: 'm1',
          title: 'District',
          date: '2026-09-15',
          invitees: ['yso'],
          cancelled: true,
        },
      ],
    }).totals['2026-09/2'],
    undefined
  )
})
test('approved leave is zero and approved absence is minus five', () => {
  assert.equal(
    score([entry(2, { meetingId: 'm1', attendance: 'APPROVED_LEAVE' })]).totals[
      '2026-09/2'
    ],
    0
  )
  assert.equal(
    score([entry(2, { meetingId: 'm1', attendance: 'ABSENT' })]).totals[
      '2026-09/2'
    ],
    -5
  )
})
test('late report approval replaces missing penalty, not double charges', () => {
  const r = score([entry(4, {}, { submittedAt: '2026-10-07T00:00:00Z' })], {
    decisions: [
      {
        key: 'report:4:2026-09',
        task: 4,
        period: '2026-09',
        outcome: 'DEDUCT',
      },
    ],
  })
  assert.equal(r.totals['2026-09/4'], -2)
})
test('pre-enrollment monthly plan never generates a missing penalty', () => {
  assert.equal(
    score([]).obligations.some((o) => o.task === 3 && o.period === '2026-09'),
    false
  )
})
test('qualification levels award 15, 50, 75 after approval', () => {
  const r = score([entry(12), entry(13), entry(14)])
  assert.equal(r.totals['2026-09/12'], 15)
  assert.equal(r.totals['2026-09/13'], 50)
  assert.equal(r.totals['2026-09/14'], 75)
})
test('monthly subjective criteria sum to at most 25 after validation', () => {
  const r = score([], {
    assessments: [
      {
        period: '2026-09',
        scores: {
          volunteer: 10,
          district: 5,
          financial: 3,
          relations: 4,
          files: 3,
        },
      },
    ],
  })
  assert.equal(r.totals['2026-09/15'], 25)
})
test('advance registration itself awards zero, timely settlement awards two', () => {
  const a = entry(10, {
    phase: 'ADVANCE',
    reference: 'A',
    date: '2026-09-01',
    dueDate: '2026-09-10',
  })
  assert.equal(
    score([a], { today: '2026-09-09' }).totals['2026-09/10'],
    undefined
  )
  assert.equal(
    score([
      a,
      entry(10, {
        phase: 'SETTLEMENT',
        advanceId: a.id,
        settlementDate: '2026-09-10',
      }),
    ]).totals['2026-09/10'],
    2
  )
})
test('late settlement has no cap and reconciles already assessed overdue days', () => {
  const a = entry(10, {
    phase: 'ADVANCE',
    reference: 'A',
    date: '2026-09-01',
    dueDate: '2026-09-10',
  })
  const r = score(
    [
      a,
      entry(
        10,
        { phase: 'SETTLEMENT', advanceId: a.id, settlementDate: '2026-10-05' },
        { period: '2026-10' }
      ),
    ],
    {
      decisions: [
        {
          key: `advance:${a.id}:2026-09`,
          period: '2026-09',
          task: 10,
          outcome: 'DEDUCT',
        },
      ],
    }
  )
  assert.equal(r.totals['2026-09/10'], -20)
  assert.equal(r.totals['2026-10/10'], -5)
})
test('unsettled advances accrue new monthly penalties without double counting days', () => {
  const a = entry(10, {
    phase: 'ADVANCE',
    reference: 'A',
    date: '2026-09-01',
    dueDate: '2026-09-10',
  })
  const obligations = score([a], { today: '2026-11-01' }).obligations.filter(
    (o) => o.task === 10
  )
  assert.deepEqual(
    obligations.map((o) => o.points),
    [-20, -31]
  )
})
test('strict validation rejects impossible dates, negative amounts and string booleans', () => {
  assert.equal(validDate('2026-02-30'), false)
  assert.equal(validDate('2028-02-29'), true)
  assert.throws(() =>
    validateData(
      1,
      { date: '2026-09-01', reference: 'x', members: 2, online: 'true' },
      '2026-10-01'
    )
  )
  assert.throws(() =>
    validateData(
      5,
      {
        date: '2026-09-01',
        reference: 'x',
        amount: -1,
        sponsor: 'x',
        credited: true,
      },
      '2026-10-01'
    )
  )
  assert.throws(() =>
    validateData(
      12,
      { date: '2026-09-01', qualification: 'x', institution: 'x', hours: 1199 },
      '2026-10-01'
    )
  )
})

test('exempted overdue advance days do not reappear as deductions on settlement', () => {
  const a = entry(10, {
    phase: 'ADVANCE',
    reference: 'A',
    date: '2026-09-01',
    dueDate: '2026-09-10',
  })
  const r = score(
    [
      a,
      entry(
        10,
        { phase: 'SETTLEMENT', advanceId: a.id, settlementDate: '2026-10-05' },
        { period: '2026-10' }
      ),
    ],
    {
      decisions: [
        {
          key: `advance:${a.id}:2026-09`,
          period: '2026-09',
          task: 10,
          outcome: 'EXEMPT',
        },
      ],
    }
  )
  assert.equal(r.totals['2026-09/10'], undefined)
  assert.equal(r.totals['2026-10/10'], -5)
})
test('approved late report retains a recorded exemption', () => {
  const r = score([entry(4, {}, { submittedAt: '2026-10-07T00:00:00Z' })], {
    decisions: [
      {
        key: 'report:4:2026-09',
        task: 4,
        period: '2026-09',
        outcome: 'EXEMPT',
      },
    ],
  })
  assert.equal(r.totals['2026-09/4'], 0)
})

test('next-month plan becomes missing immediately after the five-day late window', () => {
  const r = score([], { today: '2026-10-31' })
  assert.ok(r.obligations.some(o => o.task === 3 && o.period === '2026-11'))
})
