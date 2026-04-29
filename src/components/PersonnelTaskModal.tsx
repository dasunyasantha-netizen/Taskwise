import React, { useState, useEffect } from 'react'
import type { Task, TaskComment, AuditLog, Personnel, TaskProgressLog } from '../types'
import { taskApi, workspaceApi } from '../services/apiService'
import DatePicker from './DatePicker'
import Select from './Select'

interface Props {
  task: Task
  actorId: string
  departmentId?: string
  mySupervisorId?: string | null
  onSupervisorSet?: (supervisorId: string) => void
  personnel: Personnel[]
  parentTask?: Task
  onBack?: () => Promise<void>
  onSubtaskOpen?: (s: Task) => Promise<void>
  onClose: () => void
  onRefresh: () => Promise<void>
}

const priorityColors: Record<string, string> = {
  CRITICAL: 'badge-danger', HIGH: 'badge-warning', MEDIUM: 'badge-primary', LOW: 'badge-gray',
}
const statusColors: Record<string, string> = {
  PENDING: 'badge-gray', ASSIGNED: 'badge-gray', IN_PROGRESS: 'badge-warning',
  BLOCKED:   'bg-orange-100 text-orange-700 border border-orange-200',
  SUBMITTED: 'badge-purple', APPROVED: 'badge-success',
  RETURNED:  'badge-danger',  REJECTED: 'badge-danger', CANCELLED: 'badge-gray',
}
const displayStatus = (s: string) => s.replace('_', ' ')
const eventLabels: Record<string, string> = {
  TASK_CREATED:    'Task created',    TASK_ASSIGNED:   'Task assigned',
  TASK_ACCEPTED:   'Task accepted',   TASK_REASSIGNED: 'Task reassigned',
  TASK_UPDATED:    'Task updated',    TASK_STARTED:    'Work started',
  TASK_SUBMITTED:  'Submitted for approval',
  TASK_APPROVED:   'Task approved',   TASK_REJECTED:   'Task rejected',
  TASK_RETURNED:   'Task returned',   TASK_BLOCKED:    'Task blocked',
  TASK_UNBLOCKED:  'Task unblocked',  TASK_CANCELLED:  'Task cancelled',
  SUBTASK_CREATED: 'Subtask created', COMMENT_ADDED:   'Comment added',
}

type TabKey = 'details' | 'updates' | 'subtasks' | 'history'

export default function PersonnelTaskModal({ task, actorId, departmentId, mySupervisorId, onSupervisorSet, personnel, parentTask, onBack, onSubtaskOpen, onClose, onRefresh }: Props) {
  const [tab, setTab]           = useState<TabKey>('details')
  const [subtasks, setSubtasks] = useState<Task[]>([])
  const [comments, setComments] = useState<TaskComment[]>([])
  const [history,  setHistory]  = useState<AuditLog[]>([])
  const [progressLogs, setProgressLogs] = useState<TaskProgressLog[]>([])
  const [progressNote, setProgressNote] = useState('')
  const [progressLoading, setProgressLoading] = useState(false)

  // ── Supervisor selection state
  type SupervisorOption = { id: string; name: string; department?: { name: string } }
  const [showSupervisorModal, setShowSupervisorModal] = useState(false)
  const [supervisorOptions, setSupervisorOptions]     = useState<SupervisorOption[]>([])
  const [supervisorType, setSupervisorType]           = useState<'directors' | 'personnel'>('personnel')
  const [selectedSupervisor, setSelectedSupervisor]   = useState('')
  const [supervisorSaving, setSupervisorSaving]       = useState(false)
  const [supervisorError, setSupervisorError]         = useState('')

  // ── Edit mode
  const [editMode, setEditMode] = useState(false)
  const [editForm, setEditForm] = useState({ title: task.title, description: task.description || '', deadline: task.deadline ? new Date(task.deadline).toISOString().slice(0, 10) : '' })

  // Modals / overlays
  const [showReturn,   setShowReturn]   = useState(false)
  const [showReassign, setShowReassign] = useState(false)
  const [showSubtask,  setShowSubtask]  = useState(false)
  const [showBlock,    setShowBlock]    = useState(false)
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false)

  // Form state
  const [returnReason,   setReturnReason]   = useState('')
  const [reassignTarget, setReassignTarget] = useState('')
  const [reassignReason, setReassignReason] = useState('')
  const [blockReason,    setBlockReason]    = useState('')
  const [subtaskForm,    setSubtaskForm]    = useState({ title: '', description: '', priority: 'MEDIUM', deadline: '', assignTo: '' })
  const [newComment,     setNewComment]     = useState('')
  const [blockingList,   setBlockingList]   = useState<{ id: string; title: string; status: string }[]>([])

  const [loading,      setLoading]      = useState(false)
  const [actionError,  setActionError]  = useState('')

  // ── Derived permissions ───────────────────────────────────────────────────
  // Is this task assigned to my department (not yet accepted by anyone)?
  const isDeptPending = task.assignments?.some(a => a.departmentId === departmentId)
    && !task.assignments?.some(a => a.personnelId)

  // Am I the personally assigned actor?
  const isMyTask = task.assignments?.some(a => a.personnelId === actorId)

  // Am I the person who created this subtask (the approvalById = creator)?
  const isCreator = task.approvalById === actorId && task.approvalByType === 'personnel'

  // Subtask with no assignment yet — personnel can self-assign to take ownership
  const isUnassigned = task.status === 'PENDING' && !task.assignments?.some(a => a.personnelId || a.departmentId)
  const canSelfAssign = isUnassigned && !!actorId

  const canAccept   = (isDeptPending && task.status === 'ASSIGNED') || canSelfAssign
  const canReturn   = (isDeptPending || isMyTask) && ['ASSIGNED', 'IN_PROGRESS'].includes(task.status)
  const canBlock    = isMyTask && task.status === 'IN_PROGRESS'
  const canUnblock  = isMyTask && task.status === 'BLOCKED'
  const canReopen   = isMyTask && task.status === 'REJECTED'
  const canSubmit   = (isMyTask || canSelfAssign) && ['PENDING', 'ASSIGNED', 'IN_PROGRESS'].includes(task.status)
  const canEdit     = isCreator && !['APPROVED', 'CANCELLED'].includes(task.status)
  const canReassign = (isMyTask || isCreator) && ['PENDING', 'ASSIGNED', 'IN_PROGRESS'].includes(task.status)
  const canSubtask  = (isMyTask || isCreator) && ['ASSIGNED', 'IN_PROGRESS'].includes(task.status)

  // ── Data loading ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (tab === 'subtasks') loadSubtasks()
    if (tab === 'updates')  loadProgressLogs()
    if (tab === 'history')  loadHistory()
  }, [tab, task.id])

  useEffect(() => {
    setTab('details')
    setActionError('')
    setSupervisorError('')
    setSelectedSupervisor('')

    // Show supervisor-selection modal only for subtasks in a personnel chain.
    // Top-level tasks assigned by the director go straight back to the director — no chain needed.
    // Subtasks assigned by personnel need the chain built upward.
    const isSubtask = !!task.parentTaskId
    const isInMyApprovalQueue = isSubtask && task.status === 'SUBMITTED' && task.approvalById === actorId && task.approvalByType === 'personnel'
    const isActiveMine = isSubtask && (isMyTask || canSelfAssign) && !['APPROVED', 'CANCELLED'].includes(task.status)
    if ((isActiveMine || isInMyApprovalQueue) && mySupervisorId === null) {
      workspaceApi.getPersonnelAboveMe()
        .then(result => {
          setSupervisorOptions(result.items)
          setSupervisorType(result.type)
          setShowSupervisorModal(true)
        })
        .catch(() => {})
    }

    // Auto-transition to IN_PROGRESS when personnel opens an ASSIGNED task or self-assigns an unassigned subtask
    if (task.status === 'ASSIGNED' && isMyTask) {
      taskApi.accept(task.id).then(() => onRefresh()).catch(() => {})
    } else if (canSelfAssign) {
      taskApi.assign(task.id, { personnelId: actorId })
        .then(() => taskApi.accept(task.id))
        .then(() => onRefresh())
        .catch(() => {})
    }
  }, [task.id])

  const handleSaveSupervisor = async () => {
    if (!selectedSupervisor) return
    setSupervisorSaving(true)
    setSupervisorError('')
    try {
      await workspaceApi.updatePersonnel(actorId, { supervisorId: selectedSupervisor })
      onSupervisorSet?.(selectedSupervisor)
      setShowSupervisorModal(false)
    } catch (e: unknown) {
      setSupervisorError(e instanceof Error ? e.message : 'Failed to save supervisor')
    }
    setSupervisorSaving(false)
  }

  const loadSubtasks = async () => {
    try { setSubtasks(await taskApi.subtasks(task.id) as Task[]) } catch { /* no-op */ }
  }
  const loadComments = async () => {
    try { setComments(await taskApi.comments(task.id) as TaskComment[]) } catch { /* no-op */ }
  }
  const loadHistory = async () => {
    try { setHistory(await taskApi.history(task.id) as AuditLog[]) } catch { /* no-op */ }
  }
  const loadProgressLogs = async () => {
    try { setProgressLogs(await taskApi.progressLogs(task.id) as TaskProgressLog[]) } catch { /* no-op */ }
  }

  const handleAddProgressLog = async () => {
    if (!progressNote.trim()) return
    setProgressLoading(true)
    try {
      await taskApi.addProgressLog(task.id, progressNote)
      setProgressNote('')
      await loadProgressLogs()
    } catch (e: unknown) { setActionError(e instanceof Error ? e.message : 'Failed to save update') }
    setProgressLoading(false)
  }

  const doAction = async (fn: () => Promise<unknown>, afterClose = false) => {
    setLoading(true)
    setActionError('')
    try {
      await fn()
      await onRefresh()
      if (afterClose) onClose()
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Action failed')
    }
    setLoading(false)
  }

  // ── Accept ────────────────────────────────────────────────────────────────
  const handleAccept = () => doAction(async () => {
    if (canSelfAssign) await taskApi.assign(task.id, { personnelId: actorId })
    await taskApi.accept(task.id)
  })

  // ── Return ────────────────────────────────────────────────────────────────
  const handleReturn = () => {
    if (!returnReason.trim()) return
    doAction(() => taskApi.return(task.id, returnReason), true)
    setShowReturn(false)
    setReturnReason('')
  }

  // ── Reassign ──────────────────────────────────────────────────────────────
  const handleReassign = () => {
    const reasonRequired = task.status !== 'PENDING'
    if (!reassignTarget || (reasonRequired && !reassignReason.trim())) return
    doAction(() => taskApi.reassign(task.id, reassignTarget, reassignReason), true)
    setShowReassign(false)
    setReassignTarget('')
    setReassignReason('')
  }

  // ── Block / Unblock ───────────────────────────────────────────────────────
  const handleBlock = () => {
    if (!blockReason.trim()) return
    doAction(() => taskApi.block(task.id, blockReason))
    setShowBlock(false)
    setBlockReason('')
  }

  // ── Submit (with subtask pre-check) ──────────────────────────────────────
  const handleSubmitAttempt = async () => {
    const loaded = subtasks
    const blocking = loaded.filter(s => !['APPROVED', 'SUBMITTED', 'CANCELLED'].includes(s.status))
    if (blocking.length > 0) {
      setBlockingList(blocking.map(s => ({ id: s.id, title: s.title, status: s.status })))
      setShowSubmitConfirm(true)
      return
    }
    doAction(async () => {
      if (canSelfAssign) {
        await taskApi.assign(task.id, { personnelId: actorId })
        await taskApi.accept(task.id)
      } else if (['PENDING', 'ASSIGNED'].includes(task.status)) {
        await taskApi.accept(task.id)
      }
      await taskApi.submit(task.id)
    })
  }

  // ── Create subtask ────────────────────────────────────────────────────────
  const handleCreateSubtask = async () => {
    if (!subtaskForm.title.trim()) return
    if (!subtaskForm.assignTo) { setActionError('Please select a person to assign this subtask to'); return }
    // Client-side deadline guard
    if (subtaskForm.deadline && task.deadline) {
      if (new Date(subtaskForm.deadline) > new Date(task.deadline)) {
        setActionError(`Subtask deadline cannot be after the parent task deadline (${new Date(task.deadline).toLocaleDateString()})`)
        return
      }
    }
    setLoading(true)
    setActionError('')
    try {
      const { assignTo, ...rest } = subtaskForm
      const created = await taskApi.create({
        ...rest,
        projectId: task.projectId,
        parentTaskId: task.id,
        deadline: rest.deadline || undefined,
      }) as Task
      // Immediately assign to selected personnel
      await taskApi.assign(created.id, { personnelId: assignTo })
      setSubtaskForm({ title: '', description: '', priority: 'MEDIUM', deadline: '', assignTo: '' })
      setShowSubtask(false)
      setTab('subtasks')
      await loadSubtasks()
      await onRefresh()
    } catch (e: unknown) { setActionError(e instanceof Error ? e.message : 'Failed to create subtask') }
    setLoading(false)
  }

  // ── Comment ───────────────────────────────────────────────────────────────
  const handleComment = async () => {
    if (!newComment.trim()) return
    try {
      await taskApi.addComment(task.id, newComment)
      setNewComment('')
      await loadComments()
    } catch (e: unknown) { setActionError(e instanceof Error ? e.message : 'Failed to send') }
  }

  // ── Save edit ─────────────────────────────────────────────────────────────
  const handleSaveEdit = async () => {
    if (!editForm.title.trim()) return
    await doAction(async () => {
      await taskApi.update(task.id, {
        title: editForm.title.trim(),
        description: editForm.description.trim() || undefined,
        deadline: editForm.deadline || undefined,
      })
      setEditMode(false)
    })
  }

  const isOverdue = task.deadline && new Date(task.deadline) < new Date() && !['APPROVED', 'CANCELLED'].includes(task.status)
  const otherPersonnel = personnel.filter(p => p.id !== actorId)

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">

        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="px-6 py-5 border-b border-tw-border">
          {onBack && parentTask && (
            <button onClick={onBack}
              className="flex items-center gap-1.5 text-xs text-tw-text-secondary hover:text-tw-primary mb-3 transition-colors group">
              <svg className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to: <span className="font-medium text-tw-text group-hover:text-tw-primary truncate max-w-xs">{parentTask.title}</span>
            </button>
          )}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className={`badge ${statusColors[task.status]}`}>{displayStatus(task.status)}</span>
                <span className={`badge ${priorityColors[task.priority]}`}>{task.priority}</span>
                {task.project && <span className="text-xs text-tw-text-secondary">📋 {task.project.name}</span>}
                {isOverdue && <span className="text-xs text-tw-danger font-semibold">⚠ OVERDUE</span>}
              </div>
              {editMode ? (
                <input className="input text-base font-bold w-full" autoFocus
                  value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} />
              ) : (
                <h2 className="text-lg font-bold text-tw-text leading-snug">{task.title}</h2>
              )}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {canEdit && !editMode && (
                <button onClick={() => { setEditForm({ title: task.title, description: task.description || '', deadline: task.deadline ? new Date(task.deadline).toISOString().slice(0, 10) : '' }); setEditMode(true) }}
                  className="text-xs text-tw-text-secondary hover:text-tw-primary px-2 py-1 rounded hover:bg-tw-hover transition-colors" title="Edit task">
                  ✎ Edit
                </button>
              )}
              <button onClick={onClose} className="text-tw-text-secondary hover:text-tw-text text-2xl leading-none mt-0.5">×</button>
            </div>
          </div>

          {/* Quick meta row */}
          <div className="flex flex-wrap gap-4 mt-3 text-xs text-tw-text-secondary">
            {task.deadline && (
              <span className={isOverdue ? 'text-tw-danger font-semibold' : ''}>
                📅 {new Date(task.deadline).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
              </span>
            )}
            {task.assignments?.map(a => (
              <span key={a.id}>
                👤 {a.personnel?.name || a.department?.name || a.group?.name}
                {a.departmentId && ' (dept)'}
              </span>
            ))}
          </div>

          {/* Error banner */}
          {actionError && (
            <div className="mt-3 text-xs text-tw-danger bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center justify-between">
              {actionError}
              <button onClick={() => setActionError('')} className="ml-2 font-bold text-base leading-none">×</button>
            </div>
          )}

          {/* ── Primary action buttons ─────────────────────────────────── */}
          <div className="flex flex-wrap gap-2 mt-4">
            {canAccept && !canSelfAssign && (
              <button disabled={loading} onClick={handleAccept}
                className="btn-primary text-sm py-2 px-4 flex items-center gap-1.5">
                ✓ Accept Task
              </button>
            )}
            {canSubmit && (
              <button disabled={loading} onClick={handleSubmitAttempt}
                className="text-sm py-2 px-4 rounded-lg bg-tw-success text-white font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-1.5">
                ✓ Complete
              </button>
            )}
            {canSubtask && (
              <button onClick={() => { setShowSubtask(true); setActionError('') }}
                className="btn-secondary text-sm py-2 px-4 flex items-center gap-1.5">
                + Create Subtask
              </button>
            )}
            {canBlock && (
              <button disabled={loading} onClick={() => setShowBlock(true)}
                className="text-sm py-2 px-3 rounded-lg border border-orange-300 text-orange-700 bg-orange-50 hover:bg-orange-100 font-semibold transition-colors">
                ⊘ Mark Blocked
              </button>
            )}
            {canUnblock && (
              <button disabled={loading} onClick={() => doAction(() => taskApi.unblock(task.id))}
                className="btn-secondary text-sm py-2 px-4">
                ↺ Unblock
              </button>
            )}
            {canReopen && (
              <button disabled={loading} onClick={() => doAction(() => taskApi.reopen(task.id))}
                className="btn-secondary text-sm py-2 px-4">
                ↻ Reopen
              </button>
            )}
            {canReturn && (
              <button disabled={loading} onClick={() => setShowReturn(true)}
                className="btn-secondary text-sm py-2 px-4 text-tw-danger border-tw-danger hover:bg-red-50">
                ↩ Return
              </button>
            )}
            {canReassign && (
              <button disabled={loading} onClick={() => setShowReassign(true)}
                className="btn-secondary text-sm py-2 px-4">
                {task.status === 'PENDING' ? '👤 Assign' : '⇄ Reassign'}
              </button>
            )}
          </div>
        </div>

        {/* ── Tabs ─────────────────────────────────────────────────────── */}
        <div className="flex border-b border-tw-border px-6">
          {(['details', 'updates', 'subtasks', 'history'] as TabKey[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`py-2.5 px-3 text-xs font-medium border-b-2 transition-colors capitalize
                ${tab === t ? 'border-tw-primary text-tw-primary' : 'border-transparent text-tw-text-secondary hover:text-tw-text'}`}>
              {t}
              {t === 'subtasks' && task._count?.subtasks ? ` (${task._count.subtasks})` : ''}
              {t === 'updates' && progressLogs.length > 0 ? ` (${progressLogs.length})` : ''}
            </button>
          ))}
        </div>

        {/* ── Tab content ──────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* DETAILS */}
          {tab === 'details' && (
            <div className="space-y-5">
              {editMode ? (
                <div className="space-y-3 bg-tw-hover rounded-xl p-4">
                  <div>
                    <label className="block text-xs font-semibold text-tw-text-secondary mb-1">Description</label>
                    <textarea className="input resize-none w-full" rows={4}
                      placeholder="Task description…"
                      value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-tw-text-secondary mb-1">Deadline</label>
                    <DatePicker value={editForm.deadline} onChange={val => setEditForm(f => ({ ...f, deadline: val }))} />
                  </div>
                  <div className="flex gap-2 justify-end pt-1">
                    <button onClick={() => setEditMode(false)} className="btn-secondary text-sm">Cancel</button>
                    <button disabled={!editForm.title.trim() || loading} onClick={handleSaveEdit} className="btn-primary text-sm disabled:opacity-50">
                      {loading ? 'Saving…' : '✓ Save Changes'}
                    </button>
                  </div>
                </div>
              ) : task.description ? (
                <div>
                  <div className="text-xs font-semibold text-tw-text-secondary uppercase tracking-wide mb-2">Description</div>
                  <p className="text-sm text-tw-text leading-relaxed whitespace-pre-wrap">{task.description}</p>
                </div>
              ) : (
                <p className="text-sm text-tw-text-secondary italic">No description provided.</p>
              )}

              {/* Assigned to */}
              {task.assignments?.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-tw-text-secondary uppercase tracking-wide mb-2">Assigned To</div>
                  <div className="space-y-1.5">
                    {task.assignments.map(a => (
                      <div key={a.id} className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-tw-primary flex items-center justify-center text-white text-xs font-bold">
                          {(a.personnel?.name || a.group?.name || a.department?.name || '?').charAt(0)}
                        </div>
                        <span className="text-sm text-tw-text font-medium">{a.personnel?.name || a.group?.name || a.department?.name}</span>
                        <span className="text-xs text-tw-text-secondary">{a.personnel ? 'Person' : a.group ? 'Group' : 'Department'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Ownership */}
              {task.actedById && (
                <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3">
                  <div className="text-xs font-semibold text-tw-primary mb-0.5">Accepted by</div>
                  <p className="text-sm text-tw-text">
                    {task.actedByName || (task.actedByType === 'director' ? 'Director' : 'Personnel')}
                  </p>
                </div>
              )}

              {/* Deadline */}
              {task.deadline && (
                <div>
                  <div className="text-xs font-semibold text-tw-text-secondary uppercase tracking-wide mb-1">Deadline</div>
                  <span className={`text-sm font-medium ${isOverdue ? 'text-tw-danger' : 'text-tw-text'}`}>
                    {new Date(task.deadline).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    {isOverdue && ' — OVERDUE'}
                  </span>
                </div>
              )}

              {/* Return/block reason */}
              {(task.returnReason || task.cancelReason) && (
                <div className={`rounded-lg p-3 ${task.status === 'BLOCKED' ? 'bg-orange-50 border border-orange-200' : 'bg-red-50 border border-red-200'}`}>
                  <div className={`text-xs font-semibold mb-1 ${task.status === 'BLOCKED' ? 'text-orange-700' : 'text-tw-danger'}`}>
                    {task.status === 'BLOCKED' ? 'Blocked reason' : task.status === 'RETURNED' ? 'Returned reason' : 'Rejection reason'}
                  </div>
                  <p className="text-sm text-tw-text">{task.returnReason || task.cancelReason}</p>
                </div>
              )}

              {/* Subtask progress summary */}
              {(task._count?.subtasks ?? 0) > 0 && (
                <div className="bg-tw-hover rounded-lg px-4 py-3">
                  <div className="text-xs font-semibold text-tw-text-secondary uppercase tracking-wide mb-1">Subtasks</div>
                  <button onClick={() => setTab('subtasks')} className="text-sm text-tw-primary hover:underline">
                    View {task._count!.subtasks} subtask{task._count!.subtasks !== 1 ? 's' : ''} →
                  </button>
                </div>
              )}

              {/* Dept-pending notice */}
              {canAccept && !canSelfAssign && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3">
                  <p className="text-sm text-yellow-800 font-medium">
                    This task is assigned to your department. Accept it to take personal ownership and start working.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* UPDATES */}
          {tab === 'updates' && (
            <div className="space-y-4">
              {/* Add update row */}
              {isMyTask && !['APPROVED', 'CANCELLED'].includes(task.status) && (
                <div className="flex gap-2 items-start">
                  <textarea
                    className="input flex-1 resize-none text-sm"
                    rows={2}
                    placeholder="What did you work on today?"
                    value={progressNote}
                    onChange={e => setProgressNote(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) handleAddProgressLog() }}
                  />
                  <button
                    onClick={handleAddProgressLog}
                    disabled={!progressNote.trim() || progressLoading}
                    className="btn-primary text-sm px-4 py-2 disabled:opacity-50 flex-shrink-0">
                    {progressLoading ? '…' : 'Submit'}
                  </button>
                </div>
              )}

              {/* Progress log table */}
              {progressLogs.length === 0 ? (
                <div className="text-center py-10 text-tw-text-secondary text-sm">
                  No updates logged yet.
                </div>
              ) : (
                <div className="border border-tw-border rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-tw-hover border-b border-tw-border">
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-tw-text-secondary uppercase tracking-wide w-24">Date</th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-tw-text-secondary uppercase tracking-wide w-20">Time</th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-tw-text-secondary uppercase tracking-wide">Update</th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-tw-text-secondary uppercase tracking-wide w-28">By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-tw-border">
                      {progressLogs.map(log => {
                        const d = new Date(log.logDate)
                        return (
                          <tr key={log.id} className="hover:bg-tw-hover transition-colors">
                            <td className="px-4 py-3 text-xs text-tw-text-secondary whitespace-nowrap">
                              {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </td>
                            <td className="px-4 py-3 text-xs text-tw-text-secondary whitespace-nowrap">
                              {d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td className="px-4 py-3 text-sm text-tw-text leading-relaxed whitespace-pre-wrap">{log.note}</td>
                            <td className="px-4 py-3 text-xs text-tw-text-secondary whitespace-nowrap">{log.authorName}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Complete button at bottom of progress tab */}
              {canSubmit && (
                <div className="pt-2 border-t border-tw-border">
                  <button
                    disabled={loading}
                    onClick={handleSubmitAttempt}
                    className="w-full py-2.5 rounded-lg bg-tw-success text-white font-semibold text-sm hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2">
                    ✓ Mark as Complete
                  </button>
                </div>
              )}
            </div>
          )}

          {/* SUBTASKS */}
          {tab === 'subtasks' && (
            <div>
              {canSubtask && (
                <button onClick={() => { setShowSubtask(true); setActionError('') }}
                  className="mb-4 btn-secondary text-sm py-2 px-4">
                  + Create Subtask
                </button>
              )}
              {subtasks.length === 0 ? (
                <div className="text-center py-10 text-tw-text-secondary text-sm">
                  {canSubtask ? 'No subtasks yet. Create one above.' : 'No subtasks.'}
                </div>
              ) : (
                <div className="space-y-2">
                  {subtasks.map(s => {
                    const assigneeName = s.assignments?.[0]?.personnel?.name || s.assignments?.[0]?.department?.name || '—'
                    const clickable = !!onSubtaskOpen
                    return (
                      <div key={s.id}
                        className={`card p-3 ${clickable ? 'cursor-pointer hover:border-tw-primary hover:shadow-sm transition-all' : ''}`}
                        onClick={clickable ? () => onSubtaskOpen!(s) : undefined}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-tw-text">{s.title}</div>
                            {s.description && <div className="text-xs text-tw-text-secondary mt-0.5 truncate">{s.description}</div>}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className={`badge ${statusColors[s.status]} text-xs`}>{displayStatus(s.status)}</span>
                            {clickable && <svg className="w-3.5 h-3.5 text-tw-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 mt-2 flex-wrap">
                          <span className={`badge ${priorityColors[s.priority]} text-xs`}>{s.priority}</span>
                          <span className="text-xs text-tw-text-secondary">→ {assigneeName}</span>
                          {s.deadline && (
                            <span className="text-xs text-tw-text-secondary">
                              📅 {new Date(s.deadline).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* HISTORY */}
          {tab === 'history' && (
            <div className="space-y-0">
              {history.length === 0 && (
                <div className="text-center py-10 text-tw-text-secondary text-sm">No history yet.</div>
              )}
              {history.map(log => (
                <div key={log.id} className="flex items-start gap-3 py-3 border-b border-tw-border last:border-0">
                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                    log.event.includes('APPROVED') ? 'bg-tw-success' :
                    log.event.includes('REJECTED') || log.event.includes('CANCELLED') ? 'bg-tw-danger' :
                    log.event.includes('BLOCKED') ? 'bg-orange-500' : 'bg-tw-primary'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-tw-text">
                        {eventLabels[log.event] || log.event.replace(/_/g, ' ')}
                      </span>
                      <span className="text-xs text-tw-primary font-medium">
                        {log.actorName || log.actorType}
                      </span>
                    </div>
                    {log.payload?.reason && (
                      <div className="text-xs text-tw-text-secondary mt-0.5 italic">"{log.payload.reason}"</div>
                    )}
                    <div className="text-xs text-tw-text-secondary mt-0.5">{new Date(log.createdAt).toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Return modal ────────────────────────────────────────────────── */}
      {showReturn && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-60 p-4">
          <div className="bg-white rounded-xl shadow-panel w-full max-w-sm">
            <div className="px-5 py-4 border-b border-tw-border">
              <h3 className="font-semibold text-tw-text">Return Task</h3>
              <p className="text-xs text-tw-text-secondary mt-0.5">This task will be returned to the assigning authority with your reason.</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <textarea className="input resize-none" rows={3}
                placeholder="Reason for returning (e.g. outside my scope, missing information…)"
                value={returnReason} onChange={e => setReturnReason(e.target.value)} autoFocus />
              <div className="flex gap-2 justify-end">
                <button onClick={() => { setShowReturn(false); setReturnReason('') }} className="btn-secondary">Cancel</button>
                <button disabled={!returnReason.trim() || loading} onClick={handleReturn}
                  className="px-4 py-2 rounded-lg bg-tw-danger text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity">
                  Return Task
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Reassign modal ──────────────────────────────────────────────── */}
      {showReassign && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-60 p-4">
          <div className="bg-white rounded-xl shadow-panel w-full max-w-sm">
            <div className="px-5 py-4 border-b border-tw-border">
              <h3 className="font-semibold text-tw-text">{task.status === 'PENDING' ? 'Assign Task' : 'Reassign Task'}</h3>
              <p className="text-xs text-tw-text-secondary mt-0.5">{task.status === 'PENDING' ? 'Choose a person to assign this task to.' : 'Transfer ownership to another team member. A reason is required.'}</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <Select value={reassignTarget} onChange={setReassignTarget}
                placeholder="Select person…"
                options={otherPersonnel.map(p => ({ value: p.id, label: p.name }))} />
              <textarea className="input resize-none" rows={2}
                placeholder={task.status === 'PENDING' ? 'Note (optional)…' : 'Reason for reassigning…'}
                value={reassignReason} onChange={e => setReassignReason(e.target.value)} />
              <div className="flex gap-2 justify-end">
                <button onClick={() => { setShowReassign(false); setReassignTarget(''); setReassignReason('') }} className="btn-secondary">Cancel</button>
                <button disabled={!reassignTarget || (task.status !== 'PENDING' && !reassignReason.trim()) || loading} onClick={handleReassign}
                  className="btn-primary disabled:opacity-50">
                  Reassign
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Block modal ─────────────────────────────────────────────────── */}
      {showBlock && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-60 p-4">
          <div className="bg-white rounded-xl shadow-panel w-full max-w-sm">
            <div className="px-5 py-4 border-b border-tw-border">
              <h3 className="font-semibold text-tw-text">Mark as Blocked</h3>
              <p className="text-xs text-tw-text-secondary mt-0.5">Describe what is preventing progress on this task.</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <textarea className="input resize-none" rows={3}
                placeholder="What is blocking this task?"
                value={blockReason} onChange={e => setBlockReason(e.target.value)} autoFocus />
              <div className="flex gap-2 justify-end">
                <button onClick={() => { setShowBlock(false); setBlockReason('') }} className="btn-secondary">Cancel</button>
                <button disabled={!blockReason.trim() || loading} onClick={handleBlock}
                  className="px-4 py-2 rounded-lg border border-orange-300 text-orange-700 bg-orange-50 hover:bg-orange-100 font-semibold text-sm disabled:opacity-50">
                  Confirm Block
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Submit / Mark Complete confirm ──────────────────────────────── */}
      {showSubmitConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-60 p-4">
          <div className="bg-white rounded-xl shadow-panel w-full max-w-sm">
            <div className="px-5 py-4 border-b border-tw-border">
              <h3 className="font-semibold text-tw-text">⚠ Incomplete Subtasks</h3>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-sm text-tw-text">The following subtasks are not yet approved:</p>
              <ul className="space-y-1">
                {blockingList.map(s => (
                  <li key={s.id} className="text-xs text-tw-text-secondary flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-tw-warning flex-shrink-0" />
                    {s.title} — <span className="text-tw-warning font-medium">{displayStatus(s.status)}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-tw-text-secondary">All subtasks must be completed (submitted or approved) before marking this task complete.</p>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowSubmitConfirm(false)} className="btn-secondary">Go Back</button>
                <button disabled={loading} onClick={() => { setShowSubmitConfirm(false); doAction(() => taskApi.submit(task.id)) }}
                  className="btn-primary disabled:opacity-50">
                  Submit Anyway
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Supervisor selection modal ───────────────────────────────────── */}
      {showSupervisorModal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
            <div className="px-5 py-4 border-b border-tw-border">
              <h3 className="font-bold text-tw-text text-base">Select Your Supervisor</h3>
              <p className="text-xs text-tw-text-secondary mt-1">
                To route this task for approval, you must select your supervising officer.
                {supervisorType === 'directors'
                  ? ' Choose the director who oversees your work.'
                  : ' Choose the person one level above you in the hierarchy.'}
              </p>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-tw-text-secondary mb-2">
                  {supervisorType === 'directors' ? 'Director' : 'Supervising Officer'}
                </label>
                {supervisorOptions.length === 0 ? (
                  <p className="text-sm text-tw-text-secondary italic">No personnel found in the level above you. Contact your director to set up the hierarchy.</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {supervisorOptions.map(opt => (
                      <label key={opt.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors
                          ${selectedSupervisor === opt.id
                            ? 'border-tw-primary bg-blue-50'
                            : 'border-tw-border hover:border-tw-primary/50 hover:bg-tw-hover'}`}>
                        <input type="radio" name="supervisor" value={opt.id}
                          checked={selectedSupervisor === opt.id}
                          onChange={() => setSelectedSupervisor(opt.id)}
                          className="accent-tw-primary" />
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-tw-text">{opt.name}</div>
                          {opt.department && (
                            <div className="text-xs text-tw-text-secondary">{opt.department.name}</div>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              {supervisorError && (
                <div className="text-xs text-tw-danger bg-red-50 border border-red-200 rounded px-3 py-2">{supervisorError}</div>
              )}
              <div className="flex gap-2 justify-end pt-1">
                <button onClick={() => setShowSupervisorModal(false)} className="btn-secondary text-sm">
                  Skip for now
                </button>
                <button
                  disabled={!selectedSupervisor || supervisorSaving || supervisorOptions.length === 0}
                  onClick={handleSaveSupervisor}
                  className="btn-primary text-sm disabled:opacity-50">
                  {supervisorSaving ? 'Saving…' : 'Confirm Supervisor'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Create subtask modal ─────────────────────────────────────────── */}
      {showSubtask && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-60 p-4">
          <div className="bg-white rounded-xl shadow-panel w-full max-w-md">
            <div className="px-5 py-4 border-b border-tw-border">
              <h3 className="font-semibold text-tw-text">Create Subtask</h3>
              <p className="text-xs text-tw-text-secondary mt-0.5">Under: {task.title}</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <input className="input" placeholder="Subtask title *" autoFocus
                value={subtaskForm.title} onChange={e => setSubtaskForm(f => ({ ...f, title: e.target.value }))} />
              <textarea className="input resize-none" rows={2} placeholder="Description (optional)…"
                value={subtaskForm.description} onChange={e => setSubtaskForm(f => ({ ...f, description: e.target.value }))} />
              <div>
                <label className="block text-xs font-semibold text-tw-text-secondary mb-1">Assign to *</label>
                <Select
                  value={subtaskForm.assignTo}
                  onChange={val => setSubtaskForm(f => ({ ...f, assignTo: val }))}
                  placeholder="Select a person…"
                  options={personnel.map(p => ({ value: p.id, label: p.name }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-tw-text-secondary mb-1">Priority</label>
                  <Select value={subtaskForm.priority} onChange={val => setSubtaskForm(f => ({ ...f, priority: val }))}
                    options={[
                      { value: 'LOW', label: 'Low' }, { value: 'MEDIUM', label: 'Medium' },
                      { value: 'HIGH', label: 'High' }, { value: 'CRITICAL', label: 'Critical' },
                    ]} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-tw-text-secondary mb-1">
                    Deadline
                    {task.deadline && (
                      <span className="ml-1 font-normal text-tw-text-secondary">
                        (max {new Date(task.deadline).toLocaleDateString()})
                      </span>
                    )}
                  </label>
                  <DatePicker value={subtaskForm.deadline} onChange={val => setSubtaskForm(f => ({ ...f, deadline: val }))} />
                </div>
              </div>
              {actionError && (
                <div className="text-xs text-tw-danger bg-red-50 border border-red-200 rounded px-3 py-2">{actionError}</div>
              )}
              <div className="flex gap-2 justify-end pt-1">
                <button onClick={() => { setShowSubtask(false); setActionError('') }} className="btn-secondary">Cancel</button>
                <button onClick={handleCreateSubtask} disabled={loading || !subtaskForm.title.trim() || !subtaskForm.assignTo} className="btn-primary disabled:opacity-50">
                  {loading ? 'Creating…' : 'Create & Assign'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
