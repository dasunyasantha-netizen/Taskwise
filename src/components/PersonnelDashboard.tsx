import React, { useState, useEffect } from 'react'
import type { AuthUser, ViewMode, Task, Project, Personnel, TaskProgressLog } from '../types'
import { taskApi, projectApi, workspaceApi } from '../services/apiService'
import NotificationsMenu from './NotificationsMenu'
import PersonnelTaskModal from './PersonnelTaskModal'
import BoardView from './BoardView'
import ProfilePage from './ProfilePage'
import ElapsedDays from './ElapsedDays'

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

          {/* ── Subtasks ── */}
          <div className="border-t border-tw-primary/15 pt-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2.5 h-2.5 rounded-sm bg-tw-indigo inline-block" />
              <span className="text-xs font-bold text-tw-indigo uppercase tracking-wider">
                Subtasks{subtasks.length > 0 ? ` (${subtasks.length})` : ''}
              </span>
            </div>
            {loadingS ? (
              <div className="text-xs text-tw-text-secondary py-1">Loading…</div>
            ) : subtasks.length === 0 ? (
              <div className="text-xs text-tw-text-secondary italic py-1">No subtasks yet.</div>
            ) : (
              <div className="bg-white border border-tw-indigo/20 rounded-xl overflow-hidden shadow-sm">
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
                            : isOverdue ? <span className="text-xs font-semibold text-tw-danger">{Math.abs(dl)}d over</span>
                            : dl === 0  ? <span className="text-xs font-semibold text-orange-600">Today</span>
                            : dl <= 3   ? <span className="text-xs font-semibold text-orange-500">{dl}d left</span>
                            : <span className="text-xs text-tw-text-secondary">{dl}d</span>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ── Progress updates ── */}
          <div className="border-t border-tw-primary/15 pt-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-sm bg-tw-success inline-block" />
                <span className="text-xs font-bold text-green-700 uppercase tracking-wider">
                  Progress Updates{progressLogs.length > 0 ? ` (${progressLogs.length})` : ''}
                </span>
              </div>
            </div>

            {canAddLog && (
              <div className="flex gap-2 mb-3">
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
                  className="text-sm py-1.5 px-4 rounded-lg bg-tw-success text-white font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity flex-shrink-0">
                  {progressLoading ? '…' : 'Add'}
                </button>
              </div>
            )}

            {progressLogs.length === 0 ? (
              <div className="text-xs text-tw-text-secondary italic py-1">No updates logged yet.</div>
            ) : (
              <div className="bg-white border border-tw-success/25 rounded-xl overflow-hidden shadow-sm">
                <div className="divide-y divide-tw-border">
                  {progressLogs.map(log => {
                    const d = new Date(log.logDate)
                    return (
                      <div key={log.id} className="px-4 py-3 hover:bg-tw-hover transition-colors">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-xs text-tw-text-secondary">
                            {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · {d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="text-xs font-medium text-tw-text-secondary">{log.authorName}</span>
                        </div>
                        <p className="text-sm text-tw-text break-words leading-relaxed">{log.note}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
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

// ── Mobile expanded card (replaces table ExpandedRow on small screens) ────────
function MobileExpandedCard({ task, actorId, departmentId, onOpen, onSubtaskClick, onRefresh }: {
  task: Task; actorId: string; departmentId?: string
  onOpen: () => void; onSubtaskClick: (t: Task) => void; onRefresh: () => void
}) {
  const [subtasks, setSubtasks]         = useState<Task[]>([])
  const [progressLogs, setProgressLogs] = useState<TaskProgressLog[]>([])
  const [progressNote, setProgressNote] = useState('')
  const [progressLoading, setProgressLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError]   = useState('')
  const [showReturn, setShowReturn]     = useState(false)
  const [returnReason, setReturnReason] = useState('')

  const isMyTask     = task.assignments?.some(a => a.personnelId === actorId)
  const isDeptPending = task.assignments?.some(a => a.departmentId === departmentId) && !task.assignments?.some(a => a.personnelId)
  const canAccept    = isDeptPending && task.status === 'ASSIGNED'
  const canComplete  = isMyTask && ['ASSIGNED', 'IN_PROGRESS'].includes(task.status)
  const canReturn    = (isMyTask || isDeptPending) && ['ASSIGNED', 'IN_PROGRESS'].includes(task.status)
  const canAddLog    = (isMyTask || isDeptPending) && !['APPROVED', 'CANCELLED'].includes(task.status)

  useEffect(() => {
    taskApi.subtasks(task.id).then(s => setSubtasks(s as Task[])).catch(() => {})
    taskApi.progressLogs(task.id).then(l => setProgressLogs(l as TaskProgressLog[])).catch(() => {})
  }, [task.id])

  const doAction = async (fn: () => Promise<unknown>) => {
    setActionLoading(true); setActionError('')
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

  return (
    <div className="px-4 py-4 space-y-4">
      {/* Description */}
      {task.description && (
        <p className="text-sm text-tw-text leading-relaxed">{task.description}</p>
      )}

      {/* Assignees */}
      {task.assignments?.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {task.assignments.map(a => (
            <div key={a.id} className="flex items-center gap-1.5 bg-white border border-tw-border rounded-full px-2.5 py-1">
              <div className="w-5 h-5 rounded-full bg-tw-primary flex items-center justify-center text-white text-xs font-bold">
                {(a.personnel?.name || a.department?.name || '?').charAt(0)}
              </div>
              <span className="text-xs font-medium text-tw-text">{a.personnel?.name || a.department?.name || a.group?.name}</span>
            </div>
          ))}
        </div>
      )}

      {(task.returnReason || task.cancelReason) && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm">
          <span className="font-semibold text-tw-danger">{task.status === 'BLOCKED' ? 'Blocked: ' : 'Returned: '}</span>
          <span className="text-tw-danger italic">{task.returnReason || task.cancelReason}</span>
        </div>
      )}

      {/* Subtasks */}
      {subtasks.length > 0 && (
        <div>
          <div className="text-xs font-bold text-tw-indigo uppercase tracking-wider mb-2">Subtasks ({subtasks.length})</div>
          <div className="space-y-2">
            {subtasks.map(s => (
              <div key={s.id} onClick={e => { e.stopPropagation(); onSubtaskClick(s) }}
                className="bg-white rounded-xl border border-tw-border px-3 py-2.5 flex items-center gap-3 active:bg-blue-50">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${subtaskStatusDot[s.status] || 'bg-gray-400'}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-tw-text truncate">{s.title}</div>
                  <span className={`badge text-xs ${statusBadge[s.status] || 'badge-gray'}`}>{displayStatus(s.status)}</span>
                </div>
                <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7"/>
                </svg>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Progress updates */}
      <div>
        <div className="text-xs font-bold text-green-700 uppercase tracking-wider mb-2">
          Progress Updates{progressLogs.length > 0 ? ` (${progressLogs.length})` : ''}
        </div>
        {canAddLog && (
          <div className="flex gap-2 mb-3">
            <input className="input flex-1 text-sm py-2" placeholder="What did you work on?"
              value={progressNote} onChange={e => setProgressNote(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddLog()} />
            <button disabled={!progressNote.trim() || progressLoading} onClick={e => { e.stopPropagation(); handleAddLog() }}
              className="px-4 py-2 rounded-xl bg-tw-success text-white text-sm font-semibold disabled:opacity-50">
              {progressLoading ? '…' : 'Add'}
            </button>
          </div>
        )}
        {progressLogs.length > 0 && (
          <div className="space-y-2">
            {progressLogs.map(log => (
              <div key={log.id} className="bg-white rounded-xl border border-tw-border px-3 py-2.5">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-tw-text-secondary">{new Date(log.logDate).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span>
                  <span className="text-xs font-medium text-tw-text-secondary">{log.authorName}</span>
                </div>
                <p className="text-sm text-tw-text">{log.note}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Action error */}
      {actionError && (
        <div className="text-sm text-tw-danger bg-tw-danger-light border border-tw-danger/30 rounded-xl px-3 py-2 flex items-center justify-between">
          {actionError}<button onClick={() => setActionError('')} className="ml-2 font-bold">×</button>
        </div>
      )}

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2">
        {canAccept && (
          <button disabled={actionLoading} onClick={e => { e.stopPropagation(); doAction(() => taskApi.accept(task.id)) }}
            className="col-span-2 py-3 rounded-xl bg-tw-primary text-white font-bold text-sm active:opacity-80 disabled:opacity-50">
            ✓ Accept Task
          </button>
        )}
        {canComplete && (
          <button disabled={actionLoading} onClick={e => { e.stopPropagation(); doAction(async () => { if (task.status === 'ASSIGNED') await taskApi.accept(task.id); await taskApi.submit(task.id) }) }}
            className="py-3 rounded-xl bg-[#00c875] text-white font-bold text-sm active:opacity-80 disabled:opacity-50">
            {actionLoading ? '…' : '✓ Complete'}
          </button>
        )}
        {canReturn && (
          <button disabled={actionLoading} onClick={e => { e.stopPropagation(); setShowReturn(true) }}
            className="py-3 rounded-xl border-2 border-tw-danger text-tw-danger font-bold text-sm active:opacity-80">
            ↩ Return
          </button>
        )}
        <button onClick={e => { e.stopPropagation(); onOpen() }}
          className={`py-3 rounded-xl border-2 border-tw-primary text-tw-primary font-bold text-sm active:opacity-80 ${canComplete || canReturn ? '' : 'col-span-2'}`}>
          Open Task →
        </button>
      </div>

      {/* Return modal */}
      {showReturn && (
        <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-50 p-0" onClick={e => e.stopPropagation()}>
          <div className="bg-white rounded-t-3xl w-full max-w-lg px-5 py-6 space-y-4">
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-2" />
            <h3 className="font-bold text-tw-text text-lg">Return Task</h3>
            <textarea className="input resize-none text-sm" rows={4} autoFocus
              placeholder="Reason for returning…" value={returnReason} onChange={e => setReturnReason(e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => { setShowReturn(false); setReturnReason('') }}
                className="py-3 rounded-xl border-2 border-gray-200 text-gray-600 font-bold text-sm">Cancel</button>
              <button disabled={!returnReason.trim() || actionLoading}
                onClick={() => { doAction(() => taskApi.return(task.id, returnReason)); setShowReturn(false); setReturnReason('') }}
                className="py-3 rounded-xl bg-tw-danger text-white font-bold text-sm disabled:opacity-50">
                Return
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Mobile approval card ──────────────────────────────────────────────────────
function MobileApprovalCard({ task, onRefresh, onOpen }: { task: Task; onRefresh: () => void; onOpen: () => void }) {
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
  const priorityColors: Record<string, string> = { CRITICAL: 'border-l-red-500', HIGH: 'border-l-orange-400', MEDIUM: 'border-l-yellow-400', LOW: 'border-l-gray-300' }

  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 border-l-4 ${priorityColors[task.priority]} overflow-hidden`}>
      <div className="px-4 py-4">
        <div className="font-semibold text-tw-text text-sm mb-1">{task.title}</div>
        {task.description && <p className="text-xs text-tw-text-secondary mb-2 line-clamp-2">{task.description}</p>}
        <div className="flex flex-wrap gap-2 mb-3 text-xs text-tw-text-secondary">
          {task.project?.name && <span>📁 {task.project.name}</span>}
          <span>👤 {submittedBy}</span>
          {task.deadline && <span>📅 {new Date(task.deadline).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</span>}
          <span className={`badge ${priorityBadge[task.priority]}`}>{task.priority}</span>
        </div>
        {error && <div className="text-xs text-tw-danger mb-2">{error}</div>}
        <div className="grid grid-cols-3 gap-2">
          <button disabled={loading} onClick={() => doAction(() => taskApi.approve(task.id))}
            className="py-2.5 rounded-xl bg-[#00c875] text-white text-xs font-bold active:opacity-80 disabled:opacity-50">
            ✓ Approve
          </button>
          <button disabled={loading} onClick={() => setShowReject(true)}
            className="py-2.5 rounded-xl border-2 border-tw-danger text-tw-danger text-xs font-bold active:opacity-80">
            ↩ Reject
          </button>
          <button onClick={onOpen}
            className="py-2.5 rounded-xl border-2 border-tw-primary text-tw-primary text-xs font-bold active:opacity-80">
            View →
          </button>
        </div>
      </div>
      {showReject && (
        <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-50">
          <div className="bg-white rounded-t-3xl w-full max-w-lg px-5 py-6 space-y-4">
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-2" />
            <h3 className="font-bold text-tw-text text-lg">Reject Task</h3>
            <textarea className="input resize-none text-sm" rows={4} autoFocus
              placeholder="Reason for rejecting…" value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => { setShowReject(false); setRejectReason('') }}
                className="py-3 rounded-xl border-2 border-gray-200 text-gray-600 font-bold text-sm">Cancel</button>
              <button disabled={!rejectReason.trim() || loading}
                onClick={() => { doAction(() => taskApi.reject(task.id, rejectReason)); setShowReject(false); setRejectReason('') }}
                className="py-3 rounded-xl bg-tw-danger text-white font-bold text-sm disabled:opacity-50">
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
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
        const directlyAssigned = t.assignments?.some(a => a.personnelId === user.actorId)
        // Subtasks only appear if directly assigned to this person (no dept-level assignment for subtasks)
        if (t.parentTaskId) return directlyAssigned
        const deptAssigned = t.assignments?.some(a => a.departmentId === user.departmentId && !t.assignments?.some(p => p.personnelId))
        return directlyAssigned || deptAssigned
      })
      // Tasks awaiting this person's approval as a supervisor
      const pendingApproval = tasks.filter(t =>
        t.status === 'SUBMITTED' &&
        t.approvalById === user.actorId &&
        t.approvalByType === 'personnel'
      )
      // Only show projects where this person has at least one visible task
      const visibleProjectIds = new Set(tasks.map(t => t.projectId))
      setQueue(myTasks)
      setApprovalTasks(pendingApproval)
      setProjects(projs.filter(p => visibleProjectIds.has(p.id)))
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
    <div className="min-h-screen bg-tw-bg flex relative overflow-hidden">

      {/* ── Watermark ───────────────────────────────────────────────────── */}
      <div className="pointer-events-none fixed inset-0 z-0 flex items-end justify-center overflow-hidden">
        <svg viewBox="0 0 400 520" xmlns="http://www.w3.org/2000/svg"
          className="w-[340px] md:w-[420px] opacity-[0.045] select-none"
          style={{ marginBottom: '-40px' }}>
          {/* Yellow figure */}
          <circle cx="60" cy="210" r="22" fill="#F5A623"/>
          <rect x="44" y="234" width="32" height="80" rx="10" fill="#F5A623"/>
          <line x1="44" y1="255" x2="10" y2="195" stroke="#F5A623" strokeWidth="14" strokeLinecap="round"/>
          <line x1="76" y1="255" x2="108" y2="205" stroke="#F5A623" strokeWidth="14" strokeLinecap="round"/>
          <line x1="52" y1="314" x2="44" y2="390" stroke="#F5A623" strokeWidth="14" strokeLinecap="round"/>
          <line x1="68" y1="314" x2="76" y2="390" stroke="#F5A623" strokeWidth="14" strokeLinecap="round"/>
          {/* Pink figure */}
          <circle cx="120" cy="240" r="20" fill="#E91E8C"/>
          <rect x="105" y="262" width="30" height="75" rx="10" fill="#E91E8C"/>
          <line x1="105" y1="280" x2="75" y2="225" stroke="#E91E8C" strokeWidth="13" strokeLinecap="round"/>
          <line x1="135" y1="280" x2="160" y2="230" stroke="#E91E8C" strokeWidth="13" strokeLinecap="round"/>
          <line x1="112" y1="337" x2="105" y2="400" stroke="#E91E8C" strokeWidth="13" strokeLinecap="round"/>
          <line x1="128" y1="337" x2="135" y2="400" stroke="#E91E8C" strokeWidth="13" strokeLinecap="round"/>
          {/* Blue figure (tall) */}
          <circle cx="185" cy="175" r="24" fill="#1E88E5"/>
          <rect x="168" y="201" width="34" height="90" rx="11" fill="#1E88E5"/>
          <line x1="168" y1="220" x2="125" y2="145" stroke="#1E88E5" strokeWidth="15" strokeLinecap="round"/>
          <line x1="202" y1="220" x2="242" y2="150" stroke="#1E88E5" strokeWidth="15" strokeLinecap="round"/>
          <line x1="175" y1="291" x2="165" y2="390" stroke="#1E88E5" strokeWidth="15" strokeLinecap="round"/>
          <line x1="195" y1="291" x2="205" y2="390" stroke="#1E88E5" strokeWidth="15" strokeLinecap="round"/>
          {/* Dark blue figure */}
          <circle cx="200" cy="200" r="18" fill="#1A237E"/>
          <rect x="187" y="220" width="26" height="70" rx="9" fill="#1A237E"/>
          <line x1="187" y1="236" x2="158" y2="180" stroke="#1A237E" strokeWidth="12" strokeLinecap="round"/>
          <line x1="213" y1="236" x2="240" y2="182" stroke="#1A237E" strokeWidth="12" strokeLinecap="round"/>
          <line x1="193" y1="290" x2="185" y2="370" stroke="#1A237E" strokeWidth="12" strokeLinecap="round"/>
          <line x1="207" y1="290" x2="215" y2="370" stroke="#1A237E" strokeWidth="12" strokeLinecap="round"/>
          {/* Green figure */}
          <circle cx="255" cy="195" r="22" fill="#43A047"/>
          <rect x="239" y="219" width="32" height="82" rx="10" fill="#43A047"/>
          <line x1="239" y1="237" x2="205" y2="170" stroke="#43A047" strokeWidth="14" strokeLinecap="round"/>
          <line x1="271" y1="237" x2="305" y2="172" stroke="#43A047" strokeWidth="14" strokeLinecap="round"/>
          <line x1="246" y1="301" x2="238" y2="390" stroke="#43A047" strokeWidth="14" strokeLinecap="round"/>
          <line x1="262" y1="301" x2="270" y2="390" stroke="#43A047" strokeWidth="14" strokeLinecap="round"/>
          {/* Red figure */}
          <circle cx="310" cy="230" r="20" fill="#E53935"/>
          <rect x="296" y="252" width="30" height="76" rx="10" fill="#E53935"/>
          <line x1="296" y1="268" x2="262" y2="205" stroke="#E53935" strokeWidth="13" strokeLinecap="round"/>
          <line x1="326" y1="268" x2="356" y2="210" stroke="#E53935" strokeWidth="13" strokeLinecap="round"/>
          <line x1="303" y1="328" x2="296" y2="400" stroke="#E53935" strokeWidth="13" strokeLinecap="round"/>
          <line x1="319" y1="328" x2="326" y2="400" stroke="#E53935" strokeWidth="13" strokeLinecap="round"/>
          {/* Purple figure */}
          <circle cx="335" cy="185" r="23" fill="#8E24AA"/>
          <rect x="319" y="210" width="32" height="84" rx="10" fill="#8E24AA"/>
          <line x1="319" y1="228" x2="282" y2="155" stroke="#8E24AA" strokeWidth="14" strokeLinecap="round"/>
          <line x1="351" y1="228" x2="386" y2="158" stroke="#8E24AA" strokeWidth="14" strokeLinecap="round"/>
          <line x1="326" y1="294" x2="318" y2="390" stroke="#8E24AA" strokeWidth="14" strokeLinecap="round"/>
          <line x1="342" y1="294" x2="350" y2="390" stroke="#8E24AA" strokeWidth="14" strokeLinecap="round"/>
          {/* Teal figure */}
          <circle cx="375" cy="220" r="20" fill="#00897B"/>
          <rect x="361" y="242" width="28" height="76" rx="9" fill="#00897B"/>
          <line x1="361" y1="258" x2="336" y2="200" stroke="#00897B" strokeWidth="12" strokeLinecap="round"/>
          <line x1="389" y1="258" x2="412" y2="202" stroke="#00897B" strokeWidth="12" strokeLinecap="round"/>
          <line x1="367" y1="318" x2="360" y2="395" stroke="#00897B" strokeWidth="12" strokeLinecap="round"/>
          <line x1="382" y1="318" x2="389" y2="395" stroke="#00897B" strokeWidth="12" strokeLinecap="round"/>
        </svg>
      </div>

      {/* ── Desktop Sidebar ──────────────────────────────────────────────── */}
      <aside className="hidden md:flex w-60 bg-[#1f2d3d] flex-col flex-shrink-0 relative z-10">
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
              {item.badge !== undefined && item.badge > 0 && (
                <span className="ml-auto bg-tw-warning text-white text-xs rounded-full px-1.5 py-0.5 font-bold">{item.badge}</span>
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
      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        {/* Mobile top bar */}
        <header className="bg-[#1f2d3d] md:bg-tw-surface border-b border-white/10 md:border-tw-border px-4 md:px-6 py-3 md:py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {user.companyLogo ? (
              <img src={user.companyLogo} alt="Logo" className="w-7 h-7 rounded object-contain md:hidden" />
            ) : (
              <div className="w-7 h-7 bg-tw-primary rounded-lg flex items-center justify-center md:hidden flex-shrink-0">
                <span className="text-white font-bold text-xs">T</span>
              </div>
            )}
            <div>
              <span className="font-bold text-white md:text-tw-text text-sm md:text-base capitalize">
                {currentView === 'personnel_queue' ? 'My Queue'
                  : currentView === 'personnel_approval_queue' ? 'Approvals'
                  : currentView === 'project_board' ? (selectedProject ? selectedProject.name : 'Projects')
                  : 'My Profile'}
              </span>
              <div className="text-xs text-white/50 md:hidden">{user.name}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} title="Refresh" className="text-white/70 md:text-tw-text-secondary hover:text-white md:hover:text-tw-primary transition-colors p-1.5 rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <NotificationsMenu />
          </div>
        </header>

        <main className="flex-1 overflow-auto pb-20 md:pb-0">
          {/* ── MY QUEUE ──────────────────────────────────────────────── */}
          {currentView === 'personnel_queue' && (
            <div className="p-4 md:p-6">
              {/* Mobile header */}
              <div className="mb-4 md:mb-6">
                <h1 className="hidden md:block text-2xl font-bold text-tw-text mb-1">My Task Queue</h1>
                <p className="text-sm text-tw-text-secondary">
                  {queue.length} active task{queue.length !== 1 ? 's' : ''} assigned to you
                  {pendingAccept > 0 && (
                    <span className="ml-2 inline-flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 text-xs font-semibold">
                      ⚡ {pendingAccept} pending acceptance
                    </span>
                  )}
                </p>
              </div>

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
                <>
                  {/* ── Mobile card list ── */}
                  <div className="md:hidden space-y-3">
                    {queue.map(t => {
                      const isExpanded = expandedId === t.id
                      const isDeptPending = t.assignments?.some(a => a.departmentId === user.departmentId) && !t.assignments?.some(a => a.personnelId)
                      const isOverdue = t.deadline && new Date(t.deadline) < new Date()
                      const priorityColors: Record<string, string> = { CRITICAL: 'border-l-red-500', HIGH: 'border-l-orange-400', MEDIUM: 'border-l-yellow-400', LOW: 'border-l-gray-300' }
                      return (
                        <React.Fragment key={t.id}>
                          <div
                            onClick={() => setExpandedId(isExpanded ? null : t.id)}
                            className={`bg-white rounded-2xl shadow-sm border border-gray-100 border-l-4 ${priorityColors[t.priority]} overflow-hidden transition-all active:scale-[0.99]`}
                          >
                            <div className="px-4 py-3.5">
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <div className="flex-1 min-w-0">
                                  <div className="font-semibold text-tw-text text-sm leading-snug">{t.title}</div>
                                  {t.parentTaskId && <span className="text-xs text-purple-600 font-medium">↳ subtask</span>}
                                </div>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  {isDeptPending && <span className="bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">Accept</span>}
                                  <svg className={`w-4 h-4 text-tw-primary transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                                  </svg>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`badge text-xs ${statusBadge[t.status] || 'badge-gray'}`}>{displayStatus(t.status)}</span>
                                {t.startedAt && !['APPROVED','CANCELLED','REJECTED'].includes(t.status) && <ElapsedDays startedAt={t.startedAt} />}
                                {t.parentTaskId
                                  ? <span className="text-xs text-purple-500 font-medium truncate max-w-[120px]">↳ {t.parent?.title}</span>
                                  : t.project?.name && <span className="text-xs text-tw-text-secondary truncate max-w-[120px]">📁 {t.project.name}</span>}
                                {t.deadline && <span className={`text-xs font-medium ${isOverdue ? 'text-red-500' : 'text-tw-text-secondary'}`}>📅 {new Date(t.deadline).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</span>}
                                {daysLeftLabel(t.deadline ?? undefined)}
                              </div>
                            </div>
                          </div>
                          {isExpanded && (
                            <div className="bg-[#f8f9ff] rounded-2xl border border-tw-primary/15 overflow-hidden -mt-1 mb-1 mx-0.5 shadow-sm">
                              <MobileExpandedCard
                                task={t}
                                actorId={user.actorId}
                                departmentId={user.departmentId}
                                onOpen={() => { setTaskStack([]); setSelectedTask(t) }}
                                onSubtaskClick={async s => {
                                  setTaskStack(prev => t ? [...prev, t] : prev)
                                  try { setSelectedTask(await taskApi.get(s.id) as Task) } catch { setSelectedTask(s) }
                                }}
                                onRefresh={load}
                              />
                            </div>
                          )}
                        </React.Fragment>
                      )
                    })}
                  </div>

                  {/* ── Desktop table ── */}
                  <div className="hidden md:block card overflow-hidden">
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
                          const isDeptPending = t.assignments?.some(a => a.departmentId === user.departmentId) && !t.assignments?.some(a => a.personnelId)
                          const isOverdue = t.deadline && new Date(t.deadline) < new Date()
                          const assigneeName = t.assignments?.[0]
                            ? (t.assignments[0].personnel?.name || t.assignments[0].department?.name || t.assignments[0].group?.name || '—')
                            : '—'
                          return (
                            <React.Fragment key={t.id}>
                              <tr onClick={() => setExpandedId(isExpanded ? null : t.id)}
                                className={`cursor-pointer transition-colors border-b border-tw-border ${isExpanded ? 'bg-blue-50' : 'hover:bg-[#f8f9ff]'}`}>
                                <td className="pl-3 pr-0 py-3.5">
                                  <div className={`w-1.5 h-9 rounded-full ${priorityBar[t.priority]}`} />
                                </td>
                                <td className="px-4 py-3.5 max-w-xs">
                                  <div className="font-semibold text-tw-text text-sm">{t.title}</div>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    {t.parentTaskId && <span className="text-xs text-purple-600 font-medium">↳ subtask</span>}
                                    {(t._count?.subtasks ?? 0) > 0 && <span className="text-xs text-tw-indigo font-medium">⊞ {t._count!.subtasks} subtask{t._count!.subtasks !== 1 ? 's' : ''}</span>}
                                  </div>
                                </td>
                                <td className="px-4 py-3.5 text-sm text-tw-text-secondary whitespace-nowrap">
                                  {t.parentTaskId
                                    ? <span className="inline-flex items-center gap-1 text-purple-600"><span className="w-2 h-2 rounded-full bg-purple-400 inline-block" />{t.parent?.title ?? 'Subtask'}</span>
                                    : t.project?.name
                                      ? <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-tw-teal inline-block" />{t.project.name}</span>
                                      : '—'}
                                </td>
                                <td className="px-4 py-3.5 whitespace-nowrap">
                                  <div className="flex flex-col gap-1">
                                    <span className={`badge ${statusBadge[t.status] || 'badge-gray'}`}>{displayStatus(t.status)}</span>
                                    {t.startedAt && !['APPROVED','CANCELLED','REJECTED'].includes(t.status) && <ElapsedDays startedAt={t.startedAt} />}
                                  </div>
                                </td>
                                <td className="px-4 py-3.5 whitespace-nowrap">
                                  <span className={`badge ${priorityBadge[t.priority]}`}>{t.priority}</span>
                                </td>
                                <td className="px-4 py-3.5 text-sm text-tw-text-secondary whitespace-nowrap">{assigneeName}</td>
                                <td className="px-4 py-3.5 text-sm whitespace-nowrap">
                                  {t.deadline
                                    ? <span className={isOverdue ? 'text-tw-danger font-semibold' : 'text-tw-text-secondary'}>📅 {new Date(t.deadline).toLocaleDateString()}</span>
                                    : <span className="text-tw-text-secondary">—</span>}
                                </td>
                                <td className="px-4 py-3.5 whitespace-nowrap">{daysLeftLabel(t.deadline ?? undefined)}</td>
                                <td className="px-3 py-3.5 whitespace-nowrap">
                                  <div className="flex items-center justify-end gap-2">
                                    {isDeptPending && <span className="bg-tw-warning text-white text-xs font-bold px-2 py-0.5 rounded-full">Accept</span>}
                                    <svg className={`w-5 h-5 text-tw-primary transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                  </div>
                                </td>
                              </tr>
                              {isExpanded && (
                                <ExpandedRow task={t} colSpan={COL_COUNT} actorId={user.actorId} departmentId={user.departmentId}
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
                </>
              )}
            </div>
          )}

          {/* ── APPROVAL QUEUE ────────────────────────────────────────── */}
          {currentView === 'personnel_approval_queue' && (
            <div className="p-4 md:p-6">
              <h1 className="hidden md:block text-2xl font-bold text-tw-text mb-1">Approval Queue</h1>
              <p className="text-sm text-tw-text-secondary mb-4 md:mb-6">
                {approvalTasks.length} task{approvalTasks.length !== 1 ? 's' : ''} submitted to you for approval
              </p>
              {approvalTasks.length === 0 ? (
                <div className="card p-12 text-center">
                  <div className="text-4xl mb-3">🎉</div>
                  <p className="text-tw-text font-semibold">All clear!</p>
                  <p className="text-tw-text-secondary text-sm mt-1">No tasks awaiting your approval.</p>
                </div>
              ) : (
                <>
                  {/* Mobile approval cards */}
                  <div className="md:hidden space-y-3">
                    {approvalTasks.map(t => (
                      <MobileApprovalCard key={t.id} task={t} onRefresh={load} onOpen={() => { setTaskStack([]); setSelectedTask(t) }} />
                    ))}
                  </div>
                  {/* Desktop table */}
                  <div className="hidden md:block card overflow-hidden">
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
                </>
              )}
            </div>
          )}

          {/* ── BOARD VIEW ────────────────────────────────────────────── */}
          {currentView === 'project_board' && !selectedProject && (
            <div className="p-4 md:p-6">
              <h1 className="hidden md:block text-xl font-bold text-tw-text mb-4 md:mb-6">Projects</h1>
              {projects.length === 0 ? (
                <div className="card p-12 text-center text-tw-text-secondary text-sm">No projects available.</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                  {projects.filter(p => p.status === 'active').map(p => (
                    <div key={p.id} onClick={() => setSelectedProject(p)}
                      className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 cursor-pointer active:scale-[0.98] hover:shadow-md transition-all">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: p.color + '22' }}>
                          <div className="w-4 h-4 rounded-full" style={{ backgroundColor: p.color }} />
                        </div>
                        <span className="font-semibold text-tw-text text-sm">{p.name}</span>
                      </div>
                      {p.description && <p className="text-xs text-tw-text-secondary leading-relaxed">{p.description}</p>}
                      <div className="mt-3 flex items-center justify-end">
                        <span className="text-xs text-tw-primary font-semibold flex items-center gap-1">View Board <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7"/></svg></span>
                      </div>
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

      {/* ── Mobile bottom tab bar ──────────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-gray-200 shadow-[0_-2px_16px_rgba(0,0,0,0.08)]">
        <div className="flex items-stretch">
          {navItems.map(item => (
            <button key={item.view}
              onClick={() => { setView(item.view); setSelectedProject(null) }}
              className={`flex-1 flex flex-col items-center justify-center py-2.5 px-1 gap-0.5 relative transition-colors
                ${currentView === item.view ? 'text-tw-primary' : 'text-gray-400'}`}>
              {/* Active indicator */}
              {currentView === item.view && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-tw-primary rounded-full" />
              )}
              <span className="text-lg leading-none">{item.icon}</span>
              <span className="text-[10px] font-semibold leading-none">{item.label.split(' ')[0]}</span>
              {/* Badge */}
              {((item.view === 'personnel_queue' && queue.length > 0) ||
                (item.badge !== undefined && item.badge > 0)) && (
                <span className="absolute top-1.5 right-[20%] bg-red-500 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                  {item.view === 'personnel_queue' ? queue.length : item.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </nav>

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
