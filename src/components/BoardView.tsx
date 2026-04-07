import React, { useState, useEffect } from 'react'
import type { Task, Project, Layer, Personnel, Group } from '../types'
import { taskApi, workspaceApi } from '../services/apiService'
import TaskCard from './TaskCard'
import TaskDetailPanel from './TaskDetailPanel'

interface Props {
  project: Project
  isDirector: boolean
  actorId: string
}

const COLUMNS = [
  { status: 'PENDING',     label: 'Pending',     color: 'bg-gray-400' },
  { status: 'ASSIGNED',    label: 'Assigned',    color: 'bg-blue-400' },
  { status: 'IN_PROGRESS', label: 'In Progress', color: 'bg-yellow-400' },
  { status: 'SUBMITTED',   label: 'Submitted',   color: 'bg-purple-400' },
  { status: 'APPROVED',    label: 'Approved',    color: 'bg-green-400' },
  { status: 'RETURNED',    label: 'Returned',    color: 'bg-red-400' },
]

export default function BoardView({ project, isDirector, actorId }: Props) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [layers, setLayers] = useState<Layer[]>([])
  const [personnel, setPersonnel] = useState<Personnel[]>([])
  const [groups, setGroups] = useState<Group[]>([])

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
    if (isDirector) {
      Promise.all([
        workspaceApi.getLayers() as Promise<Layer[]>,
        workspaceApi.getPersonnel() as Promise<Personnel[]>,
        workspaceApi.getGroups() as Promise<Group[]>,
      ]).then(([l, p, g]) => { setLayers(l); setPersonnel(p); setGroups(g) })
    }
  }, [project.id])

  const allDepts = layers.flatMap(l => l.departments || [])

  const createTask = async () => {
    if (!form.title) return
    setSaving(true)
    try {
      const created = await taskApi.create({ ...form, projectId: project.id, deadline: form.deadline || undefined }) as Task
      // Assign immediately if target selected
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

      {error && <div className="mb-4 bg-red-50 border border-red-200 text-tw-danger text-sm px-3 py-2 rounded-lg">{error}</div>}

      {/* Kanban Board */}
      <div className="flex gap-4 overflow-x-auto pb-4 flex-1">
        {COLUMNS.map(col => (
          <div key={col.status} className="flex-shrink-0 w-64">
            {/* Column header */}
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-2.5 h-2.5 rounded-full ${col.color}`} />
              <span className="text-xs font-semibold text-tw-text-secondary uppercase tracking-wide">{col.label}</span>
              <span className="ml-auto bg-tw-hover text-tw-text-secondary text-xs rounded-full px-1.5 py-0.5 font-medium">
                {columnTasks(col.status).length}
              </span>
            </div>
            {/* Cards */}
            <div className="space-y-0 min-h-12">
              {columnTasks(col.status).map(task => (
                <TaskCard key={task.id} task={task} onClick={t => setSelectedTask(t)} />
              ))}
              {columnTasks(col.status).length === 0 && (
                <div className="border-2 border-dashed border-tw-border rounded-xl h-16 flex items-center justify-center">
                  <span className="text-xs text-tw-text-secondary">No tasks</span>
                </div>
              )}
            </div>
          </div>
        ))}
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
            // Refresh the selected task
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
                  <select className="input" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-tw-text mb-1">Deadline</label>
                  <input className="input" type="date" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} />
                </div>
              </div>

              {/* Assignment */}
              <div>
                <label className="block text-sm font-medium text-tw-text mb-1">Assign to (optional)</label>
                <div className="grid grid-cols-2 gap-2">
                  <select className="input" value={assignTarget.type} onChange={e => setAssignTarget({ type: e.target.value as 'personnel' | 'group' | 'department' | '', id: '' })}>
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
                </div>
              </div>

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
