import React, { useState, useEffect, useRef } from 'react'
import type { AuthUser, ViewMode, Project, Task, AuditLog, TaskComment, Layer, Personnel } from '../types'
import ElapsedDays from './ElapsedDays'
import { projectApi, taskApi, auditApi, workspaceApi, taskGroupApi } from '../services/apiService'
import DatePicker from './DatePicker'
import Select from './Select'
import NotificationsMenu from './NotificationsMenu'
import MobileUserMenu from './MobileUserMenu'
import { requestRefresh } from '../hooks/useRefresh'
import Sidebar, { type SidebarSection } from './Sidebar'
import MobileNav, { type MobileNavItem } from './MobileNav'
import { Icon } from './ui/Icon'
import { PageHeader, EmptyState, StatCard, LoadingBlock, ThemeToggle } from './ui/Primitives'
import { usePWA } from '../hooks/usePWA'
import { useLanguage } from '../i18n/Language'
import HierarchyPanel from './HierarchyPanel'
import ProjectManager from './ProjectManager'
import TasksPage, { DEFAULT_TASK_SORT } from './TasksPage'
import type { TaskSort } from './TasksPage'
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
import UserAnalyticsPage from './UserAnalyticsPage'
import ChairmanUserManagementPage from './ChairmanUserManagementPage'
import FixedRoleManagement from './FixedRoleManagement'
import LeaderboardPage from './LeaderboardPage'
import CompanyRequestsPage from './CompanyRequestsPage'
import CompanyFeaturesPage from './CompanyFeaturesPage'
import InsuranceManagementPage from './InsuranceManagementPage'
import YsoPerformancePage from './YsoPerformancePage'
import LetterManagement from './LetterManagement'
import { launcherHomeUrl, launcherName, type LaunchSource } from '../services/launchSource'

interface Props {
  user: AuthUser
  currentView: ViewMode
  setView: (v: ViewMode) => void
  onLogout: () => void
  onUserUpdate: (updated: Partial<AuthUser>) => void
  onImpersonationStart?: (token: string, impersonatedUser: AuthUser) => void
  launchSource: LaunchSource
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
  BLOCKED: 'badge-teal',
  SUBMITTED: 'badge-purple', APPROVED: 'badge-success',
  RETURNED: 'badge-danger', REJECTED: 'badge-danger', CANCELLED: 'badge-gray',
}
const subtaskStatusDot: Record<string, string> = {
  PENDING: 'bg-gray-400', ASSIGNED: 'bg-blue-500', IN_PROGRESS: 'bg-yellow-500',
  BLOCKED: 'bg-teal-500',
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
    if (!confirm(`Approve "${task.title}"?\n\nThis marks the task as approved.`)) return
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
          ${expanded ? 'bg-tw-primary/[0.05]' : 'hover:bg-tw-hover'}`}>
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
        <tr className="border-b border-tw-primary/20 bg-tw-primary/[0.03]">
          <td colSpan={7} className="px-0 py-0">
            <div className="px-6 py-5">

              {actionError && (
                <div className="mb-4 alert-error text-xs flex items-center justify-between">
                  {actionError}
                  <button onClick={() => setActionError('')} className="ml-2"><Icon name="x" className="w-3.5 h-3.5" /></button>
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
                      <div className="section-label mb-2">Assigned To</div>
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
                      <div className="section-label mb-2">Deadline</div>
                      <span className="text-xs font-medium text-tw-text bg-white border border-tw-border rounded-lg px-2.5 py-1 inline-block">
                        {new Date(task.deadline).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  )}
                </div>

                {/* Comments */}
                {!loadingS && comments.length > 0 && (
                  <div>
                    <div className="section-label mb-2">Comments ({comments.length})</div>
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
                          <div key={s.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-tw-primary/[0.05] transition-colors">
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${subtaskStatusDot[s.status] || 'bg-gray-400'}`} />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-tw-text truncate">{s.title}</div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className={`badge text-xs ${subtaskStatusBadge[s.status] || 'badge-gray'}`}>{s.status.replace('_', ' ')}</span>
                                <span className="text-xs text-tw-text-secondary truncate inline-flex items-center gap-1"><Icon name="arrowRight" className="w-3 h-3" /> {assigneeName}</span>
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
              <div className="mt-5 pt-4 border-t border-tw-border flex items-center justify-between gap-3">
                <p className="text-xs text-tw-text-secondary">
                  Review the submission above, then approve or send back with feedback.
                </p>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    disabled={actionLoading}
                    onClick={() => { setShowReject(true); setRejectReason('') }}
                    className="btn-outline-danger"
                  >
                    <Icon name="sendBack" className="w-4 h-4" /> Send Back
                  </button>
                  <button
                    disabled={actionLoading}
                    onClick={doApprove}
                    className="btn-success"
                  >
                    <Icon name="check" className="w-4 h-4" /> Approve
                  </button>
                  <button
                    disabled={actionLoading}
                    onClick={openAssignNext}
                    className="btn-primary"
                  >
                    <Icon name="chain" className="w-4 h-4" /> Approve & Assign Next
                  </button>
                </div>
              </div>
            </div>

            {/* ── Send Back modal ── */}
            {showReject && (
              <div className="fixed inset-0 flex items-center justify-center z-50 p-4 bg-[#0b1220]/50 backdrop-blur-[3px] animate-fade-in" onClick={e => e.stopPropagation()}>
                <div className="modal-panel w-full max-w-md">
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
                        className="btn-danger"
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
          <div className="fixed inset-0 flex items-start justify-center z-50 p-4 overflow-y-auto bg-[#0b1220]/50 backdrop-blur-[3px] animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="modal-panel w-full max-w-lg my-4">
              <div className="px-5 py-4 border-b border-tw-border">
                <h3 className="font-bold text-tw-text text-base">Approve &amp; Assign Next Task</h3>
                <p className="text-xs text-tw-text-secondary mt-0.5">The current task will be approved and the following tasks created and assigned.</p>
              </div>
              <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
                <div>
                  <label className="label">Handover Note <span className="font-normal">(optional)</span></label>
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
                        <span className="section-label">Task {idx + 1}</span>
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
                          <label className="label">Priority</label>
                          <Select value={nt.priority}
                            onChange={val => setNextTasks(arr => arr.map((t, i) => i === idx ? { ...t, priority: val } : t))}
                            options={[{ value: 'LOW', label: 'Low' }, { value: 'MEDIUM', label: 'Medium' }, { value: 'HIGH', label: 'High' }, { value: 'CRITICAL', label: 'Critical' }]} />
                        </div>
                        <div>
                          <label className="label">Deadline</label>
                          <DatePicker value={nt.deadline}
                            onChange={val => setNextTasks(arr => arr.map((t, i) => i === idx ? { ...t, deadline: val } : t))} />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setNextTasks(arr => arr.map((t, i) => i === idx ? { ...t, isGroupTask: false, groupId: '' } : t))}
                          className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${!nt.isGroupTask ? 'border-tw-primary/40 bg-tw-primary/10 text-tw-primary-text' : 'border-tw-border text-tw-text-secondary hover:bg-tw-hover'} inline-flex items-center justify-center gap-1.5`}>
                          <Icon name="user" className="w-3.5 h-3.5" /> Individual(s)
                        </button>
                        <button onClick={() => setNextTasks(arr => arr.map((t, i) => i === idx ? { ...t, isGroupTask: true, personnelIds: [] } : t))}
                          className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${nt.isGroupTask ? 'border-tw-primary/40 bg-tw-primary/10 text-tw-primary-text' : 'border-tw-border text-tw-text-secondary hover:bg-tw-hover'} inline-flex items-center justify-center gap-1.5`}>
                          <Icon name="users" className="w-3.5 h-3.5" /> Group
                        </button>
                      </div>
                      {nt.isGroupTask ? (
                        <Select value={nt.groupId} placeholder="Select group..."
                          onChange={val => setNextTasks(arr => arr.map((t, i) => i === idx ? { ...t, groupId: val } : t))}
                          options={allGroups.map(g => ({ value: g.id, label: g.name }))} />
                      ) : (
                        <div>
                          <label className="label">Assign to (select one or more)</label>
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
                          {nt.personnelIds.length > 0 && <div className="text-xs text-tw-primary-text mt-1">{nt.personnelIds.length} selected</div>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <button onClick={() => setNextTasks(arr => [...arr, emptyNextTask()])}
                  className="w-full py-2.5 border-2 border-dashed border-tw-border rounded-xl text-xs font-semibold text-tw-text-secondary hover:border-tw-primary/50 hover:text-tw-primary-text transition-colors inline-flex items-center justify-center gap-1.5">
                  <Icon name="plus" className="w-3.5 h-3.5" /> Add Another Next Task
                </button>
                {assignNextError && <div className="alert-error text-xs">{assignNextError}</div>}
              </div>
              <div className="modal-footer">
                <button onClick={() => setShowAssignNext(false)} className="btn-secondary">Cancel</button>
                <button disabled={assignNextSaving} onClick={doAssignNext} className="btn-primary">
                  {assignNextSaving ? 'Processing…' : <><Icon name="chain" className="w-4 h-4" /> Approve &amp; Assign</>}
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
    <div className="card overflow-hidden">
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
        <div className="px-4 pb-4 border-t border-tw-border pt-3 space-y-3">
          {task.description && <p className="text-xs text-tw-text-secondary leading-relaxed">{task.description}</p>}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            {task.project?.name && (
              <div><div className="section-label">Project</div><div className="text-tw-text font-medium mt-0.5">{task.project.name}</div></div>
            )}
            <div><div className="section-label">Submitted</div><div className="text-tw-text font-medium mt-0.5">{new Date(task.updatedAt).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</div></div>
            {task.deadline && (
              <div><div className="section-label">Deadline</div><div className="text-tw-text font-medium mt-0.5">{new Date(task.deadline).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</div></div>
            )}
            <div><div className="section-label">Priority</div><div className="mt-0.5"><span className={`badge ${priorityBadge[task.priority]}`}>{task.priority}</span></div></div>
          </div>
          {loadingS && <div className="text-xs text-tw-text-secondary">Loading details…</div>}
          {subtasks.length > 0 && (
            <div className="space-y-1">
              <div className="section-label mb-1">Subtasks ({subtasks.length})</div>
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
              <div className="section-label mb-1">Comments ({comments.length})</div>
              {comments.slice(-2).map(c => (
                <div key={c.id} className="panel-muted px-3 py-2 text-xs text-tw-text">{c.content}</div>
              ))}
            </div>
          )}
          <button onClick={() => onViewTask(task)} className="btn-primary w-full py-3">
            View Task &amp; Progress <Icon name="arrowRight" className="w-4 h-4" />
          </button>
        </div>
      )}

    </div>
  )
}

function ApprovalQueueView({ tasks, actorId, onRefresh, onViewTask }: { tasks: Task[]; actorId: string; onRefresh: () => void; onViewTask: (t: Task) => void }) {
  return (
    <div className="page">
      <PageHeader icon="approve" tone="purple" title="Approval Queue"
        subtitle={`${tasks.length} task${tasks.length !== 1 ? 's' : ''} waiting for your review`} />
      {tasks.length === 0 ? (
        <div className="card">
          <EmptyState icon="party" tone="green" title="All caught up!" text="No tasks waiting for approval." />
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
            <table className="table-modern">
              <thead>
                <tr className="bg-tw-surface-2 border-b border-tw-border">
                  <th className="w-px px-3 py-3"></th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-tw-text-secondary uppercase tracking-[0.08em]">Task</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-tw-text-secondary uppercase tracking-[0.08em]">Project</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-tw-text-secondary uppercase tracking-[0.08em]">Submitted</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-tw-text-secondary uppercase tracking-[0.08em]">Priority</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-tw-text-secondary uppercase tracking-[0.08em]">Deadline</th>
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

// ─── Deadline & Verification Report ──────────────────────────────────────────

type DeadlineTone = 'danger' | 'warning' | 'info'

const deadlineToneStyles: Record<DeadlineTone, { bar: string; badge: string; dot: string; text: string }> = {
  danger:  { bar: 'bg-red-500',     badge: 'badge-danger',  dot: 'bg-red-500',     text: 'text-tw-danger' },
  warning: { bar: 'bg-orange-400',  badge: 'badge-warning', dot: 'bg-orange-400',  text: 'text-orange-600' },
  info:    { bar: 'bg-emerald-500', badge: 'badge-success', dot: 'bg-emerald-500', text: 'text-emerald-600' },
}

function DeadlineReportCard({
  title, indicator, tone, tasks, showSubmitted, emptyText, onSelectTask,
}: {
  title: string
  indicator: string
  tone: DeadlineTone
  tasks: Task[]
  showSubmitted?: boolean
  emptyText: string
  onSelectTask: (t: Task) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const s = deadlineToneStyles[tone]
  const headers = showSubmitted
    ? ['Task', 'Project', 'Deadline', 'Submitted', 'Assigned To', 'Status']
    : ['Task', 'Project', 'Deadline', 'Assigned To', 'Status']
  return (
    <div className="card overflow-hidden">
      <button onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-4 md:px-5 py-4 text-left hover:bg-tw-hover transition-colors">
        <div className={`w-1 h-10 rounded-full flex-shrink-0 ${s.bar}`} />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-tw-text text-sm md:text-base">{title}</div>
          <div className={`flex items-center gap-1.5 mt-0.5 text-xs font-medium ${s.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} />
            {indicator}
          </div>
        </div>
        <span className={`badge ${s.badge} flex-shrink-0`}>{tasks.length}</span>
        <svg className={`w-4 h-4 text-tw-text-secondary flex-shrink-0 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded && (
        <div className="border-t border-tw-border">
          {tasks.length === 0 ? (
            <div className="p-8 text-center text-tw-text-secondary text-sm">{emptyText}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table-modern">
                <thead>
                  <tr className="bg-tw-surface-2 border-b border-tw-border">
                    {headers.map(h => (
                      <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-tw-text-secondary uppercase tracking-[0.08em] whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-tw-border">
                  {tasks.map(t => (
                    <tr key={t.id} onClick={() => onSelectTask(t)} className="hover:bg-tw-hover cursor-pointer">
                      <td className="px-4 py-3 font-medium text-tw-text">{t.title}</td>
                      <td className="px-4 py-3 text-tw-text-secondary">{t.project?.name || '—'}</td>
                      <td className={`px-4 py-3 font-medium whitespace-nowrap ${tone === 'danger' ? 'text-tw-danger' : 'text-tw-text-secondary'}`}>
                        {t.deadline ? new Date(t.deadline).toLocaleDateString() : '—'}
                      </td>
                      {showSubmitted && (
                        <td className={`px-4 py-3 font-medium whitespace-nowrap ${s.text}`}>
                          {new Date(t.updatedAt).toLocaleDateString()}
                        </td>
                      )}
                      <td className="px-4 py-3 text-tw-text-secondary">
                        {t.assignments?.[0] ? (t.assignments[0].personnel?.name || t.assignments[0].department?.name || '—') : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`badge ${subtaskStatusBadge[t.status] || 'badge-gray'}`}>{t.status.replace('_', ' ')}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// A task submitted on the deadline day itself counts as within deadline (day granularity).
const submittedAfterDeadline = (t: Task) =>
  !!t.deadline && new Date(t.updatedAt).getTime() > new Date(t.deadline).setHours(23, 59, 59, 999)

const byDeadlineAsc = (a: Task, b: Task) =>
  new Date(a.deadline ?? 8640000000000000).getTime() - new Date(b.deadline ?? 8640000000000000).getTime()


// ─── Director Dashboard ───────────────────────────────────────────────────────
export default function DirectorDashboard({ user, currentView, setView, onLogout, onUserUpdate, onImpersonationStart, launchSource }: Props) {
  const { t } = useLanguage()
  const insuranceEnabled = user.features?.includes('insurance_management') === true
  const ysoEnabled = user.features?.includes('four_level_hierarchy') === true
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

  // ── Lifted TasksPage state (filters + sort survive view switches) ────────
  const [tasksFilters, setTasksFilters] = useState<import('./FilterBar').ActiveFilters>(
    () => { try { const s = sessionStorage.getItem('tw_tasks_filters'); return s ? JSON.parse(s) : { layerFilters: {}, extra: { status: null, priority: null, assignedTo: null, createdFrom: null, createdTo: null, deadlineFrom: null, deadlineTo: null } } } catch { return { layerFilters: {}, extra: { status: null, priority: null, assignedTo: null, createdFrom: null, createdTo: null, deadlineFrom: null, deadlineTo: null } } } }
  )
  const [tasksSort, setTasksSort] = useState<TaskSort>(
    () => { try { return (sessionStorage.getItem('tw_tasks_sort') as TaskSort) || DEFAULT_TASK_SORT } catch { return DEFAULT_TASK_SORT } }
  )
  const [tasksRefreshKey, setTasksRefreshKey] = useState(0)

  const handleTasksFiltersChange = (f: import('./FilterBar').ActiveFilters) => {
    setTasksFilters(f)
    try { sessionStorage.setItem('tw_tasks_filters', JSON.stringify(f)) } catch { /* ignore */ }
  }
  const handleTasksSortChange = (s: TaskSort) => {
    setTasksSort(s)
    try { sessionStorage.setItem('tw_tasks_sort', s) } catch { /* ignore */ }
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
      // Submitted-late tasks are shown under "Needs Verification" in the deadline report, not as overdue
      const trueOverdueCount = overdue.filter(t => t.status !== 'SUBMITTED').length
      setStats({ projects: projects.length, totalTasks: allTasks.length, overdue: trueOverdueCount, pending_approval: submitted.length })
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

  const sidebarSections: SidebarSection[] = [
    { title: 'Overview', items: [
      { label: 'Dashboard',      view: 'director_dashboard', icon: 'dashboard' },
      { label: 'Recent Updates', view: 'recent_updates',     icon: 'updates' },
      { label: 'Broadcasts',     view: 'broadcasts',         icon: 'broadcast' },
    ] },
    { title: 'Work', items: [
      { label: 'Letters',     view: 'letters',       icon: 'letter' },
      { label: 'Projects',    view: 'project_board', icon: 'project' },
      { label: 'Tasks',       view: 'tasks',         icon: 'tasks' },
      { label: 'Group Tasks', view: 'group_tasks',   icon: 'group' },
      ...(insuranceEnabled ? [{ label: 'Insurance', view: 'insurance_management' as ViewMode, icon: 'shield' as const }] : []),
    ] },
    { title: 'Review', items: [
      { label: 'Approval Queue', view: 'approval_queue', icon: 'approve', badge: stats.pending_approval },
      { label: 'Overdue Tasks',  view: 'overdue',        icon: 'overdue', badge: stats.overdue },
    ] },
    { title: 'Insights', items: [
      { label: 'Reports',        view: 'reports',        icon: 'reports' },
      ...(ysoEnabled ? [{ label: 'YSO Performance', view: 'yso_performance' as ViewMode, icon: 'sprout' as const }] : []),
      { label: 'User Analytics', view: 'user_analytics', icon: 'analytics' },
      { label: 'Audit Log',      view: 'audit_log',      icon: 'audit' },
    ] },
    { title: 'Manage', items: [
      { label: 'Team Hierarchy', view: 'hierarchy_manager', icon: 'hierarchy' },
      { label: 'Settings',       view: 'settings',          icon: 'settings' },
    ] },
    ...(user.isSyswiseAdmin ? [{ title: 'SysWise Admin', items: [
      { label: 'Support Access',   view: 'impersonation'    as ViewMode, icon: 'lock' as const },
      { label: 'Company Requests', view: 'company_requests' as ViewMode, icon: 'building' as const },
      { label: 'Company Features', view: 'company_features' as ViewMode, icon: 'puzzle' as const },
    ] }] : []),
  ]

  const activeView = currentView === 'project_board' && !selectedProject ? 'project_board' : currentView

  const { canInstall, isIOS, installApp, pushState, enablePush } = usePWA({ autoPush: !user.impersonation })
  const refreshAll = () => { void loadDashboard(); requestRefresh() }
  const [showIOSGuide, setShowIOSGuide] = useState(false)

  // Mobile: four primary destinations in the floating bar, the rest in "More"
  const mobileNavItems: MobileNavItem[] = [
    { label: 'Dashboard', view: 'director_dashboard', icon: 'dashboard' },
    { label: 'Projects',  view: 'project_board',      icon: 'project' },
    { label: 'Approvals', view: 'approval_queue',     icon: 'approve', badge: stats.pending_approval },
    { label: 'Groups',    view: 'group_tasks',        icon: 'group' },
  ]
  const mobileMoreItems: MobileNavItem[] = [
    { label: 'Letters', view: 'letters', icon: 'letter' },
    ...(ysoEnabled ? [{ label: 'YSO Performance', view: 'yso_performance' as ViewMode, icon: 'sprout' as const }] : []),
    ...(insuranceEnabled ? [{ label: 'Insurance', view: 'insurance_management' as ViewMode, icon: 'shield' as const }] : []),
    { label: 'Tasks',           view: 'tasks',             icon: 'tasks' },
    { label: 'Team Hierarchy',  view: 'hierarchy_manager', icon: 'hierarchy' },
    { label: 'Reports',         view: 'reports',           icon: 'reports' },
    { label: 'Recent Updates',  view: 'recent_updates',    icon: 'updates' },
    { label: 'Broadcasts',      view: 'broadcasts',        icon: 'broadcast' },
    { label: 'Overdue Tasks',   view: 'overdue',           icon: 'overdue', badge: stats.overdue },
    { label: 'Audit Log',       view: 'audit_log',         icon: 'audit' },
    { label: 'User Analytics',  view: 'user_analytics',    icon: 'analytics' },
    ...(user.isSyswiseAdmin ? [{ label: 'Support Access', view: 'impersonation' as ViewMode, icon: 'lock' as const }] : []),
    { label: 'Settings',        view: 'settings',          icon: 'settings' },
    ...(user.isSyswiseAdmin ? [{ label: 'Company Requests', view: 'company_requests' as ViewMode, icon: 'building' as const }] : []),
    ...(user.isSyswiseAdmin ? [{ label: 'Company Features', view: 'company_features' as ViewMode, icon: 'puzzle' as const }] : []),
    { label: 'My Profile',      view: 'profile',           icon: 'user' },
  ]

  return (
    <div className="min-h-screen bg-tw-bg flex relative overflow-x-clip">

      {/* ── Watermark ───────────────────────────────────────────────────── */}
      {currentView !== 'letters' && <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <img src="/taskwise/watermark.jpeg" alt="" className="tw-watermark absolute bottom-0 select-none"
          style={{ width: '100%', maxWidth: '480px', right: '50%', transform: 'translateX(50%)' }} />
      </div>}

      {/* ── Desktop Sidebar ──────────────────────────────────────────────── */}
      <Sidebar
        user={user}
        roleLabel="Director"
        sections={sidebarSections}
        activeView={activeView}
        onSelect={v => { if (v === 'project_board') setSelectedProject(null); navigate(v) }}
        onLogout={onLogout}
        highlight={stats.pending_approval > 0 && activeView !== 'approval_queue' ? {
          title: `${stats.pending_approval} ${t(stats.pending_approval === 1 ? 'task is awaiting your approval' : 'tasks are awaiting your approval')}`,
          cta: t('Review now'),
          onClick: () => navigate('approval_queue'),
        } : undefined}
      />

      {/* ── Main ────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Top bar */}
        <header className={`sticky z-20 ${user.impersonation ? 'top-[56px] md:top-[68px]' : 'top-0 md:top-3'} bg-tw-surface/85 backdrop-blur-xl border-b border-tw-border md:border md:rounded-2xl md:mx-3 md:mt-3 md:shadow-card px-3 md:px-4 py-2.5 flex items-center justify-between gap-2 flex-shrink-0`}>
          <div className="flex items-center gap-2 min-w-0">
            {user.companyLogo ? (
              <img src={user.companyLogo} alt="Logo" className="w-8 h-8 rounded-xl object-contain bg-white p-0.5 ring-1 ring-tw-border md:hidden" />
            ) : (
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#3d9bff] to-tw-primary flex items-center justify-center md:hidden flex-shrink-0 shadow-cta">
                <span className="text-white font-bold text-xs">{(user.companyName || 'T')[0].toUpperCase()}</span>
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
                className="icon-btn w-8 h-8"
                title="Go back"
              >
                <Icon name="arrowLeft" className="w-[18px] h-[18px]" />
              </button>
            )}
            <div className="flex items-center gap-1.5 min-w-0 text-[15px]">
              <span className="hidden lg:inline text-tw-text-muted truncate max-w-[180px]">{user.companyName || 'TaskWise'}</span>
              <Icon name="chevronRight" className="hidden lg:block w-3.5 h-3.5 text-tw-text-muted flex-shrink-0" />
              <span className="font-semibold text-tw-text truncate">
                {currentView === 'project_board' && selectedProject ? selectedProject.name
                  : currentView === 'director_dashboard' ? 'Dashboard'
                  : currentView === 'approval_queue' ? 'Approvals'
                  : currentView === 'overdue' ? 'Deadline & Verification'
                  : currentView === 'hierarchy_manager' ? 'Team Hierarchy'
                  : currentView === 'audit_log' ? 'Audit Log'
                  : currentView === 'broadcasts' ? 'Broadcasts'
                  : currentView === 'settings' ? 'Settings'
                  : currentView === 'project_board' ? 'Projects'
                  : currentView === 'tasks' ? 'Tasks'
                  : currentView === 'recent_updates' ? 'Recent Updates'
                  : currentView === 'group_tasks' ? 'Group Tasks'
                  : currentView === 'reports' ? 'Reports'
                  : currentView === 'impersonation' ? 'Support Access'
                  : currentView === 'user_analytics' ? 'User Analytics'
                  : currentView === 'user_management' ? (user.roleBasedIdentity ? 'Role Management' : 'User Management')
                  : currentView === 'leaderboard' ? 'Leaderboard'
                  : currentView === 'insurance_management' ? 'Insurance Management'
                  : currentView === 'letters' ? t('Letters')
                  : currentView === 'yso_performance' ? t('YSO Performance')
                  : currentView === 'company_requests' ? 'Company Requests'
                  : currentView === 'company_features' ? 'Company Features'
                  : 'My Profile'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {currentView === 'project_board' && selectedProject && (
              <div className="hidden md:inline-flex seg">
                <button onClick={() => setProjectSubView('board')}
                  className={`seg-item ${projectSubView === 'board' ? 'seg-item-active' : ''}`}>
                  Board
                </button>
                <button onClick={() => setProjectSubView('flowchart')}
                  className={`seg-item ${projectSubView === 'flowchart' ? 'seg-item-active' : ''}`}>
                  Flowchart
                </button>
              </div>
            )}
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
            <button onClick={refreshAll} title={t('Refresh')} aria-label={t('Refresh')} className="icon-btn hidden md:inline-flex">
              <Icon name="refresh" className="w-[18px] h-[18px]" />
            </button>
            <ThemeToggle compact className="hidden md:inline-flex" />
            <a
              href={launcherHomeUrl(launchSource)}
              title={t(`Back to ${launcherName(launchSource)}`)}
              aria-label={t(`Back to ${launcherName(launchSource)}`)}
              className="icon-btn hidden md:inline-flex"
            >
              <Icon name="grid" className="w-[18px] h-[18px]" />
            </a>
            <NotificationsMenu
              onOpenYso={() => navigate('yso_performance')}
              onOpenLetter={(id) => { sessionStorage.setItem('taskwise_letter_open', id); navigate('letters'); window.dispatchEvent(new CustomEvent('taskwise:open-letter', { detail: id })) }}
              onOpenTask={async taskId => {
                try {
                  setSelectedTask(await taskApi.get(taskId) as Task)
                } catch {
                  await loadDashboard()
                }
              }}
              onOpenCompanyRequests={() => navigate('company_requests')}
            />
            {/* Mobile user menu */}
            <MobileUserMenu user={user} roleLabel="Director" onProfile={() => setView('profile' as ViewMode)} onSettings={() => setView('settings' as ViewMode)} onLogout={onLogout} onRefresh={refreshAll} launcher={{ href: launcherHomeUrl(launchSource), label: `Back to ${launcherName(launchSource)}` }} onInstall={canInstall ? (isIOS ? () => setShowIOSGuide(true) : installApp) : undefined} push={pushState} onEnablePush={enablePush} />
          </div>
        </header>

        <main ref={mainRef} className="flex-1 overflow-auto pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:pb-0">

          {/* DASHBOARD */}
          {currentView === 'director_dashboard' && (
            <div className="page">
              <PageHeader
                title={<>{t('Welcome back')}, {user.name.split(' ')[0]}</>}
                subtitle={t("Here's what's happening across your workspace.")}
              />

              {statsLoading ? <LoadingBlock /> : (
                <>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-5 md:mb-6">
                    <StatCard label={t('Projects')}         value={stats.projects}         icon="project"   tone="blue"   onClick={() => navigate('project_board')} />
                    <StatCard label={t('Total Tasks')}      value={stats.totalTasks}       icon="tasks"     tone="indigo" onClick={() => navigate('tasks')} />
                    <StatCard label={t('Pending Approval')} value={stats.pending_approval} icon="hourglass" tone="purple" onClick={() => navigate('approval_queue')} />
                    <StatCard label={t('Overdue')}          value={stats.overdue}          icon="alert"     tone="red"    onClick={() => navigate('overdue')} />
                  </div>

                  <div className="grid lg:grid-cols-3 gap-4 md:gap-5">
                    {/* Due soon */}
                    <div className="card lg:col-span-2 overflow-hidden">
                      <div className="flex items-center justify-between px-5 py-4 border-b border-tw-border">
                        <div className="flex items-center gap-2.5">
                          <span className="icon-tile tile-amber w-8 h-8 rounded-lg"><Icon name="calendar" className="w-4 h-4" /></span>
                          <div>
                            <div className="font-semibold text-tw-text text-sm">{t('Due in the next 7 days')}</div>
                            <div className="text-xs text-tw-text-secondary">{dueSoonList.length} {t(dueSoonList.length === 1 ? 'task' : 'tasks')}</div>
                          </div>
                        </div>
                        <button onClick={() => navigate('tasks')} className="btn-ghost btn-sm">{t('View all')}<Icon name="arrowRight" className="w-3.5 h-3.5" /></button>
                      </div>
                      {dueSoonList.length === 0 ? (
                        <EmptyState icon="check" tone="green" title={t('Nothing due this week')} text={t('No active tasks have a deadline in the next 7 days.')} className="py-10" />
                      ) : (
                        <div className="divide-y divide-tw-border">
                          {dueSoonList.slice(0, 6).map(task => {
                            const days = Math.ceil((new Date(task.deadline!).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000)
                            return (
                              <button key={task.id} onClick={() => setSelectedTask(task)} className="list-row w-full text-left">
                                <span className={`w-1.5 h-8 rounded-full flex-shrink-0 ${days <= 1 ? 'bg-tw-danger' : days <= 3 ? 'bg-tw-warning' : 'bg-tw-primary/60'}`} />
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium text-tw-text truncate">{task.title}</div>
                                  <div className="text-xs text-tw-text-secondary truncate">
                                    {task.project?.name || '—'} · {task.assignments?.[0]?.personnel?.name || task.assignments?.[0]?.department?.name || t('Unassigned')}
                                  </div>
                                </div>
                                <span className={`badge ${days <= 1 ? 'badge-danger' : days <= 3 ? 'badge-warning' : 'badge-gray'}`}>
                                  {days === 0 ? t('Today') : days === 1 ? t('Tomorrow') : `${days}d`}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    {/* Shortcuts */}
                    <div className="space-y-3">
                      {[
                        { title: 'Reports', text: 'Overdue · Due soon · Pending approvals · Sitting longest · By officer · By department & more', icon: 'reports' as const, tone: 'tile-blue', view: 'reports' as ViewMode },
                        { title: 'Leaderboard', text: "See who's earning points — daily logins, task updates, on-time submissions & more", icon: 'trophy' as const, tone: 'tile-amber', view: 'leaderboard' as ViewMode },
                        { title: 'Recent Updates', text: 'Latest progress notes and comments across all tasks', icon: 'updates' as const, tone: 'tile-teal', view: 'recent_updates' as ViewMode },
                      ].map(sc => (
                        <button key={sc.title} onClick={() => navigate(sc.view)}
                          className="w-full card card-hover p-4 flex items-center gap-3.5 text-left group">
                          <span className={`icon-tile ${sc.tone}`}><Icon name={sc.icon} className="w-5 h-5" /></span>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-tw-text text-sm">{t(sc.title)}</div>
                            <div className="text-xs text-tw-text-secondary mt-0.5 line-clamp-2">{t(sc.text)}</div>
                          </div>
                          <Icon name="chevronRight" className="w-4 h-4 text-tw-text-muted group-hover:text-tw-primary-text group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Sitting longest */}
                  {stalestList.length > 0 && (
                    <div className="card overflow-hidden mt-4 md:mt-5">
                      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-tw-border">
                        <span className="icon-tile tile-purple w-8 h-8 rounded-lg"><Icon name="hourglass" className="w-4 h-4" /></span>
                        <div>
                          <div className="font-semibold text-tw-text text-sm">{t('Sitting longest')}</div>
                          <div className="text-xs text-tw-text-secondary">{t('Active tasks assigned the longest time ago')}</div>
                        </div>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-px bg-tw-border">
                        {stalestList.slice(0, 6).map(task => (
                          <button key={task.id} onClick={() => setSelectedTask(task)} className="list-row w-full text-left bg-tw-surface">
                            <span className="icon-tile tile-gray w-8 h-8 rounded-lg"><Icon name="tasks" className="w-4 h-4" /></span>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-tw-text truncate">{task.title}</div>
                              <div className="text-xs text-tw-text-secondary truncate">{task.assignments?.[0]?.personnel?.name || task.assignments?.[0]?.department?.name || '—'}</div>
                            </div>
                            {task.assignments?.[0]?.assignedAt && <ElapsedDays startedAt={task.assignments[0].assignedAt} />}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {currentView === 'insurance_management' && insuranceEnabled && (
            <InsuranceManagementPage />
          )}
          {currentView === 'letters' && <LetterManagement user={user} onUserUpdate={onUserUpdate} />}
          {currentView === 'yso_performance' && ysoEnabled && <YsoPerformancePage user={user} onUserUpdate={onUserUpdate} />}

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

          {/* TASKS */}
          {currentView === 'tasks' && (
            <TasksPage
              filters={tasksFilters}
              onFiltersChange={handleTasksFiltersChange}
              sort={tasksSort}
              onSortChange={handleTasksSortChange}
              onSelectTask={setSelectedTask}
              refreshKey={tasksRefreshKey}
            />
          )}

          {/* HIERARCHY */}
          {currentView === 'hierarchy_manager' && <HierarchyPanel user={user} />}

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

          {/* OVERDUE / DEADLINE & VERIFICATION REPORT */}
          {currentView === 'overdue' && (() => {
            const trueOverdue     = overdueList.filter(t => t.status !== 'SUBMITTED').sort(byDeadlineAsc)
            const submittedLate   = approvalQueue.filter(t => submittedAfterDeadline(t)).sort(byDeadlineAsc)
            const submittedOnTime = approvalQueue.filter(t => !submittedAfterDeadline(t)).sort(byDeadlineAsc)
            return (
              <div className="page">
                <PageHeader icon="overdue" tone="red" title="Task Deadline & Verification Report"
                  subtitle="Overdue work and submissions awaiting verification, grouped by deadline outcome." />
                <div className="space-y-3 md:space-y-4">
                  <DeadlineReportCard
                    title="Task Overdue"
                    indicator="Deadline passed — action required"
                    tone="danger"
                    tasks={trueOverdue}
                    emptyText="No overdue tasks. Great work!"
                    onSelectTask={setSelectedTask}
                  />
                  <DeadlineReportCard
                    title="Task Submitted After Deadline — Needs Verification"
                    indicator="Submitted late — awaiting review"
                    tone="warning"
                    tasks={submittedLate}
                    showSubmitted
                    emptyText="No late submissions awaiting verification."
                    onSelectTask={setSelectedTask}
                  />
                  <DeadlineReportCard
                    title="Task Submitted Within Deadline — Needs Verification"
                    indicator="On time — awaiting review"
                    tone="info"
                    tasks={submittedOnTime}
                    showSubmitted
                    emptyText="No on-time submissions awaiting verification."
                    onSelectTask={setSelectedTask}
                  />
                </div>
              </div>
            )
          })()}

          {/* RECENT UPDATES */}
          {currentView === 'recent_updates' && <RecentUpdatesView />}

          {/* BROADCASTS */}
          {currentView === 'broadcasts' && <BroadcastsPage user={user} />}

          {/* GROUP TASKS */}
          {currentView === 'group_tasks' && <GroupWiseTasksPage />}

          {/* REPORTS */}
          {currentView === 'reports' && (
            <ReportsPage savedState={reportsState} onStateChange={setReportsState} scrollContainerRef={mainRef} />
          )}

          {/* SUPPORT ACCESS / IMPERSONATION — System Admin only */}
          {currentView === 'impersonation' && user.isSyswiseAdmin && onImpersonationStart && (
            <ImpersonationPage user={user} onSessionStarted={onImpersonationStart} />
          )}

          {/* USER ANALYTICS */}
          {currentView === 'user_analytics' && (
            <UserAnalyticsPage
              onOpenLeaderboard={() => navigate('leaderboard')}
              onOpenUserManagement={user.isChairman ? () => navigate('user_management') : undefined}
            />
          )}

          {/* USER MANAGEMENT — Chairman only */}
          {currentView === 'user_management' && user.isChairman && (
            user.roleBasedIdentity ? <div className="page"><FixedRoleManagement user={user} /></div> : <ChairmanUserManagementPage />
          )}

          {/* LEADERBOARD */}
          {currentView === 'leaderboard' && (
            <LeaderboardPage />
          )}

          {currentView === 'company_requests' && user.isSyswiseAdmin && (
            <CompanyRequestsPage />
          )}

          {currentView === 'company_features' && user.isSyswiseAdmin && (
            <CompanyFeaturesPage />
          )}

          {/* AUDIT LOG */}
          {currentView === 'audit_log' && (
            <div className="page">
              <PageHeader icon="audit" tone="gray" title="Audit Log" subtitle="Every task event, who triggered it and when." />
              <div className="card overflow-hidden overflow-x-auto">
                <table className="table-modern">
                  <thead>
                    <tr className="bg-tw-surface-2 border-b border-tw-border">
                      {['Event', 'Actor', 'Task', 'Date & Time'].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-tw-text-secondary uppercase tracking-[0.08em]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-tw-border">
                    {(auditLogs as AuditLog[]).length === 0 && (
                      <tr><td colSpan={4} className="px-4 py-8 text-center text-tw-text-secondary text-sm">No audit entries yet.</td></tr>
                    )}
                    {(auditLogs as AuditLog[]).map((log: AuditLog) => (
                      <tr key={log.id} className="hover:bg-tw-hover">
                        <td className="px-4 py-3"><span className="font-mono text-[11px] bg-tw-hover border border-tw-border px-2 py-0.5 rounded-md text-tw-text">{log.event}</span></td>
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

      {/* ── Mobile bottom bar ──────────────────────────────────────────── */}
      <MobileNav
        primary={mobileNavItems}
        more={mobileMoreItems}
        activeView={activeView}
        onSelect={v => { if (v === 'project_board') setSelectedProject(null); navigate(v) }}
      />

      {/* ── Task Detail Panel (overdue / flowchart click-through) ─────── */}
      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          isDirector={true}
          actorId={user.actorId}
          layers={panelLayers}
          personnel={panelPersonnel}
          onClose={() => setSelectedTask(null)}
          onRefresh={async () => {
            await loadDashboard()
            setTasksRefreshKey(k => k + 1)
            if (selectedTask) {
              try { setSelectedTask(await taskApi.get(selectedTask.id) as Task) } catch { /* panel will close on 404 */ }
            }
          }}
        />
      )}
    </div>
  )
}
