import React, { useState, useEffect } from 'react'
import type { Task, TaskComment, AuditLog, Layer, Personnel, Group } from '../types'
import { taskApi } from '../services/apiService'
import DatePicker from './DatePicker'

interface Props {
  task: Task
  isDirector: boolean
  actorId: string
  layers: Layer[]
  personnel: Personnel[]
  groups: Group[]
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

export default function TaskDetailPanel({ task, isDirector, actorId, layers, personnel, groups, onClose, onRefresh }: Props) {
  const [tab, setTab] = useState<'details' | 'subtasks' | 'comments' | 'history'>('details')
  const [comments, setComments] = useState<TaskComment[]>([])
  const [history, setHistory] = useState<AuditLog[]>([])
  const [subtasks, setSubtasks] = useState<Task[]>([])
  const [newComment, setNewComment] = useState('')
  const [reason, setReason] = useState('')
  const [showReasonModal, setShowReasonModal] = useState<'return' | 'reject' | 'cancel' | null>(null)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [showSubtaskModal, setShowSubtaskModal] = useState(false)
  const [assignTarget, setAssignTarget] = useState<{ type: string; id: string }>({ type: '', id: '' })
  const [subtaskForm, setSubtaskForm] = useState({ title: '', description: '', priority: 'MEDIUM', deadline: '' })
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)

  const allDepts = layers.flatMap(l => l.departments || [])

  useEffect(() => {
    if (tab === 'comments') loadComments()
    if (tab === 'history') loadHistory()
    if (tab === 'subtasks') loadSubtasks()
  }, [tab, task.id])

  const loadComments = async () => { setComments(await taskApi.comments(task.id) as TaskComment[]) }
  const loadHistory  = async () => { setHistory(await taskApi.history(task.id) as AuditLog[]) }
  const loadSubtasks = async () => { setSubtasks(await taskApi.subtasks(task.id) as Task[]) }

  const doAction = async (action: () => Promise<unknown>) => {
    setActionLoading(true)
    try { await action(); await onRefresh() }
    catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error') }
    setActionLoading(false)
  }

  const submitComment = async () => {
    if (!newComment.trim()) return
    await taskApi.addComment(task.id, newComment)
    setNewComment('')
    await loadComments()
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
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error') }
    setLoading(false)
  }

  const canStart   = task.status === 'ASSIGNED'
  const canSubmit  = task.status === 'IN_PROGRESS'
  const canReturn  = task.status === 'IN_PROGRESS'
  const canApprove = task.status === 'SUBMITTED' && task.approvalById === actorId
  const canReject  = task.status === 'SUBMITTED' && task.approvalById === actorId
  const canReopen  = task.status === 'REJECTED'
  const canCancel  = isDirector && !['APPROVED', 'CANCELLED'].includes(task.status)
  const canAssign  = isDirector && ['PENDING', 'RETURNED'].includes(task.status)
  const canSubtask = ['IN_PROGRESS', 'ASSIGNED'].includes(task.status)

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black bg-opacity-30" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-white shadow-panel flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-tw-border">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className={`badge ${statusColors[task.status]}`}>{task.status.replace('_', ' ')}</span>
                <span className={`badge ${priorityColors[task.priority]}`}>{task.priority}</span>
                {task.project && <span className="text-xs text-tw-text-secondary">📋 {task.project.name}</span>}
              </div>
              <h2 className="font-bold text-tw-text text-base leading-snug">{task.title}</h2>
            </div>
            <button onClick={onClose} className="text-tw-text-secondary hover:text-tw-text text-2xl leading-none mt-0.5">×</button>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 mt-3">
            {canStart   && <button disabled={actionLoading} onClick={() => doAction(() => taskApi.start(task.id))} className="btn-primary text-xs py-1.5">▶ Start</button>}
            {canSubmit  && <button disabled={actionLoading} onClick={() => doAction(() => taskApi.submit(task.id))} className="btn-primary text-xs py-1.5">✓ Submit for Approval</button>}
            {canReturn  && <button disabled={actionLoading} onClick={() => setShowReasonModal('return')} className="btn-secondary text-xs py-1.5">↩ Return</button>}
            {canApprove && <button disabled={actionLoading} onClick={() => doAction(() => taskApi.approve(task.id))} className="bg-tw-success hover:opacity-90 text-white font-semibold px-3 py-1.5 rounded-lg text-xs transition-opacity">✓ Approve</button>}
            {canReject  && <button disabled={actionLoading} onClick={() => setShowReasonModal('reject')} className="btn-danger text-xs py-1.5">✕ Reject</button>}
            {canReopen  && <button disabled={actionLoading} onClick={() => doAction(() => taskApi.reopen(task.id))} className="btn-secondary text-xs py-1.5">↻ Reopen</button>}
            {canAssign  && <button disabled={actionLoading} onClick={() => setShowAssignModal(true)} className="btn-secondary text-xs py-1.5">👤 Assign</button>}
            {canSubtask && <button onClick={() => setShowSubtaskModal(true)} className="btn-secondary text-xs py-1.5">+ Subtask</button>}
            {canCancel  && <button disabled={actionLoading} onClick={() => setShowReasonModal('cancel')} className="text-xs text-tw-danger hover:underline py-1.5">Cancel task</button>}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-tw-border px-5">
          {(['details', 'subtasks', 'comments', 'history'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`py-2.5 px-3 text-xs font-medium border-b-2 transition-colors capitalize ${tab === t ? 'border-tw-primary text-tw-primary' : 'border-transparent text-tw-text-secondary hover:text-tw-text'}`}>
              {t}
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
                  <div className="text-xs font-semibold text-tw-text-secondary uppercase tracking-wide mb-1">Description</div>
                  <p className="text-sm text-tw-text leading-relaxed">{task.description}</p>
                </div>
              )}
              {task.assignments?.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-tw-text-secondary uppercase tracking-wide mb-2">Assigned To</div>
                  {task.assignments.map(a => (
                    <div key={a.id} className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-tw-primary flex items-center justify-center text-white text-xs font-bold">
                        {(a.personnel?.name || a.group?.name || a.department?.name || '?').charAt(0)}
                      </div>
                      <span className="text-sm text-tw-text">{a.personnel?.name || a.group?.name || a.department?.name}</span>
                      <span className="text-xs text-tw-text-secondary">{a.personnel ? 'Person' : a.group ? 'Group' : 'Department'}</span>
                    </div>
                  ))}
                </div>
              )}
              {task.deadline && (
                <div>
                  <div className="text-xs font-semibold text-tw-text-secondary uppercase tracking-wide mb-1">Deadline</div>
                  <span className={`text-sm font-medium ${new Date(task.deadline) < new Date() ? 'text-tw-danger' : 'text-tw-text'}`}>
                    {new Date(task.deadline).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                  </span>
                </div>
              )}
              {task.returnReason && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <div className="text-xs font-semibold text-tw-danger mb-1">Return / Rejection Reason</div>
                  <p className="text-sm text-tw-text">{task.returnReason}</p>
                </div>
              )}
              {task.parentTaskId && (
                <div>
                  <div className="text-xs font-semibold text-tw-text-secondary uppercase tracking-wide mb-1">Parent Task</div>
                  <span className="badge badge-gray">Subtask</span>
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
                    <div key={s.id} className="card p-3 flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-tw-text">{s.title}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`badge ${statusColors[s.status]} text-xs`}>{s.status.replace('_', ' ')}</span>
                          {s.deadline && <span className="text-xs text-tw-text-secondary">{new Date(s.deadline).toLocaleDateString()}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* COMMENTS */}
          {tab === 'comments' && (
            <div className="flex flex-col h-full">
              <div className="flex-1 space-y-3 mb-4">
                {comments.length === 0 && <div className="text-center py-8 text-tw-text-secondary text-sm">No comments yet.</div>}
                {comments.map(c => (
                  <div key={c.id} className="flex gap-2">
                    <div className="w-7 h-7 rounded-full bg-tw-primary flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5">
                      {(c.authorType === 'director' ? 'D' : 'P')}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-semibold text-tw-text">{c.authorType === 'director' ? 'Director' : 'Personnel'}</span>
                        <span className="text-xs text-tw-text-secondary">{new Date(c.createdAt).toLocaleString()}</span>
                      </div>
                      <div className="bg-tw-hover rounded-lg px-3 py-2 text-sm text-tw-text">{c.content}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-auto">
                <input className="input flex-1 text-sm" placeholder="Write a comment..." value={newComment} onChange={e => setNewComment(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submitComment()} />
                <button onClick={submitComment} disabled={!newComment.trim()} className="btn-primary text-sm px-3">Send</button>
              </div>
            </div>
          )}

          {/* HISTORY */}
          {tab === 'history' && (
            <div className="space-y-2">
              {history.length === 0 && <div className="text-center py-8 text-tw-text-secondary text-sm">No history yet.</div>}
              {history.map(log => (
                <div key={log.id} className="flex items-start gap-3 py-2 border-b border-tw-border last:border-0">
                  <div className="w-2 h-2 rounded-full bg-tw-primary mt-1.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-tw-text">{log.event.replace(/_/g, ' ')}</span>
                      <span className="text-xs text-tw-text-secondary capitalize">{log.actorType}</span>
                    </div>
                    <div className="text-xs text-tw-text-secondary mt-0.5">{new Date(log.createdAt).toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
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
                placeholder={`Reason for ${showReasonModal}...`}
                value={reason} onChange={e => setReason(e.target.value)} />
              <div className="flex gap-2 justify-end">
                <button onClick={() => { setShowReasonModal(null); setReason('') }} className="btn-secondary">Cancel</button>
                <button disabled={!reason.trim() || actionLoading} className="btn-danger"
                  onClick={() => {
                    const action = showReasonModal === 'return' ? () => taskApi.return(task.id, reason)
                      : showReasonModal === 'reject' ? () => taskApi.reject(task.id, reason)
                      : () => taskApi.cancel(task.id, reason)
                    doAction(action)
                    setShowReasonModal(null); setReason('')
                  }}>
                  Confirm
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
              <select className="input" value={assignTarget.type} onChange={e => setAssignTarget({ type: e.target.value, id: '' })}>
                <option value="">Assign type...</option>
                <option value="personnel">Person</option>
                <option value="group">Group</option>
                <option value="department">Department</option>
              </select>
              {assignTarget.type === 'personnel' && (
                <select className="input" value={assignTarget.id} onChange={e => setAssignTarget(a => ({ ...a, id: e.target.value }))}>
                  <option value="">Select person...</option>
                  {personnel.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
              {assignTarget.type === 'group' && (
                <select className="input" value={assignTarget.id} onChange={e => setAssignTarget(a => ({ ...a, id: e.target.value }))}>
                  <option value="">Select group...</option>
                  {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              )}
              {assignTarget.type === 'department' && (
                <select className="input" value={assignTarget.id} onChange={e => setAssignTarget(a => ({ ...a, id: e.target.value }))}>
                  <option value="">Select department...</option>
                  {allDepts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
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

      {/* Subtask Modal */}
      {showSubtaskModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-panel w-full max-w-md">
            <div className="px-5 py-4 border-b border-tw-border">
              <h3 className="font-semibold text-tw-text">Create Subtask</h3>
              <p className="text-xs text-tw-text-secondary mt-0.5">Under: {task.title}</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <input className="input" placeholder="Subtask title" value={subtaskForm.title} onChange={e => setSubtaskForm(f => ({ ...f, title: e.target.value }))} />
              <textarea className="input resize-none" rows={2} placeholder="Description..." value={subtaskForm.description} onChange={e => setSubtaskForm(f => ({ ...f, description: e.target.value }))} />
              <div className="grid grid-cols-2 gap-3">
                <select className="input" value={subtaskForm.priority} onChange={e => setSubtaskForm(f => ({ ...f, priority: e.target.value }))}>
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
                <DatePicker value={subtaskForm.deadline} onChange={val => setSubtaskForm(f => ({ ...f, deadline: val }))} />
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowSubtaskModal(false)} className="btn-secondary">Cancel</button>
                <button onClick={createSubtask} disabled={loading || !subtaskForm.title} className="btn-primary">{loading ? 'Creating...' : 'Create Subtask'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
