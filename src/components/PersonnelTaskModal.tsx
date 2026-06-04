import React, { useState, useEffect } from 'react'
import type { Task, TaskComment, AuditLog, Personnel, TaskProgressLog, DeadlineExtension } from '../types'
import { taskApi, workspaceApi } from '../services/apiService'
import DatePicker from './DatePicker'
import Select from './Select'
import ProgressUpdateSheet from './ProgressUpdateSheet'

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
  SUBMITTED: 'badge-purple', APPROVED: 'badge-success',
  RETURNED:  'badge-danger',  REJECTED: 'badge-danger', CANCELLED: 'badge-gray',
}
const displayStatus = (s: string) => s.replace('_', ' ')
const eventLabels: Record<string, string> = {
  TASK_CREATED:      'Task created',    TASK_ASSIGNED:   'Task assigned',
  TASK_ACCEPTED:     'Task accepted',   TASK_REASSIGNED: 'Task reassigned',
  TASK_UPDATED:      'Task updated',    TASK_STARTED:    'Work started',
  TASK_SUBMITTED:    'Submitted for approval',
  TASK_APPROVED:     'Task approved',   TASK_REJECTED:   'Task rejected',
  TASK_RETURNED:     'Task returned',   TASK_CANCELLED:  'Task cancelled',
  SUBTASK_CREATED:   'Subtask created', COMMENT_ADDED:   'Comment added',
  DEADLINE_EXTENDED: 'Deadline extended',
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
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false)

  // Form state
  const [returnReason,   setReturnReason]   = useState('')
  const [reassignTarget, setReassignTarget] = useState('')
  const [reassignReason, setReassignReason] = useState('')
  const [subtaskForm,    setSubtaskForm]    = useState({ title: '', description: '', priority: 'MEDIUM', deadline: '', assignTo: '' })
  const [newComment,     setNewComment]     = useState('')
  const [blockingList,   setBlockingList]   = useState<{ id: string; title: string; status: string }[]>([])

  const [loading,      setLoading]      = useState(false)
  const [actionError,  setActionError]  = useState('')

  // Extend deadline state
  const [showExtendModal,   setShowExtendModal]   = useState(false)
  const [extendForm,        setExtendForm]        = useState({ newDeadline: '', reason: '', note: '' })
  const [extendSaving,      setExtendSaving]      = useState(false)
  const [extendError,       setExtendError]       = useState('')
  const [deadlineExtensions, setDeadlineExtensions] = useState<DeadlineExtension[]>([])

  const returnBannerKey = `tw_return_banner_${task.id}`
  const isReturnedByDirector = task.status === 'RETURNED' && task.actedByType === 'director'
  const [showReturnBanner, setShowReturnBanner] = useState(() =>
    isReturnedByDirector && !localStorage.getItem(returnBannerKey)
  )
  const dismissReturnBanner = () => {
    localStorage.setItem(returnBannerKey, '1')
    setShowReturnBanner(false)
  }

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
  const canReopen   = isMyTask && task.status === 'REJECTED'
  const canSubmit   = (isMyTask || canSelfAssign) && ['PENDING', 'ASSIGNED', 'IN_PROGRESS'].includes(task.status)
  const canEdit     = isCreator && !['APPROVED', 'CANCELLED'].includes(task.status)
  const canReassign = (isMyTask || isCreator) && ['PENDING', 'ASSIGNED', 'IN_PROGRESS'].includes(task.status)
  const canSubtask  = (isMyTask || isCreator) && ['ASSIGNED', 'IN_PROGRESS'].includes(task.status)

  // ── Data loading ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (tab === 'subtasks') loadSubtasks()
    if (tab === 'updates')  loadProgressLogs()
    if (tab === 'history')  { loadHistory(); loadDeadlineExtensions() }
  }, [tab, task.id])

  useEffect(() => {
    setTab('details')
    setActionError('')
    setSupervisorError('')
    setSelectedSupervisor('')

    // Show supervisor-selection modal only for subtasks in a personnel chain.
    // Top-level tasks assigned by the director go straight back to the director — no chain needed.
    // Subtasks assigned by personnel need the chain built upward.
    // Only prompt for supervisor when the person opens a subtask they need to work on
    // (not when viewing already-submitted/approved work, and not for tasks assigned directly by the director)
    const isSubtask = !!task.parentTaskId
    const isActiveMine = isSubtask && (isMyTask || canSelfAssign) && ['IN_PROGRESS', 'ASSIGNED', 'PENDING', 'BLOCKED', 'RETURNED', 'REJECTED'].includes(task.status)
    if (isActiveMine && mySupervisorId === null) {
      workspaceApi.getPersonnelAboveMe()
        .then(result => {
          setSupervisorOptions(result.items)
          setSupervisorType(result.type)
          setShowSupervisorModal(true)
        })
        .catch(() => {})
    }

    // Auto-transition to IN_PROGRESS when personnel opens an ASSIGNED task or self-assigns an unassigned subtask
    if (task.status === 'ASSIGNED' && (isMyTask || isDeptPending)) {
      taskApi.accept(task.id).then(() => onRefresh()).catch(() => onRefresh())
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
  const loadDeadlineExtensions = async () => {
    try { setDeadlineExtensions(await taskApi.deadlineExtensions(task.id) as DeadlineExtension[]) } catch { /* no-op */ }
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

  const isOverdue       = !!task.deadline && new Date(task.deadline) < new Date() && !['APPROVED', 'CANCELLED'].includes(task.status)
  const isTaskCreator   = task.createdByPersonnelId === actorId
  const canExtend       = isTaskCreator && isOverdue

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

  const otherPersonnel = personnel.filter(p => p.id !== actorId)

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">

        {/* ── Return-from-chairman banner ───────────────────────────────── */}
        {showReturnBanner && (
          <div className="bg-red-600 text-white px-5 py-3.5 flex items-start gap-3 flex-shrink-0">
            <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold leading-snug">This task has been returned to you by the Chairman's office.</p>
              <p className="text-xs mt-1 text-red-100 leading-relaxed">
                If you are unsure why it was returned, review the Progress Updates tab for context or contact the Chairman's office directly.
              </p>
              {task.returnReason && (
                <p className="text-xs mt-1.5 bg-red-700/50 rounded-lg px-3 py-2 leading-relaxed">
                  <span className="font-semibold">Reason: </span>{task.returnReason}
                </p>
              )}
            </div>
            <button
              onClick={dismissReturnBanner}
              className="flex-shrink-0 w-7 h-7 rounded-lg bg-red-500 hover:bg-red-400 flex items-center justify-center transition-colors mt-0.5"
              title="Dismiss"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

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
              <button onClick={onClose} className="w-8 h-8 rounded-lg bg-red-100 hover:bg-red-200 text-red-600 flex items-center justify-center transition-colors flex-shrink-0" title="Close">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
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
                👤 {a.personnel?.name || a.department?.name}
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
            {canReopen && (
              <button disabled={loading} onClick={() => doAction(() => taskApi.reopen(task.id))}
                className="btn-secondary text-sm py-2 px-4">
                ↻ Reopen
              </button>
            )}
            {canExtend && (
              <button onClick={() => { setExtendForm({ newDeadline: '', reason: '', note: '' }); setExtendError(''); setShowExtendModal(true) }}
                className="btn-secondary text-sm py-2 px-4 text-amber-700 border-amber-300 hover:bg-amber-50">
                📅 Extend Deadline
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
                          {(a.personnel?.name || a.department?.name || '?').charAt(0)}
                        </div>
                        <span className="text-sm text-tw-text font-medium">{a.personnel?.name || a.department?.name}</span>
                        <span className="text-xs text-tw-text-secondary">{a.personnel ? 'Person' : 'Department'}</span>
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

              {/* Return reason */}
              {(task.returnReason || task.cancelReason) && (
                <div className="rounded-lg p-3 bg-red-50 border border-red-200">
                  <div className="text-xs font-semibold mb-1 text-tw-danger">
                    {task.status === 'RETURNED' ? 'Returned reason' : 'Rejection reason'}
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
                <ProgressUpdateSheet
                  value={progressNote}
                  onChange={setProgressNote}
                  onSubmit={handleAddProgressLog}
                  loading={progressLoading}
                  placeholder="What did you work on today?"
                  label="Progress Update"
                />
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
          {tab === 'history' && (() => {
            type TimelineEntry =
              | { kind: 'audit'; entry: AuditLog }
              | { kind: 'extension'; entry: DeadlineExtension }
            const combined: TimelineEntry[] = [
              ...history.map(e => ({ kind: 'audit' as const, entry: e })),
              ...deadlineExtensions.map(e => ({ kind: 'extension' as const, entry: e })),
            ].sort((a, b) => new Date(a.entry.createdAt).getTime() - new Date(b.entry.createdAt).getTime())

            return (
              <div className="space-y-0">
                {combined.length === 0 && (
                  <div className="text-center py-10 text-tw-text-secondary text-sm">No history yet.</div>
                )}
                {combined.map(item => {
                  if (item.kind === 'extension') {
                    const ext = item.entry as DeadlineExtension
                    return (
                      <div key={`ext-${ext.id}`} className="flex items-start gap-3 py-3 border-b border-tw-border last:border-0">
                        <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0 bg-amber-500" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-semibold text-tw-text">Deadline extended</span>
                            <span className="text-xs text-amber-700 font-medium">{ext.extendedByName}</span>
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
                      <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                        log.event.includes('APPROVED') ? 'bg-tw-success' :
                        log.event.includes('REJECTED') || log.event.includes('CANCELLED') ? 'bg-tw-danger' :
                        'bg-tw-primary'
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
                  )
                })}
              </div>
            )
          })()}
        </div>
      </div>

      {/* ── Extend Deadline modal ───────────────────────────────────────── */}
      {showExtendModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-60 p-4">
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
