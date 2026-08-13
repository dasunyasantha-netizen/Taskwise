import React, { useState, useEffect } from 'react'
import type { Task, Layer, Personnel } from '../types'
import { taskApi, workspaceApi } from '../services/apiService'
import FilterBar, { PillSelect, filterTasks, computeAvailableOptions, hasActiveFilters } from './FilterBar'
import type { ActiveFilters, AvailableOptions } from './FilterBar'

// ─── Sorting ──────────────────────────────────────────────────────────────────

export type TaskSort =
  | 'created_desc' | 'created_asc'
  | 'deadline_asc' | 'deadline_desc'
  | 'updated_desc' | 'updated_asc'

export const DEFAULT_TASK_SORT: TaskSort = 'created_desc'

const SORT_OPTIONS: { value: TaskSort; label: string }[] = [
  { value: 'created_desc',  label: 'Created · Newest first' },
  { value: 'created_asc',   label: 'Created · Oldest first' },
  { value: 'deadline_asc',  label: 'Deadline · Earliest first' },
  { value: 'deadline_desc', label: 'Deadline · Latest first' },
  { value: 'updated_desc',  label: 'Updated · Most recent' },
  { value: 'updated_asc',   label: 'Updated · Least recent' },
]

const time = (v?: string | null) => (v ? new Date(v).getTime() : null)

function sortTasks(tasks: Task[], sort: TaskSort): Task[] {
  const sorted = [...tasks]
  switch (sort) {
    case 'created_asc':
      return sorted.sort((a, b) => (time(a.createdAt) ?? 0) - (time(b.createdAt) ?? 0))
    case 'updated_desc':
      return sorted.sort((a, b) => (time(b.updatedAt) ?? 0) - (time(a.updatedAt) ?? 0))
    case 'updated_asc':
      return sorted.sort((a, b) => (time(a.updatedAt) ?? 0) - (time(b.updatedAt) ?? 0))
    // Tasks without a deadline sort to the end in both directions
    case 'deadline_asc':
    case 'deadline_desc':
      return sorted.sort((a, b) => {
        const da = time(a.deadline), db = time(b.deadline)
        if (da === null && db === null) return (time(b.createdAt) ?? 0) - (time(a.createdAt) ?? 0)
        if (da === null) return 1
        if (db === null) return -1
        return sort === 'deadline_asc' ? da - db : db - da
      })
    case 'created_desc':
    default:
      return sorted.sort((a, b) => (time(b.createdAt) ?? 0) - (time(a.createdAt) ?? 0))
  }
}

// ─── Shared status / priority styling (matches the Projects page) ─────────────

const STATUS_STYLES: Record<string, string> = {
  PENDING:     'bg-gray-100 text-gray-600',
  ASSIGNED:    'bg-blue-50 text-blue-700',
  IN_PROGRESS: 'bg-yellow-50 text-yellow-700',
  SUBMITTED:   'bg-purple-50 text-purple-700',
  APPROVED:    'bg-green-50 text-green-700',
  RETURNED:    'bg-orange-50 text-orange-700',
  REJECTED:    'bg-red-50 text-red-600',
  CANCELLED:   'bg-red-50 text-red-500',
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending', ASSIGNED: 'Assigned', IN_PROGRESS: 'In Progress',
  SUBMITTED: 'Submitted', APPROVED: 'Approved', RETURNED: 'Returned',
  REJECTED: 'Rejected', CANCELLED: 'Cancelled',
}

const STATUS_DOTS: Record<string, string> = {
  PENDING: 'bg-gray-400', ASSIGNED: 'bg-blue-500', IN_PROGRESS: 'bg-yellow-500',
  SUBMITTED: 'bg-purple-500', APPROVED: 'bg-green-500', RETURNED: 'bg-orange-400',
  REJECTED: 'bg-red-500', CANCELLED: 'bg-gray-300',
}

const PRIORITY_STYLES: Record<string, string> = {
  CRITICAL: 'text-red-600', HIGH: 'text-orange-500', MEDIUM: 'text-yellow-600', LOW: 'text-gray-400',
}

const PRIORITY_MARK: Record<string, string> = {
  CRITICAL: '!!', HIGH: '!', MEDIUM: '·', LOW: '–',
}

const NO_PROJECT_COLOR = '#c9ccd6'

const shortDate = (v: string) => new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

const isOverdue = (t: Task) =>
  !!t.deadline && t.status !== 'APPROVED' && t.status !== 'CANCELLED' && new Date(t.deadline) < new Date()

const assigneeLabel = (t: Task): string | null => {
  const a = t.assignments?.[0]
  if (!a) return null
  const name = a.personnel?.name || a.department?.name
  if (!name) return null
  const extra = (t.assignments?.length ?? 0) - 1
  return extra > 0 ? `${name} +${extra}` : name
}

// ─── Child row (subtask / group instance) ─────────────────────────────────────

function ChildTaskRow({ task, kind, onSelect }: { task: Task; kind: 'subtask' | 'member'; onSelect?: (t: Task) => void }) {
  const assignee = assigneeLabel(task) ?? '—'
  return (
    <div
      onClick={() => onSelect?.(task)}
      className={`flex items-center gap-2.5 px-3 py-2 ${onSelect ? 'cursor-pointer hover:bg-blue-50' : ''} transition-colors`}
    >
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOTS[task.status] ?? 'bg-gray-400'}`} />
      <span className="text-xs font-medium text-tw-text truncate flex-1 min-w-0">{task.title}</span>
      <span className="text-[11px] text-tw-text-secondary truncate max-w-[40%]">
        {kind === 'member' ? '👤 ' : '→ '}{assignee}
      </span>
      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_STYLES[task.status] ?? 'bg-gray-100 text-gray-600'}`}>
        {STATUS_LABELS[task.status] ?? task.status}
      </span>
      {task.deadline && (
        <span className={`text-[11px] flex-shrink-0 whitespace-nowrap ${isOverdue(task) ? 'text-tw-danger font-semibold' : 'text-tw-text-secondary'}`}>
          {new Date(task.deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
        </span>
      )}
    </div>
  )
}

// ─── Task card ────────────────────────────────────────────────────────────────

function TaskCard({ task, instances, onSelect }: { task: Task; instances: Task[]; onSelect?: (t: Task) => void }) {
  const [expanded, setExpanded] = useState(false)
  const [subtasks, setSubtasks] = useState<Task[]>([])
  const [loadingSubs, setLoadingSubs] = useState(false)

  const subtaskCount = task._count?.subtasks ?? 0
  const expandable   = subtaskCount > 0 || instances.length > 0
  const childCount   = subtaskCount + instances.length
  const overdue      = isOverdue(task)
  const assignee     = assigneeLabel(task)

  const toggle = async () => {
    const next = !expanded
    setExpanded(next)
    if (next && subtaskCount > 0 && subtasks.length === 0) {
      setLoadingSubs(true)
      try { setSubtasks(await taskApi.subtasks(task.id) as Task[]) }
      catch { /* leave empty — the card still shows group members */ }
      setLoadingSubs(false)
    }
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-stretch">
        {/* Project colour strip */}
        <div
          className="w-1.5 flex-shrink-0"
          style={{ backgroundColor: task.project?.color ?? NO_PROJECT_COLOR }}
          title={task.project?.name ?? 'No project'}
        />
        <div className="flex-1 min-w-0">
          <div
            onClick={() => onSelect?.(task)}
            className={`flex items-center gap-3 px-3 py-2.5 ${onSelect ? 'cursor-pointer hover:bg-tw-hover' : ''} transition-colors`}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`text-xs font-bold flex-shrink-0 ${PRIORITY_STYLES[task.priority] ?? 'text-gray-400'}`}
                  title={task.priority}>
                  {PRIORITY_MARK[task.priority] ?? '–'}
                </span>
                <span className="font-medium text-tw-text text-sm truncate">{task.title}</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 mt-0.5 text-[11px] text-tw-text-secondary">
                {task.project && (
                  <span className="truncate max-w-[45%]">{task.project.name}</span>
                )}
                {instances.length > 0
                  ? <span>👥 Group · {instances.length} member{instances.length !== 1 ? 's' : ''}</span>
                  : assignee && <span className="truncate max-w-[45%]">👤 {assignee}</span>
                }
                <span>Created {shortDate(task.createdAt)}</span>
                {task.deadline && (
                  <span className={overdue ? 'text-tw-danger font-semibold' : ''}>
                    {overdue ? 'Overdue · ' : 'Due '}{shortDate(task.deadline)}
                  </span>
                )}
              </div>
            </div>

            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_STYLES[task.status] ?? 'bg-gray-100 text-gray-600'}`}>
              {STATUS_LABELS[task.status] ?? task.status}
            </span>

            {expandable && (
              <button
                onClick={e => { e.stopPropagation(); toggle() }}
                className="flex items-center gap-1 flex-shrink-0 text-tw-text-secondary hover:text-tw-primary transition-colors p-1 rounded-md"
                title={expanded ? 'Hide breakdown' : `Show ${childCount} item${childCount !== 1 ? 's' : ''}`}
              >
                <span className="text-[11px] font-semibold">{childCount}</span>
                <svg className={`w-4 h-4 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            )}
          </div>

          {/* Breakdown — subtasks and group member instances */}
          {expanded && (
            <div className="border-t border-tw-border bg-[#f8f9ff]">
              {instances.length > 0 && (
                <div className="divide-y divide-tw-border/60">
                  <div className="px-3 pt-2 pb-1 text-[10px] font-bold text-tw-text-secondary uppercase tracking-wider">
                    Group members ({instances.length})
                  </div>
                  {instances.map(i => <ChildTaskRow key={i.id} task={i} kind="member" onSelect={onSelect} />)}
                </div>
              )}
              {subtaskCount > 0 && (
                <div className="divide-y divide-tw-border/60">
                  <div className="px-3 pt-2 pb-1 text-[10px] font-bold text-tw-text-secondary uppercase tracking-wider">
                    Subtasks ({subtaskCount})
                  </div>
                  {loadingSubs
                    ? <div className="px-3 py-2 text-xs text-tw-text-secondary">Loading…</div>
                    : subtasks.length === 0
                      ? <div className="px-3 py-2 text-xs text-tw-text-secondary italic">Could not load subtasks.</div>
                      : subtasks.map(s => <ChildTaskRow key={s.id} task={s} kind="subtask" onSelect={onSelect} />)
                  }
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

interface Props {
  filters: ActiveFilters
  onFiltersChange: (f: ActiveFilters) => void
  sort: TaskSort
  onSortChange: (s: TaskSort) => void
  onSelectTask?: (t: Task) => void
  /** Bumped by the parent after a task action so the list reloads. */
  refreshKey?: number
}

export default function TasksPage({ filters, onFiltersChange, sort, onSortChange, onSelectTask, refreshKey = 0 }: Props) {
  const [tasks, setTasks]         = useState<Task[]>([])
  const [layers, setLayers]       = useState<Layer[]>([])
  const [personnel, setPersonnel] = useState<Personnel[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')

  // Reloads on mount and whenever the parent bumps refreshKey (e.g. after a
  // task action in the detail panel).
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setError('')
      try {
        // Top-level tasks only; subtasks are loaded on demand when a card expands.
        const list = await taskApi.list('parentTaskId=null') as Task[]
        if (!cancelled) setTasks(list)
      } catch {
        if (!cancelled) setError('Failed to load tasks')
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [refreshKey])

  useEffect(() => {
    Promise.all([
      workspaceApi.getLayers() as Promise<Layer[]>,
      workspaceApi.getPersonnel() as Promise<Personnel[]>,
    ]).then(([l, p]) => { setLayers(l); setPersonnel(p) }).catch(() => {})
  }, [])

  const filtersActive    = hasActiveFilters(filters)
  const filtered         = filtersActive ? filterTasks(tasks, filters, layers, personnel) : tasks
  const availableOptions: AvailableOptions = computeAvailableOptions(tasks, filters, layers, personnel)

  // Group-task member instances are nested inside their parent card. Keep an instance
  // at the top level only when its parent isn't in the current result set (e.g. when
  // filtering by an assignee that only the instance matches).
  const matchedIds  = new Set(filtered.map(t => t.id))
  const instancesBy = new Map<string, Task[]>()
  for (const t of tasks) {
    if (!t.groupTaskId) continue
    const arr = instancesBy.get(t.groupTaskId) ?? []
    arr.push(t)
    instancesBy.set(t.groupTaskId, arr)
  }
  const visible = sortTasks(
    filtered.filter(t => !t.groupTaskId || !matchedIds.has(t.groupTaskId)),
    sort
  )

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-start justify-between gap-3 mb-4 md:mb-6">
        <div>
          <h1 className="text-xl font-bold text-tw-text">Tasks</h1>
          <p className="text-sm text-tw-text-secondary mt-0.5">
            {loading ? '…' : `${visible.length} task${visible.length !== 1 ? 's' : ''}`}
            {!loading && filtersActive && tasks.length !== visible.length ? ` of ${tasks.length}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="hidden md:inline text-[11px] font-semibold text-tw-text-secondary uppercase tracking-wide whitespace-nowrap">Sort</span>
          <PillSelect
            value={sort}
            options={SORT_OPTIONS}
            placeholder="Sort"
            active={sort !== DEFAULT_TASK_SORT}
            width={200}
            onChange={v => onSortChange((v || DEFAULT_TASK_SORT) as TaskSort)}
          />
        </div>
      </div>

      {error && <div className="mb-4 bg-red-50 border border-red-200 text-tw-danger text-sm px-3 py-2 rounded-lg">{error}</div>}

      <FilterBar
        filters={filters}
        layers={layers}
        personnel={personnel}
        mode="task"
        availableOptions={availableOptions}
        onChange={onFiltersChange}
      />

      {loading ? (
        <div className="text-sm text-tw-text-secondary">Loading…</div>
      ) : visible.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="text-3xl mb-3">{filtersActive ? '🔍' : '✓'}</div>
          <p className="text-tw-text font-semibold mb-1">{filtersActive ? 'No tasks found' : 'No tasks yet'}</p>
          <p className="text-tw-text-secondary text-sm">
            {filtersActive ? 'No tasks match the selected filters.' : 'Tasks created in your projects will appear here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map(t => (
            <TaskCard key={t.id} task={t} instances={instancesBy.get(t.id) ?? []} onSelect={onSelectTask} />
          ))}
        </div>
      )}
    </div>
  )
}
