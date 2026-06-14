import React, { useState, useEffect } from 'react'
import type { Task, TaskComment, AuditLog, Layer, Personnel, TaskProgressLog, DeadlineExtension } from '../types'
import { taskApi, workspaceApi, taskGroupApi } from '../services/apiService'
import DatePicker from './DatePicker'
import Select from './Select'
import ProgressUpdateSheet from './ProgressUpdateSheet'

interface Props {
  task: Task
  isDirector: boolean
  actorId: string
  layers: Layer[]
  personnel: Personnel[]
  onClose: () => void
  onRefresh: () => Promise<void>
}

const priorityColors: Record<string, string> = {
  CRITICAL: 'badge-danger', HIGH: 'badge-warning', MEDIUM: 'badge-primary', LOW: 'badge-gray'
}
const statusColors: Record<string, string> = {
  PENDING: 'badge-gray', ASSIGNED: 'badge-primary', IN_PROGRESS: 'badge-warning',
  SUBMITTED: 'badge-purple', APPROVED: 'badge-success', RETURNED: 'badge-danger',
  REJECTED: 'badge-danger', CANCELLED: 'badge-gray',
}

const eventLabels: Record<string, string> = {
  TASK_CREATED:    'Task created',
  TASK_ASSIGNED:   'Task assigned',
  TASK_ACCEPTED:   'Task accepted',
  TASK_UPDATED:    'Task updated',
  TASK_STARTED:    'Work started',
  TASK_SUBMITTED:  'Submitted for approval',
  TASK_APPROVED:   'Task approved',
  TASK_REJECTED:   'Task rejected',
  TASK_RETURNED:   'Task returned',
  TASK_CANCELLED:  'Task cancelled',
  TASK_DELETED:    'Task deleted',
  SUBTASK_CREATED: 'Subtask created',
  COMMENT_ADDED:   'Comment added',
  DEADLINE_CHANGED:  'Deadline changed',
  DEADLINE_EXTENDED: 'Deadline extended',
  ASSIGNEES_CHANGED: 'Assignees changed',
  TASK_CHAIN_HANDOVER:        'Chained to next task',
  TASK_AUTO_APPROVED_HANDOVER:'Auto-approved (chain handover)',
}

type NextTaskForm = {
  title: string
  description: string
  projectId: string
  priority: string
  deadline: string
  isGroupTask: boolean
  groupId: string
  personnelIds: string[]
  personnelSearch: string
}

const emptyNextTask = (): NextTaskForm => ({
  title: '', description: '', projectId: '', priority: 'MEDIUM',
  deadline: '', isGroupTask: false, groupId: '', personnelIds: [], personnelSearch: '',
})

export default function TaskDetailPanel({ task, isDirector, actorId, layers, personnel, onClose, onRefresh }: Props) {
  const [tab, setTab] = useState<'details' | 'subtasks' | 'updates' | 'history' | 'chain'>('details')
  const [comments, setComments] = useState<TaskComment[]>([])
  const [history, setHistory] = useState<AuditLog[]>([])
  const [subtasks, setSubtasks] = useState<Task[]>([])
  const [progressLogs, setProgressLogs] = useState<TaskProgressLog[]>([])
  const [newComment, setNewComment] = useState('')
  const [newUpdate, setNewUpdate] = useState('')
  const [addingUpdate, setAddingUpdate] = useState(false)
  const [reason, setReason] = useState('')
  const [showReasonModal, setShowReasonModal] = useState<'return' | 'reject' | 'cancel' | null>(null)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [showSubtaskModal, setShowSubtaskModal] = useState(false)
  const [assignTarget, setAssignTarget] = useState<{ type: string; id: string }>({ type: '', id: '' })
  const [subtaskForm, setSubtaskForm] = useState({ title: '', description: '', priority: 'MEDIUM', deadline: '' })
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState('')
  const [editing, setEditing] = useState(false)
  const currentAssigneeId = task.assignments?.find(a => a.personnelId)?.personnelId ?? ''
  const [editForm, setEditForm] = useState({ title: task.title, description: task.description || '', priority: task.priority, deadline: task.deadline ? task.deadline.slice(0, 10) : '', assignedTo: currentAssigneeId })
  const [editSaving, setEditSaving] = useState(false)

  // Chain / assign-next state
  const [showAssignNextModal, setShowAssignNextModal] = useState(false)
  const [nextTasks, setNextTasks] = useState<NextTaskForm[]>([emptyNextTask()])
  const [handoverNote, setHandoverNote] = useState('')
  const [allowPrevView, setAllowPrevView] = useState(false)
  const [assignNextSaving, setAssignNextSaving] = useState(false)
  const [assignNextError, setAssignNextError] = useState('')
  type ChainTaskItem = { id: string; title: string; status: string; chainStepNumber: number; isCurrentTask: boolean; assignments?: Array<{ personnel?: { name: string } | null; department?: { name: string } | null }> }
  type PrevHistoryLog = { id: string; note: string; logDate: string; authorName?: string; authorType?: string }
  const [chainData, setChainData] = useState<{ chainId: string | null; chain: ChainTaskItem[]; links: unknown[] } | null>(null)
  const [prevHistory, setPrevHistory] = useState<{ parentTask: { title: string; status: string } | null; progressLogs: PrevHistoryLog[]; history: unknown[]; handoverNote?: string; chainStepNumber?: number } | null>(null)
  const [allGroups, setAllGroups] = useState<Array<{ id: string; name: string }>>([])
  const [allPersonnel, setAllPersonnel] = useState<Array<{ id: string; name: string }>>([])

  // Extend deadline modal state
  const [showExtendModal, setShowExtendModal] = useState(false)
  const [extendForm, setExtendForm] = useState({ newDeadline: '', reason: '', note: '' })
  const [extendSaving, setExtendSaving] = useState(false)
  const [extendError, setExtendError] = useState('')
  const [deadlineExtensions, setDeadlineExtensions] = useState<DeadlineExtension[]>([])

  const allDepts = layers.flatMap(l => l.departments || [])

  useEffect(() => {
    if (tab === 'history')  { loadHistory(); loadDeadlineExtensions() }
    if (tab === 'subtasks') loadSubtasks()
    if (tab === 'updates')  loadProgressLogs()
    if (tab === 'chain')    { loadChainData(); loadPrevHistory() }
  }, [tab, task.id])

  // Reset tab when task changes
  useEffect(() => { setTab('details'); setActionError('') }, [task.id])

  const loadComments = async () => {
    try { setComments(await taskApi.comments(task.id) as TaskComment[]) }
    catch { /* non-critical */ }
  }
  const loadHistory  = async () => {
    try { setHistory(await taskApi.history(task.id) as AuditLog[]) }
    catch { /* non-critical */ }
  }
  const loadSubtasks = async () => {
    try { setSubtasks(await taskApi.subtasks(task.id) as Task[]) }
    catch { /* non-critical */ }
  }
  const loadProgressLogs = async () => {
    try { setProgressLogs(await taskApi.progressLogs(task.id) as TaskProgressLog[]) }
    catch { /* non-critical */ }
  }
  const loadDeadlineExtensions = async () => {
    try { setDeadlineExtensions(await taskApi.deadlineExtensions(task.id) as DeadlineExtension[]) }
    catch { /* non-critical */ }
  }
  const loadChainData = async () => {
    try { setChainData(await taskApi.getChain(task.id) as NonNullable<typeof chainData>) }
    catch { /* non-critical */ }
  }
  const loadPrevHistory = async () => {
    try { setPrevHistory(await taskApi.previousHistory(task.id) as NonNullable<typeof prevHistory>) }
    catch { /* non-critical */ }
  }

  const doAction = async (action: () => Promise<unknown>) => {
    setActionLoading(true)
    setActionError('')
    try { await action(); await onRefresh() }
    catch (e: unknown) { setActionError(e instanceof Error ? e.message : 'Action failed') }
    setActionLoading(false)
  }

  const submitComment = async () => {
    if (!newComment.trim()) return
    try {
      await taskApi.addComment(task.id, newComment)
      setNewComment('')
      await loadComments()
    } catch (e: unknown) { setActionError(e instanceof Error ? e.message : 'Failed to send comment') }
  }

  const submitUpdate = async () => {
    if (!newUpdate.trim()) return
    setAddingUpdate(true)
    try {
      await taskApi.addProgressLog(task.id, newUpdate.trim())
      setNewUpdate('')
      await loadProgressLogs()
    } catch (e: unknown) { setActionError(e instanceof Error ? e.message : 'Failed to add update') }
    setAddingUpdate(false)
  }

  const createSubtask = async () => {
    if (!subtaskForm.title) return
    setLoading(true)
    try {
      await taskApi.create({ ...subtaskForm, projectId: task.projectId, parentTaskId: task.id, deadline: subtaskForm.deadline || undefined })
      setShowSubtaskModal(false)
      setSubtaskForm({ title: '', description: '', priority: 'MEDIUM', deadline: '' })
      setTab('subtasks')
      await loadSubtasks()
      await onRefresh()
    } catch (e: unknown) { setActionError(e instanceof Error ? e.message : 'Failed to create subtask') }
    setLoading(false)
  }

  const saveEdit = async () => {
    setEditSaving(true)
    try {
      await taskApi.update(task.id, {
        title: editForm.title,
        description: editForm.description || null,
        priority: editForm.priority,
        deadline: editForm.deadline || null,
        ...(editForm.assignedTo !== currentAssigneeId ? { reassignPersonnelId: editForm.assignedTo || null } : {}),
      })
      setEditing(false)
      await onRefresh()
    } catch (e: unknown) { setActionError(e instanceof Error ? e.message : 'Failed to save') }
    setEditSaving(false)
  }

  const handleExtendDeadline = async () => {
    if (!extendForm.newDeadline || !extendForm.reason.trim()) return
    setExtendSaving(true)
    setExtendError('')
    try {
      await taskApi.extendDeadline(task.id, {
        newDeadline: extendForm.newDeadline,
        reason: extendForm.reason.trim(),
        note: extendForm.note.trim() || undefined,
      })
      setShowExtendModal(false)
      setExtendForm({ newDeadline: '', reason: '', note: '' })
      await onRefresh()
    } catch (e: unknown) {
      setExtendError(e instanceof Error ? e.message : 'Failed to extend deadline')
    }
    setExtendSaving(false)
  }

  const openAssignNext = async () => {
    setNextTasks([emptyNextTask()])
    setHandoverNote('')
    setAllowPrevView(false)
    setAssignNextError('')
    // Load groups and personnel for the modal
    try {
      const [grps, ppl] = await Promise.all([
        taskGroupApi.list() as Promise<Array<{ id: string; name: string }>>,
        workspaceApi.getPersonnel() as Promise<Array<{ id: string; name: string }>>,
      ])
      setAllGroups(grps)
      setAllPersonnel(Array.isArray(ppl) ? ppl : (ppl as { items?: Array<{ id: string; name: string }> }).items ?? [])
    } catch { /* non-critical */ }
    setShowAssignNextModal(true)
  }

  const handleAssignNext = async () => {
    for (const nt of nextTasks) {
      if (!nt.title.trim()) { setAssignNextError('All tasks must have a title'); return }
      if (nt.isGroupTask && !nt.groupId) { setAssignNextError('Select a group for each group task'); return }
      if (!nt.isGroupTask && nt.personnelIds.length === 0) { setAssignNextError('Select at least one person for each task'); return }
    }
    setAssignNextSaving(true)
    setAssignNextError('')
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
      setShowAssignNextModal(false)
      await onRefresh()
    } catch (e: unknown) {
      setAssignNextError(e instanceof Error ? e.message : 'Failed to assign next task')
    }
    setAssignNextSaving(false)
  }

  // Action permissions
  const isCreator  = isDirector
    ? task.createdByDirectorId === actorId
    : task.createdByPersonnelId === actorId
  const isOverdue  = !!task.deadline && new Date(task.deadline) < new Date() && !['APPROVED', 'CANCELLED'].includes(task.status)
  const canExtend  = isCreator && isOverdue
  const canEdit    = isDirector && !['APPROVED', 'CANCELLED'].includes(task.status)
  const canSubmit  = !isDirector && task.status === 'IN_PROGRESS'
  const canReturn  = ['IN_PROGRESS', 'SUBMITTED'].includes(task.status)
  const canApprove = task.status === 'SUBMITTED' && (isDirector || task.approvalById === actorId)
  const canReject  = task.status === 'SUBMITTED' && (isDirector || task.approvalById === actorId)
  const canReopen  = task.status === 'REJECTED'
  const canCancel   = isDirector && !['APPROVED', 'CANCELLED'].includes(task.status)
  const canAssign   = isDirector && ['PENDING', 'RETURNED'].includes(task.status)
  const canSubtask  = ['IN_PROGRESS', 'ASSIGNED'].includes(task.status)
  const canHandOver = isDirector && task.status === 'SUBMITTED'

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black bg-opacity-30" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-white shadow-panel flex flex-col h-full overflow-hidden">

        {/* Header */}
        <div className="px-5 py-4 border-b border-tw-border bg-gradient-to-r from-[#f0f4ff] via-white to-[#f6f0ff]">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className={`badge ${statusColors[task.status]}`}>{task.status.replace('_', ' ')}</span>
                <span className={`badge ${priorityColors[task.priority]}`}>{task.priority}</span>
                {task.project && (
                  <span className="text-xs text-tw-text-secondary font-medium flex items-center gap-1">
                    {task.project.category && (
                      <>
                        <span style={{ color: task.project.category.color }}>{task.project.category.name}</span>
                        <span className="text-tw-text-secondary/50">›</span>
                      </>
                    )}
                    <span>📋 {task.project.name}</span>
                  </span>
                )}
                {task.parentTaskId && <span className="text-xs text-tw-text-secondary bg-tw-hover px-1.5 py-0.5 rounded font-medium">Subtask</span>}
              </div>
              {editing ? (
                <input className="input text-sm font-bold w-full" value={editForm.title}
                  onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} autoFocus />
              ) : (
                <h2 className="font-bold text-tw-text text-base leading-snug">{task.title}</h2>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {canEdit && !editing && (
                <button onClick={() => { setEditing(true); setEditForm({ title: task.title, description: task.description || '', priority: task.priority, deadline: task.deadline ? task.deadline.slice(0, 10) : '', assignedTo: currentAssigneeId }) }}
                  className="text-xs text-tw-primary hover:underline font-medium px-2 py-1 rounded-lg hover:bg-tw-hover transition-colors">
                  ✎ Edit
                </button>
              )}
              <button onClick={onClose} className="w-8 h-8 rounded-lg bg-red-100 hover:bg-red-200 text-red-600 flex items-center justify-center transition-colors flex-shrink-0" title="Close">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Inline edit form */}
          {editing && (
            <div className="mt-3 space-y-3 border-t border-tw-border pt-3">
              <div>
                <label className="block text-xs font-semibold text-tw-text-secondary uppercase tracking-wide mb-1">Description</label>
                <textarea className="input resize-none text-sm" rows={3} value={editForm.description}
                  onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} placeholder="Task description..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-tw-text-secondary uppercase tracking-wide mb-1">Priority</label>
                  <Select value={editForm.priority} onChange={val => setEditForm(f => ({ ...f, priority: val as typeof f.priority }))}
                    options={[{ value: 'LOW', label: 'Low' }, { value: 'MEDIUM', label: 'Medium' }, { value: 'HIGH', label: 'High' }, { value: 'CRITICAL', label: 'Critical' }]} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-tw-text-secondary uppercase tracking-wide mb-1">Deadline</label>
                  <DatePicker value={editForm.deadline} onChange={val => setEditForm(f => ({ ...f, deadline: val }))} />
                </div>
              </div>
              {personnel.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-tw-text-secondary uppercase tracking-wide mb-1">Assigned To</label>
                  <Select value={editForm.assignedTo} onChange={val => setEditForm(f => ({ ...f, assignedTo: val }))}
                    placeholder="Unassigned"
                    options={[{ value: '', label: 'Unassigned' }, ...personnel.map(p => ({ value: p.id, label: p.name }))]} />
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <button onClick={() => setEditing(false)} className="btn-secondary text-xs py-1.5">Cancel</button>
                <button onClick={saveEdit} disabled={editSaving || !editForm.title} className="btn-primary text-xs py-1.5">
                  {editSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          )}

          {/* Action error */}
          {actionError && (
            <div className="mt-2 text-xs text-tw-danger bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center justify-between">
              {actionError}
              <button onClick={() => setActionError('')} className="ml-2 font-bold">×</button>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 mt-3">
            {canSubmit    && <button disabled={actionLoading} onClick={() => doAction(() => taskApi.submit(task.id))} className="btn-primary text-xs py-1.5">✓ Submit for Approval</button>}
            {canReturn    && <button disabled={actionLoading} onClick={() => setShowReasonModal('return')} className="btn-secondary text-xs py-1.5">↩ Return</button>}
            {canApprove   && <button disabled={actionLoading} onClick={() => doAction(() => taskApi.approve(task.id))} className="bg-tw-success hover:opacity-90 text-white font-semibold px-3 py-1.5 rounded-lg text-xs transition-opacity">✓ Approve</button>}
            {canHandOver  && <button disabled={actionLoading} onClick={openAssignNext} className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-3 py-1.5 rounded-lg text-xs transition-colors">⛓ Approve & Assign Next</button>}
            {canReject    && <button disabled={actionLoading} onClick={() => setShowReasonModal('reject')} className="btn-danger text-xs py-1.5">✕ Reject</button>}
            {canReopen    && <button disabled={actionLoading} onClick={() => doAction(() => taskApi.reopen(task.id))} className="btn-secondary text-xs py-1.5">↻ Reopen</button>}
            {canAssign    && <button disabled={actionLoading} onClick={() => setShowAssignModal(true)} className="btn-secondary text-xs py-1.5">👤 Assign</button>}
            {canSubtask   && <button onClick={() => setShowSubtaskModal(true)} className="btn-secondary text-xs py-1.5">+ Subtask</button>}
            {canExtend  && (
              <button onClick={() => { setExtendForm({ newDeadline: '', reason: '', note: '' }); setExtendError(''); setShowExtendModal(true) }}
                className="btn-secondary text-xs py-1.5 text-amber-700 border-amber-300 hover:bg-amber-50">
                📅 Extend Deadline
              </button>
            )}
            {canCancel  && <button disabled={actionLoading} onClick={() => setShowReasonModal('cancel')} className="text-xs text-tw-danger hover:underline py-1.5">Cancel task</button>}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-tw-border px-5 bg-white overflow-x-auto">
          {(['details', 'updates', 'subtasks', 'history', 'chain'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`py-2.5 px-3 text-sm font-medium border-b-2 transition-colors capitalize whitespace-nowrap ${tab === t ? 'border-tw-primary text-tw-primary' : 'border-transparent text-tw-text-secondary hover:text-tw-text'}`}>
              {t === 'updates' ? `Updates${progressLogs.length > 0 ? ` (${progressLogs.length})` : ''}` :
               t === 'chain'   ? '⛓ Chain' : t}
              {t === 'subtasks' && task._count?.subtasks ? ` (${task._count.subtasks})` : ''}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-5">

          {/* DETAILS */}
          {tab === 'details' && (
            <div className="space-y-4">
              {task.description && (
                <div>
                  <div className="text-xs font-bold text-tw-text-secondary uppercase tracking-wide mb-1.5">Description</div>
                  <p className="text-sm text-tw-text leading-relaxed whitespace-pre-wrap">{task.description}</p>
                </div>
              )}

              {task.assignments?.length > 0 && (
                <div>
                  <div className="text-xs font-bold text-tw-text-secondary uppercase tracking-wide mb-2">Assigned To</div>
                  <div className="flex flex-wrap gap-2">
                    {task.assignments.map(a => (
                      <span key={a.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#e8f0ff] border border-[#0073ea]/20 text-sm font-medium text-[#0073ea]">
                        <span className="w-5 h-5 rounded-full bg-[#0073ea] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {(a.personnel?.name || a.department?.name || '?').charAt(0)}
                        </span>
                        {a.personnel?.name || a.department?.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {task.actedById && (
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-3">
                  <div className="text-xs font-bold text-[#0073ea] mb-1.5">Accepted by</div>
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-[#0073ea] flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                      {(task.actedByName || (task.actedByType === 'director' ? 'D' : 'P')).charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm text-tw-text font-semibold">
                      {task.actedByName || (task.actedByType === 'director' ? 'Director' : 'Personnel')}
                    </span>
                  </div>
                </div>
              )}

              {task.deadline && (
                <div className={`rounded-xl p-3 border ${new Date(task.deadline) < new Date() ? 'bg-red-50 border-red-200' : 'bg-[#f0fff8] border-green-200'}`}>
                  <div className={`text-xs font-bold uppercase tracking-wide mb-1 ${new Date(task.deadline) < new Date() ? 'text-tw-danger' : 'text-green-700'}`}>Deadline</div>
                  <span className={`text-sm font-semibold ${new Date(task.deadline) < new Date() ? 'text-tw-danger' : 'text-green-700'}`}>
                    {new Date(task.deadline).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                  </span>
                </div>
              )}

              {(task.returnReason || task.cancelReason) && (
                <div className="rounded-xl p-3 bg-red-50 border border-red-200">
                  <div className="text-xs font-bold mb-1.5 text-tw-danger">Return / Rejection reason</div>
                  <p className="text-sm text-tw-text">{task.returnReason || task.cancelReason}</p>
                </div>
              )}

              {task.parentTaskId && (
                <div>
                  <div className="text-xs font-bold text-tw-text-secondary uppercase tracking-wide mb-1">Hierarchy</div>
                  <span className="badge badge-gray">Part of a parent task</span>
                </div>
              )}
            </div>
          )}

          {/* SUBTASKS */}
          {tab === 'subtasks' && (
            <div>
              {subtasks.length === 0 ? (
                <div className="text-center py-8 text-tw-text-secondary text-sm">No subtasks yet.</div>
              ) : (
                <div className="space-y-2">
                  {subtasks.map(s => (
                    <div key={s.id} className="card p-3 flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-tw-text truncate">{s.title}</div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className={`badge ${statusColors[s.status]} text-xs`}>{s.status.replace('_', ' ')}</span>
                          <span className={`badge ${priorityColors[s.priority]} text-xs`}>{s.priority}</span>
                          {s.deadline && <span className="text-xs text-tw-text-secondary">{new Date(s.deadline).toLocaleDateString()}</span>}
                          {s._count?.subtasks ? <span className="text-xs text-tw-text-secondary">+{s._count.subtasks} sub</span> : null}
                        </div>
                        {/* Accountability on subtask */}
                        {s.actedById && (
                          <div className="text-xs text-tw-text-secondary mt-1">
                            Actioned by: {s.actedByName || (s.actedByType === 'director' ? 'Director' : 'Personnel')}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* UPDATES */}
          {tab === 'updates' && (
            <div className="flex flex-col h-full gap-3">
              <div className="flex-1 space-y-2 overflow-y-auto">
                {progressLogs.length === 0 ? (
                  <div className="text-center py-8 text-tw-text-secondary text-sm">No progress updates logged yet.</div>
                ) : progressLogs.map((log, idx) => {
                  const d = new Date(log.logDate)
                  const avatarColors = ['bg-[#0073ea]', 'bg-[#9c27b0]', 'bg-[#00a693]', 'bg-[#ff7575]', 'bg-[#ff9800]']
                  const avatarColor = avatarColors[idx % avatarColors.length]
                  return (
                    <div key={log.id} className="rounded-xl border border-tw-border bg-white px-4 py-3 shadow-sm">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2">
                          <div className={`w-6 h-6 rounded-full ${avatarColor} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                            {(log.authorName || '?').charAt(0).toUpperCase()}
                          </div>
                          <span className="text-sm font-semibold text-tw-text">{log.authorName || log.authorType}</span>
                        </div>
                        <span className="text-xs text-tw-text-secondary whitespace-nowrap">
                          {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-sm text-tw-text leading-relaxed break-words pl-8">{log.note}</p>
                    </div>
                  )
                })}
              </div>
              {/* Add update input */}
              <div className="border-t border-tw-border pt-3 mt-auto">
                <ProgressUpdateSheet
                  value={newUpdate}
                  onChange={setNewUpdate}
                  onSubmit={submitUpdate}
                  loading={addingUpdate}
                  placeholder="Add a progress update…"
                  label="Progress Update"
                />
                <p className="hidden sm:block text-xs text-tw-text-secondary mt-1">Enter to submit · Shift+Enter for new line</p>
              </div>
            </div>
          )}

          {/* CHAIN */}
          {tab === 'chain' && (() => {
            const STATUS_COLORS: Record<string, string> = {
              PENDING: 'bg-gray-100 text-gray-600', ASSIGNED: 'bg-blue-100 text-blue-700',
              IN_PROGRESS: 'bg-amber-100 text-amber-700', SUBMITTED: 'bg-purple-100 text-purple-700',
              APPROVED: 'bg-green-100 text-green-700', RETURNED: 'bg-orange-100 text-orange-700',
              REJECTED: 'bg-red-100 text-red-700', CANCELLED: 'bg-gray-100 text-gray-500',
            }
            const chainTasks = chainData?.chain ?? []

            return (
              <div className="space-y-4">
                {/* Chain Timeline */}
                {chainTasks.length === 0 ? (
                  <div className="text-center py-6 text-tw-text-secondary text-sm">
                    This task is not part of a chain yet.
                    {isDirector && task.status === 'SUBMITTED' && (
                      <div className="mt-2">
                        <button onClick={openAssignNext} className="text-indigo-600 hover:underline font-medium text-sm">
                          Approve &amp; Assign Next Task →
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <div className="text-xs font-bold text-tw-text-secondary uppercase tracking-wide mb-3">Chain Timeline</div>
                    <div className="relative">
                      {chainTasks.map((ct, idx) => (
                        <div key={ct.id} className="flex items-start gap-3 mb-4 last:mb-0">
                          {/* Step indicator */}
                          <div className="flex flex-col items-center flex-shrink-0">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 ${ct.isCurrentTask ? 'border-indigo-500 bg-indigo-100 text-indigo-700' : 'border-gray-300 bg-white text-gray-500'}`}>
                              {idx + 1}
                            </div>
                            {idx < chainTasks.length - 1 && <div className="w-0.5 h-6 bg-gray-200 mt-1" />}
                          </div>
                          {/* Task card */}
                          <div className={`flex-1 rounded-xl p-3 border ${ct.isCurrentTask ? 'border-indigo-300 bg-indigo-50' : 'border-tw-border bg-white'}`}>
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="text-sm font-semibold text-tw-text">{ct.title}</div>
                                {ct.isCurrentTask && <span className="text-xs text-indigo-600 font-medium">← Current task</span>}
                              </div>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${STATUS_COLORS[ct.status] ?? 'bg-gray-100 text-gray-600'}`}>
                                {ct.status.replace('_', ' ')}
                              </span>
                            </div>
                            {ct.assignments && ct.assignments.length > 0 && (
                              <div className="text-xs text-tw-text-secondary mt-1">
                                Assigned to: {ct.assignments.map(a => a.personnel?.name || a.department?.name || '—').join(', ')}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Previous Task History */}
                {prevHistory?.parentTask && (() => {
                  const pt = prevHistory.parentTask!
                  const logs = prevHistory.progressLogs
                  return (
                    <div className="border-t border-tw-border pt-4">
                      <div className="text-xs font-bold text-tw-text-secondary uppercase tracking-wide mb-2">Previous Task History</div>
                      {prevHistory.handoverNote && (
                        <div className="rounded-xl bg-indigo-50 border border-indigo-200 px-3 py-2 mb-3">
                          <div className="text-xs font-semibold text-indigo-600 mb-0.5">Handover note from director</div>
                          <p className="text-sm text-tw-text italic">"{prevHistory.handoverNote}"</p>
                        </div>
                      )}
                      <div className="rounded-xl border border-tw-border bg-gray-50 px-3 py-2 mb-3">
                        <div className="text-xs text-tw-text-secondary">Continued from: <span className="font-semibold text-tw-text">{pt.title}</span></div>
                        <div className="text-xs text-tw-text-secondary mt-0.5">
                          Status when handed over: <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[pt.status] ?? ''}`}>{pt.status.replace('_', ' ')}</span>
                        </div>
                      </div>
                      {logs.length === 0 ? (
                        <div className="text-sm text-tw-text-secondary text-center py-2">No progress logs from the previous task.</div>
                      ) : (
                        <div className="space-y-2">
                          {logs.map((log, idx) => {
                            const colors = ['bg-[#0073ea]', 'bg-[#9c27b0]', 'bg-[#00a693]', 'bg-[#ff7575]']
                            return (
                              <div key={log.id} className="rounded-xl border border-tw-border bg-white px-3 py-2.5">
                                <div className="flex items-center justify-between mb-1">
                                  <div className="flex items-center gap-1.5">
                                    <div className={`w-5 h-5 rounded-full ${colors[idx % colors.length]} flex items-center justify-center text-white text-xs font-bold`}>
                                      {(log.authorName || '?').charAt(0).toUpperCase()}
                                    </div>
                                    <span className="text-xs font-semibold text-tw-text">{log.authorName || log.authorType}</span>
                                  </div>
                                  <span className="text-xs text-tw-text-secondary">{new Date(log.logDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                                </div>
                                <p className="text-sm text-tw-text pl-6.5 leading-relaxed">{log.note}</p>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            )
          })()}

          {/* HISTORY */}
          {tab === 'history' && (() => {
            // Merge audit logs + deadline extensions into one timeline sorted by date
            type TimelineEntry =
              | { kind: 'audit'; entry: AuditLog }
              | { kind: 'extension'; entry: DeadlineExtension }
            const combined: TimelineEntry[] = [
              ...history.map(e => ({ kind: 'audit' as const, entry: e })),
              ...deadlineExtensions.map(e => ({ kind: 'extension' as const, entry: e })),
            ].sort((a, b) => new Date(a.entry.createdAt).getTime() - new Date(b.entry.createdAt).getTime())

            return (
              <div className="space-y-1">
                {combined.length === 0 && <div className="text-center py-8 text-tw-text-secondary text-sm">No history yet.</div>}
                {combined.map(item => {
                  if (item.kind === 'extension') {
                    const ext = item.entry as DeadlineExtension
                    return (
                      <div key={`ext-${ext.id}`} className="flex items-start gap-3 py-3 border-b border-tw-border last:border-0">
                        <div className="w-2 h-2 rounded-full mt-2 flex-shrink-0 bg-amber-500" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-tw-text">Deadline extended</span>
                            <span className="text-sm text-amber-700 font-medium">{ext.extendedByName}</span>
                          </div>
                          <div className="text-xs text-tw-text-secondary mt-0.5">
                            {new Date(ext.oldDeadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            {' → '}
                            {new Date(ext.newDeadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </div>
                          <div className="text-xs text-tw-text-secondary mt-0.5 italic">Reason: "{ext.reason}"</div>
                          {ext.note && <div className="text-xs text-tw-text-secondary mt-0.5">Note: {ext.note}</div>}
                          <div className="text-xs text-tw-text-secondary mt-0.5">{new Date(ext.createdAt).toLocaleString()}</div>
                        </div>
                      </div>
                    )
                  }
                  const log = item.entry as AuditLog
                  return (
                    <div key={`log-${log.id}`} className="flex items-start gap-3 py-3 border-b border-tw-border last:border-0">
                      <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
                        log.event.includes('APPROVED') ? 'bg-tw-success' :
                        log.event.includes('REJECTED') || log.event.includes('CANCELLED') ? 'bg-tw-danger' :
                        'bg-tw-primary'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-tw-text">
                            {eventLabels[log.event] || log.event.replace(/_/g, ' ')}
                          </span>
                          <span className="text-sm text-tw-primary font-medium">
                            {log.actorName || `${log.actorType === 'director' ? 'Director' : 'Personnel'}`}
                          </span>
                        </div>
                        {log.payload?.reason && (
                          <div className="text-sm text-tw-text-secondary mt-0.5 italic">"{log.payload.reason}"</div>
                        )}
                        {log.payload?.title && log.event === 'TASK_CREATED' && (
                          <div className="text-sm text-tw-text-secondary mt-0.5">"{log.payload.title}"</div>
                        )}
                        <div className="text-xs text-tw-text-secondary mt-0.5">{new Date(log.createdAt).toLocaleString()}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </div>
      </div>

      {/* Reason Modal (Return / Reject / Cancel) */}
      {showReasonModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-panel w-full max-w-sm">
            <div className="px-5 py-4 border-b border-tw-border">
              <h3 className="font-semibold text-tw-text capitalize">{showReasonModal} Task</h3>
            </div>
            <div className="px-5 py-4 space-y-3">
              <textarea className="input resize-none" rows={3}
                placeholder={showReasonModal === 'return' ? 'Reason (optional)…' : `Reason for ${showReasonModal}…`}
                value={reason} onChange={e => setReason(e.target.value)} />
              <div className="flex gap-2 justify-end">
                <button onClick={() => { setShowReasonModal(null); setReason('') }} className="btn-secondary">Cancel</button>
                <button disabled={(showReasonModal !== 'return' && !reason.trim()) || actionLoading} className="btn-danger"
                  onClick={() => {
                    const action =
                      showReasonModal === 'return' ? () => taskApi.return(task.id, reason) :
                      showReasonModal === 'reject' ? () => taskApi.reject(task.id, reason) :
                      () => taskApi.cancel(task.id, reason)
                    doAction(action)
                    setShowReasonModal(null)
                    setReason('')
                  }}>
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Extend Deadline Modal */}
      {showExtendModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="px-5 py-4 border-b border-tw-border">
              <h3 className="font-semibold text-tw-text">Extend Deadline</h3>
              <p className="text-xs text-tw-text-secondary mt-0.5">
                Current deadline: <span className="font-medium text-tw-danger">
                  {task.deadline ? new Date(task.deadline).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
                </span>
              </p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-tw-text-secondary uppercase tracking-wide mb-1">New Deadline <span className="text-tw-danger">*</span></label>
                <DatePicker
                  value={extendForm.newDeadline}
                  onChange={val => setExtendForm(f => ({ ...f, newDeadline: val }))}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-tw-text-secondary uppercase tracking-wide mb-1">Reason <span className="text-tw-danger">*</span></label>
                <textarea className="input resize-none" rows={2} autoFocus
                  placeholder="Why is the deadline being extended?"
                  value={extendForm.reason}
                  onChange={e => setExtendForm(f => ({ ...f, reason: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-tw-text-secondary uppercase tracking-wide mb-1">Note <span className="text-tw-text-secondary font-normal">(optional)</span></label>
                <textarea className="input resize-none" rows={2}
                  placeholder="Additional context for records…"
                  value={extendForm.note}
                  onChange={e => setExtendForm(f => ({ ...f, note: e.target.value }))} />
              </div>
              {extendError && (
                <div className="text-xs text-tw-danger bg-red-50 border border-red-200 rounded-lg px-3 py-2">{extendError}</div>
              )}
              <div className="flex gap-2 justify-end pt-1">
                <button onClick={() => { setShowExtendModal(false); setExtendForm({ newDeadline: '', reason: '', note: '' }); setExtendError('') }} className="btn-secondary">
                  Cancel
                </button>
                <button
                  disabled={!extendForm.newDeadline || !extendForm.reason.trim() || extendSaving}
                  onClick={handleExtendDeadline}
                  className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold disabled:opacity-50 transition-colors">
                  {extendSaving ? 'Saving…' : 'Extend Deadline'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Assign Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-panel w-full max-w-sm">
            <div className="px-5 py-4 border-b border-tw-border">
              <h3 className="font-semibold text-tw-text">Assign Task</h3>
            </div>
            <div className="px-5 py-4 space-y-3">
              <Select value={assignTarget.type} onChange={val => setAssignTarget({ type: val, id: '' })}
                placeholder="Assign type..."
                options={[
                  { value: 'personnel', label: 'Person' },
                  { value: 'department', label: 'Department' },
                ]} />
              {assignTarget.type === 'personnel' && (
                <Select value={assignTarget.id} onChange={val => setAssignTarget(a => ({ ...a, id: val }))}
                  placeholder="Select person..." options={personnel.map(p => ({ value: p.id, label: p.name }))} />
              )}
              {assignTarget.type === 'department' && (
                <Select value={assignTarget.id} onChange={val => setAssignTarget(a => ({ ...a, id: val }))}
                  placeholder="Select department..." options={allDepts.map(d => ({ value: d.id, label: d.name }))} />
              )}
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowAssignModal(false)} className="btn-secondary">Cancel</button>
                <button disabled={!assignTarget.type || !assignTarget.id || actionLoading} className="btn-primary"
                  onClick={() => {
                    doAction(() => taskApi.assign(task.id, { [`${assignTarget.type}Id`]: assignTarget.id }))
                    setShowAssignModal(false)
                  }}>
                  Assign
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Assign Next Task Modal */}
      {showAssignNextModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-4">
            <div className="px-5 py-4 border-b border-tw-border">
              <h3 className="font-bold text-tw-text text-base">Approve &amp; Assign Next Task</h3>
              <p className="text-xs text-tw-text-secondary mt-0.5">
                The current task will be automatically approved and the following tasks will be created and assigned.
              </p>
            </div>
            <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Handover note */}
              <div>
                <label className="block text-xs font-semibold text-tw-text-secondary uppercase tracking-wide mb-1">Handover Note <span className="text-tw-text-secondary font-normal">(optional)</span></label>
                <textarea className="input resize-none text-sm" rows={2}
                  placeholder="Context to pass to the next assignee(s)..."
                  value={handoverNote} onChange={e => setHandoverNote(e.target.value)} />
              </div>

              {/* Allow previous assignee to view */}
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={allowPrevView} onChange={e => setAllowPrevView(e.target.checked)} className="rounded border-gray-300" />
                <span className="text-sm text-tw-text">Allow previous assignee to view next task</span>
              </label>

              {/* Next tasks */}
              <div className="space-y-4">
                {nextTasks.map((nt, idx) => (
                  <div key={idx} className="border border-tw-border rounded-xl p-4 space-y-3 relative">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-tw-text-secondary uppercase tracking-wide">Task {idx + 1}</span>
                      {nextTasks.length > 1 && (
                        <button onClick={() => setNextTasks(arr => arr.filter((_, i) => i !== idx))}
                          className="text-xs text-tw-danger hover:underline">Remove</button>
                      )}
                    </div>
                    <input className="input text-sm" placeholder="Task title *" value={nt.title}
                      onChange={e => setNextTasks(arr => arr.map((t, i) => i === idx ? { ...t, title: e.target.value } : t))} />
                    <textarea className="input resize-none text-sm" rows={2} placeholder="Description (optional)"
                      value={nt.description}
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
                    {/* Assign type toggle */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => setNextTasks(arr => arr.map((t, i) => i === idx ? { ...t, isGroupTask: false, groupId: '' } : t))}
                        className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${!nt.isGroupTask ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-tw-border text-tw-text-secondary hover:bg-tw-hover'}`}>
                        👤 Individual(s)
                      </button>
                      <button
                        onClick={() => setNextTasks(arr => arr.map((t, i) => i === idx ? { ...t, isGroupTask: true, personnelIds: [] } : t))}
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
                              <input type="checkbox"
                                checked={nt.personnelIds.includes(p.id)}
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
                        {nt.personnelIds.length > 0 && (
                          <div className="text-xs text-indigo-600 mt-1">{nt.personnelIds.length} selected</div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <button onClick={() => setNextTasks(arr => [...arr, emptyNextTask()])}
                className="w-full py-2 border-2 border-dashed border-tw-border rounded-xl text-xs font-semibold text-tw-text-secondary hover:border-indigo-400 hover:text-indigo-600 transition-colors">
                + Add Another Next Task
              </button>

              {assignNextError && (
                <div className="text-xs text-tw-danger bg-red-50 border border-red-200 rounded-lg px-3 py-2">{assignNextError}</div>
              )}
            </div>
            <div className="px-5 py-4 border-t border-tw-border flex gap-2 justify-end">
              <button onClick={() => setShowAssignNextModal(false)} className="btn-secondary">Cancel</button>
              <button
                disabled={assignNextSaving}
                onClick={handleAssignNext}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors">
                {assignNextSaving ? 'Processing…' : '⛓ Approve & Assign'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Subtask Modal */}
      {showSubtaskModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-panel w-full max-w-md">
            <div className="px-5 py-4 border-b border-tw-border">
              <h3 className="font-semibold text-tw-text">Create Subtask</h3>
              <p className="text-xs text-tw-text-secondary mt-0.5">Under: {task.title}</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <input className="input" placeholder="Subtask title" value={subtaskForm.title}
                onChange={e => setSubtaskForm(f => ({ ...f, title: e.target.value }))} />
              <textarea className="input resize-none" rows={2} placeholder="Description..."
                value={subtaskForm.description} onChange={e => setSubtaskForm(f => ({ ...f, description: e.target.value }))} />
              <div className="grid grid-cols-2 gap-3">
                <Select value={subtaskForm.priority} onChange={val => setSubtaskForm(f => ({ ...f, priority: val }))}
                  options={[
                    { value: 'LOW', label: 'Low' },
                    { value: 'MEDIUM', label: 'Medium' },
                    { value: 'HIGH', label: 'High' },
                    { value: 'CRITICAL', label: 'Critical' },
                  ]} />
                <DatePicker value={subtaskForm.deadline} onChange={val => setSubtaskForm(f => ({ ...f, deadline: val }))} />
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowSubtaskModal(false)} className="btn-secondary">Cancel</button>
                <button onClick={createSubtask} disabled={loading || !subtaskForm.title} className="btn-primary">
                  {loading ? 'Creating...' : 'Create Subtask'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
