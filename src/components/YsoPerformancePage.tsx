import React, { useEffect, useMemo, useState } from 'react'
import {
  ysoApi,
  YsoDashboard,
  YsoEntry,
  YsoTask,
  YsoObligation,
  YsoPerson,
  YsoMeeting,
} from '../services/ysoService'
import type { AuthUser } from '../types'
import DatePicker from './DatePicker'
import Select from './Select'

const panel = 'bg-white rounded-2xl border border-slate-200 p-5 shadow-sm'
const input =
  'w-full min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-base sm:text-sm bg-white focus:ring-2 focus:ring-teal-500'
const primary =
  'min-h-11 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50'
const secondary =
  'min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50'
const signed = (n: number) => (n > 0 ? `+${n}` : String(n))
const pretty = (value: string) => value.replace(/_/g, ' ').toLowerCase()
const when = (value: string) =>
  new Date(value).toLocaleString('en-GB', {
    timeZone: 'Asia/Colombo',
    dateStyle: 'medium',
    timeStyle: 'short',
  })
const pending = (entry: YsoEntry) =>
  !entry.supersededAt && ['SUBMITTED', 'PENDING'].includes(entry.status)
const addDays = (date: string, days: number) =>
  new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000)
    .toISOString()
    .slice(0, 10)
const weekEnd = (date: string) =>
  addDays(date, (7 - new Date(date + 'T00:00:00Z').getUTCDay()) % 7)
function weeklyProgress(dashboard: YsoDashboard, period: string) {
  const start = dashboard.people[0]?.startDate
  const expected: string[] = []
  if (start)
    for (
      let day = period + '-01';
      day.slice(0, 7) === period;
      day = addDays(day, 1)
    ) {
      if (
        new Date(day + 'T00:00:00Z').getUTCDay() === 0 &&
        addDays(day, -6) >= start
      )
        expected.push(day)
    }
  const covered = new Set(
    dashboard.entries
      .filter((e) => e.task === 9 && e.status === 'APPROVED' && !e.supersededAt)
      .map((e) => weekEnd(e.data.date))
  )
  return {
    expected: expected.length,
    covered: expected.filter((w) => covered.has(w)).length,
  }
}
function Status({ value }: { value: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${value === 'APPROVED' ? 'bg-emerald-50 text-emerald-800' : value === 'REJECTED' ? 'bg-rose-50 text-rose-800' : 'bg-amber-50 text-amber-900'}`}
    >
      {pretty(value)}
    </span>
  )
}
function Modal({
  title,
  children,
  onClose,
}: {
  title: string
  children: React.ReactNode
  onClose: () => void
}) {
  const headingId = React.useId()
  const ref = React.useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('[data-system-picker]')) return
      if (e.key === 'Escape') onClose()
      if (e.key !== 'Tab') return
      const nodes = Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'
        ) ?? []
      )
      if (!nodes.length) return
      if (
        e.shiftKey &&
        (document.activeElement === nodes[0] ||
          document.activeElement === ref.current)
      ) {
        e.preventDefault()
        nodes[nodes.length - 1].focus()
      } else if (
        !e.shiftKey &&
        (document.activeElement === nodes[nodes.length - 1] ||
          document.activeElement === ref.current)
      ) {
        e.preventDefault()
        nodes[0].focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus()
    }
  }, [])
  return (
    <div
      className="fixed inset-0 z-[100] bg-slate-950/50 flex items-center justify-center p-3"
      role="presentation"
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90dvh] overflow-y-auto overscroll-contain p-4 sm:p-6"
      >
        <div className="flex justify-between items-start gap-3 mb-5">
          <h2 id={headingId} className="text-xl font-bold text-slate-900">
            {title}
          </h2>
          <button
            onClick={onClose}
            className={secondary}
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
function EntryForm({
  task,
  dashboard,
  previous,
  onClose,
  onSave,
}: {
  task: YsoTask
  dashboard: YsoDashboard
  previous?: YsoEntry
  onClose: () => void
  onSave: () => Promise<void>
}) {
  const [values, setValues] = useState<Record<string, any>>(() =>
    previous
      ? { ...previous.data }
      : Object.fromEntries(
          task.fields.map((f) => [
            f.key,
            f.type === 'checkbox'
              ? false
              : f.type === 'month'
                ? dashboard.today.slice(0, 7)
                : f.type === 'date'
                  ? dashboard.today
                  : (f.options?.[0] ?? ''),
          ])
        )
  )
  const [file, setFile] = useState<File | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const set = (key: string, value: any) =>
    setValues((old) => ({ ...old, [key]: value }))
  const advances = dashboard.entries.filter(
    (e) =>
      e.task === 10 &&
      e.data.phase === 'ADVANCE' &&
      e.status === 'APPROVED' &&
      !e.supersededAt
  )
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      for (const field of task.fields.filter(
        (f) =>
          task.id !== 10 ||
          (values.phase === 'SETTLEMENT'
            ? !['reference', 'date', 'dueDate'].includes(f.key)
            : !['advanceId', 'settlementDate'].includes(f.key))
      )) {
        if (
          ['date', 'month', 'select'].includes(field.type) &&
          !values[field.key]
        )
          throw new Error(`Choose ${field.label.toLowerCase()}.`)
      }
      let attachment
      if (task.id >= 12) {
        if (!file || file.size > 1048576)
          throw new Error('Choose a PDF, PNG or JPEG certificate up to 1 MB.')
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result).split(',')[1])
          reader.onerror = () => reject(new Error('Cannot read certificate'))
          reader.readAsDataURL(file)
        })
        attachment = { name: file.name, base64 }
      }
      await ysoApi.submit({
        task: task.id,
        data: values,
        previousId: previous?.id,
        attachment,
      })
      await onSave()
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      title={`Task ${String(task.id).padStart(2, '0')} · ${task.title}`}
      onClose={onClose}
    >
      <p className="rounded-lg bg-teal-50 text-teal-900 p-3 text-sm mb-5">
        {task.rule}
      </p>
      {previous && (
        <p className="text-sm text-amber-800 mb-4">
          This creates a new submission version and timestamp. Existing approved
          points stay in place until the AD approves the correction. Keep the
          activity reference unchanged.
        </p>
      )}
      <form onSubmit={save} className="space-y-4">
        {task.fields
          .filter(
            (f) =>
              task.id !== 10 ||
              (values.phase === 'SETTLEMENT'
                ? !['reference', 'date', 'dueDate'].includes(f.key)
                : !['advanceId', 'settlementDate'].includes(f.key))
          )
          .map((f) => {
            let options = (f.options ?? []).map((value) => ({
              value,
              label: pretty(value),
            }))
            if (f.key === 'meetingId')
              options = dashboard.meetings
                .filter((m) => !m.cancelled && m.date <= dashboard.today)
                .map((m) => ({ value: m.id, label: `${m.date} · ${m.title}` }))
            if (f.key === 'advanceId')
              options = advances.map((a) => ({
                value: a.id,
                label: `${a.data.reference} · due ${a.data.dueDate}`,
              }))
            return (
              <label
                key={f.key}
                className="block text-sm font-medium text-slate-700"
              >
                {f.type !== 'checkbox' && (
                  <span className="block mb-1">{f.label}</span>
                )}
                {f.type === 'checkbox' ? (
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!!values[f.key]}
                      onChange={(e) => set(f.key, e.target.checked)}
                      className="h-4 w-4"
                    />
                    {f.label}
                  </span>
                ) : f.type === 'select' ? (
                  <Select
                    ariaLabel={f.label}
                    className="[&>button]:min-h-11"
                    value={values[f.key] ?? ''}
                    onChange={(value) => set(f.key, value)}
                    options={options}
                    placeholder="Choose…"
                  />
                ) : f.type === 'date' || f.type === 'month' ? (
                  <DatePicker
                    ariaLabel={f.label}
                    className="[&>button]:min-h-11"
                    compact
                    mode={f.type}
                    value={values[f.key] ?? ''}
                    onChange={(value) => set(f.key, value)}
                    minDate={f.type === 'month' ? '2000-01-01' : undefined}
                    maxDate={
                      f.type === 'month'
                        ? '2099-12-31'
                        : f.key !== 'dueDate'
                          ? dashboard.today
                          : undefined
                    }
                  />
                ) : f.type === 'textarea' ? (
                  <textarea
                    className={input}
                    required
                    rows={5}
                    maxLength={10000}
                    value={values[f.key] ?? ''}
                    onChange={(e) => set(f.key, e.target.value)}
                  />
                ) : (
                  <input
                    className={input}
                    type={f.type}
                    required
                    min={f.min}
                    max={f.max}
                    maxLength={300}
                    step={f.type === 'number' ? 1 : undefined}
                    value={values[f.key] ?? ''}
                    onChange={(e) =>
                      set(
                        f.key,
                        f.type === 'number'
                          ? e.target.value === ''
                            ? ''
                            : Number(e.target.value)
                          : e.target.value
                      )
                    }
                  />
                )}
              </label>
            )
          })}
        {task.id >= 12 && (
          <label className="block text-sm font-medium">
            Certificate (PDF, PNG or JPEG; maximum 1 MB)
            <input
              className="block mt-2 text-sm"
              type="file"
              required
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
        )}
        <p className="text-xs text-slate-500">
          Submission time is recorded by the server. Points remain zero until AD
          approval. Dates use Sri Lanka time.
        </p>
        {error && (
          <p role="alert" className="text-rose-700 text-sm">
            {error}
          </p>
        )}
        <button className={primary} disabled={busy}>
          {busy
            ? 'Submitting…'
            : previous
              ? 'Submit revised entry'
              : 'Submit for AD approval'}
        </button>
      </form>
    </Modal>
  )
}
function DecisionDialog({
  title,
  description,
  actionLabel,
  required = true,
  onSave,
  onClose,
}: {
  title: string
  description: string
  actionLabel: string
  required?: boolean
  onSave: (reason: string) => Promise<void>
  onClose: () => void
}) {
  const [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  return (
    <Modal title={title} onClose={onClose}>
      <p className="text-sm text-slate-600 mb-4">{description}</p>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          try {
            await onSave(reason)
            onClose()
          } catch (e) {
            setError((e as Error).message)
          } finally {
            setBusy(false)
          }
        }}
      >
        <label className="block text-sm">
          Reason / feedback {required ? '(required)' : '(optional)'}
          <textarea
            className={input + ' mt-1'}
            value={reason}
            required={required}
            maxLength={2000}
            rows={3}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="text-rose-700">
            {error}
          </p>
        )}
        <button className={primary} disabled={busy}>
          {busy ? 'Saving…' : actionLabel}
        </button>
      </form>
    </Modal>
  )
}
function AssessmentForm({
  person,
  period,
  dashboard,
  onClose,
  onSave,
}: {
  person: YsoPerson
  period: string
  dashboard: YsoDashboard
  onClose: () => void
  onSave: () => Promise<void>
}) {
  const existing = dashboard.assessments.find(
    (a) => a.personnelId === person.id && a.period === period
  )
  const [scores, setScores] = useState<Record<string, number | ''>>(
    existing?.scores ??
      Object.fromEntries(dashboard.criteria.map((c) => [c.key, 0]))
  )
  const [rationale, setRationale] = useState(existing?.rationale ?? ''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  return (
    <Modal title={`Monthly evaluation · ${person.name}`} onClose={onClose}>
      <p className="text-sm text-slate-500 mb-4">
        {period} ·{' '}
        {existing ? 'Revision of existing evaluation' : 'New evaluation'}
      </p>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          try {
            await ysoApi.assess(person.id, { period, scores, rationale })
            await onSave()
            onClose()
          } catch (e) {
            setError((e as Error).message)
          } finally {
            setBusy(false)
          }
        }}
      >
        {dashboard.criteria.map((c) => (
          <label
            className="flex items-center justify-between gap-4 text-sm"
            key={c.key}
          >
            {c.label} (maximum {c.max})
            <input
              className={input + ' !w-24'}
              type="number"
              required
              min={0}
              max={c.max}
              step={1}
              value={scores[c.key]}
              onChange={(e) =>
                setScores({
                  ...scores,
                  [c.key]: e.target.value === '' ? '' : Number(e.target.value),
                })
              }
            />
          </label>
        ))}
        <p className="font-bold">
          Total:{' '}
          {Object.values(scores).reduce<number>((a, b) => a + Number(b), 0)} /
          25
        </p>
        <label className="block text-sm">
          Assessment rationale
          <textarea
            className={input + ' mt-1'}
            required
            maxLength={2000}
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            rows={3}
          />
        </label>
        {error && (
          <p className="text-rose-700" role="alert">
            {error}
          </p>
        )}
        <button disabled={busy} className={primary}>
          Save monthly evaluation
        </button>
      </form>
    </Modal>
  )
}
function MeetingForm({
  dashboard,
  onClose,
  onSave,
}: {
  dashboard: YsoDashboard
  onClose: () => void
  onSave: () => Promise<void>
}) {
  const people = dashboard.people.filter(
    (p) => p.active && p.startDate && p.managerValid
  )
  const [values, setValues] = useState({
    title: '',
    date: dashboard.today,
    location: '',
    invitees: people.map((p) => p.id),
  })
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  return (
    <Modal title="Schedule district officer meeting" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          try {
            if (!values.date) throw new Error('Choose a meeting date.')
            await ysoApi.meeting(values)
            await onSave()
            onClose()
          } catch (e) {
            setError((e as Error).message)
          } finally {
            setBusy(false)
          }
        }}
      >
        {(['title', 'date', 'location'] as const).map((key) => (
          <label className="block text-sm capitalize" key={key}>
            {key}
            {key === 'date' ? (
              <DatePicker
                compact
                ariaLabel="Meeting date"
                className="mt-1 [&>button]:min-h-11"
                value={values.date}
                minDate={dashboard.today}
                onChange={(date) => setValues({ ...values, date })}
              />
            ) : (
              <input
                className={input + ' mt-1'}
                required
                type="text"
                maxLength={key === 'title' ? 200 : 300}
                value={values[key]}
                onChange={(e) =>
                  setValues({ ...values, [key]: e.target.value })
                }
              />
            )}
          </label>
        ))}
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold mb-2">Invite YSOs</legend>
          {people.map((p) => (
            <label className="flex gap-2 items-center text-sm" key={p.id}>
              <input
                type="checkbox"
                checked={values.invitees.includes(p.id)}
                onChange={(e) =>
                  setValues({
                    ...values,
                    invitees: e.target.checked
                      ? [...values.invitees, p.id]
                      : values.invitees.filter((id) => id !== p.id),
                  })
                }
              />
              {p.name}
            </label>
          ))}
          {!people.length && (
            <p className="text-sm">Activate reporting for your YSOs first.</p>
          )}
        </fieldset>
        {error && (
          <p role="alert" className="text-rose-700">
            {error}
          </p>
        )}
        <button className={primary} disabled={busy || !values.invitees.length}>
          Schedule meeting
        </button>
      </form>
    </Modal>
  )
}
function Analytics({
  dashboard,
  people,
  period,
  adId,
}: {
  dashboard: YsoDashboard
  people: YsoPerson[]
  period: string
  adId?: string
}) {
  const ids = people.map((p) => p.id),
    ledger = dashboard.ledger.filter(
      (l) => ids.includes(l.personnelId) && (!adId || l.adId === adId)
    )
  const selected = ledger.filter((l) => l.period === period),
    entries = dashboard.entries.filter(
      (e) =>
        ids.includes(e.personnelId) &&
        e.period === period &&
        !e.supersededAt &&
        (!adId || e.assignedAdId === adId)
    )
  const ranking = people
    .map((p) => ({
      ...p,
      total: selected
        .filter((l) => l.personnelId === p.id)
        .reduce((a, b) => a + b.points, 0),
    }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
  const months = Array.from({ length: 6 }, (_, i) => {
    const [y, m] = period.split('-').map(Number)
    return new Date(Date.UTC(y, m - 6 + i, 1)).toISOString().slice(0, 7)
  })
  const trend = months.map((p) =>
      ledger.filter((l) => l.period === p).reduce((a, b) => a + b.points, 0)
    ),
    min = Math.min(0, ...trend),
    max = Math.max(1, ...trend)
  const y = (v: number) => 140 - ((v - min) / (max - min)) * 115
  const slices = ['APPROVED', 'PENDING', 'REJECTED'].map((status, i) => ({
    status,
    value: entries.filter(
      (e) =>
        e.status === status ||
        (status === 'PENDING' && e.status === 'SUBMITTED')
    ).length,
    color: ['#0f766e', '#d97706', '#e11d48'][i],
  }))
  const count = slices.reduce((a, b) => a + b.value, 0)
  let angle = 0
  const gradient = slices
    .map((s) => {
      const begin = angle
      angle += count ? (s.value / count) * 360 : 0
      return `${s.color} ${begin}deg ${angle}deg`
    })
    .join(', ')
  return (
    <div className="space-y-5">
      <div className="grid lg:grid-cols-2 gap-5">
        <section className={panel}>
          <h3 className="font-bold mb-5">Monthly score trend</h3>
          <svg
            viewBox="0 0 520 180"
            role="img"
            aria-label={`Monthly totals: ${months.map((m, i) => `${m}: ${trend[i]}`).join(', ')}`}
            className="w-full"
          >
            <line x1="25" x2="495" y1={y(0)} y2={y(0)} stroke="#cbd5e1" />
            <polyline
              points={trend.map((v, i) => `${30 + i * 92},${y(v)}`).join(' ')}
              fill="none"
              stroke="#0f766e"
              strokeWidth="3"
            />
            {trend.map((v, i) => (
              <g key={months[i]}>
                <circle cx={30 + i * 92} cy={y(v)} r="4" fill="#0f766e" />
                <text
                  x={30 + i * 92}
                  y={y(v) - 9}
                  textAnchor="middle"
                  fontSize="12"
                >
                  {v}
                </text>
                <text x={30 + i * 92} y="170" textAnchor="middle" fontSize="11">
                  {months[i]}
                </text>
              </g>
            ))}
          </svg>
        </section>
        <section className={panel}>
          <h3 className="font-bold mb-5">Submission engagement</h3>
          <div className="flex items-center gap-8 flex-wrap">
            <div
              role="img"
              aria-label={slices
                .map((s) => `${pretty(s.status)}: ${s.value}`)
                .join(', ')}
              className="w-32 h-32 rounded-full"
              style={{
                background: count ? `conic-gradient(${gradient})` : '#e2e8f0',
              }}
            />
            <div className="space-y-3">
              {slices.map((s) => (
                <div className="flex items-center gap-2 text-sm" key={s.status}>
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ background: s.color }}
                  />
                  {pretty(s.status)} <strong>{s.value}</strong>
                </div>
              ))}
              {!count && (
                <p className="text-sm text-slate-500">
                  No submissions this month
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
      <section className={panel}>
        <h3 className="font-bold mb-4">Comparative YSO leaderboard</h3>
        <p className="text-xs text-slate-500 mb-4">
          {period} · Approved awards and confirmed deductions. Qualification
          awards appear only in their credited month.
        </p>
        {ranking.map((p, i) => (
          <div
            className="grid grid-cols-[1.5rem_1fr_4rem] items-center gap-3 mb-3"
            key={p.id}
          >
            <span className="text-sm text-slate-400">{i + 1}</span>
            <div>
              <div className="text-sm mb-1">{p.name}</div>
              <div className="h-2 bg-slate-100 rounded">
                <div
                  className={`h-2 rounded ${p.total < 0 ? 'bg-rose-500' : 'bg-teal-600'}`}
                  style={{
                    width: `${(Math.abs(p.total) / Math.max(1, ...ranking.map((r) => Math.abs(r.total)))) * 100}%`,
                  }}
                />
              </div>
            </div>
            <strong className="text-right text-sm">{signed(p.total)}</strong>
          </div>
        ))}
        {!ranking.length && (
          <p className="text-sm text-slate-500">No YSOs in this scope.</p>
        )}
      </section>
      <section className={panel}>
        <h3 className="font-bold mb-4">Task-by-task points</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead>
              <tr>
                <th className="text-left p-2">YSO</th>
                {dashboard.tasks.map((t) => (
                  <th className="p-2" title={t.title} key={t.id}>
                    T{t.id}
                  </th>
                ))}
                <th className="p-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((p) => (
                <tr className="border-t" key={p.id}>
                  <th className="text-left p-2 whitespace-nowrap">{p.name}</th>
                  {dashboard.tasks.map((t) => (
                    <td className="p-2" key={t.id}>
                      {selected
                        .filter(
                          (l) => l.personnelId === p.id && l.task === t.id
                        )
                        .reduce((a, b) => a + b.points, 0)}
                    </td>
                  ))}
                  <td className="font-bold p-2">{p.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className={panel}>
        <h3 className="font-bold mb-1">AD evaluation distribution</h3>
        <p className="text-xs text-slate-500 mb-4">
          Compare criterion averages and the number evaluated. A missing
          evaluation is not a zero score.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr>
                <th className="p-2">Grading AD</th>
                <th className="p-2">Evaluated</th>
                {dashboard.criteria.map((c) => (
                  <th className="p-2" key={c.key}>
                    {c.label} / {c.max}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from(
                new Set(
                  dashboard.assessments
                    .filter(
                      (a) => a.period === period && ids.includes(a.personnelId)
                    )
                    .map((a) => a.adId)
                )
              ).map((ad) => {
                const assessments = dashboard.assessments.filter(
                  (a) =>
                    a.adId === ad &&
                    a.period === period &&
                    ids.includes(a.personnelId)
                )
                return (
                  <tr key={ad} className="border-t">
                    <td className="p-2">
                      {dashboard.ads.find((a) => a.id === ad)?.name ??
                        'Previous AD'}
                    </td>
                    <td className="p-2">{assessments.length}</td>
                    {dashboard.criteria.map((c) => (
                      <td className="p-2" key={c.key}>
                        {(
                          assessments.reduce(
                            (sum, a) => sum + a.scores[c.key],
                            0
                          ) / assessments.length
                        ).toFixed(1)}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

export default function YsoPerformancePage({ user }: { user: AuthUser }) {
  const [dashboard, setDashboard] = useState<YsoDashboard | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState(() =>
    new Date(Date.now() + 19800000).toISOString().slice(0, 7)
  )
  const [tab, setTab] = useState('monitor'),
    [selectedAd, setSelectedAd] = useState(''),
    [selectedPerson, setSelectedPerson] = useState(''),
    [selectedTask, setSelectedTask] = useState<number | null>(null)
  const [entryForm, setEntryForm] = useState<{
      task: YsoTask
      previous?: YsoEntry
    } | null>(null),
    [assessment, setAssessment] = useState<YsoPerson | null>(null),
    [meetingForm, setMeetingForm] = useState(false)
  const [decision, setDecision] = useState<{
    title: string
    description: string
    label: string
    required?: boolean
    save: (reason: string) => Promise<void>
  } | null>(null)
  const [notice, setNotice] = useState(''),
    [activation, setActivation] = useState<YsoPerson | null>(null),
    [activationDate, setActivationDate] = useState(''),
    [busy, setBusy] = useState(false)
  async function load() {
    const data = await ysoApi.dashboard()
    setDashboard(data)
    setError('')
    return data
  }
  useEffect(() => {
    let cancelled = false
    ysoApi
      .dashboard()
      .then((data) => {
        if (!cancelled) setDashboard(data)
      })
      .catch((e) => {
        if (!cancelled) setError(e.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user.actorId])
  const refresh = async () => {
    await load()
  }
  const mutate = async (
    operation: () => Promise<unknown>,
    message = 'Saved.'
  ) => {
    await operation()
    await refresh()
    setNotice(message)
  }
  const people = useMemo(
    () =>
      dashboard?.people.filter(
        (p) =>
          (!selectedAd ||
            p.adId === selectedAd ||
            (dashboard.role === 'DIRECTOR' &&
              dashboard.ledger.some(
                (l) =>
                  l.personnelId === p.id &&
                  l.adId === selectedAd &&
                  l.period === period
              ))) &&
          (!selectedPerson || p.id === selectedPerson)
      ) ?? [],
    [dashboard, selectedAd, selectedPerson, period]
  )
  if (loading)
    return (
      <div className={panel} role="status">
        Loading YSO performance…
      </div>
    )
  if (!dashboard)
    return (
      <div className={panel}>
        <p role="alert" className="text-rose-700">
          {error || 'Unable to load YSO performance.'}
        </p>
        <button
          className={secondary + ' mt-4'}
          onClick={() => {
            setLoading(true)
            load()
              .catch((e) => setError(e.message))
              .finally(() => setLoading(false))
          }}
        >
          Retry
        </button>
      </div>
    )
  const d = dashboard,
    isYso = d.role === 'YSO',
    isAd = d.role === 'AD',
    ids = people.map((p) => p.id)
  const scopedEntries = d.entries.filter((e) => ids.includes(e.personnelId)),
    queue = scopedEntries.filter(pending)
  const monthEntries = scopedEntries.filter(
    (e) => e.period === period && !e.supersededAt
  )
  const ledger = d.ledger.filter(
    (l) =>
      ids.includes(l.personnelId) &&
      l.period === period &&
      (!selectedAd || d.role !== 'DIRECTOR' || l.adId === selectedAd)
  )
  const total = ledger.reduce((a, b) => a + b.points, 0),
    qualifications = ledger
      .filter((l) => l.task >= 12 && l.task <= 14)
      .reduce((a, b) => a + b.points, 0),
    evaluation = ledger
      .filter((l) => l.task === 15)
      .reduce((a, b) => a + b.points, 0)
  const deductions = ledger
    .filter((l) => l.task < 12)
    .reduce<Record<number, number>>((acc, l) => {
      acc[l.task] = (acc[l.task] ?? 0) + l.points
      return acc
    }, {})
  const obligationQueue = d.obligations.filter((o) =>
    ids.includes(o.personnelId)
  )
  const weekly = weeklyProgress(d, period)
  const meetingState = (m: YsoMeeting) => {
    if (m.cancelled) return 'Cancelled — exempt'
    if (!isYso) return `${m.invitees.length} invited`
    const entries = d.entries.filter(
      (e) => e.task === 2 && e.data.meetingId === m.id && !e.supersededAt
    )
    if (entries.some(pending)) return 'Attendance awaiting AD approval'
    const approved = entries.find((e) => e.status === 'APPROVED')
    return approved
      ? pretty(approved.data.attendance)
      : m.date.slice(0, 7) < d.today.slice(0, 7)
        ? 'Absent — unmarked at month-end'
        : 'Attendance not marked yet'
  }
  const personName = (id: string) =>
    d.people.find((p) => p.id === id)?.name ?? 'YSO'
  const review = (entry: YsoEntry, action: 'APPROVE' | 'REJECT' | 'REVOKE') =>
    setDecision({
      title: `${pretty(action)} Task ${entry.task}`,
      description: `${personName(entry.personnelId)} · submitted ${when(entry.submittedAt)}. ${action === 'APPROVE' ? 'The original submission time determines deadline points.' : action === 'REVOKE' ? 'This reverses the approved award and keeps the audit history.' : 'The YSO can correct and resubmit.'}`,
      label:
        action === 'APPROVE'
          ? 'Approve entry'
          : action === 'REJECT'
            ? 'Reject entry'
            : 'Revoke approval',
      required: action === 'REVOKE',
      save: (reason) =>
        mutate(
          () => ysoApi.review(entry.id, action, reason),
          `Task ${entry.task} reviewed.`
        ),
    })
  const penalty = (o: YsoObligation, outcome: string) =>
    setDecision({
      title:
        outcome === 'DEDUCT'
          ? `Confirm ${o.points} point deduction`
          : 'Record exemption',
      description: `${personName(o.personnelId)} · ${o.reason}`,
      label: outcome === 'DEDUCT' ? 'Confirm deduction' : 'Save exemption',
      save: (reason) =>
        mutate(() =>
          ysoApi.penalty(o.personnelId, { key: o.key, outcome, reason })
        ),
    })
  const entryList = (entries: YsoEntry[], canReview: boolean) => (
    <div className="space-y-3">
      {entries.length === 0 && (
        <p className="text-sm text-slate-500 py-5">No entries to show.</p>
      )}
      {entries.map((e) => (
        <article className="rounded-xl border border-slate-200 p-4" key={e.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 className="font-semibold text-sm">
                {!isYso && `${personName(e.personnelId)} · `}Task {e.task}:{' '}
                {d.tasks.find((t) => t.id === e.task)?.title}
              </h4>
              <p className="text-xs text-slate-500 mt-1">
                {e.period} · Submitted {when(e.submittedAt)}
                {e.supersededAt ? ' · Superseded version' : ''}
              </p>
            </div>
            <Status value={e.status} />
          </div>
          <dl className="grid sm:grid-cols-2 gap-2 mt-3 text-sm">
            {Object.entries(e.data).map(([key, value]) => (
              <div key={key}>
                <dt className="text-xs text-slate-500">
                  {d.tasks
                    .find((t) => t.id === e.task)
                    ?.fields.find((f) => f.key === key)?.label ?? key}
                </dt>
                <dd className="whitespace-pre-wrap break-words">
                  {typeof value === 'boolean'
                    ? value
                      ? 'Yes'
                      : 'No'
                    : key === 'meetingId'
                      ? (d.meetings.find((m) => m.id === value)?.title ?? value)
                      : key === 'advanceId'
                        ? (d.entries.find((a) => a.id === value)?.data
                            .reference ?? value)
                        : String(value)}
                </dd>
              </div>
            ))}
          </dl>
          {e.feedback && (
            <p className="mt-3 bg-amber-50 p-2 rounded text-sm">
              AD feedback: {e.feedback}
            </p>
          )}
          <div className="flex flex-wrap gap-2 mt-3">
            {e.attachment && (
              <button
                className={secondary}
                onClick={() =>
                  ysoApi
                    .certificate(e.attachment!)
                    .catch((error) => setError(error.message))
                }
              >
                Download certificate
              </button>
            )}
            {canReview && pending(e) && (
              <>
                <button
                  className={primary}
                  onClick={() => review(e, 'APPROVE')}
                >
                  Approve
                </button>
                <button
                  className={secondary}
                  onClick={() => review(e, 'REJECT')}
                >
                  Reject
                </button>
              </>
            )}
            {canReview && e.status === 'APPROVED' && !e.supersededAt && (
              <button className={secondary} onClick={() => review(e, 'REVOKE')}>
                Revoke approval
              </button>
            )}
            {isYso &&
              !e.supersededAt &&
              ['REJECTED', 'APPROVED'].includes(e.status) && (
                <button
                  className={secondary}
                  onClick={() =>
                    setEntryForm({
                      task: d.tasks.find((t) => t.id === e.task)!,
                      previous: e,
                    })
                  }
                >
                  {e.status === 'REJECTED' ? 'Resubmit' : 'Correct entry'}
                </button>
              )}
          </div>
        </article>
      ))}
    </div>
  )
  const calendar = (
    <section className={panel}>
      <div className="flex justify-between items-center gap-3 mb-4">
        <h3 className="font-bold">District meeting calendar</h3>
        {isAd && (
          <button className={secondary} onClick={() => setMeetingForm(true)}>
            Schedule meeting
          </button>
        )}
      </div>
      <div className="space-y-3">
        {d.meetings
          .filter(
            (m) =>
              m.date.slice(0, 7) === period &&
              (!selectedAd || m.adId === selectedAd) &&
              (!selectedPerson || m.invitees.includes(selectedPerson))
          )
          .map((m) => (
            <div
              className="flex items-start justify-between gap-4 border-t pt-3"
              key={m.id}
            >
              <div>
                <p className="text-sm font-semibold">
                  {m.date} · {m.title}
                </p>
                <p className="text-xs text-slate-500">
                  {m.location} · {meetingState(m)}
                </p>
              </div>
              {isAd && m.adId === user.actorId && !m.cancelled && (
                <button
                  className={secondary}
                  onClick={() =>
                    setDecision({
                      title: 'Cancel meeting',
                      description:
                        'Attendance awards and related absence deductions will be reversed.',
                      label: 'Cancel meeting',
                      save: (reason) =>
                        mutate(() => ysoApi.cancelMeeting(m.id, reason)),
                    })
                  }
                >
                  Cancel
                </button>
              )}
            </div>
          ))}
        {!d.meetings.some((m) => m.date.slice(0, 7) === period) && (
          <p className="text-sm text-slate-500">
            No meetings scheduled for this month.
          </p>
        )}
      </div>
    </section>
  )
  return (
    <div className="max-w-7xl mx-auto space-y-6 p-4 sm:p-6 lg:p-8 pb-10 text-slate-800">
      <header className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <p className="uppercase tracking-widest text-xs font-semibold text-teal-700 mb-2">
            Youth services ·{' '}
            {isYso
              ? 'My performance'
              : isAd
                ? 'AD workspace'
                : 'Director overview'}
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold">
            {isYso ? 'YSO Task Hub' : 'YSO Performance'}
          </h1>
          <p className="text-sm text-slate-500 mt-2">
            {isYso
              ? 'Record your work, follow approvals and understand your score.'
              : isAd
                ? 'Monitor your YSOs, review submissions and assess monthly performance.'
                : 'Read-only oversight of Provincial AD teams and grading. Historical points retain their original AD attribution.'}
          </p>
        </div>
        <div className="flex gap-2 items-end">
          <label className="text-xs text-slate-500">
            Reporting month
            <DatePicker
              ariaLabel="Reporting month"
              mode="month"
              compact
              minDate="2000-01-01"
              maxDate="2099-12-31"
              className="mt-1 min-w-40 [&>button]:min-h-11"
              value={period}
              onChange={(value) =>
                /^20\d{2}-(0[1-9]|1[0-2])$/.test(value) && setPeriod(value)
              }
            />
          </label>
          <button
            className={secondary}
            onClick={() => refresh().catch((e) => setError(e.message))}
          >
            Refresh
          </button>
        </div>
      </header>
      {error && (
        <div role="alert" className="bg-rose-50 text-rose-800 rounded-lg p-3">
          {error}
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="bg-teal-50 text-teal-800 rounded-lg p-3 flex justify-between gap-3"
        >
          {notice}
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice('')}
          >
            ✕
          </button>
        </div>
      )}
      {!isYso && (
        <div className="flex flex-wrap gap-3">
          {d.role === 'DIRECTOR' && (
            <label className="text-xs">
              Provincial AD
              <Select
                ariaLabel="Provincial AD"
                className="mt-1 min-w-44 [&>button]:min-h-11"
                value={selectedAd}
                onChange={(value) => {
                  setSelectedAd(value)
                  setSelectedPerson('')
                }}
                options={[
                  { value: '', label: 'All ADs' },
                  ...d.ads.map((ad) => ({ value: ad.id, label: ad.name })),
                ]}
              />
            </label>
          )}
          <label className="text-xs">
            YSO
            <Select
              ariaLabel="YSO"
              className="mt-1 min-w-44 [&>button]:min-h-11"
              value={selectedPerson}
              onChange={setSelectedPerson}
              options={[
                { value: '', label: 'All YSOs' },
                ...d.people
                  .filter((p) => !selectedAd || p.adId === selectedAd)
                  .map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
          </label>
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Official monthly score', value: signed(total) },
          {
            label: 'Operational points',
            value: signed(total - qualifications - evaluation),
          },
          { label: 'Qualification awards', value: signed(qualifications) },
          {
            label: 'AD evaluation',
            value: `${evaluation}${people.length === 1 ? ' / 25' : ''}`,
          },
        ].map((s) => (
          <div className={panel} key={s.label}>
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className="text-2xl font-bold mt-2">{s.value}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        Official scores include approved submissions and confirmed penalties
        only. Negative task balances:{' '}
        {signed(
          Object.values(deductions)
            .filter((v) => v < 0)
            .reduce((a, b) => a + b, 0)
        )}
        . {queue.length} submission{queue.length === 1 ? '' : 's'} awaiting AD
        review across all months.
      </p>
      {isYso ? (
        <>
          {!d.people[0]?.startDate && (
            <div className="bg-amber-50 rounded-xl p-4 text-amber-900 text-sm">
              Your AD needs to activate reporting before you can submit.{' '}
              {d.people[0]?.managerValid
                ? `Assigned AD: ${d.people[0].adName}.`
                : 'An active Level 3 Provincial AD must be assigned.'}
            </div>
          )}
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {d.tasks.map((task) => {
              const taskEntries = monthEntries.filter(
                  (e) => e.task === task.id
                ),
                waiting = taskEntries.filter(pending).length,
                approved = taskEntries.filter(
                  (e) => e.status === 'APPROVED'
                ).length,
                points = ledger
                  .filter((l) => l.task === task.id)
                  .reduce((a, b) => a + b.points, 0)
              return (
                <button
                  key={task.id}
                  onClick={() => {
                    setSelectedTask(task.id)
                    if (
                      task.id < 15 &&
                      d.people[0]?.startDate &&
                      d.people[0].managerValid
                    )
                      setEntryForm({ task })
                  }}
                  className={`${panel} text-left hover:border-teal-500 transition-colors flex flex-col min-h-[176px] ${selectedTask === task.id ? 'ring-2 ring-teal-600' : ''}`}
                >
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-teal-700">
                      TASK {String(task.id).padStart(2, '0')}
                    </span>
                    <span className="font-bold">{signed(points)}</span>
                  </div>
                  <h3 className="font-semibold mt-3 mb-4">{task.title}</h3>
                  {task.id === 9 && (
                    <p
                      className={`text-xs mb-3 ${weekly.covered === weekly.expected ? 'text-emerald-700' : 'text-amber-800'}`}
                    >
                      {weekly.covered} / {weekly.expected} required weeks
                      covered
                    </p>
                  )}
                  <div className="mt-auto text-xs text-slate-500 flex flex-wrap gap-2">
                    {task.id === 15 ? (
                      <span>AD assessment · View details</span>
                    ) : (
                      <>
                        <span className={approved ? 'text-emerald-700' : ''}>
                          {approved ? '✓ ' : ''}
                          {approved} approved
                        </span>
                        <span>{waiting} pending</span>
                        <span>
                          {
                            taskEntries.filter((e) => e.status === 'REJECTED')
                              .length
                          }{' '}
                          rejected
                        </span>
                      </>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
          {selectedTask === 15 && (
            <section className={panel}>
              <h3 className="font-bold mb-3">Monthly AD evaluation</h3>
              {d.assessments
                .filter((a) => a.period === period)
                .map((a) => (
                  <div key={a.id}>
                    <dl className="space-y-2">
                      {d.criteria.map((c) => (
                        <div
                          className="flex justify-between text-sm"
                          key={c.key}
                        >
                          <dt>{c.label}</dt>
                          <dd>
                            {a.scores[c.key]} / {c.max}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    <p className="text-sm mt-4">{a.rationale}</p>
                  </div>
                ))}
              {!d.assessments.some((a) => a.period === period) && (
                <p className="text-sm text-slate-500">
                  Your AD has not recorded this month’s evaluation.
                </p>
              )}
            </section>
          )}
          <section className={panel}>
            <div className="flex justify-between mb-4">
              <h3 className="font-bold">
                Submission history{' '}
                {selectedTask && selectedTask < 15
                  ? `· Task ${selectedTask}`
                  : ''}
              </h3>
              {selectedTask && (
                <button
                  className={secondary}
                  onClick={() => setSelectedTask(null)}
                >
                  All tasks
                </button>
              )}
            </div>
            {entryList(
              scopedEntries.filter(
                (e) =>
                  (!selectedTask ||
                    selectedTask === 15 ||
                    e.task === selectedTask) &&
                  (e.period === period || !!selectedTask)
              ),
              false
            )}
          </section>
          {calendar}
        </>
      ) : (
        <>
          <nav
            className={`grid ${isAd ? 'grid-cols-3' : 'grid-cols-2'} gap-1 rounded-2xl border border-slate-200 bg-slate-100 p-1`}
            aria-label="YSO workspace tabs"
          >
            {[
              { key: 'monitor', label: 'Overview' },
              ...(isAd
                ? [
                    {
                      key: 'approvals',
                      label: 'Approvals',
                    },
                  ]
                : []),
              { key: 'analytics', label: 'Analytics' },
            ].map((t) => (
              <button
                className={`min-w-0 min-h-12 flex items-center justify-center gap-1 rounded-xl px-1 py-3 text-xs sm:text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 ${tab === t.key ? 'bg-teal-700 text-white shadow-sm' : 'text-slate-600 hover:bg-white hover:text-slate-900'}`}
                aria-label={
                  t.key === 'approvals'
                    ? `Approvals (${queue.length} pending)`
                    : t.label
                }
                aria-pressed={tab === t.key}
                key={t.key}
                onClick={() => setTab(t.key)}
              >
                {t.label}
                {t.key === 'approvals' && queue.length > 0 && (
                  <span
                    aria-hidden="true"
                    className={`inline-flex min-w-4 h-4 items-center justify-center rounded-full px-1 text-[10px] tabular-nums ${tab === t.key ? 'bg-white/20 text-white' : 'bg-teal-100 text-teal-800'}`}
                  >
                    {queue.length > 99 ? '99+' : queue.length}
                  </span>
                )}
              </button>
            ))}
          </nav>
          {tab === 'monitor' && (
            <>
              {d.role === 'DIRECTOR' && !selectedAd && (
                <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {d.ads.map((adInfo) => {
                    const ad = adInfo.id
                    const team = d.people.filter((p) => p.adId === ad),
                      teamIds = team.map((p) => p.id),
                      teamScore = d.ledger
                        .filter((l) => l.period === period && l.adId === ad)
                        .reduce((a, b) => a + b.points, 0),
                      waiting = d.entries.filter(
                        (e) => teamIds.includes(e.personnelId) && pending(e)
                      )
                    return (
                      <button
                        className={panel + ' text-left hover:border-teal-500'}
                        key={ad}
                        onClick={() => {
                          setSelectedAd(ad)
                          setTab('analytics')
                        }}
                      >
                        <h3 className="font-bold">{adInfo.name}</h3>
                        <p className="text-xs text-slate-500 mt-1">
                          {adInfo.district}
                        </p>
                        <dl className="grid grid-cols-3 gap-2 mt-5 text-sm">
                          <div>
                            <dt className="text-xs text-slate-500">YSOs</dt>
                            <dd className="font-bold">{team.length}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-slate-500">
                              Avg score
                            </dt>
                            <dd className="font-bold">
                              {(
                                teamScore /
                                Math.max(
                                  1,
                                  new Set([
                                    ...teamIds,
                                    ...d.ledger
                                      .filter(
                                        (l) =>
                                          l.period === period && l.adId === ad
                                      )
                                      .map((l) => l.personnelId),
                                  ]).size
                                )
                              ).toFixed(1)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs text-slate-500">Pending</dt>
                            <dd className="font-bold">{waiting.length}</dd>
                          </div>
                        </dl>
                        <p className="text-xs text-slate-500 mt-3">
                          {waiting.length
                            ? `Oldest waiting ${Math.max(0, Math.floor((Date.now() - Math.min(...waiting.map((e) => Date.parse(e.submittedAt)))) / 86400000))} days`
                            : 'Queue clear'}{' '}
                          · View analytics →
                        </p>
                      </button>
                    )
                  })}
                </div>
              )}
              <section className={panel}>
                <h3 className="font-bold mb-4">YSO directory</h3>
                <div className="space-y-3">
                  {people.map((p) => (
                    <div
                      className="border-t pt-3 flex flex-wrap items-center justify-between gap-3"
                      key={p.id}
                    >
                      <div>
                        <p className="font-semibold text-sm">
                          {p.name}
                          {!p.active && ' · Inactive'}
                        </p>
                        <p className="text-xs text-slate-500">
                          {p.startDate
                            ? `Reporting since ${p.startDate}`
                            : 'Reporting not activated'}{' '}
                          · {p.adName ?? 'AD not assigned'}
                        </p>
                        {!p.managerValid && (
                          <p className="text-xs text-rose-700">
                            Active Provincial AD assignment required
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2 items-center flex-wrap">
                        <span className="text-sm font-bold">
                          {signed(
                            d.ledger
                              .filter(
                                (l) =>
                                  l.personnelId === p.id && l.period === period
                              )
                              .reduce((a, b) => a + b.points, 0)
                          )}{' '}
                          points
                        </span>
                        <span className="text-xs rounded-full bg-amber-50 px-2 py-1">
                          {
                            d.entries.filter(
                              (e) => e.personnelId === p.id && pending(e)
                            ).length
                          }{' '}
                          pending
                        </span>
                        <button
                          className={secondary}
                          onClick={() => {
                            setSelectedPerson(p.id)
                            setTab('analytics')
                          }}
                        >
                          View performance
                        </button>
                        {isAd && !p.startDate && p.managerValid && p.active && (
                          <button
                            className={primary}
                            onClick={() => {
                              setActivation(p)
                              setActivationDate(d.today)
                            }}
                          >
                            Activate reporting
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {!people.length && (
                    <p className="text-sm text-slate-500">
                      No YSOs assigned to this team.
                    </p>
                  )}
                </div>
              </section>
              {calendar}
            </>
          )}
          {tab === 'approvals' && isAd && (
            <>
              <section className={panel}>
                <h3 className="font-bold mb-1">Pending submissions</h3>
                <p className="text-xs text-slate-500 mb-4">
                  All reporting months · Review the evidence before approving.
                  Approval time does not change deadline points.
                </p>
                {entryList(queue, true)}
              </section>
              <section className={panel}>
                <h3 className="font-bold mb-4">
                  Task 15 · Monthly performance evaluation
                </h3>
                <div className="flex flex-wrap gap-2">
                  {people
                    .filter((p) => p.active && p.startDate)
                    .map((p) => (
                      <button
                        className={secondary}
                        key={p.id}
                        onClick={() => setAssessment(p)}
                      >
                        {p.name} ·{' '}
                        {d.assessments.some(
                          (a) => a.personnelId === p.id && a.period === period
                        )
                          ? 'Revise'
                          : 'Evaluate'}
                      </button>
                    ))}
                </div>
              </section>
              <section className={panel}>
                <h3 className="font-bold mb-4">Reviewed entries · {period}</h3>
                {entryList(
                  monthEntries.filter((e) => !pending(e)),
                  true
                )}
              </section>
              {calendar}
            </>
          )}
          {tab === 'analytics' && (
            <Analytics
              dashboard={d}
              people={people}
              period={period}
              adId={d.role === 'DIRECTOR' ? selectedAd || undefined : undefined}
            />
          )}
        </>
      )}
      <section className={panel}>
        <h3 className="font-bold mb-1">Requirements & penalty review</h3>
        <p className="text-xs text-slate-500 mb-4">
          Unmarked meeting invitations become absent after month-end. Missing
          reports, weeks and unsettled advances require an AD decision. A
          pending submission holds a new penalty for review.
        </p>
        {obligationQueue.length ? (
          <div className="space-y-4">
            {obligationQueue.map((o) => (
              <div className="border-t pt-3" key={`${o.personnelId}/${o.key}`}>
                <div className="flex flex-wrap justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">
                      {!isYso && `${personName(o.personnelId)} · `}
                      {o.period} · Task {o.task} · {o.points} points
                    </p>
                    <p className="text-sm text-slate-600 mt-1">{o.reason}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {o.blocked
                        ? 'Awaiting submission review'
                        : o.outcome === 'EXEMPT'
                          ? 'Exempted by AD'
                          : o.outcome === 'DEDUCT'
                            ? 'Deduction confirmed'
                            : 'Awaiting AD decision'}
                      {d.decisions.find(
                        (x) =>
                          x.personnelId === o.personnelId && x.key === o.key
                      )?.reason &&
                        ` · ${d.decisions.find((x) => x.personnelId === o.personnelId && x.key === o.key)!.reason}`}
                    </p>
                  </div>
                  {isAd && !o.blocked && (
                    <div className="flex gap-2 items-start">
                      <button
                        className={secondary}
                        onClick={() => penalty(o, 'DEDUCT')}
                      >
                        Confirm deduction
                      </button>
                      <button
                        className={secondary}
                        onClick={() => penalty(o, 'EXEMPT')}
                      >
                        Exempt
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            No overdue requirements awaiting a decision.
          </p>
        )}
      </section>
      <details className={panel}>
        <summary className="font-bold cursor-pointer">
          Score history & audit trail
        </summary>
        <p className="text-xs text-slate-500 mt-3 mb-4">
          Awards and reversals for {period}; each adjustment preserves the
          original record.
        </p>
        <div className="max-h-80 overflow-auto space-y-2">
          {ledger.map((l) => (
            <div key={l.id} className="text-sm border-t pt-2">
              <strong>
                {signed(l.points)} · Task {l.task}
              </strong>{' '}
              · {personName(l.personnelId)}
              <p className="text-xs text-slate-500">
                {when(l.createdAt)} · {l.reason}
              </p>
            </div>
          ))}
          {!ledger.length && (
            <p className="text-sm text-slate-500">
              No score changes for this month.
            </p>
          )}
        </div>
        <h4 className="font-semibold text-sm mt-5 mb-2">
          Recent review events
        </h4>
        <div className="max-h-64 overflow-auto space-y-2">
          {d.events
            .filter((e) => e.personnelId && ids.includes(e.personnelId))
            .map((e) => (
              <div className="text-xs border-t pt-2" key={e.id}>
                {when(e.createdAt)} · {pretty(e.event)} ·{' '}
                {personName(e.personnelId!)}
                <p className="text-slate-500">
                  {e.data.feedback ??
                    e.data.rationale ??
                    e.data.reason ??
                    (e.data.submissionId ? `Entry ${e.data.submissionId}` : '')}
                </p>
              </div>
            ))}
        </div>
      </details>
      {entryForm && (
        <EntryForm
          task={entryForm.task}
          previous={entryForm.previous}
          dashboard={d}
          onClose={() => setEntryForm(null)}
          onSave={async () => {
            await refresh()
            setNotice(
              'Submitted — pending AD approval. Official points are unchanged.'
            )
          }}
        />
      )}
      {decision && (
        <DecisionDialog
          title={decision.title}
          description={decision.description}
          actionLabel={decision.label}
          required={decision.required}
          onSave={decision.save}
          onClose={() => setDecision(null)}
        />
      )}
      {assessment && (
        <AssessmentForm
          person={assessment}
          period={period}
          dashboard={d}
          onClose={() => setAssessment(null)}
          onSave={refresh}
        />
      )}
      {meetingForm && (
        <MeetingForm
          dashboard={d}
          onClose={() => setMeetingForm(false)}
          onSave={refresh}
        />
      )}
      {activation && (
        <Modal
          title={`Activate reporting · ${activation.name}`}
          onClose={() => setActivation(null)}
        >
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault()
              setBusy(true)
              try {
                if (!activationDate)
                  throw new Error('Choose a reporting start date.')
                await mutate(() =>
                  ysoApi.activate(activation.id, activationDate)
                )
                setActivation(null)
              } catch (e) {
                setError((e as Error).message)
              } finally {
                setBusy(false)
              }
            }}
          >
            <p className="text-sm text-slate-600">
              Choose when reporting obligations begin. This date is fixed once
              activated. Partial joining weeks are exempt.
            </p>
            <label className="block text-sm">
              Reporting start date
              <DatePicker
                compact
                ariaLabel="Reporting start date"
                className="mt-1 [&>button]:min-h-11"
                maxDate={d.today}
                value={activationDate}
                onChange={setActivationDate}
              />
            </label>
            <button className={primary} disabled={busy}>
              Activate reporting
            </button>
            {error && (
              <p role="alert" className="text-sm text-rose-700">
                {error}
              </p>
            )}
          </form>
        </Modal>
      )}
    </div>
  )
}
