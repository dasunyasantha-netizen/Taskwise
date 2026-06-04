import React, { useState, useEffect, useRef } from 'react'
import type { AuthUser, ViewMode, Task, Project, Personnel, TaskProgressLog } from '../types'
import { taskApi, projectApi, workspaceApi } from '../services/apiService'
import NotificationsMenu from './NotificationsMenu'
import PersonnelTaskModal from './PersonnelTaskModal'
import BoardView from './BoardView'
import ProfilePage from './ProfilePage'
import ElapsedDays from './ElapsedDays'
import { usePWA } from '../hooks/usePWA'
import ProgressUpdateSheet from './ProgressUpdateSheet'

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
  const [confirmNote, setConfirmNote]     = useState('')
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
    if (!confirmNote.trim()) return
    setProgressLoading(true)
    try {
      await taskApi.addProgressLog(task.id, confirmNote)
      setConfirmNote('')
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
    <>
    {confirmNote !== '' && (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setConfirmNote('')}>
        <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
          <div className="px-5 py-4 border-b border-tw-border">
            <h3 className="font-semibold text-tw-text">Post Progress Update?</h3>
            <p className="text-xs text-tw-text-secondary mt-0.5">This update will be visible to your director.</p>
          </div>
          <div className="px-5 py-4">
            <p className="text-sm text-tw-text bg-gray-50 rounded-lg px-3 py-2 italic">"{confirmNote}"</p>
          </div>
          <div className="px-5 py-4 border-t border-tw-border flex justify-end gap-2">
            <button className="btn-secondary text-sm" onClick={() => setConfirmNote('')}>Cancel</button>
            <button disabled={progressLoading} onClick={handleAddLog}
              className="px-4 py-2 rounded-lg bg-tw-success text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50">
              {progressLoading ? '…' : 'Post Update'}
            </button>
          </div>
        </div>
      </div>
    )}
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
                      <span className="text-xs font-medium text-tw-text">{a.personnel?.name || a.department?.name}</span>
                      <span className="text-tw-text-secondary text-xs">{a.personnel ? '· person' : '· dept'}</span>
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
                {'Returned: '}
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
                    const assigneeName = assignee?.personnel?.name || assignee?.department?.name || '—'
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
              <div className="mb-3">
                <ProgressUpdateSheet
                  value={progressNote}
                  onChange={setProgressNote}
                  onSubmit={() => setConfirmNote(progressNote)}
                  loading={progressLoading}
                  placeholder="What did you work on today?"
                  label="Progress Update"
                />
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
    </>
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
  const [confirmNote, setConfirmNote]   = useState('')
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
    if (!confirmNote.trim()) return
    setProgressLoading(true)
    try {
      await taskApi.addProgressLog(task.id, confirmNote)
      setConfirmNote('')
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
              <span className="text-xs font-medium text-tw-text">{a.personnel?.name || a.department?.name}</span>
            </div>
          ))}
        </div>
      )}

      {(task.returnReason || task.cancelReason) && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm">
          <span className="font-semibold text-tw-danger">{'Returned: '}</span>
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
          <div className="mb-3">
            <ProgressUpdateSheet
              value={progressNote}
              onChange={setProgressNote}
              onSubmit={() => setConfirmNote(progressNote)}
              loading={progressLoading}
              placeholder="What did you work on?"
              label="Progress Update"
            />
          </div>
        )}
        {confirmNote !== '' && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setConfirmNote('')}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="px-5 py-4 border-b border-tw-border">
                <h3 className="font-semibold text-tw-text">Post Progress Update?</h3>
                <p className="text-xs text-tw-text-secondary mt-0.5">This update will be visible to your director.</p>
              </div>
              <div className="px-5 py-4">
                <p className="text-sm text-tw-text bg-gray-50 rounded-lg px-3 py-2 italic">"{confirmNote}"</p>
              </div>
              <div className="px-5 py-4 border-t border-tw-border flex justify-end gap-2">
                <button className="btn-secondary text-sm" onClick={() => setConfirmNote('')}>Cancel</button>
                <button disabled={progressLoading} onClick={handleAddLog}
                  className="px-4 py-2 rounded-lg bg-tw-success text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50">
                  {progressLoading ? '…' : 'Post Update'}
                </button>
              </div>
            </div>
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
  const [expanded, setExpanded]     = useState(false)
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
  const priorityBar: Record<string, string> = { CRITICAL: 'bg-red-500', HIGH: 'bg-orange-400', MEDIUM: 'bg-yellow-400', LOW: 'bg-gray-300' }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header row — always visible, tap to expand */}
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none" onClick={() => setExpanded(e => !e)}>
        <div className={`w-1 h-10 rounded-full flex-shrink-0 ${priorityBar[task.priority] || 'bg-gray-300'}`} />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-tw-text text-sm leading-snug">{task.title}</div>
          <span className={`badge mt-0.5 ${statusBadge['SUBMITTED']}`}>Submitted</span>
        </div>
        <svg className={`w-4 h-4 text-tw-text-secondary flex-shrink-0 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Expandable details */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-3">
          {task.description && <p className="text-xs text-tw-text-secondary line-clamp-3">{task.description}</p>}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-tw-text-secondary">
            {task.project?.name && (
              <div><span className="font-medium text-tw-text-secondary uppercase tracking-wide text-[10px]">Project</span><div className="text-tw-text font-medium mt-0.5">{task.project.name}</div></div>
            )}
            <div><span className="font-medium text-tw-text-secondary uppercase tracking-wide text-[10px]">Submitted By</span><div className="text-tw-text font-medium mt-0.5">{submittedBy}</div></div>
            {task.deadline && (
              <div><span className="font-medium text-tw-text-secondary uppercase tracking-wide text-[10px]">Deadline</span><div className="text-tw-text font-medium mt-0.5">{new Date(task.deadline).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</div></div>
            )}
            <div><span className="font-medium text-tw-text-secondary uppercase tracking-wide text-[10px]">Priority</span><div className="mt-0.5"><span className={`badge ${priorityBadge[task.priority]}`}>{task.priority}</span></div></div>
          </div>
          {error && <div className="text-xs text-tw-danger">{error}</div>}
          <div className="grid grid-cols-3 gap-2 pt-1">
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
      )}

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

// ── Mobile User Menu ─────────────────────────────────────────────────────────
function MobileUserMenu({ user, onProfile, onLogout }: { user: AuthUser; onProfile: () => void; onLogout: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = React.useRef<HTMLDivElement>(null)
  const initials = user.name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative md:hidden">
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
        {user.avatarUrl
          ? <img src={user.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover" />
          : <div className="w-6 h-6 rounded-full bg-tw-primary flex items-center justify-center text-white text-xs font-bold">{initials}</div>
        }
        <svg className={`w-3 h-3 text-white/70 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-50">
          <div className="px-4 py-3 bg-[#f0f4ff] border-b border-gray-100">
            <div className="font-semibold text-tw-text text-sm truncate">{user.name}</div>
            <div className="text-xs text-tw-text-secondary">Personnel</div>
          </div>
          <button onClick={() => { onProfile(); setOpen(false) }}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-tw-text hover:bg-tw-hover transition-colors">
            <svg className="w-4 h-4 text-tw-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
            </svg>
            My Profile
          </button>
          <button onClick={() => { onLogout(); setOpen(false) }}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-tw-danger hover:bg-red-50 transition-colors border-t border-gray-100">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
            </svg>
            Sign Out
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main dashboard ────────────────────────────────────────────────────────────
export default function PersonnelDashboard({ user, currentView, setView, onLogout, onUserUpdate }: Props) {
  const { canInstall, isIOS, installApp, pushEnabled, enablePush } = usePWA()
  const [showIOSGuide, setShowIOSGuide] = useState(false)
  const [queue, setQueue]               = useState<Task[]>([])
  const [projects, setProjects]         = useState<Project[]>([])
  const [personnel, setPersonnel]       = useState<Personnel[]>([])
  const [mySupervisorId, setMySupervisorId] = useState<string | null | undefined>(undefined)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [taskStack, setTaskStack]       = useState<Task[]>([])
  const [expandedId, setExpandedId]     = useState<string | null>(null)
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState('')

  // ── Navigation history ────────────────────────────────────────────────────
  const [viewHistory, setViewHistory] = useState<Array<{ view: typeof currentView; scrollTop: number }>>([])
  const mainRef = useRef<HTMLDivElement>(null)

  const navigate = (v: typeof currentView) => {
    const scrollTop = mainRef.current?.scrollTop ?? 0
    setViewHistory(h => [...h, { view: currentView, scrollTop }])
    setView(v)
  }
  const goBack = () => {
    const entry = viewHistory[viewHistory.length - 1]
    if (entry) {
      setViewHistory(h => h.slice(0, -1))
      setView(entry.view)
      if (entry.view !== 'project_board') setSelectedProject(null)
      requestAnimationFrame(() => {
        if (mainRef.current) mainRef.current.scrollTop = entry.scrollTop
      })
    }
  }
  const canGoBack = viewHistory.length > 0 && currentView !== 'personnel_queue'

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

  const COL_COUNT = 8   // total <th> columns including the expand chevron

  return (
    <div className="min-h-screen bg-tw-bg flex relative overflow-hidden">

      {/* ── Watermark ───────────────────────────────────────────────────── */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <img src="/taskwise/watermark.jpeg" alt="" className="absolute bottom-0 select-none"
          style={{ opacity: 0.13, mixBlendMode: 'multiply' as const, width: '100%', maxWidth: '480px', left: '50%', transform: 'translateX(-50%)' }} />
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
            <button key={item.view} onClick={() => { navigate(item.view); setSelectedProject(null) }}
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
          <button onClick={() => navigate('profile' as ViewMode)}
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
        {/* Top bar */}
        <header className="bg-[#1f2d3d] md:bg-tw-surface border-b border-white/10 md:border-tw-border px-4 md:px-6 py-3 md:py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {user.companyLogo ? (
              <img src={user.companyLogo} alt="Logo" className="w-7 h-7 rounded object-contain md:hidden" />
            ) : (
              <div className="w-7 h-7 bg-tw-primary rounded-lg flex items-center justify-center md:hidden flex-shrink-0">
                <span className="text-white font-bold text-xs">T</span>
              </div>
            )}
            {/* Back button */}
            {canGoBack && (
              <button
                onClick={() => {
                  if (currentView === 'project_board' && selectedProject) {
                    setSelectedProject(null)
                    goBack()
                  } else {
                    goBack()
                  }
                }}
                className="flex items-center gap-1 text-white/70 md:text-tw-text-secondary hover:text-white md:hover:text-tw-primary transition-colors p-1.5 rounded-lg"
                title="Go back"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
                </svg>
              </button>
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
            {/* Install App button — mobile only */}
            {canInstall && (
              <button onClick={isIOS ? () => setShowIOSGuide(true) : installApp}
                className="md:hidden flex items-center gap-1 bg-white/10 hover:bg-white/20 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors"
                title="Install App">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                </svg>
                <span>Install</span>
              </button>
            )}
            {showIOSGuide && (
              <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-black/40" onClick={() => setShowIOSGuide(false)}>
                <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
                  <h3 className="font-semibold text-tw-text mb-3 text-center">Install TaskWise</h3>
                  <div className="space-y-3 text-sm text-tw-text-secondary">
                    <div className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-tw-primary text-white text-xs flex items-center justify-center flex-shrink-0 font-bold">1</span>
                      <span>Tap the <strong className="text-tw-text">Share</strong> button at the bottom of Safari
                        <svg className="inline w-4 h-4 ml-1 text-[#007aff]" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l-4 4h3v8h2V6h3l-4-4zm-7 14v4h14v-4h-2v2H7v-2H5z"/></svg>
                      </span>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-tw-primary text-white text-xs flex items-center justify-center flex-shrink-0 font-bold">2</span>
                      <span>Scroll down and tap <strong className="text-tw-text">Add to Home Screen</strong></span>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-tw-primary text-white text-xs flex items-center justify-center flex-shrink-0 font-bold">3</span>
                      <span>Tap <strong className="text-tw-text">Add</strong> in the top-right corner</span>
                    </div>
                  </div>
                  <button onClick={() => setShowIOSGuide(false)} className="mt-5 w-full btn-primary text-sm py-2.5">Got it</button>
                </div>
              </div>
            )}
            {/* Push notifications button — mobile only */}
            {!pushEnabled && (
              <button onClick={enablePush}
                className="md:hidden flex items-center gap-1 bg-white/10 hover:bg-white/20 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors"
                title="Enable Notifications">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
                </svg>
                <span className="hidden xs:inline">Notify</span>
              </button>
            )}
            <NotificationsMenu />
            <MobileUserMenu user={user} onProfile={() => navigate('profile' as ViewMode)} onLogout={onLogout} />
          </div>
        </header>

        <main ref={mainRef} className="flex-1 overflow-auto pb-20 md:pb-0">
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
                          <th className="text-left px-4 py-3 text-xs font-bold text-tw-primary uppercase tracking-wider w-[50%]">Task</th>
                          <th className="text-left px-4 py-3 text-xs font-bold text-tw-primary uppercase tracking-wider w-[30%]">Project</th>
                          <th className="text-left px-4 py-3 text-xs font-bold text-tw-primary uppercase tracking-wider whitespace-nowrap">Status</th>
                          <th className="text-left px-4 py-3 text-xs font-bold text-tw-primary uppercase tracking-wider whitespace-nowrap">Priority</th>
                          <th className="text-left px-4 py-3 text-xs font-bold text-tw-primary uppercase tracking-wider whitespace-nowrap">Deadline</th>
                          <th className="text-left px-4 py-3 text-xs font-bold text-tw-primary uppercase tracking-wider whitespace-nowrap">Days Left</th>
                          <th className="w-8 px-2 py-3"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {queue.map(t => {
                          const isExpanded  = expandedId === t.id
                          const isDeptPending = t.assignments?.some(a => a.departmentId === user.departmentId) && !t.assignments?.some(a => a.personnelId)
                          const isOverdue = t.deadline && new Date(t.deadline) < new Date()
                          const assigneeName = t.assignments?.[0]
                            ? (t.assignments[0].personnel?.name || t.assignments[0].department?.name || '—')
                            : '—'
                          return (
                            <React.Fragment key={t.id}>
                              <tr onClick={() => setExpandedId(isExpanded ? null : t.id)}
                                className={`cursor-pointer transition-colors border-b border-tw-border ${isExpanded ? 'bg-blue-50' : 'hover:bg-[#f8f9ff]'}`}>
                                <td className="pl-3 pr-0 py-3.5">
                                  <div className={`w-1.5 h-9 rounded-full ${priorityBar[t.priority]}`} />
                                </td>
                                <td className="px-4 py-3.5">
                                  <div className="font-semibold text-tw-text text-sm">{t.title}</div>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    {t.parentTaskId && <span className="text-xs text-purple-600 font-medium">↳ subtask</span>}
                                    {(t._count?.subtasks ?? 0) > 0 && <span className="text-xs text-tw-indigo font-medium">⊞ {t._count!.subtasks} subtask{t._count!.subtasks !== 1 ? 's' : ''}</span>}
                                  </div>
                                </td>
                                <td className="px-4 py-3.5 text-sm text-tw-text-secondary">
                                  {t.parentTaskId
                                    ? <span className="inline-flex items-center gap-1 text-purple-600"><span className="w-2 h-2 rounded-full bg-purple-400 inline-block flex-shrink-0" />{t.parent?.title ?? 'Subtask'}</span>
                                    : t.project?.name
                                      ? <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-tw-teal inline-block flex-shrink-0" />{t.project.name}</span>
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
                    <div key={p.id} onClick={() => { const scrollTop = mainRef.current?.scrollTop ?? 0; setViewHistory(h => [...h, { view: currentView, scrollTop }]); setSelectedProject(p) }}
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
              onClick={() => { navigate(item.view); setSelectedProject(null) }}
              className={`flex-1 flex flex-col items-center justify-center py-4 px-1 gap-1 relative transition-colors
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
