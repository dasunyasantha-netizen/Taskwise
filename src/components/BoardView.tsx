import React, { useState, useEffect, useRef } from 'react'
import type { Task, Project, Layer, Personnel, Group } from '../types'
import { taskApi, workspaceApi } from '../services/apiService'
import TaskCard from './TaskCard'
import TaskDetailPanel from './TaskDetailPanel'
import DatePicker from './DatePicker'
import Select, { SelectOption } from './Select'

interface Props {
  project: Project
  isDirector: boolean
  actorId: string
}

const COLUMNS = [
  { status: 'PENDING',     label: 'Pending',     color: 'bg-gray-400' },
  { status: 'ASSIGNED',    label: 'Assigned',    color: 'bg-blue-400' },
  { status: 'IN_PROGRESS', label: 'In Progress', color: 'bg-yellow-400' },
  { status: 'BLOCKED',     label: 'Blocked',     color: 'bg-orange-500' },
  { status: 'SUBMITTED',   label: 'Submitted',   color: 'bg-purple-400' },
  { status: 'APPROVED',    label: 'Approved',    color: 'bg-green-400' },
  { status: 'RETURNED',    label: 'Returned',    color: 'bg-red-400' },
]

// Status transitions allowed via drag-and-drop (only logical moves)
const DRAG_TRANSITIONS: Record<string, string[]> = {
  PENDING:     ['ASSIGNED'],
  ASSIGNED:    ['IN_PROGRESS'],
  IN_PROGRESS: ['BLOCKED', 'SUBMITTED'],
  BLOCKED:     ['IN_PROGRESS'],
  RETURNED:    ['IN_PROGRESS'],
  REJECTED:    ['IN_PROGRESS'],
}

export default function BoardView({ project, isDirector, actorId }: Props) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [layers, setLayers] = useState<Layer[]>([])
  const [personnel, setPersonnel] = useState<Personnel[]>([])
  const [groups, setGroups] = useState<Group[]>([])

  // Drag state
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)
  const dragTaskRef = useRef<Task | null>(null)

  // Create form
  const [form, setForm] = useState({ title: '', description: '', priority: 'MEDIUM', deadline: '' })
  const [assignTarget, setAssignTarget] = useState<{ type: 'personnel' | 'group' | 'department' | ''; id: string }>({ type: '', id: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const loadTasks = async () => {
    setLoading(true)
    try {
      const data = await taskApi.list(`projectId=${project.id}&parentTaskId=null`) as Task[]
      setTasks(data)
    } catch { setError('Failed to load tasks') }
    setLoading(false)
  }

  useEffect(() => {
    loadTasks()
    // Load workspace data for assignment dropdowns (directors + personnel for subtask creation)
    Promise.all([
      workspaceApi.getLayers() as Promise<Layer[]>,
      workspaceApi.getPersonnel() as Promise<Personnel[]>,
      workspaceApi.getGroups() as Promise<Group[]>,
    ]).then(([l, p, g]) => { setLayers(l); setPersonnel(p); setGroups(g) })
      .catch(() => { /* workspace data is best-effort */ })
  }, [project.id])

  const allDepts = layers.flatMap(l => l.departments || [])

  const createTask = async () => {
    if (!form.title) return
    setSaving(true)
    try {
      const created = await taskApi.create({ ...form, projectId: project.id, deadline: form.deadline || undefined }) as Task
      if (assignTarget.type && assignTarget.id) {
        await taskApi.assign(created.id, { [`${assignTarget.type}Id`]: assignTarget.id })
      }
      setShowCreateModal(false)
      setForm({ title: '', description: '', priority: 'MEDIUM', deadline: '' })
      setAssignTarget({ type: '', id: '' })
      await loadTasks()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Error') }
    setSaving(false)
  }

  // ── Drag-and-drop handlers ──────────────────────────────────────────────────
  const handleDragStart = (task: Task) => {
    setDraggingId(task.id)
    dragTaskRef.current = task
  }

  const handleDragEnd = () => {
    setDraggingId(null)
    setDragOverCol(null)
    dragTaskRef.current = null
  }

  const canDropInto = (targetStatus: string): boolean => {
    const task = dragTaskRef.current
    if (!task) return false
    const allowed = DRAG_TRANSITIONS[task.status] || []
    return allowed.includes(targetStatus)
  }

  const handleDrop = async (targetStatus: string) => {
    const task = dragTaskRef.current
    if (!task || !canDropInto(targetStatus)) {
      handleDragEnd()
      return
    }
    handleDragEnd()

    // Optimistic update
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: targetStatus as Task['status'] } : t))

    try {
      if (targetStatus === 'IN_PROGRESS' && task.status === 'ASSIGNED') {
        await taskApi.start(task.id)
      } else if (targetStatus === 'BLOCKED' && task.status === 'IN_PROGRESS') {
        await taskApi.block(task.id, 'Blocked via board drag')
      } else if (targetStatus === 'IN_PROGRESS' && task.status === 'BLOCKED') {
        await taskApi.unblock(task.id)
      } else if (targetStatus === 'IN_PROGRESS' && task.status === 'RETURNED') {
        await taskApi.reopen(task.id)
      } else if (targetStatus === 'IN_PROGRESS' && task.status === 'REJECTED') {
        await taskApi.reopen(task.id)
      }
      await loadTasks()
    } catch (e: unknown) {
      // Revert optimistic update on error
      setError(e instanceof Error ? e.message : 'Action failed')
      await loadTasks()
    }
  }

  const columnTasks = (status: string) => tasks.filter(t => t.status === status)

  if (loading) return <div className="p-8 text-sm text-tw-text-secondary">Loading board...</div>

  return (
    <div className="p-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 rounded-full" style={{ backgroundColor: project.color }} />
          <h1 className="text-xl font-bold text-tw-text">{project.name}</h1>
          <span className="badge badge-gray">{tasks.length} tasks</span>
        </div>
        {isDirector && (
          <button onClick={() => setShowCreateModal(true)} className="btn-primary">+ New Task</button>
        )}
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-tw-danger text-sm px-3 py-2 rounded-lg flex items-center justify-between">
          {error}
          <button onClick={() => setError('')} className="text-tw-danger font-bold ml-2">×</button>
        </div>
      )}

      {/* Kanban Board */}
      <div className="flex gap-4 overflow-x-auto pb-4 flex-1">
        {COLUMNS.map(col => {
          const isDropTarget = dragOverCol === col.status && canDropInto(col.status)
          return (
            <div key={col.status} className="flex-shrink-0 w-64"
              onDragOver={e => { e.preventDefault(); setDragOverCol(col.status) }}
              onDragLeave={() => setDragOverCol(null)}
              onDrop={() => handleDrop(col.status)}
            >
              {/* Column header */}
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-2.5 h-2.5 rounded-full ${col.color}`} />
                <span className="text-xs font-semibold text-tw-text-secondary uppercase tracking-wide">{col.label}</span>
                <span className="ml-auto bg-tw-hover text-tw-text-secondary text-xs rounded-full px-1.5 py-0.5 font-medium">
                  {columnTasks(col.status).length}
                </span>
              </div>
              {/* Cards */}
              <div className={`space-y-0 min-h-12 rounded-xl transition-colors ${isDropTarget ? 'bg-blue-50 ring-2 ring-tw-primary ring-opacity-40' : ''}`}>
                {columnTasks(col.status).map(task => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={() => handleDragStart(task)}
                    onDragEnd={handleDragEnd}
                    className={`transition-opacity ${draggingId === task.id ? 'opacity-40' : 'opacity-100'}`}
                  >
                    <TaskCard task={task} onClick={t => setSelectedTask(t)} />
                  </div>
                ))}
                {columnTasks(col.status).length === 0 && (
                  <div className={`border-2 border-dashed rounded-xl h-16 flex items-center justify-center transition-colors ${isDropTarget ? 'border-tw-primary' : 'border-tw-border'}`}>
                    <span className="text-xs text-tw-text-secondary">{isDropTarget ? 'Drop here' : 'No tasks'}</span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Task Detail Panel */}
      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          isDirector={isDirector}
          actorId={actorId}
          layers={layers}
          personnel={personnel}
          groups={groups}
          onClose={() => setSelectedTask(null)}
          onRefresh={async () => {
            await loadTasks()
            const updated = await taskApi.get(selectedTask.id) as Task
            setSelectedTask(updated)
          }}
        />
      )}

      {/* Create Task Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-panel w-full max-w-lg">
            <div className="flex items-center justify-between px-5 py-4 border-b border-tw-border">
              <h3 className="font-semibold text-tw-text">New Task — {project.name}</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-tw-text-secondary hover:text-tw-text text-xl">×</button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-tw-text mb-1">Title</label>
                <input className="input" placeholder="What needs to be done?" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-tw-text mb-1">Description</label>
                <textarea className="input resize-none" rows={3} placeholder="Describe the task in detail..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-tw-text mb-1">Priority</label>
                  <Select
                    value={form.priority}
                    onChange={val => setForm(f => ({ ...f, priority: val }))}
                    options={[
                      { value: 'LOW', label: 'Low' },
                      { value: 'MEDIUM', label: 'Medium' },
                      { value: 'HIGH', label: 'High' },
                      { value: 'CRITICAL', label: 'Critical' },
                    ]}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-tw-text mb-1">Deadline</label>
                  <DatePicker value={form.deadline} onChange={val => setForm(f => ({ ...f, deadline: val }))} />
                </div>
              </div>

              {/* Assignment — only for directors */}
              {isDirector && (
                <div>
                  <label className="block text-sm font-medium text-tw-text mb-1">Assign to (optional)</label>
                  <div className="grid grid-cols-2 gap-2">
                    <Select
                      value={assignTarget.type}
                      onChange={val => setAssignTarget({ type: val as 'personnel' | 'group' | 'department' | '', id: '' })}
                      placeholder="Assign type..."
                      options={[
                        { value: 'personnel', label: 'Person' },
                        { value: 'group', label: 'Group' },
                        { value: 'department', label: 'Department' },
                      ]}
                    />
                    {assignTarget.type === 'personnel' && (
                      <Select value={assignTarget.id} onChange={val => setAssignTarget(a => ({ ...a, id: val }))}
                        placeholder="Select person..." options={personnel.map(p => ({ value: p.id, label: p.name }))} />
                    )}
                    {assignTarget.type === 'group' && (
                      <Select value={assignTarget.id} onChange={val => setAssignTarget(a => ({ ...a, id: val }))}
                        placeholder="Select group..." options={groups.map(g => ({ value: g.id, label: g.name }))} />
                    )}
                    {assignTarget.type === 'department' && (
                      <Select value={assignTarget.id} onChange={val => setAssignTarget(a => ({ ...a, id: val }))}
                        placeholder="Select department..." options={allDepts.map(d => ({ value: d.id, label: d.name }))} />
                    )}
                  </div>
                </div>
              )}

              <div className="flex gap-2 justify-end pt-1">
                <button onClick={() => setShowCreateModal(false)} className="btn-secondary">Cancel</button>
                <button onClick={createTask} disabled={saving || !form.title} className="btn-primary">{saving ? 'Creating...' : 'Create Task'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
