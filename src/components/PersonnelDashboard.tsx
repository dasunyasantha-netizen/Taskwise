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
  IN_PROGRESS: 'badge-warning',
  BLOCKED:     'bg-orange-100 text-orange-700 border border-orange-200',
  SUBMITTED:   'badge-purple',
  RETURNED:    'badge-danger',
  REJECTED:    'badge-danger',
}
const displayStatus = (status: string) => status.replace('_', ' ')
const priorityBadge: Record<string, string> = {
  CRITICAL: 'badge-danger', HIGH: 'badge-warning', MEDIUM: 'badge-primary', LOW: 'badge-gray',
}
const subtaskStatusDot: Record<string, string> = {
  PENDING:     'bg-gray-400',
  ASSIGNED:    'bg-gray-400',
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
function ExpandedRow({ task, colSpan, actorId, departmentId, onOpen, onSubtaskClick, onRefresh }: {
  task: Task; colSpan: number; actorId: string; departmentId?: string
  onOpen: () => void; onSubtaskClick: (t: Task) => void; onRefresh: () => void
}) {
  const [subtasks, setSubtasks]           = useState<Task[]>([])
  const [loadingS, setLoadingS]           = useState(true)
  const [progressLogs, setProgressLogs]   = useState<TaskProgressLog[]>([])
  const [progressNote, setProgressNote]   = useState('')
  const [progressLoading, setProgressLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError]     = useState('')
  const [showReturn, setShowReturn]       = useState(false)
  const [returnReason, setReturnReason]   = useState('')

  const isMyTask     = task.assignments?.some(a => a.personnelId === actorId)
  const isDeptPending = task.assignments?.some(a => a.departmentId === departmentId) && !task.assignments?.some(a => a.personnelId)
  const canAccept    = isDeptPending && task.status === 'ASSIGNED'
  const canComplete  = isMyTask && ['ASSIGNED', 'IN_PROGRESS'].includes(task.status)
  const canReturn    = (isMyTask || isDeptPending) && ['ASSIGNED', 'IN_PROGRESS'].includes(task.status)
  const canAddLog    = (isMyTask || isDeptPending) && !['APPROVED', 'CANCELLED'].includes(task.status)

  useEffect(() => {
    taskApi.subtasks(task.id)
      .then(async (s) => {
        const list = s as Task[]
        // Auto-accept all ASSIGNED subtasks so they show IN_PROGRESS
        const toAccept = list.filter(sub => sub.status === 'ASSIGNED')
        if (toAccept.length > 0) {
          await Promise.all(toAccept.map(sub => taskApi.accept(sub.id).catch(() => {})))
          const refreshed = await taskApi.subtasks(task.id).catch(() => list)
          setSubtasks(refreshed as Task[])
        } else {
          setSubtasks(list)
        }
      })
      .catch(() => {})
      .finally(() => setLoadingS(false))
    taskApi.progressLogs(task.id)
      .then(l => setProgressLogs(l as TaskProgressLog[]))
      .catch(() => {})
  }, [task.id])

  const doAction = async (fn: () => Promise<unknown>) => {
    setActionLoading(true)
    setActionError('')
    try { await fn(); onRefresh() }
    catch (e: unknown) { setActionError(e instanceof Error ? e.message : 'Action failed') }
    setActionLoading(false)
  }

  const handleAddLog = async () => {
    if (!progressNote.trim()) return
    setProgressLoading(true)
    try {
      await taskApi.addProgressLog(task.id, progressNote)
      setProgressNote('')
      setProgressLogs(await taskApi.progressLogs(task.id) as TaskProgressLog[])
    } catch { /* no-op */ }
    setProgressLoading(false)
  }

  const handleAccept   = () => doAction(() => taskApi.accept(task.id))
  const handleComplete = () => doAction(async () => {
    if (task.status === 'ASSIGNED') await taskApi.accept(task.id)
    await taskApi.submit(task.id)
  })
  const handleReturn = () => {
    if (!returnReason.trim()) return
    doAction(() => taskApi.return(task.id, returnReason))
    setShowReturn(false)
    setReturnReason('')
  }

  return (
    <tr className="border-b-2 border-tw-primary/20" style={{ background: 'linear-gradient(135deg, #f0f4ff 0%, #f8f9ff 100%)' }}>
      <td colSpan={colSpan} className="px-0 py-0">
        <div className="px-6 py-5 space-y-4">

          {/* ── Task info strip ── */}
          <div className="grid grid-cols-[1fr_auto] gap-4 items-start">
            {/* Left: description + assignees */}
            <div className="space-y-3 min-w-0">
              {task.description && (
                <p className="text-sm text-tw-text leading-relaxed whitespace-pre-wrap">{task.description}</p>
              )}
              {task.assignments?.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {task.assignments.map(a => (
                    <div key={a.id} className="flex items-center gap-1.5 bg-white border border-tw-border rounded-full px-2.5 py-1">
                      <div className="w-4 h-4 rounded-full bg-tw-primary flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                        {(a.personnel?.name || a.department?.name || '?').charAt(0)}
                      </div>
                      <span className="text-xs font-medium text-tw-text">{a.personnel?.name || a.department?.name || a.group?.name}</span>
                      <span className="text-tw-text-secondary text-xs">{a.personnel ? '· person' : a.department ? '· dept' : '· group'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* Right: deadline + accepted by chips */}
            <div className="flex gap-4 flex-shrink-0">
              {task.deadline && (
                <div className="text-right">
                  <div className="text-xs font-semibold text-tw-text-secondary uppercase tracking-wide mb-1">Deadline</div>
                  <span className="text-xs font-medium text-tw-text bg-white border border-tw-border rounded-lg px-2.5 py-1 inline-block">
                    {new Date(task.deadline).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </span>
                </div>
              )}
              {task.actedById && (
                <div className="text-right">
                  <div className="text-xs font-semibold text-tw-text-secondary uppercase tracking-wide mb-1">Accepted By</div>
                  <span className="text-xs font-medium text-tw-text bg-white border border-tw-border rounded-lg px-2.5 py-1 inline-block">
                    {task.actedByName || task.actedByType}
                  </span>
                </div>
              )}
            </div>
          </div>

          {(task.returnReason || task.cancelReason) && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm">
              <span className="font-semibold text-tw-danger">
                {task.status === 'BLOCKED' ? 'Blocked: ' : 'Returned: '}
              </span>
              <span className="text-tw-danger italic">{task.returnReason || task.cancelReason}</span>
            </div>
          )}

          {/* ── Two-column layout: subtasks + progress ── */}
          <div className="grid grid-cols-2 gap-4">

            {/* Left: Subtasks */}
            <div className="bg-white border border-tw-indigo/20 rounded-xl overflow-hidden shadow-sm">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-tw-indigo-light border-b border-tw-indigo/20">
                <span className="w-2.5 h-2.5 rounded-sm bg-tw-indigo inline-block" />
                <span className="text-xs font-bold text-tw-indigo uppercase tracking-wider">
                  Subtasks{subtasks.length > 0 ? ` (${subtasks.length})` : ''}
                </span>
              </div>
              {loadingS ? (
                <div className="px-4 py-4 text-xs text-tw-text-secondary">Loading…</div>
              ) : subtasks.length === 0 ? (
                <div className="px-4 py-4 text-xs text-tw-text-secondary italic">No subtasks yet.</div>
              ) : (
                <div className="divide-y divide-tw-border">
                  {subtasks.map(s => {
                    const assignee = s.assignments?.[0]
                    const assigneeName = assignee?.personnel?.name || assignee?.department?.name || assignee?.group?.name || '—'
                    const dl = s.deadline ? Math.ceil((new Date(s.deadline).setHours(0,0,0,0) - new Date().setHours(0,0,0,0)) / 86400000) : null
                    const isOverdue = dl !== null && dl < 0
                    return (
                      <div key={s.id}
                        onClick={e => { e.stopPropagation(); onSubtaskClick(s) }}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 cursor-pointer transition-colors">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${subtaskStatusDot[s.status] || 'bg-gray-400'}`} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-tw-text truncate">{s.title}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`badge text-xs ${statusBadge[s.status] || 'badge-gray'}`}>{displayStatus(s.status)}</span>
                            <span className="text-xs text-tw-text-secondary truncate">→ {assigneeName}</span>
                          </div>
                        </div>
                        <div className="flex-shrink-0 text-right">
                          {dl === null ? null
                            : dl < 0  ? <span className="text-xs font-semibold text-tw-danger">{Math.abs(dl)}d over</span>
                            : dl === 0 ? <span className="text-xs font-semibold text-orange-600">Today</span>
                            : dl <= 3  ? <span className="text-xs font-semibold text-orange-500">{dl}d left</span>
                            : <span className="text-xs text-tw-text-secondary">{dl}d</span>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Right: Progress updates */}
            <div className="bg-white border border-tw-success/25 rounded-xl overflow-hidden shadow-sm flex flex-col">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-tw-success-light border-b border-tw-success/20">
                <span className="w-2.5 h-2.5 rounded-sm bg-tw-success inline-block" />
                <span className="text-xs font-bold text-green-700 uppercase tracking-wider">
                  Progress Updates{progressLogs.length > 0 ? ` (${progressLogs.length})` : ''}
                </span>
              </div>

              {canAddLog && (
                <div className="flex gap-2 px-3 py-2.5 border-b border-tw-border">
                  <input
                    className="input flex-1 text-sm py-1.5"
                    placeholder="What did you work on today?"
                    value={progressNote}
                    onChange={e => setProgressNote(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddLog()}
                  />
                  <button
                    disabled={!progressNote.trim() || progressLoading}
                    onClick={e => { e.stopPropagation(); handleAddLog() }}
                    className="text-sm py-1.5 px-3 rounded-lg bg-tw-success text-white font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity flex-shrink-0">
                    {progressLoading ? '…' : 'Add'}
                  </button>
                </div>
              )}

              {progressLogs.length === 0 ? (
                <div className="px-4 py-4 text-xs text-tw-text-secondary italic">No updates logged yet.</div>
              ) : (
                <div className="divide-y divide-tw-border overflow-y-auto max-h-48">
                  {progressLogs.map(log => {
                    const d = new Date(log.logDate)
                    return (
                      <div key={log.id} className="px-4 py-2.5 hover:bg-tw-hover transition-colors">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-xs text-tw-text-secondary whitespace-nowrap">
                            {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="text-xs text-tw-text-secondary font-medium whitespace-nowrap">{log.authorName}</span>
                        </div>
                        <p className="text-sm text-tw-text break-words leading-relaxed">{log.note}</p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── Action bar ── */}
          {actionError && (
            <div className="text-sm text-tw-danger bg-tw-danger-light border border-tw-danger/30 rounded-lg px-3 py-2 flex items-center justify-between">
              {actionError}
              <button onClick={() => setActionError('')} className="ml-2 font-bold">×</button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 justify-between">
            <div className="flex flex-wrap gap-2">
              {canAccept && (
                <button disabled={actionLoading} onClick={e => { e.stopPropagation(); handleAccept() }}
                  className="text-sm py-2 px-4 rounded-lg bg-tw-primary text-white font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity">
                  ✓ Accept Task
                </button>
              )}
              {canComplete && (
                <button disabled={actionLoading} onClick={e => { e.stopPropagation(); handleComplete() }}
                  className="text-sm py-2 px-4 rounded-lg bg-tw-success text-white font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity">
                  {actionLoading ? '…' : '✓ Complete'}
                </button>
              )}
              {canReturn && (
                <button disabled={actionLoading} onClick={e => { e.stopPropagation(); setShowReturn(true) }}
                  className="text-sm py-2 px-4 rounded-lg border border-tw-danger text-tw-danger bg-white hover:bg-tw-danger-light font-semibold disabled:opacity-50 transition-colors">
                  ↩ Return
                </button>
              )}
            </div>
            <button onClick={e => { e.stopPropagation(); onOpen() }} className="btn-secondary text-sm py-2 px-4">
              Open Task →
            </button>
          </div>

          {/* ── Return reason modal ── */}
          {showReturn && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={e => e.stopPropagation()}>
              <div className="bg-white rounded-xl shadow-panel w-full max-w-sm">
                <div className="px-5 py-4 border-b border-tw-border">
                  <h3 className="font-semibold text-tw-text">Return Task</h3>
                  <p className="text-xs text-tw-text-secondary mt-0.5">Reason for returning this task.</p>
                </div>
                <div className="px-5 py-4 space-y-3">
                  <textarea className="input resize-none" rows={3} autoFocus
                    placeholder="Reason for returning…"
                    value={returnReason} onChange={e => setReturnReason(e.target.value)} />
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => { setShowReturn(false); setReturnReason('') }} className="btn-secondary">Cancel</button>
                    <button disabled={!returnReason.trim() || actionLoading} onClick={handleReturn}
                      className="px-4 py-2 rounded-lg bg-tw-danger text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50">
                      Return Task
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </td>
    </tr>
  )
}

// ── Personnel Approval Row ────────────────────────────────────────────────────
function PersonnelApprovalRow({ task, onRefresh, onOpen }: { task: Task; onRefresh: () => void; onOpen: () => void }) {
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')
  const [showReject, setShowReject] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  const doAction = async (fn: () => Promise<unknown>) => {
    setLoading(true); setError('')
    try { await fn(); onRefresh() }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Action failed') }
    setLoading(false)
  }

  const submittedBy = task.actedByName || (task.actedByType === 'director' ? 'Director' : 'Personnel')

  return (
    <>
      <tr className="hover:bg-[#f8f9ff] transition-colors">
        <td className="pl-3 pr-0 py-3.5">
          <div className={`w-1.5 h-9 rounded-full ${priorityBar[task.priority]}`} />
        </td>
        <td className="px-4 py-3.5">
          <div className="font-semibold text-tw-text text-sm">{task.title}</div>
          {task.description && <div className="text-xs text-tw-text-secondary mt-0.5 truncate max-w-xs">{task.description}</div>}
        </td>
        <td className="px-4 py-3.5 text-sm text-tw-text-secondary">{task.project?.name || '—'}</td>
        <td className="px-4 py-3.5 text-sm text-tw-text-secondary">{submittedBy}</td>
        <td className="px-4 py-3.5">
          <span className={`badge ${priorityBadge[task.priority]}`}>{task.priority}</span>
        </td>
        <td className="px-4 py-3.5 text-sm text-tw-text-secondary">
          {task.deadline ? new Date(task.deadline).toLocaleDateString() : '—'}
        </td>
        <td className="px-4 py-3.5">
          <div className="flex items-center gap-2">
            <button disabled={loading} onClick={() => doAction(() => taskApi.approve(task.id))}
              className="px-3 py-1.5 rounded-lg bg-tw-success text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50">
              ✓ Approve
            </button>
            <button disabled={loading} onClick={() => setShowReject(true)}
              className="px-3 py-1.5 rounded-lg border border-tw-danger text-tw-danger bg-white hover:bg-red-50 text-xs font-semibold disabled:opacity-50">
              ↩ Reject
            </button>
            <button onClick={onOpen} className="px-3 py-1.5 rounded-lg border border-tw-border text-tw-text-secondary text-xs hover:bg-tw-hover">
              View →
            </button>
          </div>
          {error && <div className="text-xs text-tw-danger mt-1">{error}</div>}
        </td>
      </tr>
      {showReject && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-panel w-full max-w-sm">
            <div className="px-5 py-4 border-b border-tw-border">
              <h3 className="font-semibold text-tw-text">Reject / Send Back</h3>
              <p className="text-xs text-tw-text-secondary mt-0.5">Provide feedback so the assignee knows what to fix.</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <textarea className="input resize-none" rows={3} autoFocus
                placeholder="Reason for rejecting…"
                value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
              <div className="flex gap-2 justify-end">
                <button onClick={() => { setShowReject(false); setRejectReason('') }} className="btn-secondary">Cancel</button>
                <button disabled={!rejectReason.trim() || loading}
                  onClick={() => { doAction(() => taskApi.reject(task.id, rejectReason)); setShowReject(false); setRejectReason('') }}
                  className="px-4 py-2 rounded-lg bg-tw-danger text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50">
                  Reject
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Main dashboard ────────────────────────────────────────────────────────────
export default function PersonnelDashboard({ user, currentView, setView, onLogout, onUserUpdate }: Props) {
  const [queue, setQueue]               = useState<Task[]>([])
  const [projects, setProjects]         = useState<Project[]>([])
  const [personnel, setPersonnel]       = useState<Personnel[]>([])
  const [mySupervisorId, setMySupervisorId] = useState<string | null | undefined>(undefined)
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
        if (t.parentTaskId) return false
        const directlyAssigned = t.assignments?.some(a => a.personnelId === user.actorId)
        const deptAssigned     = t.assignments?.some(a => a.departmentId === user.departmentId && !t.assignments?.some(p => p.personnelId))
        return directlyAssigned || deptAssigned
      })
      // Tasks awaiting this person's approval as a supervisor
      const pendingApproval = tasks.filter(t =>
        t.status === 'SUBMITTED' &&
        t.approvalById === user.actorId &&
        t.approvalByType === 'personnel'
      )
      setQueue(myTasks)
      setApprovalTasks(pendingApproval)
      setProjects(projs)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load tasks')
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
    workspaceApi.getPersonnel()
      .then(p => {
        const list = p as Personnel[]
        setPersonnel(list)
        const me = list.find(p => p.id === user.actorId)
        setMySupervisorId(me?.supervisorId ?? null)
      })
      .catch(() => {})
  }, [])

  const [approvalTasks, setApprovalTasks] = useState<Task[]>([])

  const navItems = [
    { label: 'My Queue',       view: 'personnel_queue'          as ViewMode, icon: '📋' },
    { label: 'Approval Queue', view: 'personnel_approval_queue' as ViewMode, icon: '✅', badge: approvalTasks.length },
    { label: 'Board View',     view: 'project_board'            as ViewMode, icon: '⊞' },
    { label: 'My Profile',     view: 'profile'                  as ViewMode, icon: '👤' },
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
                                  {displayStatus(t.status)}
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
                                departmentId={user.departmentId}
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

          {/* ── APPROVAL QUEUE ────────────────────────────────────────── */}
          {currentView === 'personnel_approval_queue' && (
            <div className="p-6">
              <h1 className="text-2xl font-bold text-tw-text mb-1">Approval Queue</h1>
              <p className="text-sm text-tw-text-secondary mb-6">
                {approvalTasks.length} task{approvalTasks.length !== 1 ? 's' : ''} submitted to you for approval
              </p>
              {approvalTasks.length === 0 ? (
                <div className="card p-12 text-center">
                  <div className="text-4xl mb-3">🎉</div>
                  <p className="text-tw-text font-semibold">All clear!</p>
                  <p className="text-tw-text-secondary text-sm mt-1">No tasks awaiting your approval.</p>
                </div>
              ) : (
                <div className="card overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[#f0f4ff] border-b-2 border-tw-primary/20">
                        <th className="w-px px-3 py-3"></th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-tw-primary uppercase tracking-wider">Task</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-tw-primary uppercase tracking-wider">Project</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-tw-primary uppercase tracking-wider">Submitted By</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-tw-primary uppercase tracking-wider">Priority</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-tw-primary uppercase tracking-wider">Deadline</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-tw-primary uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-tw-border">
                      {approvalTasks.map(t => (
                        <PersonnelApprovalRow key={t.id} task={t} onRefresh={load} onOpen={() => { setTaskStack([]); setSelectedTask(t) }} />
                      ))}
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
          mySupervisorId={mySupervisorId}
          onSupervisorSet={id => setMySupervisorId(id)}
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
