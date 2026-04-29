import React, { useState, useEffect, useRef } from 'react'
import type { Task, Project, Layer, Personnel, Group } from '../types'
import { taskApi, workspaceApi } from '../services/apiService'
import TaskCard from './TaskCard'
import TaskDetailPanel from './TaskDetailPanel'
import DatePicker from './DatePicker'
import Select from './Select'
import PersonPickerModal from './PersonPickerModal'

interface Props {
  project: Project
  isDirector: boolean
  actorId: string
}

const COLUMNS = [
  { status: 'NOT_STARTED', label: 'Not Started', color: 'bg-gray-400', statuses: ['PENDING', 'ASSIGNED'] },
  { status: 'IN_PROGRESS', label: 'In Progress', color: 'bg-yellow-400', statuses: ['IN_PROGRESS'] },
  { status: 'BLOCKED',     label: 'Blocked',     color: 'bg-orange-500', statuses: ['BLOCKED'] },
  { status: 'SUBMITTED',   label: 'Submitted',   color: 'bg-purple-400', statuses: ['SUBMITTED'] },
  { status: 'APPROVED',    label: 'Approved',    color: 'bg-green-400',  statuses: ['APPROVED'] },
  { status: 'RETURNED',    label: 'Returned',    color: 'bg-red-400',    statuses: ['RETURNED'] },
]

const DRAG_TRANSITIONS: Record<string, string[]> = {
  PENDING:     ['IN_PROGRESS'],
  ASSIGNED:    ['IN_PROGRESS'],
  IN_PROGRESS: ['BLOCKED', 'SUBMITTED'],
  BLOCKED:     ['IN_PROGRESS'],
  RETURNED:    ['IN_PROGRESS'],
  REJECTED:    ['IN_PROGRESS'],
}

// ── Intermediate supervisor picker (proper component — no hook violations) ────
interface IntermediatePickerProps {
  layerNumber: number
  layerName: string
  stepLabel: string
  isLastStep: boolean
  personnel: Personnel[]
  allDepts: { id: string; name: string }[]
  selected: string[]
  error: string
  saving: boolean
  onToggle: (pid: string) => void
  onNext: () => void
  onCancel: () => void
}

function IntermediatePickerModal({
  layerNumber, layerName, stepLabel, isLastStep,
  personnel, allDepts, selected, error, saving,
  onToggle, onNext, onCancel,
}: IntermediatePickerProps) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { inputRef.current?.focus() }, [layerNumber])

  const q = query.trim().toLowerCase()
  const visible = q
    ? personnel.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (allDepts.find(d => d.id === p.departmentId)?.name ?? '').toLowerCase().includes(q) ||
        (p.phone ?? '').includes(q) ||
        (p.email ?? '').toLowerCase().includes(q)
      )
    : personnel

  const byDept: Record<string, { deptName: string; people: Personnel[] }> = {}
  for (const p of visible) {
    const dept = allDepts.find(d => d.id === p.departmentId)
    if (!dept) continue
    if (!byDept[dept.id]) byDept[dept.id] = { deptName: dept.name, people: [] }
    byDept[dept.id].people.push(p)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col" style={{ maxHeight: '80vh' }}>
        <div className="px-5 py-4 border-b border-tw-border">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-semibold text-tw-text">Select {layerName} Supervisor(s)</h3>
            <span className="text-xs font-semibold text-tw-primary bg-blue-50 px-2 py-1 rounded-full">{selected.length} selected</span>
          </div>
          <p className="text-xs text-tw-text-secondary">{stepLabel} — mandatory, pick one or more</p>
        </div>

        <div className="px-4 pt-3 pb-2">
          <div className="flex items-center gap-2 border border-tw-border rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-tw-primary focus-within:border-tw-primary transition-all">
            <svg className="w-4 h-4 text-tw-text-secondary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input ref={inputRef} className="flex-1 text-sm outline-none bg-transparent placeholder-tw-text-secondary"
              placeholder="Search name, department, phone…"
              value={query} onChange={e => setQuery(e.target.value)} />
            {query && <button onClick={() => setQuery('')} className="text-tw-text-secondary hover:text-tw-text text-base leading-none">×</button>}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-3 space-y-3">
          {Object.values(byDept).map(({ deptName, people }) => (
            <div key={deptName}>
              <div className="text-xs font-semibold text-tw-text-secondary uppercase tracking-wide mb-1.5">{deptName}</div>
              <div className="space-y-1">
                {people.map(p => {
                  const checked = selected.includes(p.id)
                  return (
                    <label key={p.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${checked ? 'bg-blue-50 border border-tw-primary' : 'hover:bg-tw-hover border border-transparent'}`}>
                      <input type="checkbox" checked={checked} onChange={() => onToggle(p.id)} className="w-4 h-4 accent-tw-primary" />
                      <div className="w-7 h-7 rounded-full bg-tw-primary flex items-center justify-center text-white text-xs font-bold flex-shrink-0">{p.name.charAt(0)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-tw-text">{p.name}</div>
                        <div className="text-xs text-tw-text-secondary">{allDepts.find(d => d.id === p.departmentId)?.name}{p.phone ? ` · ${p.phone}` : ''}</div>
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>
          ))}
          {visible.length === 0 && <p className="text-sm text-tw-text-secondary text-center py-6">No results.</p>}
        </div>

        {error && <div className="mx-4 mb-2 text-xs text-tw-danger bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}

        <div className="px-5 py-4 border-t border-tw-border flex gap-2 justify-between">
          <button onClick={onCancel} className="btn-secondary">Cancel</button>
          <button onClick={onNext} disabled={saving} className="btn-primary disabled:opacity-50">
            {saving ? 'Creating…' : isLastStep ? '✓ Confirm & Create Task' : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main BoardView ─────────────────────────────────────────────────────────────
export default function BoardView({ project, isDirector, actorId }: Props) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [layers, setLayers] = useState<Layer[]>([])
  const [personnel, setPersonnel] = useState<Personnel[]>([])
  const [groups, setGroups] = useState<Group[]>([])

  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)
  const dragTaskRef = useRef<Task | null>(null)

  const [form, setForm] = useState({ title: '', description: '', priority: 'MEDIUM', deadline: '' })
  const [assignTarget, setAssignTarget] = useState<{ type: 'personnel' | 'group' | 'department' | ''; id: string }>({ type: '', id: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showPersonPicker, setShowPersonPicker] = useState(false)

  const [showIntermediate, setShowIntermediate] = useState(false)
  const [intermediateLayer, setIntermediateLayer] = useState<number>(1)
  const [intermediateLayers, setIntermediateLayers] = useState<number[]>([])
  const [intermediateSelections, setIntermediateSelections] = useState<Record<number, string[]>>({})
  const [intermediateError, setIntermediateError] = useState('')

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
    Promise.all([
      workspaceApi.getLayers() as Promise<Layer[]>,
      workspaceApi.getPersonnel() as Promise<Personnel[]>,
      workspaceApi.getGroups() as Promise<Group[]>,
    ]).then(([l, p, g]) => { setLayers(l); setPersonnel(p); setGroups(g) })
      .catch(() => {})
  }, [project.id])

  const allDepts = layers.flatMap(l => l.departments || [])

  const getPersonnelLayer = (personnelId: string): number | null => {
    const p = personnel.find(p => p.id === personnelId)
    const dept = p?.departmentId ? allDepts.find(d => d.id === p.departmentId) : null
    if (!dept) return null
    return layers.find(l => l.departments?.some(d => d.id === dept.id))?.number ?? null
  }

  const handleCreateClick = () => {
    if (!form.title) return
    if (assignTarget.type === 'personnel' && assignTarget.id && isDirector) {
      const targetLayer = getPersonnelLayer(assignTarget.id)
      if (targetLayer && targetLayer > 1) {
        const needed = Array.from({ length: targetLayer - 1 }, (_, i) => i + 1)
        setIntermediateLayers(needed)
        setIntermediateLayer(needed[0])
        setIntermediateSelections({})
        setIntermediateError('')
        setShowIntermediate(true)
        return
      }
    }
    doCreateTask({})
  }

  const doCreateTask = async (supervisorMap: Record<number, string[]>) => {
    setSaving(true)
    try {
      const created = await taskApi.create({ ...form, projectId: project.id, deadline: form.deadline || undefined }) as Task
      for (const layer of Object.keys(supervisorMap).map(Number).sort()) {
        for (const pid of supervisorMap[layer]) {
          await taskApi.assign(created.id, { personnelId: pid })
        }
      }
      if (assignTarget.type && assignTarget.id) {
        await taskApi.assign(created.id, { [`${assignTarget.type}Id`]: assignTarget.id })
      }
      setShowCreateModal(false)
      setShowIntermediate(false)
      setForm({ title: '', description: '', priority: 'MEDIUM', deadline: '' })
      setAssignTarget({ type: '', id: '' })
      setIntermediateSelections({})
      await loadTasks()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Error') }
    setSaving(false)
  }

  const handleIntermediateNext = () => {
    const selected = intermediateSelections[intermediateLayer] ?? []
    if (selected.length === 0) { setIntermediateError('Please select at least one person from this layer.'); return }
    setIntermediateError('')
    const currentIdx = intermediateLayers.indexOf(intermediateLayer)
    if (currentIdx < intermediateLayers.length - 1) {
      setIntermediateLayer(intermediateLayers[currentIdx + 1])
    } else {
      setShowIntermediate(false)
      doCreateTask(intermediateSelections)
    }
  }

  const toggleIntermediateSelection = (pid: string) => {
    setIntermediateSelections(prev => {
      const current = prev[intermediateLayer] ?? []
      const updated = current.includes(pid) ? current.filter(x => x !== pid) : [...current, pid]
      return { ...prev, [intermediateLayer]: updated }
    })
  }

  const handleDragStart = (task: Task) => { setDraggingId(task.id); dragTaskRef.current = task }
  const handleDragEnd = () => { setDraggingId(null); setDragOverCol(null); dragTaskRef.current = null }
  const canDropInto = (targetStatus: string) => {
    const task = dragTaskRef.current
    return task ? (DRAG_TRANSITIONS[task.status] || []).includes(targetStatus) : false
  }

  const handleDrop = async (targetStatus: string) => {
    const task = dragTaskRef.current
    if (!task || !canDropInto(targetStatus)) { handleDragEnd(); return }
    handleDragEnd()
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: targetStatus as Task['status'] } : t))
    try {
      if (targetStatus === 'IN_PROGRESS' && task.status === 'ASSIGNED') await taskApi.start(task.id)
      else if (targetStatus === 'BLOCKED'     && task.status === 'IN_PROGRESS') await taskApi.block(task.id, 'Blocked via board drag')
      else if (targetStatus === 'IN_PROGRESS' && task.status === 'BLOCKED')     await taskApi.unblock(task.id)
      else if (targetStatus === 'IN_PROGRESS' && task.status === 'RETURNED')    await taskApi.reopen(task.id)
      else if (targetStatus === 'IN_PROGRESS' && task.status === 'REJECTED')    await taskApi.reopen(task.id)
      await loadTasks()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Action failed'); await loadTasks() }
  }

  const columnTasks = (col: typeof COLUMNS[number]) => tasks.filter(t => col.statuses.includes(t.status))

  // Intermediate modal data
  const currentIdx = intermediateLayers.indexOf(intermediateLayer)
  const layerPersonnelForPicker = personnel.filter(p => {
    const dept = allDepts.find(d => d.id === p.departmentId)
    return dept && layers.find(l => l.number === intermediateLayer)?.departments?.some(d => d.id === dept.id)
  })

  if (loading) return <div className="p-8 text-sm text-tw-text-secondary">Loading board...</div>

  return (
    <div className="p-6 h-full flex flex-col">
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

      <div className="flex gap-4 overflow-x-auto pb-4 flex-1">
        {COLUMNS.map(col => {
          const isDropTarget = dragOverCol === col.status && canDropInto(col.status)
          return (
            <div key={col.status} className="flex-shrink-0 w-64"
              onDragOver={e => { e.preventDefault(); setDragOverCol(col.status) }}
              onDragLeave={() => setDragOverCol(null)}
              onDrop={() => handleDrop(col.status)}
            >
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-2.5 h-2.5 rounded-full ${col.color}`} />
                <span className="text-xs font-semibold text-tw-text-secondary uppercase tracking-wide">{col.label}</span>
                <span className="ml-auto bg-tw-hover text-tw-text-secondary text-xs rounded-full px-1.5 py-0.5 font-medium">
                  {columnTasks(col).length}
                </span>
              </div>
              <div className={`space-y-0 min-h-12 rounded-xl transition-colors ${isDropTarget ? 'bg-blue-50 ring-2 ring-tw-primary ring-opacity-40' : ''}`}>
                {columnTasks(col).map(task => (
                  <div key={task.id} draggable
                    onDragStart={() => handleDragStart(task)} onDragEnd={handleDragEnd}
                    className={`transition-opacity ${draggingId === task.id ? 'opacity-40' : 'opacity-100'}`}>
                    <TaskCard task={task} onClick={t => setSelectedTask(t)} />
                  </div>
                ))}
                {columnTasks(col).length === 0 && (
                  <div className={`border-2 border-dashed rounded-xl h-16 flex items-center justify-center transition-colors ${isDropTarget ? 'border-tw-primary' : 'border-tw-border'}`}>
                    <span className="text-xs text-tw-text-secondary">{isDropTarget ? 'Drop here' : 'No tasks'}</span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {selectedTask && (
        <TaskDetailPanel task={selectedTask} isDirector={isDirector} actorId={actorId}
          layers={layers} personnel={personnel} groups={groups}
          onClose={() => setSelectedTask(null)}
          onRefresh={async () => {
            await loadTasks()
            const updated = await taskApi.get(selectedTask.id) as Task
            setSelectedTask(updated)
          }} />
      )}

      {/* Person picker modal */}
      {showPersonPicker && (
        <PersonPickerModal personnel={personnel} layers={layers} title="Select Person to Assign"
          onSelect={p => setAssignTarget({ type: 'personnel', id: p.id })}
          onClose={() => setShowPersonPicker(false)} />
      )}

      {/* Intermediate supervisor picker modal */}
      {showIntermediate && (
        <IntermediatePickerModal
          layerNumber={intermediateLayer}
          layerName={layers.find(l => l.number === intermediateLayer)?.name ?? `Layer ${intermediateLayer}`}
          stepLabel={`Step ${currentIdx + 1} of ${intermediateLayers.length}`}
          isLastStep={currentIdx === intermediateLayers.length - 1}
          personnel={layerPersonnelForPicker}
          allDepts={allDepts}
          selected={intermediateSelections[intermediateLayer] ?? []}
          error={intermediateError}
          saving={saving}
          onToggle={toggleIntermediateSelection}
          onNext={handleIntermediateNext}
          onCancel={() => { setShowIntermediate(false); setIntermediateSelections({}) }}
        />
      )}

      {/* Create task modal */}
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
                <input className="input" placeholder="What needs to be done?" value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-tw-text mb-1">Description</label>
                <textarea className="input resize-none" rows={3} placeholder="Describe the task in detail..."
                  value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-tw-text mb-1">Priority</label>
                  <Select value={form.priority} onChange={val => setForm(f => ({ ...f, priority: val }))}
                    options={[
                      { value: 'LOW', label: 'Low' }, { value: 'MEDIUM', label: 'Medium' },
                      { value: 'HIGH', label: 'High' }, { value: 'CRITICAL', label: 'Critical' },
                    ]} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-tw-text mb-1">Deadline</label>
                  <DatePicker value={form.deadline} onChange={val => setForm(f => ({ ...f, deadline: val }))} />
                </div>
              </div>

              {isDirector && (
                <div>
                  <label className="block text-sm font-medium text-tw-text mb-1">Assign to (optional)</label>
                  <div className="grid grid-cols-2 gap-2">
                    <Select value={assignTarget.type}
                      onChange={val => setAssignTarget({ type: val as 'personnel' | 'group' | 'department' | '', id: '' })}
                      placeholder="Assign type..."
                      options={[
                        { value: 'personnel', label: 'Person' },
                        { value: 'group',     label: 'Group' },
                        { value: 'department',label: 'Department' },
                      ]} />

                    {assignTarget.type === 'personnel' && (
                      <button type="button" onClick={() => setShowPersonPicker(true)}
                        className="w-full flex items-center justify-between border border-tw-border rounded-lg px-3 py-2 text-sm bg-white hover:border-tw-primary focus:outline-none focus:ring-2 focus:ring-tw-primary transition-colors">
                        {assignTarget.id ? (
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-5 h-5 rounded-full bg-tw-primary flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                              {personnel.find(p => p.id === assignTarget.id)?.name.charAt(0) ?? '?'}
                            </div>
                            <span className="text-tw-text truncate">{personnel.find(p => p.id === assignTarget.id)?.name ?? '—'}</span>
                          </div>
                        ) : (
                          <span className="text-tw-text-secondary">Select person…</span>
                        )}
                        <svg className="w-4 h-4 text-tw-text-secondary flex-shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                        </svg>
                      </button>
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
                <button onClick={handleCreateClick} disabled={saving || !form.title} className="btn-primary">
                  {saving ? 'Creating...' : 'Create Task'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
