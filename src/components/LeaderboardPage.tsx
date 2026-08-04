import React, { useState, useEffect, useMemo } from 'react'
import { auditApi } from '../services/apiService'

// ─── Types (mirror /reports/leaderboard) ───────────────────────────────────────

interface ScoreRow {
  id: string
  name: string
  department: string
  avatarUrl: string | null
  loginDays: number
  taskUpdates: number
  onTimeCount: number
  overdueDays: number
  rejectionCount: number
  earned: number
  deductions: number
  totalPoints: number
  rank: number
}

interface Summary {
  topPerformer: { id: string; name: string; department: string; points: number } | null
  totalPointsEarned: number
  avgScore: number
  scoredUserCount: number
  mostActiveDept: { name: string; points: number } | null
}

interface LeaderboardData {
  leaderboard: ScoreRow[]
  summary: Summary
  config: {
    epoch: string
    points: Record<string, number>
    period: ScorePeriod
    rangeStart: string
    rangeEnd: string
  }
}

type ScorePeriod = 'all' | 'week' | 'month'

// ─── Helpers ────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function activityLevel(r: ScoreRow) {
  const engagement = r.loginDays + r.taskUpdates + r.onTimeCount
  if (engagement === 0) return { label: 'Inactive',    cls: 'bg-gray-100 text-gray-500' }
  if (engagement >= 40) return { label: 'Very Active',  cls: 'bg-emerald-100 text-emerald-700' }
  if (engagement >= 15) return { label: 'Active',       cls: 'bg-blue-100 text-blue-700' }
  return { label: 'Low Activity', cls: 'bg-amber-100 text-amber-700' }
}

function formatPeriodDate(value: string, includeYear = false) {
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    ...(includeYear ? { year: 'numeric' as const } : {}),
  })
}

// Rank badge — medals for the podium, plain number otherwise
function RankBadge({ rank }: { rank: number }) {
  const medal = rank === 1 ? { e: '🥇', cls: 'bg-yellow-50 text-yellow-700 ring-yellow-300' }
    : rank === 2 ? { e: '🥈', cls: 'bg-gray-50 text-gray-600 ring-gray-300' }
    : rank === 3 ? { e: '🥉', cls: 'bg-orange-50 text-orange-700 ring-orange-300' }
    : null
  if (medal) return (
    <span className={`inline-flex items-center gap-1 font-bold text-sm px-2 py-0.5 rounded-full ring-1 ${medal.cls}`}>
      <span>{medal.e}</span>{rank}
    </span>
  )
  return <span className="inline-flex w-7 h-7 items-center justify-center text-tw-text-secondary font-semibold text-sm">{rank}</span>
}

// ─── Points Breakdown Modal ─────────────────────────────────────────────────

function BreakdownModal({ row, points, onClose }: {
  row: ScoreRow
  points: Record<string, number>
  onClose: () => void
}) {
  // Each category: count × per-unit points = subtotal
  const lines = [
    { label: 'Daily logins',        icon: '📅', count: row.loginDays,      unit: points.DAILY_LOGIN,        sub: `${row.loginDays} day${row.loginDays !== 1 ? 's' : ''}` },
    { label: 'Task updates',        icon: '✏️', count: row.taskUpdates,    unit: points.TASK_UPDATE,        sub: `${row.taskUpdates} update${row.taskUpdates !== 1 ? 's' : ''} (max 1/task/day)` },
    { label: 'On-time submissions', icon: '✅', count: row.onTimeCount,    unit: points.ON_TIME_SUBMISSION, sub: `${row.onTimeCount} task${row.onTimeCount !== 1 ? 's' : ''}` },
    { label: 'Overdue days',        icon: '⏰', count: row.overdueDays,    unit: points.OVERDUE_PER_DAY,    sub: `${row.overdueDays} day${row.overdueDays !== 1 ? 's' : ''} late` },
    { label: 'Rejections',          icon: '↩️', count: row.rejectionCount, unit: points.REJECTION,          sub: `${row.rejectionCount} rejected` },
  ].map(l => ({ ...l, subtotal: l.count * l.unit }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-tw-border">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-full bg-tw-primary/10 text-tw-primary font-bold flex items-center justify-center flex-shrink-0">
              {initials(row.name)}
            </div>
            <div className="min-w-0">
              <div className="font-bold text-tw-text truncate">{row.name}</div>
              <div className="text-xs text-tw-text-secondary truncate">{row.department} · Rank #{row.rank}</div>
            </div>
          </div>
          <button onClick={onClose} className="text-tw-text-secondary hover:text-tw-text text-xl leading-none px-1 flex-shrink-0">×</button>
        </div>

        {/* Total banner */}
        <div className="px-5 py-3 bg-tw-hover border-b border-tw-border flex items-center justify-between">
          <span className="text-sm text-tw-text-secondary">Total points</span>
          <span className={`text-2xl font-bold ${row.totalPoints < 0 ? 'text-tw-danger' : 'text-tw-text'}`}>{row.totalPoints}</span>
        </div>

        {/* Category breakdown */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          <div className="text-xs font-semibold text-tw-text-secondary uppercase tracking-wide mb-2">Points by category</div>
          <div className="divide-y divide-tw-border">
            {lines.map(l => (
              <div key={l.label} className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-base flex-shrink-0">{l.icon}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-tw-text">{l.label}</div>
                    <div className="text-xs text-tw-text-secondary">
                      {l.sub} <span className="opacity-70">· {l.unit > 0 ? '+' : ''}{l.unit} each</span>
                    </div>
                  </div>
                </div>
                <span className={`text-sm font-bold flex-shrink-0 ml-3 ${
                  l.subtotal > 0 ? 'text-emerald-600' : l.subtotal < 0 ? 'text-tw-danger' : 'text-tw-text-secondary'
                }`}>
                  {l.subtotal > 0 ? '+' : ''}{l.subtotal}
                </span>
              </div>
            ))}
          </div>

          {/* Sum row */}
          <div className="flex items-center justify-between pt-3 mt-1 border-t-2 border-tw-border">
            <span className="text-sm font-semibold text-tw-text">Net total</span>
            <span className={`text-lg font-bold ${row.totalPoints < 0 ? 'text-tw-danger' : 'text-tw-text'}`}>{row.totalPoints}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LeaderboardPage() {
  const [data, setData]       = useState<LeaderboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [search, setSearch]   = useState('')
  const [dept, setDept]       = useState('')
  const [period, setPeriod]   = useState<ScorePeriod>('all')
  const [selected, setSelected] = useState<ScoreRow | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    setSelected(null)
    auditApi.leaderboard(period)
      .then(d => { if (active) setData(d as LeaderboardData) })
      .catch(() => { if (active) setError('Failed to load leaderboard') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [period])

  const departments = useMemo(() => {
    if (!data) return []
    return Array.from(new Set(data.leaderboard.map(r => r.department))).sort()
  }, [data])

  const filtered = useMemo(() => {
    if (!data) return []
    const q = search.toLowerCase()
    return data.leaderboard.filter(r =>
      (!q || r.name.toLowerCase().includes(q) || r.department.toLowerCase().includes(q)) &&
      (!dept || r.department === dept)
    )
  }, [data, search, dept])

  if (loading) return (
    <div className="flex items-center justify-center h-48 text-tw-text-secondary text-sm">Loading leaderboard…</div>
  )
  if (error) return <div className="p-6 text-tw-danger text-sm">{error}</div>
  if (!data) return null

  const { summary, config } = data
  const periodDescription = config.period === 'all'
    ? `Points earned across the workspace since ${new Date(config.epoch).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`
    : `Points earned ${config.period === 'week' ? 'this week' : 'this month'} · ${formatPeriodDate(config.rangeStart)} – ${formatPeriodDate(config.rangeEnd, true)}`
  const cards = [
    {
      label: 'Top Performer', icon: '🏆', cls: 'text-yellow-600',
      value: summary.topPerformer ? summary.topPerformer.name : '—',
      sub: summary.topPerformer ? `${summary.topPerformer.points} pts · ${summary.topPerformer.department}` : 'No points yet',
    },
    {
      label: 'Total Points (Workspace)', icon: '⭐', cls: 'text-tw-primary',
      value: summary.totalPointsEarned.toLocaleString(),
      sub: `${summary.scoredUserCount} active scorer${summary.scoredUserCount !== 1 ? 's' : ''}`,
    },
    {
      label: 'Avg User Score', icon: '📊', cls: 'text-indigo-600',
      value: summary.avgScore.toLocaleString(),
      sub: `across ${data.leaderboard.length} user${data.leaderboard.length !== 1 ? 's' : ''}`,
    },
    {
      label: 'Most Active Department', icon: '🏢', cls: 'text-emerald-600',
      value: summary.mostActiveDept ? summary.mostActiveDept.name : '—',
      sub: summary.mostActiveDept ? `${summary.mostActiveDept.points} pts` : '—',
    },
  ]

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-tw-text">🏆 Leaderboard</h1>
          <p className="text-sm text-tw-text-secondary mt-0.5">{periodDescription}</p>
        </div>
        <div className="inline-flex w-full sm:w-auto rounded-xl border border-tw-border bg-white p-1 shadow-sm" role="group" aria-label="Leaderboard period">
          {([
            ['all', 'All Time'],
            ['week', 'This Week'],
            ['month', 'This Month'],
          ] as Array<[ScorePeriod, string]>).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setPeriod(value)}
              aria-pressed={period === value}
              className={`flex-1 sm:flex-none rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                period === value
                  ? 'bg-tw-primary text-white shadow-sm'
                  : 'text-tw-text-secondary hover:bg-tw-hover hover:text-tw-text'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map(c => (
          <div key={c.label} className="card px-4 py-3">
            <div className="flex items-center gap-2 mb-1">
              <span>{c.icon}</span>
              <span className="text-xs text-tw-text-secondary">{c.label}</span>
            </div>
            <div className={`text-xl font-bold truncate ${c.cls}`} title={String(c.value)}>{c.value}</div>
            <div className="text-xs text-tw-text-secondary mt-0.5 truncate">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Scoring legend */}
      <div className="card px-4 py-3">
        <div className="text-xs font-semibold text-tw-text-secondary uppercase tracking-wide mb-2">How points are earned</div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-tw-text-secondary">
          <span><b className="text-emerald-600">+{config.points.DAILY_LOGIN}</b> daily login</span>
          <span><b className="text-emerald-600">+{config.points.TASK_UPDATE}</b> task update (max 1/task/day)</span>
          <span><b className="text-emerald-600">+{config.points.ON_TIME_SUBMISSION}</b> on-time submission</span>
          <span><b className="text-tw-danger">{config.points.OVERDUE_PER_DAY}</b> per day overdue</span>
          <span><b className="text-tw-danger">{config.points.REJECTION}</b> per rejection</span>
        </div>
      </div>

      {/* Leaderboard table */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-tw-border flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-tw-text-secondary text-sm">🔍</span>
            <input
              className="input pl-8 text-sm"
              placeholder="Search by name or department…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select className="input text-sm max-w-[200px]" value={dept} onChange={e => setDept(e.target.value)}>
            <option value="">All departments</option>
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <div className="text-xs text-tw-text-secondary hidden sm:block ml-auto">{filtered.length} user{filtered.length !== 1 ? 's' : ''}</div>
        </div>

        {/* Mobile list */}
        <div className="sm:hidden divide-y divide-tw-border">
          {filtered.length === 0 ? (
            <div className="py-10 text-center text-tw-text-secondary text-sm">No users found</div>
          ) : filtered.map(r => {
            const lvl = activityLevel(r)
            return (
              <div key={r.id} onClick={() => setSelected(r)} className="flex items-center gap-3 px-4 py-3 cursor-pointer active:bg-tw-hover">
                <div className="w-8 flex-shrink-0 flex justify-center"><RankBadge rank={r.rank} /></div>
                <div className="w-9 h-9 rounded-full bg-tw-primary/10 text-tw-primary font-bold text-sm flex items-center justify-center flex-shrink-0">
                  {initials(r.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-tw-text text-sm truncate">{r.name}</div>
                  <div className="text-xs text-tw-text-secondary truncate">{r.department}</div>
                  <div className="text-xs text-tw-text-secondary mt-0.5">
                    {r.onTimeCount} on-time · {r.deductions > 0 ? <span className="text-tw-danger">−{r.deductions} deductions</span> : 'no deductions'}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className={`text-lg font-bold ${r.totalPoints < 0 ? 'text-tw-danger' : 'text-tw-text'}`}>{r.totalPoints}</div>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${lvl.cls}`}>{lvl.label}</span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Desktop table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#f0f4ff] border-b-2 border-tw-primary/20">
                {['Rank', 'Name', 'Department', 'Total Points', 'Tasks On-Time', 'Deductions', 'Activity Level'].map((h, i) => (
                  <th key={h} className={`px-4 py-3 text-xs font-bold text-tw-primary uppercase tracking-wider whitespace-nowrap ${i >= 3 && i <= 5 ? 'text-center' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-tw-border">
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="py-10 text-center text-tw-text-secondary">No users found</td></tr>
              ) : filtered.map(r => {
                const lvl = activityLevel(r)
                return (
                  <tr key={r.id} onClick={() => setSelected(r)} className="hover:bg-tw-hover transition-colors cursor-pointer">
                    <td className="px-4 py-3"><RankBadge rank={r.rank} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-tw-primary/10 text-tw-primary font-bold text-xs flex items-center justify-center flex-shrink-0">
                          {initials(r.name)}
                        </div>
                        <span className="font-medium text-tw-text">{r.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-tw-text-secondary text-xs">{r.department}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`font-bold text-base ${r.totalPoints < 0 ? 'text-tw-danger' : 'text-tw-text'}`}>{r.totalPoints}</span>
                    </td>
                    <td className="px-4 py-3 text-center text-tw-text">{r.onTimeCount}</td>
                    <td className="px-4 py-3 text-center">
                      {r.deductions > 0
                        ? <span className="text-tw-danger font-semibold" title={`${r.overdueDays} overdue day(s) · ${r.rejectionCount} rejection(s)`}>−{r.deductions}</span>
                        : <span className="text-tw-text-secondary">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${lvl.cls}`}>{lvl.label}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per-user points breakdown */}
      {selected && (
        <BreakdownModal row={selected} points={config.points} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
