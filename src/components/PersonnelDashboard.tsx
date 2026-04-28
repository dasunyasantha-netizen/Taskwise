import React, { useState, useEffect } from 'react'
import type { AuthUser, ViewMode, Task, Project, Personnel, TaskProgressLog } from '../types'
import { taskApi, projectApi, workspaceApi } from '../services/apiService'
import NotificationsMenu from './NotificationsMenu'
import PersonnelTaskModal from './PersonnelTaskModal'
import BoardView from './BoardView'
import ProfilePage from './ProfilePage'

interface Props {
  user: AuthUser
  currentView: ViewMode
  setView: (v: ViewMode) => void
  onLogout: () => void
  onUserUpdate: (updated: Partial<AuthUser>) => void
}

// ── shared lookup maps ────────────────────────────────────────────────────────
const priorityBar:  Record<string, string> = {
  CRITICAL: 'bg-red-500', HIGH: 'bg-orange-400', MEDIUM: 'bg-yellow-400', LOW: 'bg-gray-300',
}
const statusBadge: Record<string, string> = {
  ASSIGNED:    'badge-primary',
  IN_PROGRESS: 'badge-warning',
  BLOCKED:     'bg-orange-100 text-orange-700 border border-orange-200',
  SUBMITTED:   'badge-purple',
  RETURNED:    'badge-danger',
  REJECTED:    'badge-danger',
}
const priorityBadge: Record<string, string> = {
  CRITICAL: 'badge-danger', HIGH: 'badge-warning', MEDIUM: 'badge-primary', LOW: 'badge-gray',
}
const subtaskStatusDot: Record<string, string> = {
  PENDING:     'bg-gray-400',
  ASSIGNED:    'bg-blue-500',
  IN_PROGRESS: 'bg-yellow-500',
  BLOCKED:     'bg-orange-500',
  SUBMITTED:   'bg-purple-500',
  APPROVED:    'bg-green-500',
  RETURNED:    'bg-red-400',
  REJECTED:    'bg-red-500',
  CANCELLED:   'bg-gray-300',
}

function daysLeftLabel(deadline?: string) {
  if (!deadline) return null
  const d = Math.ceil((new Date(deadline).setHours(0,0,0,0) - new Date().setHours(0,0,0,0)) / 86400000)
  if (d < 0)  return <span className="inline-flex text-xs font-semibold text-white bg-tw-danger rounded-full px-2 py-0.5">{Math.abs(d)}d overdue</span>
  if (d === 0) return <span className="inline-flex text-xs font-semibold text-orange-800 bg-orange-100 border border-orange-300 rounded-full px-2 py-0.5">Due today</span>
  if (d <= 3)  return <span className="inline-flex text-xs font-semibold text-orange-700 bg-orange-50 border border-orange-200 rounded-full px-2 py-0.5">{d}d left</span>
  return <span className="text-xs text-tw-text-secondary">{d}d left</span>
}

// ── Expanded row component (loads subtasks on mount) ──────────────────────────
function ExpandedRow({ task, colSpan, actorId, onOpen, onSubtaskClick, onRefresh }: {
  task: Task; colSpan: number; actorId: string
  onOpen: () => void; onSubtaskClick: (t: Task) => void; onRefresh: () => void
}) {
  const [subtasks, setSubtasks]           = useState<Task[]>([])
  const [loadingS, setLoadingS]           = useState(true)
  const [progressLogs, setProgressLogs]   = useState<TaskProgressLog[]>([])
  const [progressNote, setProgressNote]   = useState('')
  const [progressLoading, setProgressLoading] = useState(false)
  const [completeLoading, setCompleteLoading] = useState(false)

  const isMyTask = task.assignments?.some(a => a.personnelId === actorId)
  const isDeptPending = task.assignments?.some(a => a.departmentId) && !task.assignments?.some(a => a.personnelId)
  const canComplete = isMyTask && ['ASSIGNED', 'IN_PROGRESS'].includes(task.status)
  const canAddLog = (isMyTask || isDeptPending) && !['APPROVED', 'CANCELLED'].includes(task.status)

  useEffect(() => {
    taskApi.subtasks(task.id)
      .then(s => setSubtasks(s as Task[]))
      .catch(() => {})
      .finally(() => setLoadingS(false))
    taskApi.progressLogs(task.id)
      .then(l => setProgressLogs(l as TaskProgressLog[]))
      .catch(() => {})
  }, [task.id])

  const handleAddLog = async () => {
    if (!progressNote.trim()) return
    setProgressLoading(true)
    try {
      await taskApi.addProgressLog(task.id, progressNote)
      setProgressNote('')
      const logs = await taskApi.progressLogs(task.id) as TaskProgressLog[]
      setProgressLogs(logs)
    } catch { /* no-op */ }
    setProgressLoading(false)
  }

  const handleComplete = async () => {
    setCompleteLoading(true)
    try {
      if (task.status === 'ASSIGNED') await taskApi.accept(task.id)
      await taskApi.submit(task.id)
      onRefresh()
    } catch { /* no-op */ }
    setCompleteLoading(false)
  }

  return (
    <tr className="border-b-2 border-tw-primary/20" style={{ background: 'linear-gradient(to right, #eef3ff, #f8f9ff)' }}>
      <td colSpan={colSpan} className="px-0 py-0">
        <div className="px-6 py-5 space-y-5">

          {/* ── Task meta row ── */}
          <div className="flex flex-wrap gap-6 text-sm">
            {task.description && (
              <div className="w-full">
                <div className="font-semibold text-tw-text-secondary uppercase tracking-wide mb-1">Description</div>
                <p className="text-sm text-tw-text leading-relaxed whitespace-pre-wrap">{task.description}</p>
              </div>
            )}
            {task.assignments?.length > 0 && (
              <div>
                <div className="font-semibold text-tw-text-secondary uppercase tracking-wide mb-1">Assigned To</div>
                {task.assignments.map(a => (
                  <div key={a.id} className="flex items-center gap-1.5 text-tw-text">
                    <div className="w-5 h-5 rounded-full bg-tw-primary flex items-center justify-center text-white font-bold text-xs">
                      {(a.personnel?.name || a.department?.name || '?').charAt(0)}
                    </div>
                    {a.personnel?.name || a.department?.name || a.group?.name}
                    <span className="text-tw-text-secondary ml-1">{a.personnel ? '(person)' : a.department ? '(dept)' : '(group)'}</span>
                  </div>
                ))}
              </div>
            )}
            {task.deadline && (
              <div>
                <div className="font-semibold text-tw-text-secondary uppercase tracking-wide mb-1">Deadline</div>
                <span className="text-tw-text">{new Date(task.deadline).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
              </div>
            )}
            {task.actedById && (
              <div>
                <div className="font-semibold text-tw-text-secondary uppercase tracking-wide mb-1">Accepted By</div>
                <span className="text-tw-text">{task.actedByName || task.actedByType}</span>
              </div>
            )}
            {(task.returnReason || task.cancelReason) && (
              <div className="w-full bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <div className="font-semibold text-tw-danger uppercase tracking-wide mb-0.5">
                  {task.status === 'BLOCKED' ? 'Blocked Reason' : 'Return / Rejection Reason'}
                </div>
                <span className="text-tw-danger italic">{task.returnReason || task.cancelReason}</span>
              </div>
            )}
          </div>

          {/* ── Subtasks table ── */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-3 h-3 rounded bg-tw-indigo inline-block" />
              <span className="text-xs font-bold text-tw-indigo uppercase tracking-wider">
                Subtasks {subtasks.length > 0 ? `(${subtasks.length})` : ''}
              </span>
            </div>
            {loadingS ? (
              <div className="text-xs text-tw-text-secondary py-2">Loading…</div>
            ) : subtasks.length === 0 ? (
              <div className="text-xs text-tw-text-secondary italic py-2">No subtasks yet.</div>
            ) : (
              <div className="bg-white border border-tw-indigo/20 rounded-lg overflow-hidden shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-tw-indigo-light border-b border-tw-indigo/20">
                      <th className="w-px px-2 py-2.5"></th>
                      <th className="text-left px-3 py-2.5 font-bold text-tw-indigo uppercase tracking-wider text-xs">Subtask</th>
                      <th className="text-left px-3 py-2.5 font-bold text-tw-indigo uppercase tracking-wider text-xs">Status</th>
                      <th className="text-left px-3 py-2.5 font-bold text-tw-indigo uppercase tracking-wider text-xs">Priority</th>
                      <th className="text-left px-3 py-2.5 font-bold text-tw-indigo uppercase tracking-wider text-xs">Assigned To</th>
                      <th className="text-left px-3 py-2.5 font-bold text-tw-indigo uppercase tracking-wider text-xs">Deadline</th>
                      <th className="text-left px-3 py-2.5 font-bold text-tw-indigo uppercase tracking-wider text-xs">Days Left</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-tw-border">
                    {subtasks.map(s => {
                      const assignee = s.assignments?.[0]
                      const assigneeName = assignee?.personnel?.name || assignee?.department?.name || assignee?.group?.name || '—'
                      const dl = s.deadline ? Math.ceil((new Date(s.deadline).setHours(0,0,0,0) - new Date().setHours(0,0,0,0)) / 86400000) : null
                      const isOverdue = dl !== null && dl < 0
                      return (
                        <tr key={s.id} onClick={e => { e.stopPropagation(); onSubtaskClick(s) }} className="hover:bg-blue-100 cursor-pointer transition-colors">
                          <td className="pl-2 pr-0 py-2">
                            <div className={`w-2 h-2 rounded-full ${subtaskStatusDot[s.status] || 'bg-gray-400'}`} />
                          </td>
                          <td className="px-3 py-2 font-medium text-tw-text max-w-xs truncate">{s.title}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className={`badge text-xs ${statusBadge[s.status] || 'badge-gray'}`}>{s.status.replace('_', ' ')}</span>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className={`badge text-xs ${priorityBadge[s.priority]}`}>{s.priority}</span>
                          </td>
                          <td className="px-3 py-2 text-tw-text-secondary whitespace-nowrap">{assigneeName}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {s.deadline
                              ? <span className={isOverdue ? 'text-tw-danger font-semibold' : 'text-tw-text-secondary'}>
                                  {new Date(s.deadline).toLocaleDateString()}
                                </span>
                              : <span className="text-tw-text-secondary">—</span>}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {dl === null ? <span className="text-tw-text-secondary">—</span>
                              : dl < 0  ? <span className="inline-flex text-xs font-semibold text-white bg-tw-danger rounded-full px-2 py-0.5">{Math.abs(dl)}d overdue</span>
                              : dl === 0 ? <span className="inline-flex text-xs font-semibold text-orange-800 bg-orange-100 border border-orange-300 rounded-full px-2 py-0.5">Due today</span>
                              : dl <= 3  ? <span className="inline-flex text-xs font-semibold text-orange-700 bg-orange-50 border border-orange-200 rounded-full px-2 py-0.5">{dl}d left</span>
                              : <span className="text-tw-text-secondary">{dl}d left</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Progress log ── */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-3 h-3 rounded bg-tw-success inline-block" />
              <span className="text-xs font-bold text-tw-success uppercase tracking-wider">
                Progress Updates {progressLogs.length > 0 ? `(${progressLogs.length})` : ''}
              </span>
            </div>

            {canAddLog && (
              <div className="flex gap-2 mb-3">
                <input
                  className="input flex-1 text-sm py-2"
                  placeholder="What did you work on today?"
                  value={progressNote}
                  onChange={e => setProgressNote(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddLog()}
                />
                <button
                  disabled={!progressNote.trim() || progressLoading}
                  onClick={e => { e.stopPropagation(); handleAddLog() }}
                  className="text-sm py-2 px-4 rounded-lg bg-tw-success text-white font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity flex-shrink-0">
                  {progressLoading ? '…' : 'Submit'}
                </button>
              </div>
            )}

            {progressLogs.length > 0 && (
              <div className="bg-white border border-tw-success/30 rounded-lg overflow-hidden mb-2 shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-tw-success-light border-b border-tw-success/20">
                      <th className="text-left px-3 py-2.5 font-bold text-green-700 uppercase tracking-wider text-xs w-28">Date</th>
                      <th className="text-left px-3 py-2.5 font-bold text-green-700 uppercase tracking-wider text-xs w-20">Time</th>
                      <th className="text-left px-3 py-2.5 font-bold text-green-700 uppercase tracking-wider text-xs">Update</th>
                      <th className="text-left px-3 py-2.5 font-bold text-green-700 uppercase tracking-wider text-xs w-32">By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-tw-border">
                    {progressLogs.map(log => {
                      const d = new Date(log.logDate)
                      return (
                        <tr key={log.id} className="hover:bg-tw-hover">
                          <td className="px-3 py-2 text-tw-text-secondary whitespace-nowrap">
                            {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </td>
                          <td className="px-3 py-2 text-tw-text-secondary whitespace-nowrap">
                            {d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="px-3 py-2 text-tw-text">{log.note}</td>
                          <td className="px-3 py-2 text-tw-text-secondary whitespace-nowrap">{log.authorName}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Open modal button + Complete ── */}
          <div className="pt-2 border-t border-blue-200 flex items-center justify-between gap-3">
            {canComplete ? (
              <button
                disabled={completeLoading}
                onClick={e => { e.stopPropagation(); handleComplete() }}
                className="text-sm py-2 px-5 rounded-lg bg-tw-success text-white font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity">
                {completeLoading ? '…' : '✓ Complete'}
              </button>
            ) : <div />}
            <button onClick={e => { e.stopPropagation(); onOpen() }} className="btn-primary text-xs py-1.5 px-4">
              Open Task →
            </button>
          </div>
        </div>
      </td>
    </tr>
  )
}

// ── Main dashboard ────────────────────────────────────────────────────────────
export default function PersonnelDashboard({ user, currentView, setView, onLogout, onUserUpdate }: Props) {
  const [queue, setQueue]               = useState<Task[]>([])
  const [projects, setProjects]         = useState<Project[]>([])
  const [personnel, setPersonnel]       = useState<Personnel[]>([])
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [taskStack, setTaskStack]       = useState<Task[]>([])  // navigation history for back button
  const [expandedId, setExpandedId]     = useState<string | null>(null)
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [tasks, projs] = await Promise.all([
        taskApi.list() as Promise<Task[]>,
        projectApi.list() as Promise<Project[]>,
      ])
      const myTasks = tasks.filter(t => {
        if (['APPROVED', 'CANCELLED'].includes(t.status)) return false
        const directlyAssigned = t.assignments?.some(a => a.personnelId === user.actorId)
        const deptAssigned     = t.assignments?.some(a => a.departmentId === user.departmentId && !t.assignments?.some(p => p.personnelId))
        return directlyAssigned || deptAssigned
      })
      setQueue(myTasks)
      setProjects(projs)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load tasks')
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
    workspaceApi.getPersonnel()
      .then(p => setPersonnel(p as Personnel[]))
      .catch(() => {})
  }, [])

  const navItems = [
    { label: 'My Queue',   view: 'personnel_queue' as ViewMode, icon: '📋' },
    { label: 'Board View', view: 'project_board'   as ViewMode, icon: '⊞' },
    { label: 'My Profile', view: 'profile'         as ViewMode, icon: '👤' },
  ]

  const initials = user.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
  const pendingAccept = queue.filter(t =>
    t.assignments?.some(a => a.departmentId === user.departmentId) &&
    !t.assignments?.some(a => a.personnelId)
  ).length

  const COL_COUNT = 9   // total <th> columns including the expand chevron

  return (
    <div className="min-h-screen bg-tw-bg flex">
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className="w-60 bg-[#1f2d3d] flex flex-col flex-shrink-0">
        <div className="px-5 py-4 border-b border-white/10">
          {user.companyLogo ? (
            <div className="flex items-center gap-2.5">
              <img src={user.companyLogo} alt="Logo" className="w-8 h-8 rounded object-contain" />
              <span className="font-bold text-white text-base truncate">{user.companyName || 'TaskWise'}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-tw-primary rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold text-sm">T</span>
              </div>
              <span className="font-bold text-white text-base">{user.companyName || 'TaskWise'}</span>
            </div>
          )}
        </div>

        <nav className="flex-1 px-3 py-3 space-y-0.5">
          {navItems.map(item => (
            <button key={item.view} onClick={() => { setView(item.view); setSelectedProject(null) }}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2.5
                ${currentView === item.view
                  ? 'bg-tw-primary text-white shadow-sm'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'}`}>
              <span className="text-base">{item.icon}</span>{item.label}
              {item.view === 'personnel_queue' && queue.length > 0 && (
                <span className="ml-auto bg-tw-warning text-white text-xs rounded-full px-1.5 py-0.5 font-bold">{queue.length}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="px-3 py-3 border-t border-white/10">
          <button onClick={() => setView('profile' as ViewMode)}
            className="flex items-center gap-2.5 px-2 py-2 mb-1 w-full rounded-lg hover:bg-white/10 transition-colors">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="Avatar" className="w-8 h-8 rounded-full object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-tw-primary flex items-center justify-center text-white text-sm font-bold flex-shrink-0">{initials}</div>
            )}
            <div className="min-w-0 text-left">
              <div className="text-sm font-semibold text-white truncate">{user.name}</div>
              <div className="text-xs text-white/50">Personnel</div>
            </div>
          </button>
          <button onClick={onLogout} className="w-full text-left px-2 py-1 text-xs text-white/40 hover:text-tw-danger transition-colors rounded">
            Sign out
          </button>
          <p className="text-center text-xs text-white/25 mt-2">Created by SysWise</p>
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-tw-surface border-b border-tw-border px-6 py-3.5 flex items-center justify-between">
          <span className="font-semibold text-tw-text text-base capitalize">{currentView.replace(/_/g, ' ')}</span>
          <div className="flex items-center gap-3">
            <button onClick={load} title="Refresh" className="text-tw-text-secondary hover:text-tw-primary transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <NotificationsMenu />
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          {/* ── MY QUEUE ──────────────────────────────────────────────── */}
          {currentView === 'personnel_queue' && (
            <div className="p-6">
              <h1 className="text-2xl font-bold text-tw-text mb-1">My Task Queue</h1>
              <p className="text-sm text-tw-text-secondary mb-6">
                {queue.length} active task{queue.length !== 1 ? 's' : ''} assigned to you
                {pendingAccept > 0 && (
                  <span className="ml-2 inline-flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 text-xs font-semibold">
                    ⚡ {pendingAccept} pending acceptance
                  </span>
                )}
              </p>

              {error && (
                <div className="mb-4 bg-red-50 border border-red-200 text-tw-danger text-sm px-3 py-2 rounded-lg">
                  {error} — <button onClick={load} className="underline">Try again</button>
                </div>
              )}

              {loading ? (
                <div className="text-sm text-tw-text-secondary">Loading...</div>
              ) : queue.length === 0 ? (
                <div className="card p-12 text-center">
                  <div className="text-4xl mb-3">🎉</div>
                  <p className="text-tw-text font-semibold">All clear!</p>
                  <p className="text-tw-text-secondary text-sm mt-1">No tasks assigned to you right now.</p>
                </div>
              ) : (
                <div className="card overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[#f0f4ff] border-b-2 border-tw-primary/20">
                        <th className="w-px px-3 py-3"></th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-tw-primary uppercase tracking-wider">Task</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-tw-primary uppercase tracking-wider">Project</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-tw-primary uppercase tracking-wider">Status</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-tw-primary uppercase tracking-wider">Priority</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-tw-primary uppercase tracking-wider">Assigned By</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-tw-primary uppercase tracking-wider">Deadline</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-tw-primary uppercase tracking-wider">Days Left</th>
                        <th className="w-8 px-2 py-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {queue.map(t => {
                        const isExpanded  = expandedId === t.id
                        const isDeptPending =
                          t.assignments?.some(a => a.departmentId === user.departmentId) &&
                          !t.assignments?.some(a => a.personnelId)
                        const isOverdue = t.deadline && new Date(t.deadline) < new Date()
                        const assigneeName = t.assignments?.[0]
                          ? (t.assignments[0].personnel?.name || t.assignments[0].department?.name || t.assignments[0].group?.name || '—')
                          : '—'

                        return (
                          <React.Fragment key={t.id}>
                            {/* ── Summary row ── */}
                            <tr
                              onClick={() => setExpandedId(isExpanded ? null : t.id)}
                              className={`cursor-pointer transition-colors border-b border-tw-border
                                ${isExpanded ? 'bg-blue-50 border-b-tw-primary/20' : 'hover:bg-[#f8f9ff]'}`}
                            >
                              {/* Priority bar */}
                              <td className="pl-3 pr-0 py-3.5">
                                <div className={`w-1.5 h-9 rounded-full ${priorityBar[t.priority]}`} />
                              </td>

                              {/* Title */}
                              <td className="px-4 py-3.5 max-w-xs">
                                <div className="font-semibold text-tw-text text-sm">{t.title}</div>
                                <div className="flex items-center gap-2 mt-0.5">
                                  {(t._count?.subtasks ?? 0) > 0 && (
                                    <span className="text-xs text-tw-indigo font-medium">
                                      ⊞ {t._count!.subtasks} subtask{t._count!.subtasks !== 1 ? 's' : ''}
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* Project */}
                              <td className="px-4 py-3.5 text-sm text-tw-text-secondary whitespace-nowrap">
                                {t.project?.name
                                  ? <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-tw-teal inline-block" />{t.project.name}</span>
                                  : '—'}
                              </td>

                              {/* Status */}
                              <td className="px-4 py-3.5 whitespace-nowrap">
                                <span className={`badge ${statusBadge[t.status] || 'badge-gray'}`}>
                                  {t.status.replace('_', ' ')}
                                </span>
                              </td>

                              {/* Priority */}
                              <td className="px-4 py-3.5 whitespace-nowrap">
                                <span className={`badge ${priorityBadge[t.priority]}`}>{t.priority}</span>
                              </td>

                              {/* Assigned by */}
                              <td className="px-4 py-3.5 text-sm text-tw-text-secondary whitespace-nowrap">
                                {assigneeName}
                              </td>

                              {/* Deadline */}
                              <td className="px-4 py-3.5 text-sm whitespace-nowrap">
                                {t.deadline
                                  ? <span className={isOverdue ? 'text-tw-danger font-semibold' : 'text-tw-text-secondary'}>
                                      📅 {new Date(t.deadline).toLocaleDateString()}
                                    </span>
                                  : <span className="text-tw-text-secondary">—</span>}
                              </td>

                              {/* Days left */}
                              <td className="px-4 py-3.5 whitespace-nowrap">
                                {daysLeftLabel(t.deadline ?? undefined)}
                              </td>

                              {/* Chevron + accept badge */}
                              <td className="px-3 py-3.5 whitespace-nowrap">
                                <div className="flex items-center justify-end gap-2">
                                  {isDeptPending && (
                                    <span className="bg-tw-warning text-white text-xs font-bold px-2 py-0.5 rounded-full">
                                      Accept
                                    </span>
                                  )}
                                  <svg
                                    className={`w-5 h-5 text-tw-primary transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                                    fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                  </svg>
                                </div>
                              </td>
                            </tr>

                            {/* ── Expanded detail row ── */}
                            {isExpanded && (
                              <ExpandedRow
                                task={t}
                                colSpan={COL_COUNT}
                                actorId={user.actorId}
                                onOpen={() => { setTaskStack([]); setSelectedTask(t) }}
                                onSubtaskClick={async s => {
                                  setTaskStack(prev => t ? [...prev, t] : prev)
                                  try { setSelectedTask(await taskApi.get(s.id) as Task) } catch { setSelectedTask(s) }
                                }}
                                onRefresh={load}
                              />
                            )}
                          </React.Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── BOARD VIEW ────────────────────────────────────────────── */}
          {currentView === 'project_board' && !selectedProject && (
            <div className="p-6">
              <h1 className="text-xl font-bold text-tw-text mb-6">Projects</h1>
              {projects.length === 0 ? (
                <div className="card p-12 text-center text-tw-text-secondary text-sm">No projects available.</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {projects.filter(p => p.status === 'active').map(p => (
                    <div key={p.id} onClick={() => setSelectedProject(p)}
                      className="card p-4 cursor-pointer hover:shadow-panel transition-shadow">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
                        <span className="font-semibold text-tw-text text-sm">{p.name}</span>
                      </div>
                      {p.description && <p className="text-xs text-tw-text-secondary">{p.description}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {currentView === 'project_board' && selectedProject && (
            <BoardView project={selectedProject} isDirector={false} actorId={user.actorId} />
          )}

          {/* ── PROFILE ───────────────────────────────────────────────── */}
          {currentView === 'profile' && (
            <ProfilePage user={user} onUserUpdate={onUserUpdate} />
          )}
        </main>
      </div>

      {/* ── Task modal ─────────────────────────────────────────────────── */}
      {selectedTask && (
        <PersonnelTaskModal
          task={selectedTask}
          actorId={user.actorId}
          departmentId={user.departmentId}
          personnel={personnel}
          parentTask={taskStack.length > 0 ? taskStack[taskStack.length - 1] : undefined}
          onBack={taskStack.length > 0 ? async () => {
            const parent = taskStack[taskStack.length - 1]
            setTaskStack(prev => prev.slice(0, -1))
            try { setSelectedTask(await taskApi.get(parent.id) as Task) } catch { setSelectedTask(parent) }
          } : undefined}
          onSubtaskOpen={async s => {
            setTaskStack(prev => selectedTask ? [...prev, selectedTask] : prev)
            try { setSelectedTask(await taskApi.get(s.id) as Task) } catch { setSelectedTask(s) }
          }}
          onClose={() => { setSelectedTask(null); setTaskStack([]) }}
          onRefresh={async () => {
            await load()
            try {
              const updated = await taskApi.get(selectedTask.id) as Task
              setSelectedTask(updated)
            } catch {
              setSelectedTask(null)
            }
          }}
        />
      )}
    </div>
  )
}
