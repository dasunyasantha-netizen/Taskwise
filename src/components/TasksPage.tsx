import React, { useState, useEffect } from 'react'
import type { Task, Layer, Personnel } from '../types'
import { taskApi, workspaceApi } from '../services/apiService'
import FilterBar, { PillSelect, filterTasks, computeAvailableOptions, hasActiveFilters } from './FilterBar'
import type { ActiveFilters, AvailableOptions } from './FilterBar'
import { Icon } from './ui/Icon'
import { PageHeader, EmptyState, LoadingBlock } from './ui/Primitives'

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
  PENDING:     'badge-gray',
  ASSIGNED:    'badge-primary',
  IN_PROGRESS: 'badge-warning',
  BLOCKED:     'badge-teal',
  SUBMITTED:   'badge-purple',
  APPROVED:    'badge-success',
  RETURNED:    'badge bg-orange-50 text-orange-700 ring-orange-200/70',
  REJECTED:    'badge-danger',
  CANCELLED:   'badge-danger',
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending', ASSIGNED: 'Assigned', IN_PROGRESS: 'In Progress',
  BLOCKED: 'Blocked',
  SUBMITTED: 'Submitted', APPROVED: 'Approved', RETURNED: 'Returned',
  REJECTED: 'Rejected', CANCELLED: 'Cancelled',
}

const STATUS_DOTS: Record<string, string> = {
  PENDING: 'bg-gray-400', ASSIGNED: 'bg-blue-500', IN_PROGRESS: 'bg-yellow-500',
  BLOCKED: 'bg-teal-500',
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
      className={`flex items-center gap-2.5 px-3 py-2 ${onSelect ? 'cursor-pointer hover:bg-tw-primary/[0.05]' : ''} transition-colors`}
    >
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOTS[task.status] ?? 'bg-gray-400'}`} />
      <span className="text-xs font-medium text-tw-text truncate flex-1 min-w-0">{task.title}</span>
      <span className="text-[11px] text-tw-text-secondary truncate max-w-[40%] inline-flex items-center gap-1">
        <Icon name={kind === 'member' ? 'user' : 'arrowRight'} className="w-3 h-3 flex-shrink-0" />{assignee}
      </span>
      <span className={`badge text-[10px] flex-shrink-0 ${STATUS_STYLES[task.status] ?? 'badge-gray'}`}>
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
    <div className="card overflow-hidden hover:border-tw-border-strong transition-colors">
      <div className="flex items-stretch">
        {/* Project colour strip */}
        <div
          className="w-1.5 flex-shrink-0"
          style={{ backgroundColor: task.project?.color ?? NO_PROJECT_COLOR }}
          title={task.project?.name ?? 'No project'}
        />
        <div className="flex-1 min-w-0">
          {/* Card face — title only; everything else lives in the expansion */}
          <div
            onClick={toggle}
            className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-tw-hover transition-colors"
          >
            <span className="font-medium text-tw-text text-sm truncate flex-1 min-w-0">{task.title}</span>
            {childCount > 0 && (
              <span className="badge badge-gray flex-shrink-0" title="Subtasks & group members"><Icon name="layers" className="w-3 h-3" />{childCount}</span>
            )}
            {onSelect && (
              <button
                onClick={e => { e.stopPropagation(); onSelect(task) }}
                className="flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-lg bg-tw-primary/10 text-tw-primary-text hover:bg-tw-primary hover:text-white transition-colors whitespace-nowrap"
              >
                Open task
              </button>
            )}
            <Icon name="chevronDown" className={`w-4 h-4 flex-shrink-0 text-tw-text-secondary transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
          </div>

          {/* Breakdown — details, then subtasks and group member instances */}
          {expanded && (
            <div className="border-t border-tw-border bg-tw-primary/[0.03]">
              {/* Details */}
              <div className="px-4 py-3 space-y-2.5">
                {task.description && (
                  <p className="text-xs text-tw-text leading-relaxed whitespace-pre-wrap line-clamp-4">{task.description}</p>
                )}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-tw-text-secondary">
                  <span className={`badge ${STATUS_STYLES[task.status] ?? 'badge-gray'}`}>
                    {STATUS_LABELS[task.status] ?? task.status}
                  </span>
                  <span className={`font-semibold ${PRIORITY_STYLES[task.priority] ?? 'text-gray-400'}`} title="Priority">
                    {PRIORITY_MARK[task.priority] ?? '–'} {task.priority}
                  </span>
                  {task.project && <span className="truncate max-w-[45%]">{task.project.name}</span>}
                  {instances.length > 0
                    ? <span className="inline-flex items-center gap-1"><Icon name="users" className="w-3.5 h-3.5" /> Group · {instances.length} member{instances.length !== 1 ? 's' : ''}</span>
                    : assignee && <span className="truncate max-w-[45%] inline-flex items-center gap-1"><Icon name="user" className="w-3.5 h-3.5 flex-shrink-0" /> {assignee}</span>
                  }
                  <span>Created {shortDate(task.createdAt)}</span>
                  {task.deadline && (
                    <span className={overdue ? 'text-tw-danger font-semibold' : ''}>
                      {overdue ? 'Overdue · ' : 'Due '}{shortDate(task.deadline)}
                    </span>
                  )}
                </div>
              </div>

              {instances.length > 0 && (
                <div className="divide-y divide-tw-border/60 border-t border-tw-border/60">
                  <div className="px-4 pt-2.5 pb-1 section-label">
                    Group members ({instances.length})
                  </div>
                  {instances.map(i => <ChildTaskRow key={i.id} task={i} kind="member" onSelect={onSelect} />)}
                </div>
              )}
              {subtaskCount > 0 && (
                <div className="divide-y divide-tw-border/60 border-t border-tw-border/60">
                  <div className="px-4 pt-2.5 pb-1 section-label">
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

  // Completed/dead work is hidden by default; users can opt each status back in.
  // Reset on every mount so a fresh visit never surfaces Approved/Cancelled (req #1).
  const [includeApproved,  setIncludeApproved]  = useState(false)
  const [includeCancelled, setIncludeCancelled] = useState(false)

  // Statuses to omit from the server fetch. Picking a status explicitly in the
  // filter (e.g. "Approved") re-includes it so the query can actually return it.
  const excludedStatuses = [
    ...(!includeApproved  && filters.extra.status !== 'APPROVED'  ? ['APPROVED']  : []),
    ...(!includeCancelled && filters.extra.status !== 'CANCELLED' ? ['CANCELLED'] : []),
  ]
  const fetchParams = 'parentTaskId=null'
    + (excludedStatuses.length ? `&excludeStatus=${excludedStatuses.join(',')}` : '')

  // Reloads on mount, whenever the parent bumps refreshKey (e.g. after a task
  // action in the detail panel), and whenever the default-exclusion changes so
  // the API — not just the UI — drops Approved/Cancelled (req: query layer).
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        // Top-level tasks only; subtasks are loaded on demand when a card expands.
        const list = await taskApi.list(fetchParams) as Task[]
        if (!cancelled) setTasks(list)
      } catch {
        if (!cancelled) setError('Failed to load tasks')
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [refreshKey, fetchParams])

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
    <div className="page">
      <PageHeader icon="tasks" tone="indigo" title="Tasks"
        subtitle={<>
          {loading ? '…' : `${visible.length} task${visible.length !== 1 ? 's' : ''}`}
          {!loading && filtersActive && tasks.length !== visible.length ? ` of ${tasks.length}` : ''}
        </>}
        actions={<div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="hidden md:inline section-label whitespace-nowrap">Sort</span>
          <PillSelect
            value={sort}
            options={SORT_OPTIONS}
            placeholder="Sort"
            active={sort !== DEFAULT_TASK_SORT}
            width={200}
            onChange={v => onSortChange((v || DEFAULT_TASK_SORT) as TaskSort)}
          />
        </div>} />

      {error && <div className="mb-4 alert-error">{error}</div>}

      <FilterBar
        filters={filters}
        layers={layers}
        personnel={personnel}
        mode="task"
        availableOptions={availableOptions}
        onChange={onFiltersChange}
      />

      {/* Approved / Cancelled are hidden by default — opt them back in here. */}
      <div className="flex items-center gap-2 flex-wrap mt-3 mb-3">
        <span className="section-label">Include</span>
        <button
          type="button"
          aria-pressed={includeApproved}
          onClick={() => setIncludeApproved(v => !v)}
          className={`chip ${includeApproved ? 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:text-emerald-700' : ''}`}
        >
          {includeApproved && <Icon name="check" className="w-3.5 h-3.5" />}Approved
        </button>
        <button
          type="button"
          aria-pressed={includeCancelled}
          onClick={() => setIncludeCancelled(v => !v)}
          className={`chip ${includeCancelled ? 'bg-rose-50 border-rose-300 text-rose-700 hover:text-rose-700' : ''}`}
        >
          {includeCancelled && <Icon name="check" className="w-3.5 h-3.5" />}Cancelled
        </button>
        <span className="text-[11px] text-tw-text-muted hidden sm:inline">
          Hidden by default
        </span>
      </div>

      {loading ? (
        <LoadingBlock />
      ) : visible.length === 0 ? (
        <div className="card">
          <EmptyState icon={filtersActive ? 'search' : 'tasks'}
            title={filtersActive ? 'No tasks found' : 'No tasks yet'}
            text={filtersActive ? 'No tasks match the selected filters.' : 'Tasks created in your projects will appear here.'} />
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
