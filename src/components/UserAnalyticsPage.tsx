import React, { useState, useEffect, useMemo } from 'react'
import { auditApi } from '../services/apiService'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PersonnelStat {
  id: string
  name: string
  department: string
  loginCount90d: number
  lastLogin: string | null
  taskCount: number
}

interface LoginLogEntry {
  id: string
  actorId: string
  actorType: string
  actorName: string
  loggedInAt: string
  ipAddress: string | null
  userAgent: string | null
}

interface TrendDay { day: string; count: number }

interface OverviewData {
  personnel: PersonnelStat[]
  totalLoginsLast30d: number
  loginTrend: TrendDay[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtDateTime(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function daysSince(d: string | null) {
  if (!d) return null
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
}

function activityBadge(count: number) {
  if (count === 0) return { label: 'Inactive', cls: 'bg-gray-100 text-gray-500' }
  if (count >= 30) return { label: 'Very Active', cls: 'bg-emerald-100 text-emerald-700' }
  if (count >= 10) return { label: 'Active', cls: 'bg-blue-100 text-blue-700' }
  return { label: 'Low Activity', cls: 'bg-amber-100 text-amber-700' }
}

// Mini bar chart for login trend
function SparkBar({ trend }: { trend: TrendDay[] }) {
  const max = Math.max(...trend.map(t => t.count), 1)
  const last30 = useMemo(() => {
    const days: { day: string; count: number }[] = []
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)
      const found = trend.find(t => t.day.slice(0, 10) === d)
      days.push({ day: d, count: found?.count ?? 0 })
    }
    return days
  }, [trend])

  return (
    <div className="flex items-end gap-0.5 h-10">
      {last30.map(d => (
        <div key={d.day} title={`${fmtDate(d.day)}: ${d.count} login${d.count !== 1 ? 's' : ''}`}
          className="flex-1 bg-tw-primary/70 rounded-sm transition-all hover:bg-tw-primary"
          style={{ height: `${Math.max(2, (d.count / max) * 100)}%` }} />
      ))}
    </div>
  )
}

// ─── Login History Panel ──────────────────────────────────────────────────────

function LoginHistoryPanel({ person, onClose }: { person: PersonnelStat; onClose: () => void }) {
  const [logs, setLogs] = useState<LoginLogEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    auditApi.userLoginHistory(person.id, 'personnel')
      .then(d => setLogs(d as LoginLogEntry[]))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [person.id])

  // Group logs by date
  const grouped = useMemo(() => {
    const map = new Map<string, LoginLogEntry[]>()
    for (const log of logs) {
      const day = log.loggedInAt.slice(0, 10)
      if (!map.has(day)) map.set(day, [])
      map.get(day)!.push(log)
    }
    return Array.from(map.entries()).map(([day, entries]) => ({ day, entries }))
  }, [logs])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-tw-border">
          <div>
            <div className="font-bold text-tw-text">{person.name}</div>
            <div className="text-xs text-tw-text-secondary">{person.department} · Login History</div>
          </div>
          <button onClick={onClose} className="text-tw-text-secondary hover:text-tw-text text-xl leading-none px-1">×</button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 divide-x divide-tw-border border-b border-tw-border">
          <div className="px-4 py-3 text-center">
            <div className="text-xl font-bold text-tw-text">{person.loginCount90d}</div>
            <div className="text-xs text-tw-text-secondary">Logins (90d)</div>
          </div>
          <div className="px-4 py-3 text-center">
            <div className="text-xl font-bold text-tw-text">{logs.length}</div>
            <div className="text-xs text-tw-text-secondary">Total shown</div>
          </div>
          <div className="px-4 py-3 text-center">
            <div className="text-sm font-semibold text-tw-text">{fmtDate(person.lastLogin)}</div>
            <div className="text-xs text-tw-text-secondary">Last login</div>
          </div>
        </div>

        {/* Log list */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-center text-tw-text-secondary py-8 text-sm">Loading…</div>
          ) : logs.length === 0 ? (
            <div className="text-center text-tw-text-secondary py-8 text-sm">No login records yet</div>
          ) : (
            <div className="space-y-4">
              {grouped.map(({ day, entries }) => (
                <div key={day}>
                  <div className="text-xs font-semibold text-tw-text-secondary uppercase tracking-wide mb-1.5">
                    {fmtDate(day)} — {entries.length} login{entries.length !== 1 ? 's' : ''}
                  </div>
                  <div className="space-y-1">
                    {entries.map(log => (
                      <div key={log.id} className="flex items-center justify-between bg-tw-hover rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
                          <span className="text-sm text-tw-text font-medium">
                            {new Date(log.loggedInAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="text-xs text-tw-text-secondary truncate max-w-[180px]" title={log.userAgent || ''}>
                          {log.userAgent ? log.userAgent.split(' ').slice(0, 3).join(' ') : '—'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function UserAnalyticsPage() {
  const [overview, setOverview] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'loginCount90d' | 'lastLogin' | 'taskCount'>('loginCount90d')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [selectedPerson, setSelectedPerson] = useState<PersonnelStat | null>(null)

  useEffect(() => {
    auditApi.userAnalyticsOverview()
      .then(d => setOverview(d as OverviewData))
      .catch(() => setError('Failed to load analytics'))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    if (!overview) return []
    const q = search.toLowerCase()
    return overview.personnel
      .filter(p => !q || p.name.toLowerCase().includes(q) || p.department.toLowerCase().includes(q))
      .sort((a, b) => {
        let va: number | string = a[sortBy] ?? ''
        let vb: number | string = b[sortBy] ?? ''
        if (sortBy === 'lastLogin') {
          va = a.lastLogin ? new Date(a.lastLogin).getTime() : 0
          vb = b.lastLogin ? new Date(b.lastLogin).getTime() : 0
        }
        if (typeof va === 'string') va = va.toLowerCase()
        if (typeof vb === 'string') vb = vb.toLowerCase()
        return sortDir === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1)
      })
  }, [overview, search, sortBy, sortDir])

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('desc') }
  }

  const SortIcon = ({ col }: { col: typeof sortBy }) =>
    sortBy === col ? <span className="ml-1 text-tw-primary">{sortDir === 'asc' ? '↑' : '↓'}</span> : null

  // Summary stats
  const activeCount     = overview?.personnel.filter(p => p.loginCount90d > 0).length ?? 0
  const inactiveCount   = (overview?.personnel.length ?? 0) - activeCount
  const avgLogins       = overview && overview.personnel.length > 0
    ? (overview.personnel.reduce((s, p) => s + p.loginCount90d, 0) / overview.personnel.length).toFixed(1)
    : '0'

  if (loading) return (
    <div className="flex items-center justify-center h-48 text-tw-text-secondary text-sm">Loading analytics…</div>
  )
  if (error) return (
    <div className="p-6 text-tw-danger text-sm">{error}</div>
  )
  if (!overview) return null

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-tw-text">User Analytics</h1>
        <p className="text-sm text-tw-text-secondary mt-0.5">Login activity and user engagement across the workspace</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Users', value: overview.personnel.length, icon: '👥', cls: 'text-tw-primary' },
          { label: 'Active (90d)', value: activeCount, icon: '✅', cls: 'text-emerald-600' },
          { label: 'Inactive', value: inactiveCount, icon: '💤', cls: 'text-gray-500' },
          { label: 'Avg Logins (90d)', value: avgLogins, icon: '📊', cls: 'text-indigo-600' },
        ].map(s => (
          <div key={s.label} className="card px-4 py-3">
            <div className="flex items-center gap-2 mb-1">
              <span>{s.icon}</span>
              <span className="text-xs text-tw-text-secondary">{s.label}</span>
            </div>
            <div className={`text-2xl font-bold ${s.cls}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Login trend chart */}
      {overview.loginTrend.length > 0 && (
        <div className="card px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="font-semibold text-tw-text text-sm">Login Activity</div>
              <div className="text-xs text-tw-text-secondary">Last 30 days — {overview.totalLoginsLast30d} total logins</div>
            </div>
          </div>
          <SparkBar trend={overview.loginTrend} />
          <div className="flex justify-between text-xs text-tw-text-secondary mt-1">
            <span>30 days ago</span>
            <span>Today</span>
          </div>
        </div>
      )}

      {/* Personnel table */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-tw-border flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-tw-text-secondary text-sm">🔍</span>
            <input
              className="input pl-8 text-sm"
              placeholder="Search by name or department…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          <div className="text-xs text-tw-text-secondary hidden sm:block">{filtered.length} user{filtered.length !== 1 ? 's' : ''}</div>
        </div>

        {/* Mobile list */}
        <div className="sm:hidden divide-y divide-tw-border">
          {filtered.length === 0 ? (
            <div className="py-10 text-center text-tw-text-secondary text-sm">No users found</div>
          ) : filtered.map(p => {
            const badge = activityBadge(p.loginCount90d)
            const ds = daysSince(p.lastLogin)
            return (
              <div key={p.id} onClick={() => setSelectedPerson(p)}
                className="flex items-center gap-3 px-4 py-3 cursor-pointer active:bg-tw-hover">
                <div className="w-9 h-9 rounded-full bg-tw-primary/10 text-tw-primary font-bold text-sm flex items-center justify-center flex-shrink-0">
                  {p.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-tw-text text-sm truncate">{p.name}</div>
                  <div className="text-xs text-tw-text-secondary">{p.department}</div>
                  <div className="text-xs text-tw-text-secondary mt-0.5">
                    {p.loginCount90d} login{p.loginCount90d !== 1 ? 's' : ''} · Last {ds === null ? 'never' : ds === 0 ? 'today' : `${ds}d ago`}
                  </div>
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${badge.cls}`}>{badge.label}</span>
              </div>
            )
          })}
        </div>

        {/* Desktop table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#f0f4ff] border-b-2 border-tw-primary/20">
                {[
                  { label: 'Name', col: 'name' as const },
                  { label: 'Department', col: null },
                  { label: 'Logins (90d)', col: 'loginCount90d' as const },
                  { label: 'Last Login', col: 'lastLogin' as const },
                  { label: 'Tasks Assigned', col: 'taskCount' as const },
                  { label: 'Activity', col: null },
                ].map(h => (
                  <th key={h.label}
                    onClick={() => h.col && toggleSort(h.col)}
                    className={`text-left px-4 py-3 text-xs font-bold text-tw-primary uppercase tracking-wider whitespace-nowrap
                      ${h.col ? 'cursor-pointer select-none hover:bg-tw-primary/10' : ''}`}>
                    {h.label}{h.col && <SortIcon col={h.col} />}
                  </th>
                ))}
                <th className="px-4 py-3 text-xs font-bold text-tw-primary uppercase tracking-wider"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tw-border">
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="py-10 text-center text-tw-text-secondary">No users found</td></tr>
              ) : filtered.map(p => {
                const badge = activityBadge(p.loginCount90d)
                const ds = daysSince(p.lastLogin)
                return (
                  <tr key={p.id} className="hover:bg-tw-hover transition-colors cursor-pointer"
                    onClick={() => setSelectedPerson(p)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-tw-primary/10 text-tw-primary font-bold text-xs flex items-center justify-center flex-shrink-0">
                          {p.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                        </div>
                        <span className="font-medium text-tw-text">{p.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-tw-text-secondary text-xs">{p.department}</td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-tw-text">{p.loginCount90d}</span>
                    </td>
                    <td className="px-4 py-3 text-tw-text-secondary text-xs whitespace-nowrap">
                      {ds === null ? '—' : ds === 0 ? 'Today' : ds === 1 ? 'Yesterday' : `${ds} days ago`}
                      {p.lastLogin && (
                        <div className="text-[11px] text-tw-text-secondary/70">{fmtDateTime(p.lastLogin)}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-tw-text-secondary text-xs">{p.taskCount}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={e => { e.stopPropagation(); setSelectedPerson(p) }}
                        className="text-xs text-tw-primary hover:underline font-medium">
                        View Logins
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Login history modal */}
      {selectedPerson && (
        <LoginHistoryPanel person={selectedPerson} onClose={() => setSelectedPerson(null)} />
      )}
    </div>
  )
}
