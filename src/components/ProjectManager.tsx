import React, { useState, useEffect, useRef, useCallback } from 'react'
import type { Project, Task, Layer, Personnel } from '../types'
import { projectApi, taskApi, workspaceApi } from '../services/apiService'
import FilterBar, { DEFAULT_FILTERS, filterProjects, filterTasks, computeAvailableOptions, hasActiveFilters } from './FilterBar'
import type { ActiveFilters, AvailableOptions } from './FilterBar'

interface Props {
  onSelectProject: (project: Project) => void
}

const PROJECT_COLORS = ['#0073ea', '#00c875', '#e2445c', '#fdab3d', '#a358df', '#037f4c', '#bb3354', '#0086c0']

function useLongPress(onLongPress: () => void, ms = 500) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fired = useRef(false)

  const start = useCallback(() => {
    fired.current = false
    timer.current = setTimeout(() => { fired.current = true; onLongPress() }, ms)
  }, [onLongPress, ms])

  const cancel = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
  }, [])

  return {
    onTouchStart: start,
    onTouchEnd: cancel,
    onTouchMove: cancel,
    onTouchCancel: cancel,
    onClick: (e: React.MouseEvent) => { if (fired.current) { e.stopPropagation(); e.preventDefault() } },
  }
}

interface ActiveProjectCardProps {
  project: Project
  onSelect: (p: Project) => void
  onEdit: (p: Project, e: React.MouseEvent) => void
  onArchive: (id: string, e: React.MouseEvent) => void
}

function ActiveProjectCard({ project: p, onSelect, onEdit, onArchive }: ActiveProjectCardProps) {
  const { onClick: lpClick, ...longPressProps } = useLongPress(() => onEdit(p, { stopPropagation: () => {} } as React.MouseEvent))
  return (
    <div
      {...longPressProps}
      onClick={e => { lpClick(e); if (!e.defaultPrevented) onSelect(p) }}
      className="card p-4 cursor-pointer hover:shadow-panel transition-shadow group select-none"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
          <span className="font-semibold text-tw-text text-sm">{p.name}</span>
        </div>
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
          <button onClick={e => { e.stopPropagation(); onEdit(p, e) }}
            className="text-xs text-tw-primary hover:underline">Edit</button>
          <button onClick={e => onArchive(p.id, e)}
            className="text-xs text-tw-text-secondary hover:text-tw-danger transition-colors">Archive</button>
        </div>
      </div>
      {p.description && <p className="text-xs text-tw-text-secondary mb-3 line-clamp-2">{p.description}</p>}
      <div className="flex items-center justify-between">
        <span className="badge badge-success">Active</span>
        <span className="text-xs text-tw-text-secondary">{new Date(p.createdAt).toLocaleDateString()}</span>
      </div>
    </div>
  )
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  PENDING:     'bg-gray-100 text-gray-600',
  ASSIGNED:    'bg-blue-50 text-blue-700',
  IN_PROGRESS: 'bg-yellow-50 text-yellow-700',
  SUBMITTED:   'bg-purple-50 text-purple-700',
  APPROVED:    'bg-green-50 text-green-700',
  RETURNED:    'bg-orange-50 text-orange-700',
  CANCELLED:   'bg-red-50 text-red-500',
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending', ASSIGNED: 'Assigned', IN_PROGRESS: 'In Progress',
  SUBMITTED: 'Submitted', APPROVED: 'Approved', RETURNED: 'Returned', CANCELLED: 'Cancelled',
}

const PRIORITY_STYLES: Record<string, string> = {
  CRITICAL: 'text-red-600', HIGH: 'text-orange-500', MEDIUM: 'text-yellow-600', LOW: 'text-gray-400',
}

function FilteredTaskCard({ task }: { task: Task }) {
  const assignee = task.assignments?.[0]?.personnel
  const dept = task.assignments?.[0]?.department
  const isOverdue = task.deadline && task.status !== 'APPROVED' && task.status !== 'CANCELLED' && new Date(task.deadline) < new Date()

  return (
    <div className="card p-4 space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <span className={`text-xs font-semibold mt-0.5 flex-shrink-0 ${PRIORITY_STYLES[task.priority] ?? 'text-gray-400'}`}>
            {task.priority === 'CRITICAL' ? '!!' : task.priority === 'HIGH' ? '!' : task.priority === 'MEDIUM' ? '·' : '–'}
          </span>
          <span className="font-medium text-tw-text text-sm leading-snug">{task.title}</span>
        </div>
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_STYLES[task.status] ?? 'bg-gray-100 text-gray-600'}`}>
          {STATUS_LABELS[task.status] ?? task.status}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-tw-text-secondary">
        {assignee && (
          <span className="flex items-center gap-1">
            <span className="w-5 h-5 rounded-full bg-tw-primary/10 text-tw-primary font-bold flex items-center justify-center text-[10px] flex-shrink-0">
              {assignee.name.charAt(0).toUpperCase()}
            </span>
            {assignee.name}
          </span>
        )}
        {!assignee && dept && (
          <span className="flex items-center gap-1">
            <span className="text-tw-text-secondary">Dept:</span> {dept.name}
          </span>
        )}
        {task.project && (
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: task.project.color }} />
            {task.project.name}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between text-[11px] text-tw-text-secondary pt-0.5">
        <span>Created {new Date(task.createdAt).toLocaleDateString()}</span>
        {task.deadline && (
          <span className={isOverdue ? 'text-tw-danger font-semibold' : ''}>
            {isOverdue ? 'Overdue · ' : 'Due '}
            {new Date(task.deadline).toLocaleDateString()}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ProjectManager({ onSelectProject }: Props) {
  const [projects, setProjects] = useState<Project[]>([])
  const [allTasks, setAllTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [form, setForm] = useState({ name: '', description: '', color: '#0073ea' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState<ActiveFilters>(DEFAULT_FILTERS)
  const [layers, setLayers] = useState<Layer[]>([])
  const [personnel, setPersonnel] = useState<Personnel[]>([])

  const filtersActive = hasActiveFilters(filters)
  const filteredTasks = filtersActive ? filterTasks(allTasks, filters, layers, personnel) : []
  const availableOptions: AvailableOptions = computeAvailableOptions(allTasks, filters, layers, personnel)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [projs, tasks] = await Promise.all([
        projectApi.list() as Promise<Project[]>,
        taskApi.list('parentTaskId=null') as Promise<Task[]>,
      ])
      setProjects(projs)
      setAllTasks(tasks)
    } catch {
      setError('Failed to load projects')
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
    Promise.all([
      workspaceApi.getLayers() as Promise<Layer[]>,
      workspaceApi.getPersonnel() as Promise<Personnel[]>,
    ]).then(([l, p]) => { setLayers(l); setPersonnel(p) }).catch(() => {})
  }, [])

  const handleFilterChange = (f: ActiveFilters) => {
    setFilters(f)
  }

  const create = async () => {
    if (!form.name) return
    setSaving(true)
    try {
      await projectApi.create(form)
      setShowModal(false)
      setForm({ name: '', description: '', color: '#0073ea' })
      await load()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Error') }
    setSaving(false)
  }

  const archive = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Archive this project?')) return
    await projectApi.update(id, { status: 'archived' })
    await load()
  }

  const openEdit = (p: Project, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingProject(p)
    setForm({ name: p.name, description: p.description || '', color: p.color })
  }

  const saveEdit = async () => {
    if (!editingProject || !form.name) return
    setSaving(true)
    try {
      await projectApi.update(editingProject.id, form)
      setEditingProject(null)
      await load()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Error') }
    setSaving(false)
  }

  // Project view (no filters active)
  const filteredProjects = filterProjects(projects, filters)
  const allActive = projects.filter(p => p.status === 'active')
  const active = filteredProjects.filter(p => p.status === 'active')
  const archived = filteredProjects.filter(p => p.status === 'archived')

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-tw-text">Projects</h1>
          {filtersActive
            ? <p className="text-sm text-tw-text-secondary mt-0.5">{loading ? '…' : filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''} matched</p>
            : <p className="text-sm text-tw-text-secondary mt-0.5">{active.length}{active.length !== allActive.length ? ` / ${allActive.length}` : ''} active project{allActive.length !== 1 ? 's' : ''}</p>
          }
        </div>
        {!filtersActive && <button onClick={() => setShowModal(true)} className="btn-primary">+ New Project</button>}
      </div>

      {error && <div className="mb-4 bg-red-50 border border-red-200 text-tw-danger text-sm px-3 py-2 rounded-lg">{error}</div>}

      <FilterBar
        filters={filters}
        layers={layers}
        personnel={personnel}
        mode={filtersActive ? 'task' : 'project'}
        availableOptions={availableOptions}
        onChange={handleFilterChange}
      />

      {loading ? (
        <div className="text-sm text-tw-text-secondary">{filtersActive ? 'Loading tasks…' : 'Loading projects…'}</div>
      ) : filtersActive ? (
        /* ── Filtered task view ── */
        filteredTasks.length === 0 ? (
          <div className="card p-12 text-center">
            <div className="text-3xl mb-3">🔍</div>
            <p className="text-tw-text font-semibold mb-1">No tasks found</p>
            <p className="text-tw-text-secondary text-sm">No tasks match the selected filters.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTasks.map(t => <FilteredTaskCard key={t.id} task={t} />)}
          </div>
        )
      ) : (
        /* ── Default project view ── */
        <>
          {active.length === 0 && archived.length === 0 ? (
            <div className="card p-12 text-center">
              <div className="text-4xl mb-4">📋</div>
              <p className="text-tw-text font-semibold mb-1">No projects yet</p>
              <p className="text-tw-text-secondary text-sm mb-4">Create your first project to start assigning tasks.</p>
              <button onClick={() => setShowModal(true)} className="btn-primary">Create Project</button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                {active.map(p => (
                  <ActiveProjectCard key={p.id} project={p} onSelect={onSelectProject} onEdit={openEdit} onArchive={archive} />
                ))}
              </div>
              {archived.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-tw-text-secondary uppercase tracking-wide mb-3">Archived</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {archived.map(p => (
                      <div key={p.id} className="card p-4 opacity-60">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
                          <span className="font-medium text-tw-text text-sm">{p.name}</span>
                        </div>
                        <span className="badge badge-gray">Archived</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-panel w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-tw-border">
              <h3 className="font-semibold text-tw-text">New Project</h3>
              <button onClick={() => setShowModal(false)} className="text-tw-text-secondary hover:text-tw-text text-xl">×</button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-tw-text mb-1">Project Name</label>
                <input className="input" placeholder="e.g. Website Redesign" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-tw-text mb-1">Description (optional)</label>
                <textarea className="input resize-none" rows={2} placeholder="Brief description..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-tw-text mb-2">Color</label>
                <div className="flex gap-2">
                  {PROJECT_COLORS.map(c => (
                    <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                      className={`w-7 h-7 rounded-full transition-transform ${form.color === c ? 'ring-2 ring-offset-1 ring-tw-text scale-110' : 'hover:scale-105'}`}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
              <div className="flex gap-2 justify-end pt-1">
                <button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
                <button onClick={create} disabled={saving || !form.name} className="btn-primary">{saving ? 'Creating...' : 'Create Project'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editingProject && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-panel w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-tw-border">
              <h3 className="font-semibold text-tw-text">Edit Project</h3>
              <button onClick={() => setEditingProject(null)} className="text-tw-text-secondary hover:text-tw-text text-xl">×</button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-tw-text mb-1">Project Name</label>
                <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-tw-text mb-1">Description (optional)</label>
                <textarea className="input resize-none" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-tw-text mb-2">Color</label>
                <div className="flex gap-2">
                  {PROJECT_COLORS.map(c => (
                    <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                      className={`w-7 h-7 rounded-full transition-transform ${form.color === c ? 'ring-2 ring-offset-1 ring-tw-text scale-110' : 'hover:scale-105'}`}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
              <div className="flex gap-2 justify-end pt-1">
                <button onClick={() => setEditingProject(null)} className="btn-secondary">Cancel</button>
                <button onClick={saveEdit} disabled={saving || !form.name} className="btn-primary">{saving ? 'Saving...' : 'Save Changes'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
