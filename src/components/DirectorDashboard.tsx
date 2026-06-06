import React, { useState, useEffect, useRef } from 'react'
import type { AuthUser, ViewMode, Project, Task, AuditLog, TaskComment, Layer, Personnel } from '../types'
import ElapsedDays from './ElapsedDays'
import { projectApi, taskApi, auditApi, workspaceApi, taskGroupApi } from '../services/apiService'
import DatePicker from './DatePicker'
import Select from './Select'
import NotificationsMenu from './NotificationsMenu'
import { usePWA } from '../hooks/usePWA'
import HierarchyPanel from './HierarchyPanel'
import ProjectManager from './ProjectManager'
import BoardView from './BoardView'
import FlowchartView from './FlowchartView'
import ProfilePage from './ProfilePage'
import WorkspaceSettings from './WorkspaceSettings'
import TaskDetailPanel from './TaskDetailPanel'
import RecentUpdatesView from './RecentUpdatesView'
import BroadcastsPage from './BroadcastsPage'
import GroupWiseTasksPage from './GroupWiseTasksPage'
import ReportsPage from './ReportsPage'
import type { ReportsState } from './ReportsPage'
import { DEFAULT_REPORTS_STATE } from './ReportsPage'
import ImpersonationPage from './ImpersonationPage'

interface Props {
  user: AuthUser
  currentView: ViewMode
  setView: (v: ViewMode) => void
  onLogout: () => void
  onUserUpdate: (updated: Partial<AuthUser>) => void
  onImpersonationStart?: (token: string, impersonatedUser: AuthUser) => void
}

type ProjectSubView = 'board' | 'flowchart'

type NextTaskForm = {
  title: string; description: string; projectId: string; priority: string
  deadline: string; isGroupTask: boolean; groupId: string; personnelIds: string[]
  personnelSearch: string
}
const emptyNextTask = (): NextTaskForm => ({
  title: '', description: '', projectId: '', priority: 'MEDIUM',
  deadline: '', isGroupTask: false, groupId: '', personnelIds: [], personnelSearch: '',
})

// ─── Approval Queue View ──────────────────────────────────────────────────────

const priorityBadge: Record<string, string> = {
  CRITICAL: 'badge-danger', HIGH: 'badge-warning', MEDIUM: 'badge-primary', LOW: 'badge-gray',
}
const subtaskStatusBadge: Record<string, string> = {
  PENDING: 'badge-gray', ASSIGNED: 'badge-primary', IN_PROGRESS: 'badge-warning',
  SUBMITTED: 'badge-purple', APPROVED: 'badge-success',
  RETURNED: 'badge-danger', REJECTED: 'badge-danger', CANCELLED: 'badge-gray',
}
const subtaskStatusDot: Record<string, string> = {
  PENDING: 'bg-gray-400', ASSIGNED: 'bg-blue-500', IN_PROGRESS: 'bg-yellow-500',
  SUBMITTED: 'bg-purple-500', APPROVED: 'bg-green-500',
  RETURNED: 'bg-red-400', REJECTED: 'bg-red-500', CANCELLED: 'bg-gray-300',
}

function ApprovalTaskRow({
  task, actorId, onRefresh,
}: { task: Task; actorId: string; onRefresh: () => void }) {
  const [expanded,  setExpanded]  = useState(false)
  const [subtasks,  setSubtasks]  = useState<Task[]>([])
  const [comments,  setComments]  = useState<TaskComment[]>([])
  const [loadingS,  setLoadingS]  = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError,   setActionError]   = useState('')

  // Approve & Assign Next
  const [showAssignNext,    setShowAssignNext]    = useState(false)
  const [nextTasks,         setNextTasks]         = useState<NextTaskForm[]>([emptyNextTask()])
  const [handoverNote,      setHandoverNote]      = useState('')
  const [allowPrevView,     setAllowPrevView]     = useState(false)
  const [assignNextSaving,  setAssignNextSaving]  = useState(false)
  const [assignNextError,   setAssignNextError]   = useState('')
  const [allGroups,         setAllGroups]         = useState<Array<{ id: string; name: string }>>([])
  const [allPersonnel,      setAllPersonnel]      = useState<Array<{ id: string; name: string }>>([])

  const toggle = async () => {
    setExpanded(e => !e)
    if (!expanded && subtasks.length === 0) {
      setLoadingS(true)
      try {
        const [s, c] = await Promise.all([
          taskApi.subtasks(task.id) as Promise<Task[]>,
          taskApi.comments(task.id) as Promise<TaskComment[]>,
        ])
        setSubtasks(s); setComments(c)
      } catch { /* no-op */ }
      setLoadingS(false)
    }
  }

  const doApprove = async () => {
    setActionLoading(true); setActionError('')
    try { await taskApi.approve(task.id); onRefresh() }
    catch (e: unknown) { setActionError(e instanceof Error ? e.message : 'Failed') }
    setActionLoading(false)
  }

  const doReject = async () => {
    if (!rejectReason.trim()) return
    setActionLoading(true); setActionError('')
    try { await taskApi.reject(task.id, rejectReason); setShowReject(false); setRejectReason(''); onRefresh() }
    catch (e: unknown) { setActionError(e instanceof Error ? e.message : 'Failed') }
    setActionLoading(false)
  }

  const openAssignNext = async () => {
    setNextTasks([emptyNextTask()])
    setHandoverNote(''); setAllowPrevView(false); setAssignNextError('')
    try {
      const [grps, ppl] = await Promise.all([
        taskGroupApi.list() as Promise<Array<{ id: string; name: string }>>,
        workspaceApi.getPersonnel() as Promise<Array<{ id: string; name: string }>>,
      ])
      setAllGroups(grps)
      setAllPersonnel(Array.isArray(ppl) ? ppl : (ppl as { items?: Array<{ id: string; name: string }> }).items ?? [])
    } catch { /* non-critical */ }
    setShowAssignNext(true)
  }

  const doAssignNext = async () => {
    for (const nt of nextTasks) {
      if (!nt.title.trim()) { setAssignNextError('All tasks must have a title'); return }
      if (nt.isGroupTask && !nt.groupId) { setAssignNextError('Select a group for each group task'); return }
      if (!nt.isGroupTask && nt.personnelIds.length === 0) { setAssignNextError('Select at least one person for each task'); return }
    }
    setAssignNextSaving(true); setAssignNextError('')
    try {
      await taskApi.assignNext(task.id, {
        nextTasks: nextTasks.map(nt => ({
          title: nt.title.trim(),
          description: nt.description.trim() || undefined,
          projectId: nt.projectId || task.projectId,
          priority: nt.priority,
          deadline: nt.deadline || undefined,
          personnelIds: nt.isGroupTask ? undefined : nt.personnelIds,
          groupId: nt.isGroupTask ? nt.groupId : undefined,
          isGroupTask: nt.isGroupTask,
        })),
        handoverNote: handoverNote.trim() || undefined,
        allowPreviousAssigneeView: allowPrevView,
      })
      setShowAssignNext(false)
      onRefresh()
    } catch (e: unknown) { setAssignNextError(e instanceof Error ? e.message : 'Failed') }
    setAssignNextSaving(false)
  }

  const submittedBy = task.actedByName || (task.actedByType === 'director' ? 'Director' : 'Personnel')

  return (
    <>
      {/* ── Summary row ── */}
      <tr onClick={toggle}
        className={`cursor-pointer transition-colors border-b border-tw-border
          ${expanded ? 'bg-blue-50' : 'hover:bg-[#f8f9ff]'}`}>
        <td className="pl-3 pr-0 py-3 w-1">
          <div className={`w-1 h-8 rounded-full ${
            task.priority === 'CRITICAL' ? 'bg-red-500' :
            task.priority === 'HIGH'     ? 'bg-orange-400' :
            task.priority === 'MEDIUM'   ? 'bg-yellow-400' : 'bg-gray-300'
          }`} />
        </td>
        <td className="px-4 py-3">
          <div className="font-medium text-tw-text">{task.title}</div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-xs text-tw-text-secondary">Submitted by {submittedBy}</span>
            {task.startedAt && <ElapsedDays startedAt={task.startedAt} />}
          </div>
        </td>
        <td className="px-4 py-3 text-xs text-tw-text-secondary">{task.project?.name || '—'}</td>
        <td className="px-4 py-3 text-xs text-tw-text-secondary whitespace-nowrap">
          {new Date(task.updatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          <span className={`badge text-xs ${priorityBadge[task.priority]}`}>{task.priority}</span>
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          {task.deadline
            ? <span className="text-xs text-tw-text-secondary">{new Date(task.deadline).toLocaleDateString()}</span>
            : <span className="text-xs text-tw-text-secondary">—</span>}
        </td>
        <td className="px-3 py-3 whitespace-nowrap">
          <svg className={`w-4 h-4 text-tw-text-secondary transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </td>
      </tr>

      {/* ── Expanded row ── */}
      {expanded && (
        <tr className="border-b-2 border-tw-primary/20" style={{ background: 'linear-gradient(to right, #eef3ff, #f8f9ff)' }}>
          <td colSpan={7} className="px-0 py-0">
            <div className="px-6 py-5">

              {actionError && (
                <div className="mb-4 text-xs text-tw-danger bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center justify-between">
                  {actionError}
                  <button onClick={() => setActionError('')} className="font-bold ml-2">×</button>
                </div>
              )}

              {/* ── Task meta ── */}
              <div className="space-y-4">
                {task.description && (
                  <p className="text-sm text-tw-text leading-relaxed whitespace-pre-wrap">{task.description}</p>
                )}

                {/* Assignees + deadline chips row */}
                <div className="flex items-start justify-between gap-6">
                  {task.assignments?.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-tw-text-secondary uppercase tracking-wide mb-2">Assigned To</div>
                      <div className="flex flex-wrap gap-2">
                        {task.assignments.map(a => (
                          <div key={a.id} className="flex items-center gap-1.5 bg-white border border-tw-border rounded-full px-2.5 py-1">
                            <div className="w-4 h-4 rounded-full bg-tw-primary flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                              {(a.personnel?.name || a.department?.name || '?').charAt(0)}
                            </div>
                            <span className="text-xs font-medium text-tw-text">{a.personnel?.name || a.department?.name}</span>
                            <span className="text-xs text-tw-text-secondary">{a.personnel ? '· person' : a.department ? '· dept' : '· group'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {task.deadline && (
                    <div className="text-right flex-shrink-0">
                      <div className="text-xs font-semibold text-tw-text-secondary uppercase tracking-wide mb-2">Deadline</div>
                      <span className="text-xs font-medium text-tw-text bg-white border border-tw-border rounded-lg px-2.5 py-1 inline-block">
                        {new Date(task.deadline).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  )}
                </div>

                {/* Comments */}
                {!loadingS && comments.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-tw-text-secondary uppercase tracking-wide mb-2">Comments ({comments.length})</div>
                    <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                      {comments.map(c => (
                        <div key={c.id} className="flex gap-2 bg-white border border-tw-border rounded-lg px-3 py-2">
                          <div className="w-6 h-6 rounded-full bg-tw-primary flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                            {(c.authorName || '?').charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-tw-text">{c.authorName || c.authorType}</span>
                              <span className="text-xs text-tw-text-secondary">{new Date(c.createdAt).toLocaleString()}</span>
                            </div>
                            <p className="text-xs text-tw-text mt-0.5">{c.content}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Subtasks ── */}
              <div className="border-t border-tw-primary/15 pt-4 mt-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2.5 h-2.5 rounded-sm bg-tw-indigo inline-block" />
                  <span className="text-xs font-bold text-tw-indigo uppercase tracking-wider">
                    Subtasks{subtasks.length > 0 ? ` (${subtasks.length})` : ''}
                  </span>
                </div>
                {loadingS ? (
                  <div className="text-xs text-tw-text-secondary py-1">Loading…</div>
                ) : subtasks.length === 0 ? (
                  <div className="text-xs text-tw-text-secondary italic py-1">No subtasks.</div>
                ) : (
                  <div className="bg-white border border-tw-indigo/20 rounded-xl overflow-hidden shadow-sm">
                    <div className="divide-y divide-tw-border">
                      {subtasks.map(s => {
                        const assignee = s.assignments?.[0]
                        const assigneeName = assignee?.personnel?.name || assignee?.department?.name || '—'
                        const dl = s.deadline ? Math.ceil((new Date(s.deadline).setHours(0,0,0,0) - new Date().setHours(0,0,0,0)) / 86400000) : null
                        const isOverdue = dl !== null && dl < 0
                        return (
                          <div key={s.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 transition-colors">
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${subtaskStatusDot[s.status] || 'bg-gray-400'}`} />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-tw-text truncate">{s.title}</div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className={`badge text-xs ${subtaskStatusBadge[s.status] || 'badge-gray'}`}>{s.status.replace('_', ' ')}</span>
                                <span className="text-xs text-tw-text-secondary truncate">→ {assigneeName}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 flex-shrink-0">
                              <span className={`badge text-xs ${{
                                CRITICAL: 'badge-danger', HIGH: 'badge-warning', MEDIUM: 'badge-primary', LOW: 'badge-gray'
                              }[s.priority]}`}>{s.priority}</span>
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

              {/* ── Action buttons ── */}
              <div className="mt-5 pt-4 border-t border-blue-200 flex items-center justify-between gap-3">
                <p className="text-xs text-tw-text-secondary">
                  Review the submission above, then approve or send back with feedback.
                </p>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    disabled={actionLoading}
                    onClick={() => { setShowReject(true); setRejectReason('') }}
                    className="px-4 py-2 rounded-lg border border-tw-danger text-tw-danger bg-white hover:bg-red-50 font-semibold text-sm transition-colors disabled:opacity-50"
                  >
                    ↩ Send Back
                  </button>
                  <button
                    disabled={actionLoading}
                    onClick={doApprove}
                    className="px-4 py-2 rounded-lg bg-tw-success text-white font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-1.5"
                  >
                    ✓ Approve
                  </button>
                  <button
                    disabled={actionLoading}
                    onClick={openAssignNext}
                    className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  >
                    ⛓ Approve & Assign Next
                  </button>
                </div>
              </div>
            </div>

            {/* ── Send Back modal ── */}
            {showReject && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={e => e.stopPropagation()}>
                <div className="bg-white rounded-xl shadow-panel w-full max-w-md">
                  <div className="px-5 py-4 border-b border-tw-border">
                    <h3 className="font-semibold text-tw-text">Send Back for Revision</h3>
                    <p className="text-xs text-tw-text-secondary mt-0.5">
                      Provide clear feedback so the assignee knows what needs to be corrected.
                      The task will be moved back to <strong>Rejected</strong> status.
                    </p>
                  </div>
                  <div className="px-5 py-4 space-y-3">
                    <textarea
                      className="input resize-none" rows={4} autoFocus
                      placeholder="e.g. The report is missing the financial summary section. Please revise and resubmit."
                      value={rejectReason}
                      onChange={e => setRejectReason(e.target.value)}
                    />
                    {actionError && <p className="text-xs text-tw-danger">{actionError}</p>}
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => { setShowReject(false); setRejectReason('') }} className="btn-secondary">Cancel</button>
                      <button
                        disabled={!rejectReason.trim() || actionLoading}
                        onClick={doReject}
                        className="px-4 py-2 rounded-lg bg-tw-danger text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
                      >
                        Send Back
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </td>
        </tr>
      )}

      {/* ── Approve & Assign Next modal ── */}
      {showAssignNext && (
        <tr><td colSpan={7} className="p-0">
          <div className="fixed inset-0 bg-black bg-opacity-60 flex items-start justify-center z-50 p-4 overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-4">
              <div className="px-5 py-4 border-b border-tw-border">
                <h3 className="font-bold text-tw-text text-base">Approve &amp; Assign Next Task</h3>
                <p className="text-xs text-tw-text-secondary mt-0.5">The current task will be approved and the following tasks created and assigned.</p>
              </div>
              <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
                <div>
                  <label className="block text-xs font-semibold text-tw-text-secondary uppercase tracking-wide mb-1">Handover Note <span className="font-normal">(optional)</span></label>
                  <textarea className="input resize-none text-sm" rows={2} placeholder="Context to pass to the next assignee(s)..."
                    value={handoverNote} onChange={e => setHandoverNote(e.target.value)} />
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={allowPrevView} onChange={e => setAllowPrevView(e.target.checked)} className="rounded border-gray-300" />
                  <span className="text-sm text-tw-text">Allow previous assignee to view next task</span>
                </label>
                <div className="space-y-4">
                  {nextTasks.map((nt, idx) => (
                    <div key={idx} className="border border-tw-border rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-tw-text-secondary uppercase tracking-wide">Task {idx + 1}</span>
                        {nextTasks.length > 1 && (
                          <button onClick={() => setNextTasks(arr => arr.filter((_, i) => i !== idx))}
                            className="text-xs text-tw-danger hover:underline">Remove</button>
                        )}
                      </div>
                      <input className="input text-sm" placeholder="Task title *" value={nt.title}
                        onChange={e => setNextTasks(arr => arr.map((t, i) => i === idx ? { ...t, title: e.target.value } : t))} />
                      <textarea className="input resize-none text-sm" rows={2} placeholder="Description (optional)" value={nt.description}
                        onChange={e => setNextTasks(arr => arr.map((t, i) => i === idx ? { ...t, description: e.target.value } : t))} />
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-tw-text-secondary mb-1">Priority</label>
                          <Select value={nt.priority}
                            onChange={val => setNextTasks(arr => arr.map((t, i) => i === idx ? { ...t, priority: val } : t))}
                            options={[{ value: 'LOW', label: 'Low' }, { value: 'MEDIUM', label: 'Medium' }, { value: 'HIGH', label: 'High' }, { value: 'CRITICAL', label: 'Critical' }]} />
                        </div>
                        <div>
                          <label className="block text-xs text-tw-text-secondary mb-1">Deadline</label>
                          <DatePicker value={nt.deadline}
                            onChange={val => setNextTasks(arr => arr.map((t, i) => i === idx ? { ...t, deadline: val } : t))} />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setNextTasks(arr => arr.map((t, i) => i === idx ? { ...t, isGroupTask: false, groupId: '' } : t))}
                          className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${!nt.isGroupTask ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-tw-border text-tw-text-secondary hover:bg-tw-hover'}`}>
                          👤 Individual(s)
                        </button>
                        <button onClick={() => setNextTasks(arr => arr.map((t, i) => i === idx ? { ...t, isGroupTask: true, personnelIds: [] } : t))}
                          className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${nt.isGroupTask ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-tw-border text-tw-text-secondary hover:bg-tw-hover'}`}>
                          👥 Group
                        </button>
                      </div>
                      {nt.isGroupTask ? (
                        <Select value={nt.groupId} placeholder="Select group..."
                          onChange={val => setNextTasks(arr => arr.map((t, i) => i === idx ? { ...t, groupId: val } : t))}
                          options={allGroups.map(g => ({ value: g.id, label: g.name }))} />
                      ) : (
                        <div>
                          <label className="block text-xs text-tw-text-secondary mb-1">Assign to (select one or more)</label>
                          <input
                            className="input text-sm mb-1"
                            placeholder="Search personnel..."
                            value={nt.personnelSearch}
                            onChange={e => setNextTasks(arr => arr.map((t, i) => i === idx ? { ...t, personnelSearch: e.target.value } : t))}
                          />
                          <div className="border border-tw-border rounded-lg max-h-36 overflow-y-auto divide-y divide-tw-border">
                            {allPersonnel.filter(p => p.name.toLowerCase().includes(nt.personnelSearch.toLowerCase())).map(p => (
                              <label key={p.id} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-tw-hover text-sm">
                                <input type="checkbox" checked={nt.personnelIds.includes(p.id)}
                                  onChange={e => setNextTasks(arr => arr.map((t, i) => {
                                    if (i !== idx) return t
                                    const ids = e.target.checked ? [...t.personnelIds, p.id] : t.personnelIds.filter(id => id !== p.id)
                                    return { ...t, personnelIds: ids }
                                  }))}
                                  className="rounded border-gray-300" />
                                {p.name}
                              </label>
                            ))}
                          </div>
                          {nt.personnelIds.length > 0 && <div className="text-xs text-indigo-600 mt-1">{nt.personnelIds.length} selected</div>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <button onClick={() => setNextTasks(arr => [...arr, emptyNextTask()])}
                  className="w-full py-2 border-2 border-dashed border-tw-border rounded-xl text-xs font-semibold text-tw-text-secondary hover:border-indigo-400 hover:text-indigo-600 transition-colors">
                  + Add Another Next Task
                </button>
                {assignNextError && <div className="text-xs text-tw-danger bg-red-50 border border-red-200 rounded-lg px-3 py-2">{assignNextError}</div>}
              </div>
              <div className="px-5 py-4 border-t border-tw-border flex gap-2 justify-end">
                <button onClick={() => setShowAssignNext(false)} className="btn-secondary">Cancel</button>
                <button disabled={assignNextSaving} onClick={doAssignNext}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors">
                  {assignNextSaving ? 'Processing…' : '⛓ Approve & Assign'}
                </button>
              </div>
            </div>
          </div>
        </td></tr>
      )}
    </>
  )
}

function MobileApprovalCard({ task, actorId, onRefresh, onViewTask }: { task: Task; actorId: string; onRefresh: () => void; onViewTask: (t: Task) => void }) {
  const [expanded,  setExpanded]  = useState(false)
  const [subtasks,  setSubtasks]  = useState<Task[]>([])
  const [comments,  setComments]  = useState<TaskComment[]>([])
  const [loadingS,  setLoadingS]  = useState(false)

  const priorityBar: Record<string, string> = { CRITICAL: 'bg-red-500', HIGH: 'bg-orange-400', MEDIUM: 'bg-yellow-400', LOW: 'bg-gray-300' }
  const submittedBy = task.actedByName || (task.actedByType === 'director' ? 'Director' : 'Personnel')

  const toggle = async () => {
    setExpanded(e => !e)
    if (!expanded && subtasks.length === 0) {
      setLoadingS(true)
      try {
        const [s, c] = await Promise.all([
          taskApi.subtasks(task.id) as Promise<Task[]>,
          taskApi.comments(task.id) as Promise<TaskComment[]>,
        ])
        setSubtasks(s); setComments(c)
      } catch { /* no-op */ }
      setLoadingS(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header — always visible */}
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none" onClick={toggle}>
        <div className={`w-1 h-10 rounded-full flex-shrink-0 ${priorityBar[task.priority] || 'bg-gray-300'}`} />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-tw-text text-sm leading-snug">{task.title}</div>
          <span className="text-xs text-tw-text-secondary mt-0.5">by {submittedBy}</span>
        </div>
        <svg className={`w-4 h-4 text-tw-text-secondary flex-shrink-0 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-3">
          {task.description && <p className="text-xs text-tw-text-secondary leading-relaxed">{task.description}</p>}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            {task.project?.name && (
              <div><div className="text-[10px] font-bold text-tw-text-secondary uppercase tracking-wide">Project</div><div className="text-tw-text font-medium mt-0.5">{task.project.name}</div></div>
            )}
            <div><div className="text-[10px] font-bold text-tw-text-secondary uppercase tracking-wide">Submitted</div><div className="text-tw-text font-medium mt-0.5">{new Date(task.updatedAt).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</div></div>
            {task.deadline && (
              <div><div className="text-[10px] font-bold text-tw-text-secondary uppercase tracking-wide">Deadline</div><div className="text-tw-text font-medium mt-0.5">{new Date(task.deadline).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</div></div>
            )}
            <div><div className="text-[10px] font-bold text-tw-text-secondary uppercase tracking-wide">Priority</div><div className="mt-0.5"><span className={`badge ${priorityBadge[task.priority]}`}>{task.priority}</span></div></div>
          </div>
          {loadingS && <div className="text-xs text-tw-text-secondary">Loading details…</div>}
          {subtasks.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] font-bold text-tw-text-secondary uppercase tracking-wide mb-1">Subtasks ({subtasks.length})</div>
              {subtasks.map(s => (
                <div key={s.id} className="flex items-center gap-2 text-xs">
                  <span className={`badge ${subtaskStatusBadge[s.status] || 'badge-gray'}`}>{s.status.replace('_',' ')}</span>
                  <span className="text-tw-text truncate">{s.title}</span>
                </div>
              ))}
            </div>
          )}
          {comments.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] font-bold text-tw-text-secondary uppercase tracking-wide mb-1">Comments ({comments.length})</div>
              {comments.slice(-2).map(c => (
                <div key={c.id} className="bg-gray-50 rounded-lg px-3 py-2 text-xs text-tw-text">{c.content}</div>
              ))}
            </div>
          )}
          <button onClick={() => onViewTask(task)}
            className="w-full py-3 rounded-xl bg-tw-primary text-white text-sm font-bold active:opacity-80 flex items-center justify-center gap-2">
            View Task & Progress →
          </button>
        </div>
      )}

    </div>
  )
}

function ApprovalQueueView({ tasks, actorId, onRefresh, onViewTask }: { tasks: Task[]; actorId: string; onRefresh: () => void; onViewTask: (t: Task) => void }) {
  return (
    <div className="p-4 md:p-6">
      <h1 className="hidden md:block text-2xl font-bold text-tw-text mb-1">Approval Queue</h1>
      <p className="text-sm text-tw-text-secondary mb-4 md:mb-6">
        {tasks.length} task{tasks.length !== 1 ? 's' : ''} waiting for your review
      </p>
      {tasks.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="text-4xl mb-3">🎉</div>
          <p className="text-tw-text font-semibold">All caught up!</p>
          <p className="text-tw-text-secondary text-sm mt-1">No tasks waiting for approval.</p>
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {tasks.map(t => (
              <MobileApprovalCard key={t.id} task={t} actorId={actorId} onRefresh={onRefresh} onViewTask={onViewTask} />
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
                  <th className="text-left px-4 py-3 text-xs font-bold text-tw-primary uppercase tracking-wider">Submitted</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-tw-primary uppercase tracking-wider">Priority</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-tw-primary uppercase tracking-wider">Deadline</th>
                  <th className="w-8 px-2 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {tasks.map(t => (
                  <ApprovalTaskRow key={t.id} task={t} actorId={actorId} onRefresh={onRefresh} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Mobile User Menu ────────────────────────────────────────────────────────
function MobileUserMenu({ user, onProfile, onSettings, onLogout }: { user: AuthUser; onProfile: () => void; onSettings: () => void; onLogout: () => void }) {
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
          {/* User info header */}
          <div className="px-4 py-3 bg-[#f0f4ff] border-b border-gray-100">
            <div className="font-semibold text-tw-text text-sm truncate">{user.name}</div>
            <div className="text-xs text-tw-text-secondary">Director</div>
          </div>
          <button onClick={() => { onProfile(); setOpen(false) }}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-tw-text hover:bg-tw-hover transition-colors">
            <svg className="w-4 h-4 text-tw-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
            </svg>
            My Profile
          </button>
          <button onClick={() => { onSettings(); setOpen(false) }}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-tw-text hover:bg-tw-hover transition-colors border-t border-gray-50">
            <svg className="w-4 h-4 text-tw-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
            </svg>
            Settings
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

// ─── Director Dashboard ───────────────────────────────────────────────────────
export default function DirectorDashboard({ user, currentView, setView, onLogout, onUserUpdate, onImpersonationStart }: Props) {
  // ── Navigation history (view + scroll position) ───────────────────────────
  const [viewHistory, setViewHistory] = useState<Array<{ view: ViewMode; scrollTop: number }>>([])
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [projectSubView, setProjectSubView]   = useState<ProjectSubView>('board')
  const mainRef = useRef<HTMLDivElement>(null)

  // ── Lifted ProjectManager state (survives view switches) ─────────────────
  const [pmFilters, setPmFilters] = useState<import('./FilterBar').ActiveFilters>(
    () => { try { const s = sessionStorage.getItem('tw_pm_filters'); return s ? JSON.parse(s) : { layerFilters: {}, extra: { status: null, priority: null, assignedTo: null, createdFrom: null, createdTo: null, deadlineFrom: null, deadlineTo: null } } } catch { return { layerFilters: {}, extra: { status: null, priority: null, assignedTo: null, createdFrom: null, createdTo: null, deadlineFrom: null, deadlineTo: null } } } }
  )
  const [pmAllTasks, setPmAllTasks] = useState<Task[]>([])
  const [pmProjects, setPmProjects] = useState<Project[]>([])

  const handlePmFiltersChange = (f: import('./FilterBar').ActiveFilters) => {
    setPmFilters(f)
    try { sessionStorage.setItem('tw_pm_filters', JSON.stringify(f)) } catch { /* ignore */ }
  }

  // ── Lifted ReportsPage state ───────────────────────────────────────────────
  const [reportsState, setReportsState] = useState<ReportsState>(DEFAULT_REPORTS_STATE)

  const navigate = (v: ViewMode) => {
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
      // Restore scroll position after React re-renders
      requestAnimationFrame(() => {
        if (mainRef.current) mainRef.current.scrollTop = entry.scrollTop
      })
    }
  }
  const canGoBack = viewHistory.length > 0 && currentView !== 'director_dashboard'
  const [stats, setStats] = useState({ projects: 0, totalTasks: 0, overdue: 0, pending_approval: 0 })
  const [recentTasks, setRecentTasks] = useState<Task[]>([])
  const [overdueList, setOverdueTasks] = useState<Task[]>([])
  const [approvalQueue, setApprovalQueue] = useState<Task[]>([])
  const [dueSoonList, setDueSoonList] = useState<Task[]>([])
  const [stalestList, setStalestList] = useState<Task[]>([])
  const [auditLogs, setAuditLogs] = useState<unknown[]>([])
  const [statsLoading, setStatsLoading] = useState(true)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [panelLayers, setPanelLayers] = useState<Layer[]>([])
  const [panelPersonnel, setPanelPersonnel] = useState<Personnel[]>([])

  const loadDashboard = async () => {
    setStatsLoading(true)
    try {
      const [projects, overdue, allTasks] = await Promise.all([
        projectApi.list() as Promise<Project[]>,
        auditApi.overdue() as Promise<Task[]>,
        taskApi.list() as Promise<Task[]>,
      ])
      const submitted = allTasks.filter(t => t.status === 'SUBMITTED')
      const now = new Date()
      const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
      const activeStatuses = ['ASSIGNED', 'IN_PROGRESS']
      const dueSoon = allTasks
        .filter(t => t.deadline && activeStatuses.includes(t.status) && new Date(t.deadline) > now && new Date(t.deadline) <= in7Days)
        .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime())
      const stalest = allTasks
        .filter(t => activeStatuses.includes(t.status) && t.assignments?.length > 0 && t.assignments[0].assignedAt)
        .sort((a, b) => new Date(a.assignments[0].assignedAt).getTime() - new Date(b.assignments[0].assignedAt).getTime())
        .slice(0, 10)
      setStats({ projects: projects.length, totalTasks: allTasks.length, overdue: overdue.length, pending_approval: submitted.length })
      setRecentTasks(allTasks.slice(0, 5))
      setOverdueTasks(overdue)
      setApprovalQueue(submitted)
      setDueSoonList(dueSoon)
      setStalestList(stalest)
    } catch { /* silent */ }
    setStatsLoading(false)
  }

  const loadAudit = async () => {
    try { setAuditLogs(await auditApi.list() as unknown[]) }
    catch { /* silent */ }
  }

  useEffect(() => { loadDashboard() }, [])
  useEffect(() => { if (currentView === 'audit_log') loadAudit() }, [currentView])
  useEffect(() => {
    if (selectedTask && panelLayers.length === 0) {
      Promise.all([
        workspaceApi.getLayers() as Promise<Layer[]>,
        workspaceApi.getPersonnel() as Promise<Personnel[]>,
      ]).then(([l, p]) => { setPanelLayers(l); setPanelPersonnel(p) }).catch(() => {})
    }
  }, [selectedTask])

  const handleSelectProject = (p: Project) => {
    setSelectedProject(p)
    setProjectSubView('board')
    navigate('project_board')
  }

  const navItems = [
    { label: 'Dashboard',      view: 'director_dashboard' as ViewMode, icon: '⊞' },
    { label: 'Projects',       view: 'project_board'      as ViewMode, icon: '📋' },
    { label: 'Approval Queue', view: 'approval_queue'     as ViewMode, icon: '✅', badge: stats.pending_approval },
    { label: 'Overdue Tasks',   view: 'overdue'          as ViewMode, icon: '⏰', badge: stats.overdue },
    { label: 'Recent Updates',  view: 'recent_updates'   as ViewMode, icon: '🕐' },
    { label: 'Broadcasts',      view: 'broadcasts'       as ViewMode, icon: '📢' },
    { label: 'Group Tasks',     view: 'group_tasks'      as ViewMode, icon: '🫂' },
    { label: 'Reports',         view: 'reports'           as ViewMode, icon: '📊' },
    { label: 'Team Hierarchy',  view: 'hierarchy_manager' as ViewMode, icon: '👥' },
    { label: 'Audit Log',      view: 'audit_log'          as ViewMode, icon: '📜' },
    ...(user.isChairman ? [{ label: 'User Access', view: 'impersonation' as ViewMode, icon: '🔐' }] : []),
    { label: 'Settings',       view: 'settings'           as ViewMode, icon: '⚙️' },
    { label: 'My Profile',     view: 'profile'            as ViewMode, icon: '👤' },
  ]

  const activeView = currentView === 'project_board' && !selectedProject ? 'project_board' : currentView

  // Avatar/initials for sidebar
  const initials = user.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

  const { canInstall, isIOS, installApp, pushEnabled, enablePush } = usePWA()
  const [showIOSGuide, setShowIOSGuide] = useState(false)

  // Mobile nav items (condensed — 5 max for bottom bar)
  const mobileNavItems = [
    { label: 'Dashboard', view: 'director_dashboard' as ViewMode, icon: '⊞' },
    { label: 'Projects',  view: 'project_board'      as ViewMode, icon: '📋' },
    { label: 'Approvals', view: 'approval_queue'     as ViewMode, icon: '✅', badge: stats.pending_approval },
    { label: 'Groups',    view: 'group_tasks'        as ViewMode, icon: '🫂' },
    { label: 'More',      view: null, icon: '☰' },
  ]
  const [showMobileMore, setShowMobileMore] = useState(false)
  const mobileMoreItems = [
    { label: 'Team Hierarchy',  view: 'hierarchy_manager' as ViewMode, icon: '👥' },
    { label: 'Reports',         view: 'reports'           as ViewMode, icon: '📊' },
    { label: 'Recent Updates',  view: 'recent_updates'    as ViewMode, icon: '🕐' },
    { label: 'Broadcasts',      view: 'broadcasts'        as ViewMode, icon: '📢' },
    { label: 'Overdue Tasks',   view: 'overdue'           as ViewMode, icon: '⏰', badge: stats.overdue },
    { label: 'Audit Log',       view: 'audit_log'         as ViewMode, icon: '📜' },
    ...(user.isChairman ? [{ label: 'User Access', view: 'impersonation' as ViewMode, icon: '🔐' }] : []),
    { label: 'Settings',        view: 'settings'          as ViewMode, icon: '⚙️' },
    { label: 'My Profile',      view: 'profile'           as ViewMode, icon: '👤' },
  ]

  return (
    <div className="min-h-screen bg-tw-bg flex relative overflow-hidden">

      {/* ── Watermark ───────────────────────────────────────────────────── */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <img src="/taskwise/watermark.jpeg" alt="" className="absolute bottom-0 right-0 select-none"
          style={{ opacity: 0.13, mixBlendMode: 'multiply' as const, width: '100%', maxWidth: '480px', right: '50%', transform: 'translateX(50%)' }} />
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

        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          {navItems.map(item => (
            <button key={item.view}
              onClick={() => { if (item.view === 'project_board') setSelectedProject(null); navigate(item.view) }}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2.5
                ${activeView === item.view ? 'bg-tw-primary text-white shadow-sm' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}>
              <span className="text-base flex-shrink-0">{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {item.badge ? <span className="bg-tw-danger text-white text-xs rounded-full px-1.5 py-0.5 font-bold leading-none">{item.badge}</span> : null}
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
              <div className="text-xs text-white/50">Director</div>
            </div>
          </button>
          <button onClick={onLogout} className="w-full text-left px-2 py-1 text-xs text-white/40 hover:text-tw-danger transition-colors rounded">Sign out</button>
          <p className="text-center text-xs text-white/25 mt-2">Created by SysWise</p>
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        {/* Top bar */}
        <header className="bg-[#1f2d3d] md:bg-tw-surface border-b border-white/10 md:border-tw-border px-4 md:px-6 py-3 md:py-3.5 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            {user.companyLogo ? (
              <img src={user.companyLogo} alt="Logo" className="w-7 h-7 rounded object-contain md:hidden" />
            ) : (
              <div className="w-7 h-7 bg-tw-primary rounded-lg flex items-center justify-center md:hidden flex-shrink-0">
                <span className="text-white font-bold text-xs">T</span>
              </div>
            )}
            {/* Back button — desktop (left of title) and mobile */}
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
              <div className="font-bold text-white md:text-tw-text text-sm md:text-base">
                {currentView === 'project_board' && selectedProject ? selectedProject.name
                  : currentView === 'director_dashboard' ? 'Dashboard'
                  : currentView === 'approval_queue' ? 'Approvals'
                  : currentView === 'overdue' ? 'Overdue'
                  : currentView === 'hierarchy_manager' ? 'Team Hierarchy'
                  : currentView === 'audit_log' ? 'Audit Log'
                  : currentView === 'broadcasts' ? 'Broadcasts'
                  : currentView === 'settings' ? 'Settings'
                  : currentView === 'project_board' ? 'Projects'
                  : currentView === 'recent_updates' ? 'Recent Updates'
                  : currentView === 'group_tasks' ? 'Group Tasks'
                  : currentView === 'reports' ? 'Reports'
                  : currentView === 'impersonation' ? 'User Access'
                  : 'My Profile'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {currentView === 'project_board' && selectedProject && (
              <div className="hidden md:flex bg-tw-hover rounded-lg p-0.5 gap-0.5">
                <button onClick={() => setProjectSubView('board')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${projectSubView === 'board' ? 'bg-white text-tw-primary shadow-card' : 'text-tw-text-secondary'}`}>
                  Board
                </button>
                <button onClick={() => setProjectSubView('flowchart')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${projectSubView === 'flowchart' ? 'bg-white text-tw-primary shadow-card' : 'text-tw-text-secondary'}`}>
                  Flowchart
                </button>
              </div>
            )}
            {/* Install App button — mobile only, show when not installed */}
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
            {/* Mobile user menu */}
            <MobileUserMenu user={user} onProfile={() => setView('profile' as ViewMode)} onSettings={() => setView('settings' as ViewMode)} onLogout={onLogout} />
          </div>
        </header>

        <main ref={mainRef} className="flex-1 overflow-auto pb-20 md:pb-0">

          {/* DASHBOARD */}
          {currentView === 'director_dashboard' && (
            <div className="p-4 md:p-6">
              <h1 className="text-xl md:text-2xl font-bold text-tw-text mb-1">Welcome back, {user.name.split(' ')[0]}</h1>
              <p className="text-sm text-tw-text-secondary mb-4 md:mb-6">Here's what's happening across your workspace.</p>

              {statsLoading ? <div className="text-sm text-tw-text-secondary">Loading...</div> : (
                <>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
                    {[
                      { label: 'Projects',         value: stats.projects,          color: 'text-tw-primary',   bg: 'bg-blue-50',   icon: '📋', view: 'project_board'   as ViewMode },
                      { label: 'Total Tasks',       value: stats.totalTasks,        color: 'text-tw-text',      bg: 'bg-gray-50',   icon: '✓',  view: 'project_board'   as ViewMode },
                      { label: 'Pending Approval',  value: stats.pending_approval,  color: 'text-purple-600',   bg: 'bg-purple-50', icon: '⏳', view: 'approval_queue'  as ViewMode },
                      { label: 'Overdue',           value: stats.overdue,           color: 'text-tw-danger',    bg: 'bg-red-50',    icon: '⚠',  view: 'overdue'         as ViewMode },
                    ].map(s => (
                      <button
                        key={s.label}
                        onClick={() => navigate(s.view)}
                        className={`rounded-2xl p-4 ${s.bg} border border-white/50 flex flex-col items-center justify-center text-center gap-1 hover:shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer`}
                      >
                        <div className="text-2xl leading-none mb-1">{s.icon}</div>
                        <div className={`text-2xl md:text-3xl font-bold ${s.color}`}>{s.value}</div>
                        <div className="text-xs md:text-sm text-tw-text-secondary">{s.label}</div>
                      </button>
                    ))}
                  </div>

                  {/* Reports shortcut */}
                  <button
                    onClick={() => navigate('reports')}
                    className="w-full card p-5 flex items-center justify-between hover:shadow-panel transition-shadow group"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">📊</span>
                      <div className="text-left">
                        <div className="font-semibold text-tw-text text-sm">Reports</div>
                        <div className="text-xs text-tw-text-secondary mt-0.5">
                          Overdue · Due soon · Pending approvals · Sitting longest · By officer · By department &amp; more
                        </div>
                      </div>
                    </div>
                    <svg className="w-5 h-5 text-tw-text-secondary group-hover:text-tw-primary transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                    </svg>
                  </button>
                </>
              )}
            </div>
          )}

          {/* PROJECTS */}
          {currentView === 'project_board' && !selectedProject && (
            <ProjectManager
              onSelectProject={handleSelectProject}
              onSelectTask={setSelectedTask}
              filters={pmFilters}
              onFiltersChange={handlePmFiltersChange}
              allTasks={pmAllTasks}
              onAllTasksLoaded={(tasks, projs) => { setPmAllTasks(tasks); setPmProjects(projs) }}
              isDirector={true}
              actorId={user.actorId}
            />
          )}
          {currentView === 'project_board' && selectedProject && projectSubView === 'board' && (
            <BoardView project={selectedProject} isDirector={true} actorId={user.actorId} />
          )}
          {currentView === 'project_board' && selectedProject && projectSubView === 'flowchart' && (
            <FlowchartView
              project={selectedProject}
              user={user}
              onTaskClick={task => { setSelectedTask(task); setProjectSubView('board') }}
            />
          )}

          {/* HIERARCHY */}
          {currentView === 'hierarchy_manager' && <HierarchyPanel />}

          {/* SETTINGS */}
          {currentView === 'settings' && (
            <WorkspaceSettings user={user} onUpdate={onUserUpdate} />
          )}

          {/* PROFILE */}
          {currentView === 'profile' && (
            <ProfilePage user={user} onUserUpdate={onUserUpdate} />
          )}

          {/* APPROVAL QUEUE */}
          {currentView === 'approval_queue' && (
            <ApprovalQueueView
              tasks={approvalQueue}
              actorId={user.actorId}
              onRefresh={loadDashboard}
              onViewTask={setSelectedTask}
            />
          )}

          {/* OVERDUE */}
          {currentView === 'overdue' && (
            <div className="p-6">
              <h1 className="text-2xl font-bold text-tw-text mb-6">Overdue Tasks</h1>
              <div className="card overflow-hidden">
                {overdueList.length === 0 ? (
                  <div className="p-12 text-center text-tw-text-secondary text-sm">No overdue tasks. Great work!</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[#f0f4ff] border-b-2 border-tw-primary/20">
                        {['Task', 'Project', 'Deadline', 'Assigned To', 'Status'].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-xs font-bold text-tw-primary uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-tw-border">
                      {overdueList.map(t => (
                        <tr key={t.id} onClick={() => setSelectedTask(t)} className="hover:bg-tw-hover cursor-pointer">
                          <td className="px-4 py-3 font-medium text-tw-text">{t.title}</td>
                          <td className="px-4 py-3 text-tw-text-secondary">{t.project?.name}</td>
                          <td className="px-4 py-3 text-tw-danger font-medium">{t.deadline ? new Date(t.deadline).toLocaleDateString() : '—'}</td>
                          <td className="px-4 py-3 text-tw-text-secondary">{t.assignments?.[0] ? (t.assignments[0].personnel?.name || t.assignments[0].department?.name || '—') : '—'}</td>
                          <td className="px-4 py-3"><span className="badge badge-danger">{t.status.replace('_', ' ')}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* RECENT UPDATES */}
          {currentView === 'recent_updates' && <RecentUpdatesView />}

          {/* BROADCASTS */}
          {currentView === 'broadcasts' && <BroadcastsPage />}

          {/* GROUP TASKS */}
          {currentView === 'group_tasks' && <GroupWiseTasksPage />}

          {/* REPORTS */}
          {currentView === 'reports' && (
            <ReportsPage savedState={reportsState} onStateChange={setReportsState} scrollContainerRef={mainRef} />
          )}

          {/* USER ACCESS / IMPERSONATION — Chairman only */}
          {currentView === 'impersonation' && user.isChairman && onImpersonationStart && (
            <ImpersonationPage user={user} onSessionStarted={onImpersonationStart} />
          )}

          {/* AUDIT LOG */}
          {currentView === 'audit_log' && (
            <div className="p-6">
              <h1 className="text-2xl font-bold text-tw-text mb-6">Audit Log</h1>
              <div className="card overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#f0f4ff] border-b-2 border-tw-primary/20">
                      {['Event', 'Actor', 'Task', 'Date & Time'].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-bold text-tw-primary uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-tw-border">
                    {(auditLogs as AuditLog[]).length === 0 && (
                      <tr><td colSpan={4} className="px-4 py-8 text-center text-tw-text-secondary text-sm">No audit entries yet.</td></tr>
                    )}
                    {(auditLogs as AuditLog[]).map((log: AuditLog) => (
                      <tr key={log.id} className="hover:bg-tw-hover">
                        <td className="px-4 py-3"><span className="font-mono text-xs bg-tw-hover px-2 py-0.5 rounded">{log.event}</span></td>
                        <td className="px-4 py-3 text-tw-text-secondary capitalize">{log.actorName || log.actorType}</td>
                        <td className="px-4 py-3 text-tw-text-secondary text-xs">{log.taskId ? log.taskId.slice(0, 8) + '...' : '—'}</td>
                        <td className="px-4 py-3 text-tw-text-secondary text-xs">{new Date(log.createdAt).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ── Mobile bottom tab bar ──────────────────────────────────────── */}
      {/* Mobile More drawer */}
      {showMobileMore && (
        <div className="md:hidden fixed inset-0 z-30 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowMobileMore(false)} />
          <div className="relative bg-white rounded-t-2xl shadow-xl pb-safe">
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mt-3 mb-2" />
            <div className="px-4 pb-4 grid grid-cols-4 gap-2">
              {mobileMoreItems.map(item => (
                <button
                  key={item.view}
                  onClick={() => { navigate(item.view); setShowMobileMore(false) }}
                  className={`flex flex-col items-center justify-center py-3 px-1 gap-1.5 rounded-xl relative transition-colors
                    ${activeView === item.view ? 'bg-blue-50 text-tw-primary' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  <span className="text-2xl leading-none">{item.icon}</span>
                  <span className="text-[10px] font-semibold leading-none text-center">{item.label}</span>
                  {item.badge ? (
                    <span className="absolute top-1 right-1 bg-red-500 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                      {item.badge}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-gray-200 shadow-[0_-2px_16px_rgba(0,0,0,0.08)]">
        <div className="flex items-stretch">
          {mobileNavItems.map(item => (
            <button key={item.view ?? 'more'}
              onClick={() => {
                if (item.view === null) { setShowMobileMore(o => !o); return }
                if (item.view === 'project_board') setSelectedProject(null)
                setShowMobileMore(false)
                navigate(item.view)
              }}
              className={`flex-1 flex flex-col items-center justify-center py-4 px-1 gap-1 relative transition-colors
                ${item.view !== null && activeView === item.view ? 'text-tw-primary' : showMobileMore && item.view === null ? 'text-tw-primary' : 'text-gray-400'}`}>
              {item.view !== null && activeView === item.view && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-tw-primary rounded-full" />
              )}
              <span className="text-lg leading-none">{item.icon}</span>
              <span className="text-[10px] font-semibold leading-none">{item.label}</span>
              {item.badge ? (
                <span className="absolute top-1.5 right-[20%] bg-red-500 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                  {item.badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </nav>

      {/* ── Task Detail Panel (overdue / flowchart click-through) ─────── */}
      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          isDirector={true}
          actorId={user.actorId}
          layers={panelLayers}
          personnel={panelPersonnel}
          onClose={() => setSelectedTask(null)}
          onRefresh={loadDashboard}
        />
      )}
    </div>
  )
}
