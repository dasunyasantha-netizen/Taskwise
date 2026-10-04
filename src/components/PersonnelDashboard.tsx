import React, { useState, useEffect, useRef } from 'react'
import type { AuthUser, ViewMode, Task, Project, Personnel, TaskProgressLog } from '../types'
import { taskApi, projectApi, workspaceApi } from '../services/apiService'
import NotificationsMenu from './NotificationsMenu'
import PickitiHomeLink from './PickitiHomeLink'
import MobileUserMenu from './MobileUserMenu'
import { requestRefresh } from '../hooks/useRefresh'
import MobileNav, { type MobileNavItem } from './MobileNav'
import { Icon } from './ui/Icon'
import { PageHeader, EmptyState, LoadingBlock, ThemeToggle } from './ui/Primitives'
import Sidebar, { type SidebarSection } from './Sidebar'
import PersonnelTaskModal from './PersonnelTaskModal'
import BoardView from './BoardView'
import ProfilePage from './ProfilePage'
import ElapsedDays from './ElapsedDays'
import { usePWA } from '../hooks/usePWA'
import { useLanguage } from '../i18n/Language'
import ProgressUpdateSheet from './ProgressUpdateSheet'
import InsuranceManagementPage from './InsuranceManagementPage'
import YsoPerformancePage from './YsoPerformancePage'
import LetterManagement from './LetterManagement'
import { launcherHomeUrl, type LaunchSource } from '../services/launchSource'

interface Props {
  user: AuthUser
  currentView: ViewMode
  setView: (v: ViewMode) => void
  onLogout: () => void
  onUserUpdate: (updated: Partial<AuthUser>) => void
  launchSource: LaunchSource
}

// ── shared lookup maps ────────────────────────────────────────────────────────
const priorityBar:  Record<string, string> = {
  CRITICAL: 'bg-red-500', HIGH: 'bg-orange-400', MEDIUM: 'bg-yellow-400', LOW: 'bg-gray-300',
}
const statusBadge: Record<string, string> = {
  IN_PROGRESS: 'badge-warning',
  BLOCKED:     'badge-teal',
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
  BLOCKED:     'bg-teal-500',
  SUBMITTED:   'bg-purple-500',
  APPROVED:    'bg-green-500',
  RETURNED:    'bg-red-400',
  REJECTED:    'bg-red-500',
  CANCELLED:   'bg-gray-300',
}

function daysLeftLabel(deadline?: string) {
  if (!deadline) return null
  const d = Math.ceil((new Date(deadline).setHours(0,0,0,0) - new Date().setHours(0,0,0,0)) / 86400000)
  if (d < 0)  return <span className="badge bg-tw-danger text-white ring-tw-danger">{Math.abs(d)}d overdue</span>
  if (d === 0) return <span className="badge badge-warning">Due today</span>
  if (d <= 3)  return <span className="badge badge-warning">{d}d left</span>
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
      <div className="fixed inset-0 flex items-center justify-center z-50 bg-[#0b1220]/50 backdrop-blur-[3px] animate-fade-in" onClick={() => setConfirmNote('')}>
        <div className="modal-panel w-full max-w-sm mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
          <div className="px-5 py-4 border-b border-tw-border">
            <h3 className="font-semibold text-tw-text">Post Progress Update?</h3>
            <p className="text-xs text-tw-text-secondary mt-0.5">This update will be visible to your director.</p>
          </div>
          <div className="px-5 py-4">
            <p className="text-sm text-tw-text panel-muted px-3 py-2 italic">"{confirmNote}"</p>
          </div>
          <div className="px-5 py-4 border-t border-tw-border flex justify-end gap-2">
            <button className="btn-secondary text-sm" onClick={() => setConfirmNote('')}>Cancel</button>
            <button disabled={progressLoading} onClick={handleAddLog}
              className="btn-success">
              {progressLoading ? '…' : 'Post Update'}
            </button>
          </div>
        </div>
      </div>
    )}
    <tr className="border-b border-tw-primary/20 bg-tw-primary/[0.03]">
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
            <div className="alert-error">
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
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-tw-primary/[0.05] cursor-pointer transition-colors">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${subtaskStatusDot[s.status] || 'bg-gray-400'}`} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-tw-text truncate">{s.title}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`badge text-xs ${statusBadge[s.status] || 'badge-gray'}`}>{displayStatus(s.status)}</span>
                            <span className="text-xs text-tw-text-secondary truncate inline-flex items-center gap-1"><Icon name="arrowRight" className="w-3 h-3" /> {assigneeName}</span>
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
            <div className="alert-error flex items-center justify-between">
              {actionError}
              <button onClick={() => setActionError('')} className="ml-2"><Icon name="x" className="w-3.5 h-3.5" /></button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 justify-between">
            <div className="flex flex-wrap gap-2">
              {canAccept && (
                <button disabled={actionLoading} onClick={e => { e.stopPropagation(); handleAccept() }}
                  className="btn-primary">
                  <Icon name="check" className="w-4 h-4" /> Accept Task
                </button>
              )}
              {canComplete && (
                <button disabled={actionLoading} onClick={e => { e.stopPropagation(); handleComplete() }}
                  className="btn-success">
                  {actionLoading ? '…' : <><Icon name="check" className="w-4 h-4" /> Complete</>}
                </button>
              )}
              {canReturn && (
                <button disabled={actionLoading} onClick={e => { e.stopPropagation(); setShowReturn(true) }}
                  className="btn-outline-danger">
                  <Icon name="sendBack" className="w-4 h-4" /> Return
                </button>
              )}
            </div>
            <button onClick={e => { e.stopPropagation(); onOpen() }} className="btn-secondary">
              Open Task <Icon name="arrowRight" className="w-4 h-4" />
            </button>
          </div>

          {/* ── Return reason modal ── */}
          {showReturn && (
            <div className="fixed inset-0 flex items-center justify-center z-50 p-4 bg-[#0b1220]/50 backdrop-blur-[3px] animate-fade-in" onClick={e => e.stopPropagation()}>
              <div className="modal-panel w-full max-w-sm">
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
                      className="btn-danger">
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
      <tr className="hover:bg-tw-hover transition-colors">
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
            <button disabled={loading} onClick={() => { if (confirm(`Approve "${task.title}"?\n\nThis marks the task as approved.`)) doAction(() => taskApi.approve(task.id)) }}
              className="btn-success btn-sm">
              <Icon name="check" className="w-3.5 h-3.5" /> Approve
            </button>
            <button disabled={loading} onClick={() => setShowReject(true)}
              className="btn-outline-danger btn-sm">
              <Icon name="sendBack" className="w-3.5 h-3.5" /> Reject
            </button>
            <button onClick={onOpen} className="btn-secondary btn-sm">
              View <Icon name="arrowRight" className="w-3.5 h-3.5" />
            </button>
          </div>
          {error && <div className="text-xs text-tw-danger mt-1">{error}</div>}
        </td>
      </tr>
      {showReject && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4 bg-[#0b1220]/50 backdrop-blur-[3px] animate-fade-in">
          <div className="modal-panel w-full max-w-sm">
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
                  className="btn-danger">
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
        <div className="alert-error">
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
                className="bg-tw-surface rounded-xl border border-tw-border px-3 py-2.5 flex items-center gap-3 active:bg-tw-hover">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${subtaskStatusDot[s.status] || 'bg-gray-400'}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-tw-text truncate">{s.title}</div>
                  <span className={`badge text-xs ${statusBadge[s.status] || 'badge-gray'}`}>{displayStatus(s.status)}</span>
                </div>
                <Icon name="chevronRight" className="w-4 h-4 text-tw-text-muted flex-shrink-0" />
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
          <div className="fixed inset-0 flex items-center justify-center z-50 bg-[#0b1220]/50 backdrop-blur-[3px] animate-fade-in" onClick={() => setConfirmNote('')}>
            <div className="modal-panel w-full max-w-sm mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="px-5 py-4 border-b border-tw-border">
                <h3 className="font-semibold text-tw-text">Post Progress Update?</h3>
                <p className="text-xs text-tw-text-secondary mt-0.5">This update will be visible to your director.</p>
              </div>
              <div className="px-5 py-4">
                <p className="text-sm text-tw-text panel-muted px-3 py-2 italic">"{confirmNote}"</p>
              </div>
              <div className="px-5 py-4 border-t border-tw-border flex justify-end gap-2">
                <button className="btn-secondary text-sm" onClick={() => setConfirmNote('')}>Cancel</button>
                <button disabled={progressLoading} onClick={handleAddLog}
                  className="btn-success">
                  {progressLoading ? '…' : 'Post Update'}
                </button>
              </div>
            </div>
          </div>
        )}
        {progressLogs.length > 0 && (
          <div className="space-y-2">
            {progressLogs.map(log => (
              <div key={log.id} className="bg-tw-surface rounded-xl border border-tw-border px-3 py-2.5">
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
        <div className="alert-error flex items-center justify-between">
          {actionError}<button onClick={() => setActionError('')} className="ml-2"><Icon name="x" className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2">
        {canAccept && (
          <button disabled={actionLoading} onClick={e => { e.stopPropagation(); doAction(() => taskApi.accept(task.id)) }}
            className="btn-primary col-span-2 py-3">
            <Icon name="check" className="w-4 h-4" /> Accept Task
          </button>
        )}
        {canComplete && (
          <button disabled={actionLoading} onClick={e => { e.stopPropagation(); doAction(async () => { if (task.status === 'ASSIGNED') await taskApi.accept(task.id); await taskApi.submit(task.id) }) }}
            className="btn-success py-3">
            {actionLoading ? '…' : <><Icon name="check" className="w-4 h-4" /> Complete</>}
          </button>
        )}
        {canReturn && (
          <button disabled={actionLoading} onClick={e => { e.stopPropagation(); setShowReturn(true) }}
            className="btn-outline-danger py-3">
            <Icon name="sendBack" className="w-4 h-4" /> Return
          </button>
        )}
        <button onClick={e => { e.stopPropagation(); onOpen() }}
          className={`btn-secondary py-3 ${canComplete || canReturn ? '' : 'col-span-2'}`}>
          Open Task <Icon name="arrowRight" className="w-4 h-4" />
        </button>
      </div>

      {/* Return modal */}
      {showReturn && (
        <div className="fixed inset-0 flex items-end justify-center z-50 p-0 bg-[#0b1220]/50 backdrop-blur-[3px] animate-fade-in" onClick={e => e.stopPropagation()}>
          <div className="bg-tw-surface border-t border-tw-border rounded-t-3xl w-full max-w-lg px-5 py-6 space-y-4 animate-slide-up">
            <div className="w-10 h-1 bg-tw-border-strong rounded-full mx-auto mb-2" />
            <h3 className="font-bold text-tw-text text-lg">Return Task</h3>
            <textarea className="input resize-none text-sm" rows={4} autoFocus
              placeholder="Reason for returning…" value={returnReason} onChange={e => setReturnReason(e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => { setShowReturn(false); setReturnReason('') }}
                className="btn-secondary py-3">Cancel</button>
              <button disabled={!returnReason.trim() || actionLoading}
                onClick={() => { doAction(() => taskApi.return(task.id, returnReason)); setShowReturn(false); setReturnReason('') }}
                className="btn-danger py-3">
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
    <div className="card overflow-hidden">
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
        <div className="px-4 pb-4 border-t border-tw-border pt-3 space-y-3">
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
            <button disabled={loading} onClick={() => { if (confirm(`Approve "${task.title}"?\n\nThis marks the task as approved.`)) doAction(() => taskApi.approve(task.id)) }}
              className="btn-success btn-sm py-2.5">
              <Icon name="check" className="w-3.5 h-3.5" /> Approve
            </button>
            <button disabled={loading} onClick={() => setShowReject(true)}
              className="btn-outline-danger btn-sm py-2.5">
              <Icon name="sendBack" className="w-3.5 h-3.5" /> Reject
            </button>
            <button onClick={onOpen}
              className="btn-secondary btn-sm py-2.5">
              View <Icon name="arrowRight" className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {showReject && (
        <div className="fixed inset-0 flex items-end justify-center z-50 bg-[#0b1220]/50 backdrop-blur-[3px] animate-fade-in">
          <div className="bg-tw-surface border-t border-tw-border rounded-t-3xl w-full max-w-lg px-5 py-6 space-y-4 animate-slide-up">
            <div className="w-10 h-1 bg-tw-border-strong rounded-full mx-auto mb-2" />
            <h3 className="font-bold text-tw-text text-lg">Reject Task</h3>
            <textarea className="input resize-none text-sm" rows={4} autoFocus
              placeholder="Reason for rejecting…" value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => { setShowReject(false); setRejectReason('') }}
                className="btn-secondary py-3">Cancel</button>
              <button disabled={!rejectReason.trim() || loading}
                onClick={() => { doAction(() => taskApi.reject(task.id, rejectReason)); setShowReject(false); setRejectReason('') }}
                className="btn-danger py-3">
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
  const { t } = useLanguage()
  const insuranceEnabled = user.features?.includes('insurance_management') === true
  const ysoEnabled = user.features?.includes('four_level_hierarchy') === true && !!user.ysoRole
  const { canInstall, isIOS, installApp, pushState, enablePush } = usePWA({ autoPush: !user.impersonation })
  const refreshAll = () => { void load(); requestRefresh() }
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
  const [ysoHasSelection, setYsoHasSelection] = useState(false)
  const [ysoDirectoryResetKey, setYsoDirectoryResetKey] = useState(0)

  const navigate = (v: typeof currentView) => {
    if (v === currentView && v === 'yso_performance') {
      setYsoDirectoryResetKey(key => key + 1)
      return
    }
    const scrollTop = mainRef.current?.scrollTop ?? 0
    setViewHistory(h => [...h, { view: currentView, scrollTop }])
    setView(v)
  }
  const goBack = () => {
    if (currentView === 'yso_performance' && ysoHasSelection) {
      setYsoDirectoryResetKey(key => key + 1)
      return
    }
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
  const canGoBack = (viewHistory.length > 0 && currentView !== 'personnel_queue') || (currentView === 'yso_performance' && ysoHasSelection)

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

  const sidebarSections: SidebarSection[] = [
    { title: 'My Work', items: [
      { label: 'My Queue',       view: 'personnel_queue',          icon: 'queue', badge: queue.length, badgeTone: 'warning' },
      { label: 'Approval Queue', view: 'personnel_approval_queue', icon: 'approve', badge: approvalTasks.length, badgeTone: 'warning' },
      { label: 'Board View',     view: 'project_board',            icon: 'board' },
    ] },
    { title: 'Workspace', items: [
      { label: 'Letters', view: 'letters', icon: 'letter' },
      ...(ysoEnabled ? [{ label: user.ysoRole === 'YSO' ? 'YSO Task Hub' : 'YSO Performance', view: 'yso_performance' as ViewMode, icon: 'sprout' as const }] : []),
      ...(insuranceEnabled ? [{ label: 'Insurance', view: 'insurance_management' as ViewMode, icon: 'shield' as const }] : []),
    ] },
  ]

  // Mobile: primary destinations in the floating bar, the rest in "More"
  const mobileNavItems: MobileNavItem[] = [
    { label: 'Tasks',     view: 'personnel_queue',          icon: 'queue',   badge: queue.length },
    { label: 'Approvals', view: 'personnel_approval_queue', icon: 'approve', badge: approvalTasks.length },
    ...(ysoEnabled
      ? [{ label: user.ysoRole === 'YSO' ? 'YSO Tasks' : 'My YSOs', view: 'yso_performance' as ViewMode, icon: 'sprout' as const }]
      : [{ label: 'Projects', view: 'project_board' as ViewMode, icon: 'board' as const }]),
    { label: 'Letters',   view: 'letters',                  icon: 'letter' },
  ]
  const mobileMoreItems: MobileNavItem[] = [
    ...(ysoEnabled ? [{ label: 'Projects', view: 'project_board' as ViewMode, icon: 'board' as const }] : []),
    ...(insuranceEnabled ? [{ label: 'Insurance', view: 'insurance_management' as ViewMode, icon: 'shield' as const }] : []),
  ]
  const pendingAccept = queue.filter(t =>
    t.assignments?.some(a => a.departmentId === user.departmentId) &&
    !t.assignments?.some(a => a.personnelId)
  ).length

  const COL_COUNT = 8   // total <th> columns including the expand chevron

  return (
    <div className="min-h-screen bg-tw-bg flex relative overflow-x-clip">

      {/* ── Watermark ───────────────────────────────────────────────────── */}
      {currentView !== 'letters' && <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <img src="/taskwise/watermark.jpeg" alt="" className="tw-watermark absolute bottom-0 select-none"
          style={{ width: '100%', maxWidth: '480px', left: '50%', transform: 'translateX(-50%)' }} />
      </div>}

      {/* ── Desktop Sidebar ──────────────────────────────────────────────── */}
      <Sidebar
        user={user}
        roleLabel="Personnel"
        sections={sidebarSections}
        activeView={currentView}
        onSelect={v => { navigate(v); setSelectedProject(null) }}
        onLogout={onLogout}
        highlight={approvalTasks.length > 0 && currentView !== 'personnel_approval_queue' ? {
          title: `${approvalTasks.length} ${t(approvalTasks.length === 1 ? 'task is awaiting your approval' : 'tasks are awaiting your approval')}`,
          cta: t('Review now'),
          onClick: () => navigate('personnel_approval_queue'),
        } : undefined}
      />

      {/* ── Main ────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Top bar */}
        <header className={`sticky z-20 ${user.impersonation ? 'top-[56px] md:top-[68px]' : 'top-0 md:top-3'} bg-tw-surface/85 backdrop-blur-xl border-b border-tw-border md:border md:rounded-2xl md:mx-3 md:mt-3 md:shadow-card px-3 md:px-4 py-2.5 flex items-center justify-between gap-2`}>
          <div className="flex items-center gap-2 min-w-0">
            {user.companyLogo ? (
              <img src={user.companyLogo} alt="Logo" className="w-8 h-8 rounded-xl object-contain bg-white p-0.5 ring-1 ring-tw-border md:hidden" />
            ) : (
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#3d9bff] to-tw-primary flex items-center justify-center md:hidden flex-shrink-0 shadow-cta">
                <span className="text-white font-bold text-xs">{(user.companyName || 'T')[0].toUpperCase()}</span>
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
                className="icon-btn w-8 h-8"
                title="Go back"
              >
                <Icon name="arrowLeft" className="w-[18px] h-[18px]" />
              </button>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[15px]">
                <span className="hidden lg:inline text-tw-text-muted truncate max-w-[180px]">{user.companyName || 'TaskWise'}</span>
                <Icon name="chevronRight" className="hidden lg:block w-3.5 h-3.5 text-tw-text-muted flex-shrink-0" />
                <span className="font-semibold text-tw-text truncate">
                  {currentView === 'personnel_queue' ? 'My Queue'
                  : currentView === 'personnel_approval_queue' ? 'Approvals'
                  : currentView === 'project_board' ? (selectedProject ? selectedProject.name : 'Projects')
                  : currentView === 'insurance_management' ? 'Insurance Management'
                  : currentView === 'letters' ? t('Letters')
                  : currentView === 'yso_performance' ? t(user.ysoRole === 'YSO' ? 'YSO Task Hub' : 'YSO Performance')
                  : 'My Profile'}
                </span>
              </div>
              <div className="text-[11px] text-tw-text-secondary md:hidden truncate">{user.name}</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={refreshAll} title={t('Refresh')} aria-label={t('Refresh')} className="icon-btn hidden md:inline-flex">
              <Icon name="refresh" className="w-[18px] h-[18px]" />
            </button>
            {showIOSGuide && (
              <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-[#0b1220]/50 backdrop-blur-[3px] animate-fade-in" onClick={() => setShowIOSGuide(false)}>
                <div className="modal-panel w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
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
            <ThemeToggle compact className="hidden md:inline-flex" />
            <PickitiHomeLink />
            <NotificationsMenu
              onOpenYso={() => navigate('yso_performance')}
              onOpenLetter={(id) => { sessionStorage.setItem('taskwise_letter_open', id); navigate('letters'); window.dispatchEvent(new CustomEvent('taskwise:open-letter', { detail: id })) }}
              onOpenTask={async taskId => {
                try {
                  setTaskStack([])
                  setSelectedTask(await taskApi.get(taskId) as Task)
                } catch {
                  await load()
                }
              }}
            />
            <MobileUserMenu user={user} roleLabel="Personnel" onProfile={() => navigate('profile' as ViewMode)} onLogout={onLogout} onUserUpdate={onUserUpdate} links={mobileMoreItems} onNavigate={item => { navigate(item.view); setSelectedProject(null) }} onRefresh={refreshAll} launcher={{ href: launcherHomeUrl('pickiti'), label: 'Back to Pickiti' }} onInstall={canInstall ? (isIOS ? () => setShowIOSGuide(true) : installApp) : undefined} push={pushState} onEnablePush={enablePush} />
          </div>
        </header>

        <main ref={mainRef} className="flex-1 overflow-auto pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:pb-0">
          {/* ── MY QUEUE ──────────────────────────────────────────────── */}
          {currentView === 'personnel_queue' && (
            <div className="page">
              <PageHeader icon="queue" tone="blue" title="My Task Queue"
                subtitle={<>
                  {queue.length} active task{queue.length !== 1 ? 's' : ''} assigned to you
                  {pendingAccept > 0 && (
                    <span className="ml-2 badge badge-warning">
                      <Icon name="zap" className="w-3 h-3" /> {pendingAccept} pending acceptance
                    </span>
                  )}
                </>} />

              {error && (
                <div className="mb-4 alert-error">
                  {error} — <button onClick={load} className="underline">Try again</button>
                </div>
              )}

              {loading ? (
                <LoadingBlock />
              ) : queue.length === 0 ? (
                <div className="card">
                  <EmptyState icon="party" tone="green" title="All clear!" text="No tasks assigned to you right now." />
                </div>
              ) : (
                <>
                  {/* ── Mobile card list ── */}
                  <div className="md:hidden space-y-3">
                    {queue.map(t => {
                      const isExpanded = expandedId === t.id
                      const isDeptPending = t.assignments?.some(a => a.departmentId === user.departmentId) && !t.assignments?.some(a => a.personnelId)
                      const isOverdue = t.deadline && new Date(t.deadline) < new Date()
                      const priorityColors: Record<string, string> = { CRITICAL: 'bg-red-500', HIGH: 'bg-orange-400', MEDIUM: 'bg-yellow-400', LOW: 'bg-gray-300' }
                      return (
                        <React.Fragment key={t.id}>
                          <div
                            onClick={() => setExpandedId(isExpanded ? null : t.id)}
                            className="card relative overflow-hidden transition-all active:scale-[0.99]"
                          >
                            <span className={`absolute left-0 top-3 bottom-3 w-1 rounded-r-full ${priorityColors[t.priority]}`} />
                            <div className="px-4 py-3.5">
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <div className="flex-1 min-w-0">
                                  <div className="font-semibold text-tw-text text-sm leading-snug">{t.title}</div>
                                  {t.parentTaskId && <span className="text-xs text-purple-600 font-medium inline-flex items-center gap-1"><Icon name="cornerDownRight" className="w-3 h-3" /> subtask</span>}
                                </div>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  {isDeptPending && <span className="badge bg-amber-500 text-white ring-amber-500">Accept</span>}
                                  <Icon name="chevronDown" className={`w-4 h-4 text-tw-text-secondary transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`badge text-xs ${statusBadge[t.status] || 'badge-gray'}`}>{displayStatus(t.status)}</span>
                                {t.startedAt && !['APPROVED','CANCELLED','REJECTED'].includes(t.status) && <ElapsedDays startedAt={t.startedAt} />}
                                {t.parentTaskId
                                  ? <span className="text-xs text-purple-500 font-medium truncate max-w-[120px] inline-flex items-center gap-1"><Icon name="cornerDownRight" className="w-3 h-3 flex-shrink-0" /> {t.parent?.title}</span>
                                  : t.project?.name && <span className="text-xs text-tw-text-secondary truncate max-w-[120px] inline-flex items-center gap-1"><Icon name="project" className="w-3 h-3 flex-shrink-0" /> {t.project.name}</span>}
                                {t.deadline && <span className={`text-xs font-medium inline-flex items-center gap-1 ${isOverdue ? 'text-red-500' : 'text-tw-text-secondary'}`}><Icon name="calendar" className="w-3 h-3" /> {new Date(t.deadline).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</span>}
                                {daysLeftLabel(t.deadline ?? undefined)}
                              </div>
                            </div>
                          </div>
                          {isExpanded && (
                            <div className="bg-tw-primary/[0.03] rounded-2xl border border-tw-primary/20 overflow-hidden -mt-1 mb-1 mx-0.5">
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
                    <table className="table-modern">
                      <thead>
                        <tr className="bg-tw-surface-2 border-b border-tw-border">
                          <th className="w-px px-3 py-3"></th>
                          <th className="text-left px-4 py-3 text-[11px] font-semibold text-tw-text-secondary uppercase tracking-[0.08em] w-[50%]">Task</th>
                          <th className="text-left px-4 py-3 text-[11px] font-semibold text-tw-text-secondary uppercase tracking-[0.08em] w-[30%]">Project</th>
                          <th className="text-left px-4 py-3 text-[11px] font-semibold text-tw-text-secondary uppercase tracking-[0.08em] whitespace-nowrap">Status</th>
                          <th className="text-left px-4 py-3 text-[11px] font-semibold text-tw-text-secondary uppercase tracking-[0.08em] whitespace-nowrap">Priority</th>
                          <th className="text-left px-4 py-3 text-[11px] font-semibold text-tw-text-secondary uppercase tracking-[0.08em] whitespace-nowrap">Deadline</th>
                          <th className="text-left px-4 py-3 text-[11px] font-semibold text-tw-text-secondary uppercase tracking-[0.08em] whitespace-nowrap">Days Left</th>
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
                                className={`cursor-pointer transition-colors border-b border-tw-border ${isExpanded ? 'bg-tw-primary/[0.05]' : 'hover:bg-tw-hover'}`}>
                                <td className="pl-3 pr-0 py-3.5">
                                  <div className={`w-1.5 h-9 rounded-full ${priorityBar[t.priority]}`} />
                                </td>
                                <td className="px-4 py-3.5">
                                  <div className="font-semibold text-tw-text text-sm">{t.title}</div>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    {t.parentTaskId && <span className="text-xs text-purple-600 font-medium inline-flex items-center gap-1"><Icon name="cornerDownRight" className="w-3 h-3" /> subtask</span>}
                                    {(t._count?.subtasks ?? 0) > 0 && <span className="text-xs text-tw-indigo font-medium inline-flex items-center gap-1"><Icon name="layers" className="w-3 h-3" /> {t._count!.subtasks} subtask{t._count!.subtasks !== 1 ? 's' : ''}</span>}
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
                                    ? <span className={`inline-flex items-center gap-1 ${isOverdue ? 'text-tw-danger font-semibold' : 'text-tw-text-secondary'}`}><Icon name="calendar" className="w-3.5 h-3.5" /> {new Date(t.deadline).toLocaleDateString()}</span>
                                    : <span className="text-tw-text-secondary">—</span>}
                                </td>
                                <td className="px-4 py-3.5 whitespace-nowrap">{daysLeftLabel(t.deadline ?? undefined)}</td>
                                <td className="px-3 py-3.5 whitespace-nowrap">
                                  <div className="flex items-center justify-end gap-2">
                                    {isDeptPending && <span className="badge bg-tw-warning text-white ring-tw-warning">Accept</span>}
                                    <Icon name="chevronDown" className={`w-4 h-4 text-tw-text-secondary transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
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
            <div className="page">
              <PageHeader icon="approve" tone="purple" title="Approval Queue"
                subtitle={`${approvalTasks.length} task${approvalTasks.length !== 1 ? 's' : ''} submitted to you for approval`} />
              {approvalTasks.length === 0 ? (
                <div className="card">
                  <EmptyState icon="party" tone="green" title="All clear!" text="No tasks awaiting your approval." />
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
                    <table className="table-modern">
                      <thead>
                        <tr className="bg-tw-surface-2 border-b border-tw-border">
                          <th className="w-px px-3 py-3"></th>
                          <th className="text-left px-4 py-3 text-[11px] font-semibold text-tw-text-secondary uppercase tracking-[0.08em]">Task</th>
                          <th className="text-left px-4 py-3 text-[11px] font-semibold text-tw-text-secondary uppercase tracking-[0.08em]">Project</th>
                          <th className="text-left px-4 py-3 text-[11px] font-semibold text-tw-text-secondary uppercase tracking-[0.08em]">Submitted By</th>
                          <th className="text-left px-4 py-3 text-[11px] font-semibold text-tw-text-secondary uppercase tracking-[0.08em]">Priority</th>
                          <th className="text-left px-4 py-3 text-[11px] font-semibold text-tw-text-secondary uppercase tracking-[0.08em]">Deadline</th>
                          <th className="text-left px-4 py-3 text-[11px] font-semibold text-tw-text-secondary uppercase tracking-[0.08em]">Actions</th>
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
          {currentView === 'insurance_management' && insuranceEnabled && (
            <InsuranceManagementPage />
          )}
          {currentView === 'letters' && <LetterManagement user={user} onUserUpdate={onUserUpdate} />}
          {currentView === 'yso_performance' && ysoEnabled && <YsoPerformancePage user={user} onUserUpdate={onUserUpdate} directoryResetKey={ysoDirectoryResetKey} onSelectionChange={setYsoHasSelection} />}

          {currentView === 'project_board' && !selectedProject && (
            <div className="page">
              <PageHeader icon="project" tone="teal" title="Projects" subtitle="Projects where you have assigned work." />
              {projects.length === 0 ? (
                <div className="card"><EmptyState icon="project" title="No projects available." /></div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                  {projects.filter(p => p.status === 'active').map(p => (
                    <div key={p.id} onClick={() => { const scrollTop = mainRef.current?.scrollTop ?? 0; setViewHistory(h => [...h, { view: currentView, scrollTop }]); setSelectedProject(p) }}
                      className="card card-hover p-4 cursor-pointer active:scale-[0.98] group">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: p.color + '22' }}>
                          <div className="w-4 h-4 rounded-full" style={{ backgroundColor: p.color }} />
                        </div>
                        <span className="font-semibold text-tw-text text-sm">{p.name}</span>
                      </div>
                      {p.description && <p className="text-xs text-tw-text-secondary leading-relaxed">{p.description}</p>}
                      <div className="mt-3 flex items-center justify-end">
                        <span className="text-xs text-tw-primary-text font-semibold flex items-center gap-1">View Board <Icon name="arrowRight" className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" /></span>
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

      {/* ── Mobile bottom bar ──────────────────────────────────────────── */}
      <MobileNav
        primary={mobileNavItems}
        more={[]}
        activeView={currentView}
        onSelect={v => { navigate(v); setSelectedProject(null) }}
      />

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
