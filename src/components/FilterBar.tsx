import React, { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { Layer, Task, Project, Personnel } from '../types'
import DatePicker from './DatePicker'

// ─── Types ────────────────────────────────────────────────────────────────────

export type LayerFilter = {
  layerNumber: number
  targetType: 'department' | 'personnel' | null
  targetId: string | null
}

export type ExtraFilter = {
  status: string | null
  priority: string | null
  assignedTo: string | null
  createdFrom: string | null
  createdTo: string | null
  deadlineFrom: string | null
  deadlineTo: string | null
}

export interface ActiveFilters {
  layerFilters: Record<number, LayerFilter>
  extra: ExtraFilter
}

// Available option IDs derived from currently-filtered task set, per layer number
export type AvailableOptions = {
  // layerNumber → set of available dept IDs and personnel IDs for that layer's dropdown
  layers: Record<number, { deptIds: Set<string>; personnelIds: Set<string> }>
  statuses: Set<string>
  priorities: Set<string>
}

const EMPTY_EXTRA: ExtraFilter = { status: null, priority: null, assignedTo: null, createdFrom: null, createdTo: null, deadlineFrom: null, deadlineTo: null }
export const DEFAULT_FILTERS: ActiveFilters = { layerFilters: {}, extra: EMPTY_EXTRA }

// ─── Filter logic ─────────────────────────────────────────────────────────────

function applyOneLayerFilter(tasks: Task[], lf: LayerFilter, layers: Layer[], personnel: Personnel[]): Task[] {
  const layer = layers.find(l => l.number === lf.layerNumber)
  if (!layer) return tasks
  const layerDeptIds = (layer.departments ?? []).map(d => d.id)
  return tasks.filter(task => {
    const assignments = task.assignments ?? []
    if (lf.targetType === 'personnel' && lf.targetId)
      return assignments.some(a => a.personnelId === lf.targetId)
    if (lf.targetType === 'department' && lf.targetId)
      return assignments.some(a =>
        a.departmentId === lf.targetId ||
        (a.personnelId && personnel.find(p => p.id === a.personnelId)?.departmentId === lf.targetId)
      )
    return assignments.some(a =>
      (a.departmentId && layerDeptIds.includes(a.departmentId)) ||
      (a.personnelId && layerDeptIds.includes(personnel.find(p => p.id === a.personnelId)?.departmentId ?? ''))
    )
  })
}

export function filterTasks(tasks: Task[], filters: ActiveFilters, layers: Layer[], personnel: Personnel[]): Task[] {
  let result = tasks
  const sortedLayers = Object.values(filters.layerFilters).sort((a, b) => a.layerNumber - b.layerNumber)
  for (const lf of sortedLayers) result = applyOneLayerFilter(result, lf, layers, personnel)

  const ef = filters.extra
  if (ef.status)       result = result.filter(t => t.status === ef.status)
  if (ef.priority)     result = result.filter(t => t.priority === ef.priority)
  if (ef.assignedTo)   result = result.filter(t => (t.assignments ?? []).some(a => a.personnelId === ef.assignedTo))
  if (ef.createdFrom)  result = result.filter(t => new Date(t.createdAt) >= new Date(ef.createdFrom!))
  if (ef.createdTo)    result = result.filter(t => new Date(t.createdAt) <= new Date(ef.createdTo!))
  if (ef.deadlineFrom) result = result.filter(t => t.deadline && new Date(t.deadline) >= new Date(ef.deadlineFrom!))
  if (ef.deadlineTo)   result = result.filter(t => t.deadline && new Date(t.deadline) <= new Date(ef.deadlineTo!))
  return result
}

/** Extract the dept IDs and personnel IDs that appear in a task set's assignments */
function extractAssignedIds(tasks: Task[], layers: Layer[], personnel: Personnel[], layerNumber: number): { deptIds: Set<string>; personnelIds: Set<string> } {
  const layer = layers.find(l => l.number === layerNumber)
  const layerDeptIds = new Set((layer?.departments ?? []).map(d => d.id))
  const deptIds = new Set<string>()
  const personnelIds = new Set<string>()
  for (const task of tasks) {
    for (const a of task.assignments ?? []) {
      if (a.departmentId && layerDeptIds.has(a.departmentId)) deptIds.add(a.departmentId)
      if (a.personnelId) {
        const p = personnel.find(p => p.id === a.personnelId)
        if (p && layerDeptIds.has(p.departmentId)) personnelIds.add(a.personnelId)
        // also track dept via personnel's dept
        if (p && layerDeptIds.has(p.departmentId)) deptIds.add(p.departmentId)
      }
    }
  }
  return { deptIds, personnelIds }
}

/**
 * Compute available options for each layer dropdown and for status/priority.
 * For layer N: apply all filters for layers < N, then extract which depts/personnel remain.
 * For status/priority: apply all layer filters, then extract distinct values.
 */
export function computeAvailableOptions(
  allTasks: Task[],
  filters: ActiveFilters,
  layers: Layer[],
  personnel: Personnel[]
): AvailableOptions {
  const sortedLayerNums = layers.map(l => l.number).sort((a, b) => a - b)
  const result: AvailableOptions = { layers: {}, statuses: new Set(), priorities: new Set() }

  // For each layer's dropdown: apply only the filters from earlier layers
  for (const layerNum of sortedLayerNums) {
    let tasksForLayer = allTasks
    for (const lf of Object.values(filters.layerFilters).sort((a, b) => a.layerNumber - b.layerNumber)) {
      if (lf.layerNumber >= layerNum) break
      tasksForLayer = applyOneLayerFilter(tasksForLayer, lf, layers, personnel)
    }
    result.layers[layerNum] = extractAssignedIds(tasksForLayer, layers, personnel, layerNum)
  }

  // For status/priority: apply all layer filters
  let tasksForExtra = allTasks
  for (const lf of Object.values(filters.layerFilters).sort((a, b) => a.layerNumber - b.layerNumber)) {
    tasksForExtra = applyOneLayerFilter(tasksForExtra, lf, layers, personnel)
  }
  for (const t of tasksForExtra) {
    result.statuses.add(t.status)
    result.priorities.add(t.priority)
  }

  return result
}

export function filterProjects(projects: Project[], filters: ActiveFilters): Project[] {
  const ef = filters.extra
  let result = projects
  if (ef.status && (ef.status === 'active' || ef.status === 'archived')) result = result.filter(p => p.status === ef.status)
  if (ef.createdFrom) result = result.filter(p => new Date(p.createdAt) >= new Date(ef.createdFrom!))
  if (ef.createdTo)   result = result.filter(p => new Date(p.createdAt) <= new Date(ef.createdTo!))
  return result
}

/** Build query params for server-side project filtering (layer + deadline range) */
export function buildProjectLayerParams(filters: ActiveFilters): string {
  const parts: string[] = []
  const active = Object.values(filters.layerFilters)
  if (active.length > 0) {
    const lf = active[0]
    if (lf.targetType === 'personnel' && lf.targetId) parts.push(`personnelId=${lf.targetId}`)
    else if (lf.targetType === 'department' && lf.targetId) parts.push(`departmentId=${lf.targetId}`)
    else parts.push(`layerNumber=${lf.layerNumber}`)
  }
  const ef = filters.extra
  if (ef.deadlineFrom) parts.push(`deadlineFrom=${ef.deadlineFrom}`)
  if (ef.deadlineTo)   parts.push(`deadlineTo=${ef.deadlineTo}`)
  return parts.join('&')
}

/**
 * Build query params for server-side task filtering from project page filters.
 * Cascades layer filters: picks the most specific (deepest layer) active filter.
 * Status and priority are included too so filtering is fully server-side.
 */
export function buildTaskFilterParams(filters: ActiveFilters): string {
  const parts: string[] = []

  // Pick the most specific layer filter (highest layer number = deepest)
  const layerEntries = Object.values(filters.layerFilters).sort((a, b) => b.layerNumber - a.layerNumber)
  if (layerEntries.length > 0) {
    const lf = layerEntries[0]
    if (lf.targetType === 'personnel' && lf.targetId) parts.push(`filterPersonnelId=${lf.targetId}`)
    else if (lf.targetType === 'department' && lf.targetId) parts.push(`filterDepartmentId=${lf.targetId}`)
    else parts.push(`filterLayerNumber=${lf.layerNumber}`)
  }

  const ef = filters.extra
  if (ef.status)       parts.push(`status=${ef.status}`)
  if (ef.deadlineFrom) parts.push(`deadlineFrom=${ef.deadlineFrom}`)
  if (ef.deadlineTo)   parts.push(`deadlineTo=${ef.deadlineTo}`)
  if (ef.createdFrom)  parts.push(`createdFrom=${ef.createdFrom}`)
  if (ef.createdTo)    parts.push(`createdTo=${ef.createdTo}`)

  // Only parent tasks (no group task instances) to avoid duplicates
  parts.push('parentTaskId=null')

  return parts.join('&')
}

/** Returns true if any filter is active */
export function hasActiveFilters(filters: ActiveFilters): boolean {
  const ef = filters.extra
  return Object.keys(filters.layerFilters).length > 0 ||
    !!(ef.status || ef.priority || ef.assignedTo || ef.createdFrom || ef.createdTo || ef.deadlineFrom || ef.deadlineTo)
}

// ─── Styled pill dropdown ─────────────────────────────────────────────────────

interface PillSelectProps {
  value: string
  options: { value: string; label: string }[]
  placeholder: string
  onChange: (v: string) => void
  active?: boolean
  width?: number
}

function PillSelect({ value, options, placeholder, onChange, active, width }: PillSelectProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0, w: 0, openUpward: false })
  const ref = useRef<HTMLButtonElement>(null)
  const selected = options.find(o => o.value === value)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleOpen = () => {
    if (!ref.current) return
    const r = ref.current.getBoundingClientRect()
    const dropH = Math.min(options.length * 36 + 8, 240)
    const openUpward = window.innerHeight - r.bottom < dropH + 8 && r.top > dropH + 8
    setPos({ top: openUpward ? r.top - dropH - 4 : r.bottom + 4, left: r.left, w: Math.max(r.width, width ?? 150), openUpward })
    setOpen(true)
  }

  return (
    <>
      <button ref={ref}
        onMouseDown={e => { e.preventDefault(); open ? setOpen(false) : handleOpen() }}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all whitespace-nowrap ${
          active || selected
            ? 'bg-[#f0f6ff] border-tw-primary text-tw-primary'
            : 'bg-white border-tw-border text-tw-text-secondary hover:border-tw-primary/50 hover:text-tw-text'
        }`}
      >
        {selected ? selected.label : placeholder}
        <svg className={`w-3 h-3 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && createPortal(
        <div style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.w, zIndex: 9999 }}
          className="bg-white border border-tw-border rounded-xl shadow-panel overflow-y-auto max-h-60 py-1"
          onMouseDown={e => e.preventDefault()}>
          {options.map(o => (
            <button key={o.value} onMouseDown={() => { onChange(o.value); setOpen(false) }}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-tw-hover transition-colors ${o.value === value ? 'text-tw-primary font-semibold bg-[#f0f6ff]' : 'text-tw-text'}`}>
              {o.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  )
}


function ClearPill({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-tw-border/60 hover:bg-tw-danger hover:text-white text-tw-text-secondary transition-colors text-xs font-bold flex-shrink-0"
      title="Clear">×</button>
  )
}

// ─── Per-layer filter group (single grouped dropdown) ────────────────────────

type LayerAvailable = { deptIds: Set<string>; personnelIds: Set<string> } | undefined

interface LayerGroupProps {
  layer: Layer
  filter: LayerFilter | undefined
  available: LayerAvailable
  onChange: (f: LayerFilter | null) => void
}

// Shared dropdown body rendered inside a portal for all three LayerGroup variants
function LayerDropdown({
  pos, layer, filter, available, onSelect, onClose,
}: {
  pos: { top: number; left: number; w: number }
  layer: Layer
  filter: LayerFilter | undefined
  available: LayerAvailable
  onSelect: (f: LayerFilter | null) => void
  onClose: () => void
}) {
  const depts = layer.departments ?? []

  // When available is set, filter to only items with matching tasks
  const visibleDepts = available ? depts.filter(d => available.deptIds.has(d.id)) : depts
  const visiblePeople = available
    ? depts.flatMap(d => (d.personnel ?? []).filter(p => available.personnelIds.has(p.id)).map(p => ({ p, dName: d.name })))
    : depts.flatMap(d => (d.personnel ?? []).map(p => ({ p, dName: d.name })))

  return createPortal(
    <div style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.w, zIndex: 9999 }}
      className="bg-white border border-tw-border rounded-xl shadow-panel overflow-y-auto max-h-72 py-1"
      onMouseDown={e => e.preventDefault()}>
      <button onMouseDown={() => { onSelect(null); onClose() }}
        className={`w-full text-left px-3 py-2 text-xs hover:bg-tw-hover transition-colors ${!filter ? 'text-tw-primary font-semibold bg-[#f0f6ff]' : 'text-tw-text'}`}>
        All
      </button>
      {visibleDepts.length > 0 && <>
        <div className="px-3 pt-2 pb-1"><span className="text-[10px] font-bold text-tw-text-secondary uppercase tracking-wider">Departments</span></div>
        {visibleDepts.map(d => (
          <button key={d.id} onMouseDown={() => { onSelect({ layerNumber: layer.number, targetType: 'department', targetId: d.id }); onClose() }}
            className={`w-full text-left px-3 py-2 text-xs hover:bg-tw-hover transition-colors ${filter?.targetType === 'department' && filter.targetId === d.id ? 'text-tw-primary font-semibold bg-[#f0f6ff]' : 'text-tw-text'}`}>
            {d.name}
          </button>
        ))}
      </>}
      {visiblePeople.length > 0 && <>
        <div className="px-3 pt-2 pb-1 border-t border-tw-border/30 mt-1"><span className="text-[10px] font-bold text-tw-text-secondary uppercase tracking-wider">People</span></div>
        {visiblePeople.map(({ p, dName }) => (
          <button key={p.id} onMouseDown={() => { onSelect({ layerNumber: layer.number, targetType: 'personnel', targetId: p.id }); onClose() }}
            className={`w-full text-left px-3 py-2 text-xs hover:bg-tw-hover transition-colors ${filter?.targetType === 'personnel' && filter.targetId === p.id ? 'text-tw-primary font-semibold bg-[#f0f6ff]' : 'text-tw-text'}`}>
            {p.name}<span className="ml-1.5 text-tw-text-secondary text-[10px]">· {dName}</span>
          </button>
        ))}
      </>}
    </div>,
    document.body
  )
}

function LayerGroup({ layer, filter, available, onChange }: LayerGroupProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0, w: 0 })
  const ref = useRef<HTMLButtonElement>(null)
  const depts = layer.departments ?? []

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleOpen = () => {
    if (!ref.current) return
    const r = ref.current.getBoundingClientRect()
    setPos({ top: r.bottom + 4, left: r.left, w: Math.max(r.width, 220) })
    setOpen(o => !o)
  }

  let displayLabel = 'All'
  if (filter) {
    if (filter.targetType === 'department' && filter.targetId)
      displayLabel = depts.find(d => d.id === filter.targetId)?.name ?? 'Dept'
    else if (filter.targetType === 'personnel' && filter.targetId) {
      for (const dept of depts) { const p = dept.personnel?.find(p => p.id === filter.targetId); if (p) { displayLabel = p.name; break } }
    }
  }

  return (
    <>
      <span className="text-[11px] font-semibold text-tw-text-secondary uppercase tracking-wide whitespace-nowrap self-center">{layer.name}</span>
      <div className="flex items-center gap-1.5 min-w-0">
        <button ref={ref} onMouseDown={e => { e.preventDefault(); handleOpen() }}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all whitespace-nowrap ${
            filter ? 'bg-[#f0f6ff] border-tw-primary text-tw-primary' : 'bg-white border-tw-border text-tw-text-secondary hover:border-tw-primary/50 hover:text-tw-text'
          }`}>
          {displayLabel}
          <svg className={`w-3 h-3 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {filter && <ClearPill onClick={() => onChange(null)} />}
        {open && <LayerDropdown pos={pos} layer={layer} filter={filter} available={available} onSelect={onChange} onClose={() => setOpen(false)} />}
      </div>
    </>
  )
}

// ─── Date range row ───────────────────────────────────────────────────────────

const DATE_PILL = (active: boolean) =>
  `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all whitespace-nowrap focus:outline-none ${
    active ? 'bg-[#f0f6ff] border-tw-primary text-tw-primary' : 'bg-white border-tw-border text-tw-text-secondary hover:border-tw-primary/50 hover:text-tw-text'
  }`

interface DateRangeRowProps {
  label: string
  from: string | null
  to: string | null
  onFromChange: (v: string | null) => void
  onToChange: (v: string | null) => void
}

function DateRangeRow({ label, from, to, onFromChange, onToChange }: DateRangeRowProps) {
  const isActive = !!(from || to)
  return (
    <>
      <span className="text-[11px] font-semibold text-tw-text-secondary uppercase tracking-wide whitespace-nowrap self-center">
        {label}
      </span>
      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
        <DatePicker value={from ?? ''} onChange={v => onFromChange(v || null)} placeholder="From…"
          triggerClassName={DATE_PILL(!!from)} />
        <span className="text-[11px] text-tw-text-secondary">→</span>
        <DatePicker value={to ?? ''} onChange={v => onToChange(v || null)} placeholder="To…"
          triggerClassName={DATE_PILL(!!to)} />
        {isActive && <ClearPill onClick={() => { onFromChange(null); onToChange(null) }} />}
      </div>
    </>
  )
}

// ─── Extra (refine by) filter group ──────────────────────────────────────────

interface ExtraGroupProps {
  filter: ExtraFilter
  personnel: Personnel[]
  mode: 'task' | 'project'
  availableStatuses?: Set<string>
  availablePriorities?: Set<string>
  onChange: (f: ExtraFilter) => void
}

function ExtraGroup({ filter, personnel, mode, onChange }: ExtraGroupProps) {
  const STATUS_TASK = [
    { value: 'PENDING', label: 'Pending' }, { value: 'ASSIGNED', label: 'Assigned' },
    { value: 'IN_PROGRESS', label: 'In Progress' },
    { value: 'SUBMITTED', label: 'Submitted' }, { value: 'APPROVED', label: 'Approved' },
    { value: 'RETURNED', label: 'Returned' }, { value: 'CANCELLED', label: 'Cancelled' },
  ]
  const STATUS_PROJ = [{ value: 'active', label: 'Active' }, { value: 'archived', label: 'Archived' }]
  const PRIORITY = [
    { value: 'CRITICAL', label: 'Critical' }, { value: 'HIGH', label: 'High' },
    { value: 'MEDIUM', label: 'Medium' }, { value: 'LOW', label: 'Low' },
  ]

  return (
    <>
      {/* Status */}
      <span className="text-[11px] font-semibold text-tw-text-secondary uppercase tracking-wide whitespace-nowrap self-center">Status</span>
      <div className="flex items-center gap-1.5 min-w-0">
        <PillSelect value={filter.status ?? ''} options={mode === 'task' ? STATUS_TASK : STATUS_PROJ}
          placeholder="Any" active={!!filter.status}
          onChange={v => onChange({ ...filter, status: v || null })} />
        {filter.status && <ClearPill onClick={() => onChange({ ...filter, status: null })} />}
      </div>

      <div className="col-span-2 border-t border-tw-border/30" />

      {/* Priority (tasks only) */}
      {mode === 'task' && (
        <>
          <span className="text-[11px] font-semibold text-tw-text-secondary uppercase tracking-wide whitespace-nowrap self-center">Priority</span>
          <div className="flex items-center gap-1.5 min-w-0">
            <PillSelect value={filter.priority ?? ''} options={PRIORITY}
              placeholder="Any" active={!!filter.priority}
              onChange={v => onChange({ ...filter, priority: v || null })} />
            {filter.priority && <ClearPill onClick={() => onChange({ ...filter, priority: null })} />}
          </div>
          <div className="col-span-2 border-t border-tw-border/30" />
        </>
      )}

      {/* Assigned to (tasks only) */}
      {mode === 'task' && (
        <>
          <span className="text-[11px] font-semibold text-tw-text-secondary uppercase tracking-wide whitespace-nowrap self-center">Assigned to</span>
          <div className="flex items-center gap-1.5 min-w-0">
            <PillSelect value={filter.assignedTo ?? ''} options={personnel.map(p => ({ value: p.id, label: p.name }))}
              placeholder="Anyone" active={!!filter.assignedTo} width={180}
              onChange={v => onChange({ ...filter, assignedTo: v || null })} />
            {filter.assignedTo && <ClearPill onClick={() => onChange({ ...filter, assignedTo: null })} />}
          </div>
          <div className="col-span-2 border-t border-tw-border/30" />
        </>
      )}

      {/* Deadline range (tasks: client-side; projects: server-side via buildProjectLayerParams) */}
      <DateRangeRow label="Deadline"
        from={filter.deadlineFrom} to={filter.deadlineTo}
        onFromChange={v => onChange({ ...filter, deadlineFrom: v })}
        onToChange={v => onChange({ ...filter, deadlineTo: v })}
      />
      <div className="col-span-2 border-t border-tw-border/30" />

      {/* Created date range */}
      <DateRangeRow label="Created"
        from={filter.createdFrom} to={filter.createdTo}
        onFromChange={v => onChange({ ...filter, createdFrom: v })}
        onToChange={v => onChange({ ...filter, createdTo: v })}
      />
    </>
  )
}

// ─── Desktop inline layer dropdown ───────────────────────────────────────────

function LayerGroupInline({ layer, filter, available, onChange }: LayerGroupProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0, w: 0 })
  const ref = useRef<HTMLButtonElement>(null)
  const depts = layer.departments ?? []

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  const handleOpen = () => {
    if (!ref.current) return
    const r = ref.current.getBoundingClientRect()
    setPos({ top: r.bottom + 4, left: r.left, w: Math.max(r.width, 220) })
    setOpen(o => !o)
  }

  let displayLabel = 'All'
  if (filter) {
    if (filter.targetType === 'department' && filter.targetId) displayLabel = depts.find(d => d.id === filter.targetId)?.name ?? 'Dept'
    else if (filter.targetType === 'personnel' && filter.targetId) {
      for (const dept of depts) { const p = dept.personnel?.find(p => p.id === filter.targetId); if (p) { displayLabel = p.name; break } }
    }
  }

  return (
    <div className="inline-flex items-center gap-1">
      <span className="text-[11px] font-semibold text-tw-text-secondary uppercase tracking-wide whitespace-nowrap">{layer.name}:</span>
      <button ref={ref} onMouseDown={e => { e.preventDefault(); handleOpen() }}
        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all whitespace-nowrap ${
          filter ? 'bg-[#f0f6ff] border-tw-primary text-tw-primary' : 'bg-white border-tw-border text-tw-text-secondary hover:border-tw-primary/50'
        }`}>
        {displayLabel}
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {filter && <ClearPill onClick={() => onChange(null)} />}
      {open && <LayerDropdown pos={pos} layer={layer} filter={filter} available={available} onSelect={onChange} onClose={() => setOpen(false)} />}
    </div>
  )
}

// ─── Mobile layer dropdown ────────────────────────────────────────────────────

function LayerGroupMobile({ layer, filter, available, onChange }: LayerGroupProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0, w: 0 })
  const ref = useRef<HTMLButtonElement>(null)
  const depts = layer.departments ?? []

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  const handleOpen = () => {
    if (!ref.current) return
    const r = ref.current.getBoundingClientRect()
    setPos({ top: r.bottom + 4, left: Math.max(8, r.right - 220), w: 220 })
    setOpen(o => !o)
  }

  let displayLabel = 'All'
  if (filter) {
    if (filter.targetType === 'department' && filter.targetId) displayLabel = depts.find(d => d.id === filter.targetId)?.name ?? 'Dept'
    else if (filter.targetType === 'personnel' && filter.targetId) {
      for (const dept of depts) { const p = dept.personnel?.find(p => p.id === filter.targetId); if (p) { displayLabel = p.name; break } }
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <button ref={ref} onMouseDown={e => { e.preventDefault(); handleOpen() }}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
          filter ? 'bg-[#f0f6ff] border-tw-primary text-tw-primary' : 'bg-white border-tw-border text-tw-text-secondary'
        }`}>
        {displayLabel}
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {filter && <ClearPill onClick={() => onChange(null)} />}
      {open && <LayerDropdown pos={pos} layer={layer} filter={filter} available={available} onSelect={onChange} onClose={() => setOpen(false)} />}
    </div>
  )
}

// ─── Extra filter groups (status, priority, dates) ────────────────────────────

const ALL_STATUSES = [
  { value: 'PENDING', label: 'Pending' }, { value: 'ASSIGNED', label: 'Assigned' },
  { value: 'IN_PROGRESS', label: 'In Progress' }, { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'APPROVED', label: 'Approved' }, { value: 'RETURNED', label: 'Returned' },
  { value: 'CANCELLED', label: 'Cancelled' },
]
const ALL_PRIORITIES = [
  { value: 'CRITICAL', label: 'Critical' }, { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' }, { value: 'LOW', label: 'Low' },
]
const STATUS_PROJ = [{ value: 'active', label: 'Active' }, { value: 'archived', label: 'Archived' }]

function ExtraGroupInline({ filter, personnel, mode, availableStatuses, availablePriorities, onChange }: ExtraGroupProps) {
  const DC = DATE_PILL
  const statusOpts = mode === 'task'
    ? (availableStatuses ? ALL_STATUSES.filter(s => availableStatuses.has(s.value)) : ALL_STATUSES)
    : STATUS_PROJ
  const priorityOpts = availablePriorities ? ALL_PRIORITIES.filter(p => availablePriorities.has(p.value)) : ALL_PRIORITIES

  return (
    <>
      <div className="inline-flex items-center gap-1">
        <span className="text-[11px] font-semibold text-tw-text-secondary uppercase tracking-wide whitespace-nowrap">Status:</span>
        <PillSelect value={filter.status ?? ''} options={statusOpts}
          placeholder="Any" active={!!filter.status} onChange={v => onChange({ ...filter, status: v || null })} />
        {filter.status && <ClearPill onClick={() => onChange({ ...filter, status: null })} />}
      </div>
      {mode === 'task' && <>
        <span className="self-stretch w-px bg-tw-border/50 mx-1 rounded-full" />
        <div className="inline-flex items-center gap-1">
          <span className="text-[11px] font-semibold text-tw-text-secondary uppercase tracking-wide whitespace-nowrap">Priority:</span>
          <PillSelect value={filter.priority ?? ''} options={priorityOpts}
            placeholder="Any" active={!!filter.priority} onChange={v => onChange({ ...filter, priority: v || null })} />
          {filter.priority && <ClearPill onClick={() => onChange({ ...filter, priority: null })} />}
        </div>
        <span className="self-stretch w-px bg-tw-border/50 mx-1 rounded-full" />
        <div className="inline-flex items-center gap-1">
          <span className="text-[11px] font-semibold text-tw-text-secondary uppercase tracking-wide whitespace-nowrap">Assigned:</span>
          <PillSelect value={filter.assignedTo ?? ''} options={personnel.map(p => ({ value: p.id, label: p.name }))}
            placeholder="Anyone" active={!!filter.assignedTo} width={180} onChange={v => onChange({ ...filter, assignedTo: v || null })} />
          {filter.assignedTo && <ClearPill onClick={() => onChange({ ...filter, assignedTo: null })} />}
        </div>
        <span className="self-stretch w-px bg-tw-border/50 mx-1 rounded-full" />
      </>}
      <div className="inline-flex items-center gap-1.5 flex-wrap">
        <span className="text-[11px] font-semibold text-tw-text-secondary uppercase tracking-wide whitespace-nowrap">Deadline:</span>
        <DatePicker value={filter.deadlineFrom ?? ''} onChange={v => onChange({ ...filter, deadlineFrom: v || null })} placeholder="From…" triggerClassName={DC(!!filter.deadlineFrom)} />
        <span className="text-[11px] text-tw-text-secondary">→</span>
        <DatePicker value={filter.deadlineTo ?? ''} onChange={v => onChange({ ...filter, deadlineTo: v || null })} placeholder="To…" triggerClassName={DC(!!filter.deadlineTo)} />
        {(filter.deadlineFrom || filter.deadlineTo) && <ClearPill onClick={() => onChange({ ...filter, deadlineFrom: null, deadlineTo: null })} />}
      </div>
      <span className="text-tw-border/80 text-base select-none">·</span>
      <div className="inline-flex items-center gap-1.5 flex-wrap">
        <span className="text-[11px] font-semibold text-tw-text-secondary uppercase tracking-wide whitespace-nowrap">Created:</span>
        <DatePicker value={filter.createdFrom ?? ''} onChange={v => onChange({ ...filter, createdFrom: v || null })} placeholder="From…" triggerClassName={DC(!!filter.createdFrom)} />
        <span className="text-[11px] text-tw-text-secondary">→</span>
        <DatePicker value={filter.createdTo ?? ''} onChange={v => onChange({ ...filter, createdTo: v || null })} placeholder="To…" triggerClassName={DC(!!filter.createdTo)} />
        {(filter.createdFrom || filter.createdTo) && <ClearPill onClick={() => onChange({ ...filter, createdFrom: null, createdTo: null })} />}
      </div>
    </>
  )
}

function ExtraGroupMobile({ filter, personnel, mode, availableStatuses, availablePriorities, onChange }: ExtraGroupProps) {
  const DC = DATE_PILL
  const statusOpts = mode === 'task'
    ? (availableStatuses ? ALL_STATUSES.filter(s => availableStatuses.has(s.value)) : ALL_STATUSES)
    : STATUS_PROJ
  const priorityOpts = availablePriorities ? ALL_PRIORITIES.filter(p => availablePriorities.has(p.value)) : ALL_PRIORITIES

  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] font-semibold text-tw-text-secondary uppercase tracking-wide whitespace-nowrap flex-shrink-0">{label}</span>
      <div className="flex items-center gap-1.5 justify-end flex-wrap">{children}</div>
    </div>
  )

  return (
    <>
      <Row label="Status">
        <PillSelect value={filter.status ?? ''} options={statusOpts}
          placeholder="Any" active={!!filter.status} onChange={v => onChange({ ...filter, status: v || null })} />
        {filter.status && <ClearPill onClick={() => onChange({ ...filter, status: null })} />}
      </Row>
      {mode === 'task' && <>
        <div className="border-t border-tw-border/30" />
        <Row label="Priority">
          <PillSelect value={filter.priority ?? ''} options={priorityOpts}
            placeholder="Any" active={!!filter.priority} onChange={v => onChange({ ...filter, priority: v || null })} />
          {filter.priority && <ClearPill onClick={() => onChange({ ...filter, priority: null })} />}
        </Row>
        <div className="border-t border-tw-border/30" />
        <Row label="Assigned to">
          <PillSelect value={filter.assignedTo ?? ''} options={personnel.map(p => ({ value: p.id, label: p.name }))}
            placeholder="Anyone" active={!!filter.assignedTo} width={180} onChange={v => onChange({ ...filter, assignedTo: v || null })} />
          {filter.assignedTo && <ClearPill onClick={() => onChange({ ...filter, assignedTo: null })} />}
        </Row>
      </>}
      <div className="border-t border-tw-border/30" />
      <Row label="Deadline">
        <DatePicker value={filter.deadlineFrom ?? ''} onChange={v => onChange({ ...filter, deadlineFrom: v || null })} placeholder="From…" triggerClassName={DC(!!filter.deadlineFrom)} />
        <span className="text-[11px] text-tw-text-secondary">→</span>
        <DatePicker value={filter.deadlineTo ?? ''} onChange={v => onChange({ ...filter, deadlineTo: v || null })} placeholder="To…" triggerClassName={DC(!!filter.deadlineTo)} />
        {(filter.deadlineFrom || filter.deadlineTo) && <ClearPill onClick={() => onChange({ ...filter, deadlineFrom: null, deadlineTo: null })} />}
      </Row>
      <div className="border-t border-tw-border/30" />
      <Row label="Created">
        <DatePicker value={filter.createdFrom ?? ''} onChange={v => onChange({ ...filter, createdFrom: v || null })} placeholder="From…" triggerClassName={DC(!!filter.createdFrom)} />
        <span className="text-[11px] text-tw-text-secondary">→</span>
        <DatePicker value={filter.createdTo ?? ''} onChange={v => onChange({ ...filter, createdTo: v || null })} placeholder="To…" triggerClassName={DC(!!filter.createdTo)} />
        {(filter.createdFrom || filter.createdTo) && <ClearPill onClick={() => onChange({ ...filter, createdFrom: null, createdTo: null })} />}
      </Row>
    </>
  )
}

// ─── Main FilterBar ───────────────────────────────────────────────────────────

interface FilterBarProps {
  filters: ActiveFilters
  layers: Layer[]
  personnel: Personnel[]
  mode: 'task' | 'project'
  availableOptions?: AvailableOptions
  onChange: (f: ActiveFilters) => void
}

export default function FilterBar({ filters, layers, personnel, mode, availableOptions, onChange }: FilterBarProps) {
  const [expanded, setExpanded] = useState(false)

  const activeLayerCount = Object.keys(filters.layerFilters).length
  const ef = filters.extra
  const extraActive = [ef.status, ef.priority, ef.assignedTo, ef.createdFrom, ef.createdTo, ef.deadlineFrom, ef.deadlineTo].filter(Boolean).length
  const isActive = activeLayerCount > 0 || extraActive > 0
  const activeCount = activeLayerCount + (extraActive > 0 ? 1 : 0)

  const clearAll = () => onChange(DEFAULT_FILTERS)

  const setLayerFilter = (layerNumber: number, lf: LayerFilter | null) => {
    // When clearing or changing a layer filter, also clear all deeper layer filters
    const next: Record<number, LayerFilter> = {}
    for (const [num, f] of Object.entries(filters.layerFilters)) {
      if (Number(num) < layerNumber) next[Number(num)] = f
    }
    if (lf !== null) next[layerNumber] = lf
    onChange({ ...filters, layerFilters: next })
  }

  return (
    <div className="mb-5">
      <div className="flex items-center gap-2">
        <button onClick={() => setExpanded(e => !e)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
            isActive ? 'bg-[#f0f6ff] border-tw-primary text-tw-primary' : 'bg-white border-tw-border text-tw-text-secondary hover:border-tw-primary/50 hover:text-tw-text'
          }`}>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18M7 8h10M10 12h4" />
          </svg>
          Filter
          {isActive && <span className="bg-tw-primary text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold leading-none">{activeCount}</span>}
          <svg className={`w-3 h-3 flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {isActive && !expanded && <button onClick={clearAll} className="text-xs text-tw-text-secondary hover:text-tw-danger transition-colors">Clear all</button>}
      </div>

      {/* Desktop: horizontal inline chips */}
      {expanded && (
        <div className="hidden md:block mt-3 px-4 py-3 bg-[#f8f9ff] border border-tw-border/60 rounded-xl">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
            {layers.map(layer => (
              <React.Fragment key={layer.id}>
                <LayerGroupInline layer={layer} filter={filters.layerFilters[layer.number]}
                  available={availableOptions?.layers[layer.number]}
                  onChange={lf => setLayerFilter(layer.number, lf)} />
                <span className="self-stretch w-px bg-tw-border/50 mx-1 rounded-full" />
              </React.Fragment>
            ))}
            <ExtraGroupInline filter={filters.extra} personnel={personnel} mode={mode}
              availableStatuses={availableOptions?.statuses}
              availablePriorities={availableOptions?.priorities}
              onChange={f => onChange({ ...filters, extra: f })} />
            {isActive && <>
              <span className="self-stretch w-px bg-tw-border/50 mx-1 rounded-full" />
              <button onClick={clearAll} className="text-xs text-tw-text-secondary hover:text-tw-danger transition-colors whitespace-nowrap">Clear all</button>
            </>}
          </div>
        </div>
      )}

      {/* Mobile: bottom sheet */}
      {expanded && createPortal(
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setExpanded(false)} />
          <div className="relative bg-white rounded-t-2xl shadow-xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-tw-border flex-shrink-0">
              <span className="font-semibold text-sm text-tw-text">Filters</span>
              <div className="flex items-center gap-3">
                {isActive && <button onClick={clearAll} className="text-xs text-tw-danger font-medium">Clear all</button>}
                <button onClick={() => setExpanded(false)} className="text-tw-text-secondary text-xl leading-none">×</button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 px-4 py-4 space-y-4">
              {layers.map((layer, i) => (
                <React.Fragment key={layer.id}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] font-semibold text-tw-text-secondary uppercase tracking-wide whitespace-nowrap flex-shrink-0">{layer.name}</span>
                    <div className="flex justify-end">
                      <LayerGroupMobile layer={layer} filter={filters.layerFilters[layer.number]}
                        available={availableOptions?.layers[layer.number]}
                        onChange={lf => setLayerFilter(layer.number, lf)} />
                    </div>
                  </div>
                  {i < layers.length - 1 && <div className="border-t border-tw-border/30" />}
                </React.Fragment>
              ))}
              {layers.length > 0 && <div className="border-t border-tw-border/30" />}
              <ExtraGroupMobile filter={filters.extra} personnel={personnel} mode={mode}
                availableStatuses={availableOptions?.statuses}
                availablePriorities={availableOptions?.priorities}
                onChange={f => onChange({ ...filters, extra: f })} />
            </div>
            <div className="px-4 py-3 border-t border-tw-border flex-shrink-0">
              <button onClick={() => setExpanded(false)} className="w-full btn-primary text-sm py-2.5">Done</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
