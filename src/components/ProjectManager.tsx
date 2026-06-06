import React, { useState, useEffect, useRef, useCallback } from 'react'
import type { Project, Task, Layer, Personnel, ProjectCategory } from '../types'
import { projectApi, projectCategoryApi, taskApi, workspaceApi } from '../services/apiService'
import FilterBar, { DEFAULT_FILTERS, filterTasks, computeAvailableOptions, hasActiveFilters } from './FilterBar'
import type { ActiveFilters, AvailableOptions } from './FilterBar'

interface Props {
  onSelectProject: (project: Project) => void
  onSelectTask?: (task: Task) => void
  filters: ActiveFilters
  onFiltersChange: (f: ActiveFilters) => void
  allTasks: Task[]
  onAllTasksLoaded: (tasks: Task[], projects: Project[]) => void
  isDirector: boolean
  actorId: string
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
    // don't reset fired here — the subsequent onClick needs to see it
  }, [])

  const resetFired = useCallback(() => { fired.current = false }, [])

  return {
    onTouchStart: start,
    onTouchEnd: cancel,
    onTouchMove: cancel,
    onTouchCancel: cancel,
    onClick: (e: React.MouseEvent) => {
      if (fired.current) {
        e.stopPropagation()
        e.preventDefault()
        // reset after consuming so next tap works normally
        resetFired()
      }
    },
  }
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

// ─── Project card ─────────────────────────────────────────────────────────────

interface ProjectCardProps {
  project: Project
  onSelect: (p: Project) => void
  onEdit: (p: Project, e: React.MouseEvent) => void
  onArchive: (id: string, e: React.MouseEvent) => void
  canEdit: boolean
}

function ProjectCard({ project: p, onSelect, onEdit, onArchive, canEdit }: ProjectCardProps) {
  const { onClick: lpClick, ...longPressProps } = useLongPress(() => canEdit && onEdit(p, { stopPropagation: () => {} } as React.MouseEvent))
  return (
    <div
      {...longPressProps}
      onClick={e => { lpClick(e); if (!e.defaultPrevented) onSelect(p) }}
      className="card p-4 cursor-pointer hover:shadow-panel transition-shadow group select-none"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
          <span className="font-semibold text-tw-text text-sm truncate">{p.name}</span>
        </div>
        {canEdit && (
          <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0 ml-2">
            <button onClick={e => { e.stopPropagation(); onEdit(p, e) }}
              className="text-xs font-medium px-2.5 py-1 rounded-md bg-tw-primary/10 text-tw-primary hover:bg-tw-primary hover:text-white transition-colors">Edit</button>
            <button onClick={e => onArchive(p.id, e)}
              className="text-xs font-medium px-2.5 py-1 rounded-md bg-gray-100 text-tw-text-secondary hover:bg-tw-danger hover:text-white transition-colors">Archive</button>
          </div>
        )}
      </div>
      {p.description && <p className="text-xs text-tw-text-secondary mb-3 line-clamp-2">{p.description}</p>}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="badge badge-success">Active</span>
          {p._count && (
            <span className="text-xs text-tw-text-secondary">{p._count.tasks} task{p._count.tasks !== 1 ? 's' : ''}</span>
          )}
        </div>
        <span className="text-xs text-tw-text-secondary">{new Date(p.createdAt).toLocaleDateString()}</span>
      </div>
    </div>
  )
}

// ─── Filtered task card ───────────────────────────────────────────────────────

function FilteredTaskCard({ task, onSelect }: { task: Task; onSelect?: (t: Task) => void }) {
  const assignee = task.assignments?.[0]?.personnel
  const dept = task.assignments?.[0]?.department
  const isOverdue = task.deadline && task.status !== 'APPROVED' && task.status !== 'CANCELLED' && new Date(task.deadline) < new Date()

  return (
    <div
      className={`card p-4 space-y-2.5 ${onSelect ? 'cursor-pointer hover:border-tw-primary/40 hover:shadow-md transition-all active:scale-[0.99]' : ''}`}
      onClick={() => onSelect?.(task)}
    >
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

// ─── Category modal ───────────────────────────────────────────────────────────

interface CategoryModalProps {
  initial?: ProjectCategory | null
  onSave: (data: { name: string; description?: string; color: string }) => Promise<void>
  onClose: () => void
}

function CategoryModal({ initial, onSave, onClose }: CategoryModalProps) {
  const [form, setForm] = useState({ name: initial?.name ?? '', description: initial?.description ?? '', color: initial?.color ?? '#0073ea' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    setError('')
    try {
      await onSave({ name: form.name.trim(), description: form.description.trim() || undefined, color: form.color })
      onClose()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Error') }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-panel w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-tw-border">
          <h3 className="font-semibold text-tw-text">{initial ? 'Edit Category' : 'New Category'}</h3>
          <button onClick={onClose} className="text-tw-text-secondary hover:text-tw-text text-xl">×</button>
        </div>
        <div className="px-5 py-4 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-tw-danger text-sm px-3 py-2 rounded-lg">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-tw-text mb-1">Category Name</label>
            <input className="input" placeholder="e.g. Construction" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
          </div>
          <div>
            <label className="block text-sm font-medium text-tw-text mb-1">Description (optional)</label>
            <textarea className="input resize-none" rows={2} placeholder="Brief description..." value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
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
            <button onClick={onClose} className="btn-secondary">Cancel</button>
            <button onClick={submit} disabled={saving || !form.name.trim()} className="btn-primary">
              {saving ? 'Saving...' : initial ? 'Save Changes' : 'Create Category'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Project modal (create / edit) ────────────────────────────────────────────

interface ProjectModalProps {
  initial?: Project | null
  categories: ProjectCategory[]
  onSave: (data: { name: string; description?: string; color: string; categoryId: string }) => Promise<void>
  onClose: () => void
}

function ProjectModal({ initial, categories, onSave, onClose }: ProjectModalProps) {
  const activeCategories = categories.filter(c => !c.isSystem && c.status === 'active')
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    description: initial?.description ?? '',
    color: initial?.color ?? '#0073ea',
    categoryId: initial?.categoryId ?? (activeCategories[0]?.id ?? ''),
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!form.name.trim()) return
    if (!form.categoryId) { setError('Please select a category'); return }
    setSaving(true)
    setError('')
    try {
      await onSave({ name: form.name.trim(), description: form.description.trim() || undefined, color: form.color, categoryId: form.categoryId })
      onClose()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Error') }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-panel w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-tw-border">
          <h3 className="font-semibold text-tw-text">{initial ? 'Edit Project' : 'New Project'}</h3>
          <button onClick={onClose} className="text-tw-text-secondary hover:text-tw-text text-xl">×</button>
        </div>
        <div className="px-5 py-4 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-tw-danger text-sm px-3 py-2 rounded-lg">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-tw-text mb-1">Category <span className="text-tw-danger">*</span></label>
            <select className="input" value={form.categoryId}
              onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))}>
              <option value="">— Select category —</option>
              {activeCategories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-tw-text mb-1">Project Name <span className="text-tw-danger">*</span></label>
            <input className="input" placeholder="e.g. Website Redesign" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
          </div>
          <div>
            <label className="block text-sm font-medium text-tw-text mb-1">Description (optional)</label>
            <textarea className="input resize-none" rows={2} placeholder="Brief description..." value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
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
            <button onClick={onClose} className="btn-secondary">Cancel</button>
            <button onClick={submit} disabled={saving || !form.name.trim() || !form.categoryId} className="btn-primary">
              {saving ? 'Saving...' : initial ? 'Save Changes' : 'Create Project'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Category section ─────────────────────────────────────────────────────────

interface CategorySectionProps {
  category: ProjectCategory
  projects: Project[]
  onSelectProject: (p: Project) => void
  onEditProject: (p: Project, e: React.MouseEvent) => void
  onArchiveProject: (id: string, e: React.MouseEvent) => void
  onEditCategory: (c: ProjectCategory) => void
  onArchiveCategory: (c: ProjectCategory) => void
  onUnarchiveCategory: (c: ProjectCategory) => void
  isDirector: boolean
  actorId: string
}

function CategorySection({
  category, projects, onSelectProject, onEditProject, onArchiveProject,
  onEditCategory, onArchiveCategory, onUnarchiveCategory, isDirector, actorId,
}: CategorySectionProps) {
  const [expanded, setExpanded] = useState(false)
  const activeProjects = projects.filter(p => p.status === 'active')
  const archivedProjects = projects.filter(p => p.status === 'archived')
  const totalProjects = activeProjects.length + archivedProjects.length
  const isArchived = category.status === 'archived'
  const canEditCategory = isDirector && !category.isSystem && (!category.directorId || category.directorId === actorId)

  return (
    <div className={`mb-3 rounded-xl border border-tw-border bg-white shadow-sm overflow-hidden ${isArchived ? 'opacity-70' : ''}`}>
      {/* Card header — always visible, click to expand */}
      <div className="group flex items-center justify-between px-4 py-3 cursor-pointer select-none hover:bg-tw-hover transition-colors"
        onClick={() => setExpanded(e => !e)}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: category.color }} />
          <span className="font-semibold text-tw-text text-sm">{category.name}</span>
          {isArchived && (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 flex-shrink-0">Archived</span>
          )}
          <span className="text-xs text-tw-text-secondary font-normal flex-shrink-0">
            {totalProjects} project{totalProjects !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
          {canEditCategory && (
            <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all"
              onClick={e => e.stopPropagation()}>
              <button onClick={() => onEditCategory(category)}
                className="text-xs font-medium px-2.5 py-1 rounded-md bg-tw-primary/10 text-tw-primary hover:bg-tw-primary hover:text-white transition-colors">Edit</button>
              {isArchived
                ? <button onClick={() => onUnarchiveCategory(category)}
                    className="text-xs font-medium px-2.5 py-1 rounded-md bg-gray-100 text-tw-text-secondary hover:bg-tw-primary hover:text-white transition-colors">Unarchive</button>
                : <button onClick={() => onArchiveCategory(category)}
                    className="text-xs font-medium px-2.5 py-1 rounded-md bg-gray-100 text-tw-text-secondary hover:bg-tw-danger hover:text-white transition-colors">Archive</button>
              }
            </div>
          )}
          <svg className={`w-4 h-4 text-tw-text-secondary transition-transform flex-shrink-0 ${expanded ? '' : '-rotate-90'}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Card body — projects */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-tw-border/60">
          {totalProjects === 0 ? (
            <p className="text-sm text-tw-text-secondary py-3">No projects in this category.</p>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-3">
                {activeProjects.map(p => (
                  <ProjectCard key={p.id} project={p} onSelect={onSelectProject}
                    onEdit={onEditProject} onArchive={onArchiveProject}
                    canEdit={isDirector && p.directorId === actorId} />
                ))}
              </div>
              {archivedProjects.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-xs font-semibold text-tw-text-secondary uppercase tracking-wide mb-2">Archived</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {archivedProjects.map(p => (
                      <div key={p.id} className="card p-4 opacity-60">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                          <span className="font-medium text-tw-text text-sm truncate">{p.name}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ProjectManager({ onSelectProject, onSelectTask, filters, onFiltersChange, allTasks, onAllTasksLoaded, isDirector, actorId }: Props) {
  const [categories, setCategories] = useState<ProjectCategory[]>([])
  const [loading, setLoading] = useState(allTasks.length === 0)
  const [layers, setLayers] = useState<Layer[]>([])
  const [personnel, setPersonnel] = useState<Personnel[]>([])

  // Project modal
  const [showProjectModal, setShowProjectModal] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)

  // Category modal
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [editingCategory, setEditingCategory] = useState<ProjectCategory | null>(null)

  // Category management panel visibility
  const [showCategoryPanel, setShowCategoryPanel] = useState(false)

  const [error, setError] = useState('')

  const filtersActive = hasActiveFilters(filters)
  const allProjectsFlat = categories.flatMap(c => c.projects ?? [])
  const filteredTasks = filtersActive ? filterTasks(allTasks, filters, layers, personnel) : []
  const availableOptions: AvailableOptions = computeAvailableOptions(allTasks, filters, layers, personnel)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [cats, tasks] = await Promise.all([
        projectCategoryApi.list() as Promise<ProjectCategory[]>,
        taskApi.list('parentTaskId=null') as Promise<Task[]>,
      ])
      setCategories(cats)
      const projects = cats.flatMap(c => c.projects ?? [])
      onAllTasksLoaded(tasks, projects)
    } catch {
      setError('Failed to load projects')
    }
    setLoading(false)
  }

  useEffect(() => {
    if (allTasks.length === 0) load()
    else {
      // Still load categories even if tasks already cached
      projectCategoryApi.list().then(cats => setCategories(cats as ProjectCategory[])).catch(() => {})
    }
    Promise.all([
      workspaceApi.getLayers() as Promise<Layer[]>,
      workspaceApi.getPersonnel() as Promise<Personnel[]>,
    ]).then(([l, p]) => { setLayers(l); setPersonnel(p) }).catch(() => {})
  }, [])

  // ── Project actions ──────────────────────────────────────────────────────────

  const handleCreateProject = async (data: { name: string; description?: string; color: string; categoryId: string }) => {
    await projectApi.create(data)
    await load()
  }

  const handleEditProject = async (data: { name: string; description?: string; color: string; categoryId: string }) => {
    if (!editingProject) return
    await projectApi.update(editingProject.id, data)
    setEditingProject(null)
    await load()
  }

  const handleArchiveProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Archive this project?')) return
    await projectApi.update(id, { status: 'archived' })
    await load()
  }

  const openEditProject = (p: Project, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingProject(p)
  }

  // ── Category actions ─────────────────────────────────────────────────────────

  const handleCreateCategory = async (data: { name: string; description?: string; color: string }) => {
    await projectCategoryApi.create(data)
    await load()
  }

  const handleEditCategory = async (data: { name: string; description?: string; color: string }) => {
    if (!editingCategory) return
    await projectCategoryApi.update(editingCategory.id, data)
    setEditingCategory(null)
    await load()
  }

  const handleArchiveCategory = async (cat: ProjectCategory) => {
    if (!confirm(`Archive category "${cat.name}"? Projects in this category will remain accessible but cannot be assigned to archived categories.`)) return
    await projectCategoryApi.update(cat.id, { status: 'archived' })
    await load()
  }

  const handleUnarchiveCategory = async (cat: ProjectCategory) => {
    await projectCategoryApi.update(cat.id, { status: 'active' })
    await load()
  }

  // ── Derived data ─────────────────────────────────────────────────────────────

  const activeCategories = categories.filter(c => !c.isSystem && c.status === 'active')
  const archivedCategories = categories.filter(c => !c.isSystem && c.status === 'archived')
  const uncategorized = categories.find(c => c.isSystem)

  const totalActiveProjects = categories
    .flatMap(c => c.projects ?? [])
    .filter(p => p.status === 'active').length

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-tw-text">Projects</h1>
          {filtersActive
            ? <p className="text-sm text-tw-text-secondary mt-0.5">{loading ? '…' : filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''} matched</p>
            : <p className="text-sm text-tw-text-secondary mt-0.5">{totalActiveProjects} active project{totalActiveProjects !== 1 ? 's' : ''} across {activeCategories.length} categor{activeCategories.length !== 1 ? 'ies' : 'y'}</p>
          }
        </div>
        {!filtersActive && isDirector && (
          <div className="flex items-center gap-2">
            <button onClick={() => setShowCategoryPanel(p => !p)}
              className={`btn-secondary text-sm ${showCategoryPanel ? 'border-tw-primary text-tw-primary' : ''}`}>
              Categories
            </button>
            <button onClick={() => setShowProjectModal(true)} className="btn-primary">+ New Project</button>
          </div>
        )}
      </div>

      {error && <div className="mb-4 bg-red-50 border border-red-200 text-tw-danger text-sm px-3 py-2 rounded-lg">{error}</div>}

      {/* Category management panel */}
      {showCategoryPanel && isDirector && (
        <div className="mb-6 card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-tw-text">Manage Categories</h3>
            <button onClick={() => setShowCategoryModal(true)} className="btn-primary text-sm">+ New Category</button>
          </div>
          {categories.filter(c => !c.isSystem).length === 0 ? (
            <p className="text-sm text-tw-text-secondary">No categories yet. Create one to get started.</p>
          ) : (
            <div className="space-y-2">
              {[...activeCategories, ...archivedCategories].map(cat => {
                const canEditCat = !cat.directorId || cat.directorId === actorId
                return (
                <div key={cat.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-tw-hover transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-tw-text">{cat.name}</span>
                      {cat.description && <span className="text-xs text-tw-text-secondary ml-2">{cat.description}</span>}
                    </div>
                    {cat.status === 'archived' && (
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 flex-shrink-0">Archived</span>
                    )}
                    <span className="text-xs text-tw-text-secondary flex-shrink-0">
                      {(cat.projects ?? []).filter(p => p.status === 'active').length} projects
                    </span>
                  </div>
                  {canEditCat && (
                    <div className="flex items-center gap-1.5 flex-shrink-0 ml-4">
                      <button onClick={() => { setEditingCategory(cat); setShowCategoryModal(true) }}
                        className="text-xs font-medium px-2.5 py-1 rounded-md bg-tw-primary/10 text-tw-primary hover:bg-tw-primary hover:text-white transition-colors">Edit</button>
                      {cat.status === 'archived'
                        ? <button onClick={() => handleUnarchiveCategory(cat)}
                            className="text-xs font-medium px-2.5 py-1 rounded-md bg-gray-100 text-tw-text-secondary hover:bg-tw-primary hover:text-white transition-colors">Unarchive</button>
                        : <button onClick={() => handleArchiveCategory(cat)}
                            className="text-xs font-medium px-2.5 py-1 rounded-md bg-gray-100 text-tw-text-secondary hover:bg-tw-danger hover:text-white transition-colors">Archive</button>
                      }
                    </div>
                  )}
                </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      <FilterBar
        filters={filters}
        layers={layers}
        personnel={personnel}
        mode={filtersActive ? 'task' : 'project'}
        availableOptions={availableOptions}
        onChange={onFiltersChange}
      />

      {loading ? (
        <div className="text-sm text-tw-text-secondary">Loading…</div>
      ) : filtersActive ? (
        filteredTasks.length === 0 ? (
          <div className="card p-12 text-center">
            <div className="text-3xl mb-3">🔍</div>
            <p className="text-tw-text font-semibold mb-1">No tasks found</p>
            <p className="text-tw-text-secondary text-sm">No tasks match the selected filters.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTasks.map(t => <FilteredTaskCard key={t.id} task={t} onSelect={onSelectTask} />)}
          </div>
        )
      ) : allProjectsFlat.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="text-4xl mb-4">📋</div>
          <p className="text-tw-text font-semibold mb-1">No projects yet</p>
          <p className="text-tw-text-secondary text-sm mb-4">Create a category and then add your first project.</p>
          {isDirector && <button onClick={() => setShowProjectModal(true)} className="btn-primary">Create Project</button>}
        </div>
      ) : (
        <>
          {/* Active categories */}
          <div className="space-y-3">
          {activeCategories.map(cat => (
            <CategorySection key={cat.id}
              category={cat}
              projects={cat.projects ?? []}
              onSelectProject={onSelectProject}
              onEditProject={openEditProject}
              onArchiveProject={handleArchiveProject}
              onEditCategory={c => { setEditingCategory(c); setShowCategoryModal(true) }}
              onArchiveCategory={handleArchiveCategory}
              onUnarchiveCategory={handleUnarchiveCategory}
              isDirector={isDirector}
              actorId={actorId}
            />
          ))}
          </div>

          {/* Archived categories — collapsed under a disclosure */}
          {archivedCategories.length > 0 && (
            <ArchivedCategoriesGroup
              categories={archivedCategories}
              onSelectProject={onSelectProject}
              onEditProject={openEditProject}
              onArchiveProject={handleArchiveProject}
              onEditCategory={c => { setEditingCategory(c); setShowCategoryModal(true) }}
              onArchiveCategory={handleArchiveCategory}
              onUnarchiveCategory={handleUnarchiveCategory}
              isDirector={isDirector}
              actorId={actorId}
            />
          )}

          {/* Uncategorized (system) */}
          {uncategorized && (uncategorized.projects ?? []).length > 0 && (
            <div className="mt-3">
              <CategorySection key={uncategorized.id}
                category={uncategorized}
                projects={uncategorized.projects ?? []}
                onSelectProject={onSelectProject}
                onEditProject={openEditProject}
                onArchiveProject={handleArchiveProject}
                onEditCategory={() => {}}
                onArchiveCategory={() => {}}
                onUnarchiveCategory={() => {}}
                isDirector={isDirector}
                actorId={actorId}
              />
            </div>
          )}
        </>
      )}

      {/* Project create/edit modals */}
      {showProjectModal && (
        <ProjectModal
          categories={categories}
          onSave={handleCreateProject}
          onClose={() => setShowProjectModal(false)}
        />
      )}
      {editingProject && (
        <ProjectModal
          initial={editingProject}
          categories={categories}
          onSave={handleEditProject}
          onClose={() => setEditingProject(null)}
        />
      )}

      {/* Category create/edit modals */}
      {showCategoryModal && (
        <CategoryModal
          initial={editingCategory}
          onSave={editingCategory ? handleEditCategory : handleCreateCategory}
          onClose={() => { setShowCategoryModal(false); setEditingCategory(null) }}
        />
      )}
    </div>
  )
}

// ─── Archived categories group ────────────────────────────────────────────────

function ArchivedCategoriesGroup({
  categories, onSelectProject, onEditProject, onArchiveProject,
  onEditCategory, onArchiveCategory, onUnarchiveCategory, isDirector, actorId,
}: {
  categories: ProjectCategory[]
  onSelectProject: (p: Project) => void
  onEditProject: (p: Project, e: React.MouseEvent) => void
  onArchiveProject: (id: string, e: React.MouseEvent) => void
  onEditCategory: (c: ProjectCategory) => void
  onArchiveCategory: (c: ProjectCategory) => void
  onUnarchiveCategory: (c: ProjectCategory) => void
  isDirector: boolean
  actorId: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-6">
      <button
        className="flex items-center gap-2 text-xs font-semibold text-tw-text-secondary uppercase tracking-wide hover:text-tw-text transition-colors mb-3"
        onClick={() => setOpen(o => !o)}
      >
        <svg className={`w-3.5 h-3.5 transition-transform ${open ? '' : '-rotate-90'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
        Archived Categories ({categories.length})
      </button>
      {open && (
        <div className="space-y-3">
          {categories.map(cat => (
            <CategorySection key={cat.id}
              category={cat}
              projects={cat.projects ?? []}
              onSelectProject={onSelectProject}
              onEditProject={onEditProject}
              onArchiveProject={onArchiveProject}
              onEditCategory={onEditCategory}
              onArchiveCategory={onArchiveCategory}
              onUnarchiveCategory={onUnarchiveCategory}
              isDirector={isDirector}
              actorId={actorId}
            />
          ))}
        </div>
      )}
    </div>
  )
}
