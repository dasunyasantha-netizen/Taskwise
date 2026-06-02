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

const EMPTY_EXTRA: ExtraFilter = { status: null, priority: null, assignedTo: null, createdFrom: null, createdTo: null, deadlineFrom: null, deadlineTo: null }
export const DEFAULT_FILTERS: ActiveFilters = { layerFilters: {}, extra: EMPTY_EXTRA }

// ─── Filter logic ─────────────────────────────────────────────────────────────

export function filterTasks(tasks: Task[], filters: ActiveFilters, layers: Layer[], personnel: Personnel[]): Task[] {
  let result = tasks

  for (const lf of Object.values(filters.layerFilters)) {
    const layer = layers.find(l => l.number === lf.layerNumber)
    if (!layer) continue
    const layerDeptIds = (layer.departments ?? []).map(d => d.id)

    result = result.filter(task => {
      const assignments = task.assignments ?? []
      if (lf.targetType === 'personnel' && lf.targetId) {
        return assignments.some(a => a.personnelId === lf.targetId)
      }
      if (lf.targetType === 'department' && lf.targetId) {
        return assignments.some(a =>
          a.departmentId === lf.targetId ||
          (a.personnelId && personnel.find(p => p.id === a.personnelId)?.departmentId === lf.targetId)
        )
      }
      return assignments.some(a =>
        (a.departmentId && layerDeptIds.includes(a.departmentId)) ||
        (a.personnelId && layerDeptIds.includes(personnel.find(p => p.id === a.personnelId)?.departmentId ?? ''))
      )
    })
  }

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

interface LayerGroupProps {
  layer: Layer
  filter: LayerFilter | undefined
  onChange: (f: LayerFilter | null) => void
}

function LayerGroup({ layer, filter, onChange }: LayerGroupProps) {
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

  // Derive display label from current filter
  let displayLabel = 'All'
  if (filter) {
    if (filter.targetType === 'department' && filter.targetId) {
      displayLabel = depts.find(d => d.id === filter.targetId)?.name ?? 'Dept'
    } else if (filter.targetType === 'personnel' && filter.targetId) {
      for (const dept of depts) {
        const p = dept.personnel?.find(p => p.id === filter.targetId)
        if (p) { displayLabel = p.name; break }
      }
    }
  }

  const isActive = !!filter

  return (
    <>
      <span className="text-[11px] font-semibold text-tw-text-secondary uppercase tracking-wide whitespace-nowrap self-center">
        {layer.name}
      </span>
      <div className="flex items-center gap-1.5 min-w-0">
        <button
          ref={ref}
          onMouseDown={e => { e.preventDefault(); handleOpen() }}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all whitespace-nowrap ${
            isActive
              ? 'bg-[#f0f6ff] border-tw-primary text-tw-primary'
              : 'bg-white border-tw-border text-tw-text-secondary hover:border-tw-primary/50 hover:text-tw-text'
          }`}
        >
          {displayLabel}
          <svg className={`w-3 h-3 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {isActive && <ClearPill onClick={() => onChange(null)} />}

        {open && createPortal(
          <div
            style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.w, zIndex: 9999 }}
            className="bg-white border border-tw-border rounded-xl shadow-panel overflow-y-auto max-h-72 py-1"
            onMouseDown={e => e.preventDefault()}
          >
            {/* All option */}
            <button
              onMouseDown={() => { onChange(null); setOpen(false) }}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-tw-hover transition-colors ${!filter ? 'text-tw-primary font-semibold bg-[#f0f6ff]' : 'text-tw-text'}`}
            >
              All
            </button>

            {/* Departments section */}
            {depts.length > 0 && (
              <>
                <div className="px-3 pt-2 pb-1">
                  <span className="text-[10px] font-bold text-tw-text-secondary uppercase tracking-wider">Departments</span>
                </div>
                {depts.map(d => (
                  <button key={d.id}
                    onMouseDown={() => { onChange({ layerNumber: layer.number, targetType: 'department', targetId: d.id }); setOpen(false) }}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-tw-hover transition-colors ${filter?.targetType === 'department' && filter.targetId === d.id ? 'text-tw-primary font-semibold bg-[#f0f6ff]' : 'text-tw-text'}`}
                  >
                    {d.name}
                  </button>
                ))}
              </>
            )}

            {/* People section */}
            {depts.some(d => (d.personnel?.length ?? 0) > 0) && (
              <>
                <div className="px-3 pt-2 pb-1 border-t border-tw-border/30 mt-1">
                  <span className="text-[10px] font-bold text-tw-text-secondary uppercase tracking-wider">People</span>
                </div>
                {depts.flatMap(d => (d.personnel ?? []).map(p => (
                  <button key={p.id}
                    onMouseDown={() => { onChange({ layerNumber: layer.number, targetType: 'personnel', targetId: p.id }); setOpen(false) }}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-tw-hover transition-colors ${filter?.targetType === 'personnel' && filter.targetId === p.id ? 'text-tw-primary font-semibold bg-[#f0f6ff]' : 'text-tw-text'}`}
                  >
                    <span>{p.name}</span>
                    <span className="ml-1.5 text-tw-text-secondary text-[10px]">· {d.name}</span>
                  </button>
                )))}
              </>
            )}
          </div>,
          document.body
        )}
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

// ─── Desktop inline variants ─────────────────────────────────────────────────

function LayerGroupInline({ layer, filter, onChange }: LayerGroupProps) {
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
      {open && createPortal(
        <div style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.w, zIndex: 9999 }}
          className="bg-white border border-tw-border rounded-xl shadow-panel overflow-y-auto max-h-72 py-1" onMouseDown={e => e.preventDefault()}>
          <button onMouseDown={() => { onChange(null); setOpen(false) }}
            className={`w-full text-left px-3 py-2 text-xs hover:bg-tw-hover ${!filter ? 'text-tw-primary font-semibold bg-[#f0f6ff]' : 'text-tw-text'}`}>All</button>
          {depts.length > 0 && <>
            <div className="px-3 pt-2 pb-1"><span className="text-[10px] font-bold text-tw-text-secondary uppercase tracking-wider">Departments</span></div>
            {depts.map(d => <button key={d.id} onMouseDown={() => { onChange({ layerNumber: layer.number, targetType: 'department', targetId: d.id }); setOpen(false) }}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-tw-hover ${filter?.targetType === 'department' && filter.targetId === d.id ? 'text-tw-primary font-semibold bg-[#f0f6ff]' : 'text-tw-text'}`}>{d.name}</button>)}
          </>}
          {depts.some(d => (d.personnel?.length ?? 0) > 0) && <>
            <div className="px-3 pt-2 pb-1 border-t border-tw-border/30 mt-1"><span className="text-[10px] font-bold text-tw-text-secondary uppercase tracking-wider">People</span></div>
            {depts.flatMap(d => (d.personnel ?? []).map(p => <button key={p.id} onMouseDown={() => { onChange({ layerNumber: layer.number, targetType: 'personnel', targetId: p.id }); setOpen(false) }}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-tw-hover ${filter?.targetType === 'personnel' && filter.targetId === p.id ? 'text-tw-primary font-semibold bg-[#f0f6ff]' : 'text-tw-text'}`}>
              {p.name}<span className="ml-1.5 text-tw-text-secondary text-[10px]">· {d.name}</span></button>))}
          </>}
        </div>, document.body
      )}
    </div>
  )
}

function ExtraGroupInline({ filter, personnel, mode, onChange }: ExtraGroupProps) {
  const STATUS_TASK = [
    { value: 'PENDING', label: 'Pending' }, { value: 'ASSIGNED', label: 'Assigned' },
    { value: 'IN_PROGRESS', label: 'In Progress' },
    { value: 'SUBMITTED', label: 'Submitted' }, { value: 'APPROVED', label: 'Approved' },
    { value: 'RETURNED', label: 'Returned' }, { value: 'CANCELLED', label: 'Cancelled' },
  ]
  const STATUS_PROJ = [{ value: 'active', label: 'Active' }, { value: 'archived', label: 'Archived' }]
  const PRIORITY = [{ value: 'CRITICAL', label: 'Critical' }, { value: 'HIGH', label: 'High' }, { value: 'MEDIUM', label: 'Medium' }, { value: 'LOW', label: 'Low' }]
  const DC = DATE_PILL

  return (
    <>
      {/* Status */}
      <div className="inline-flex items-center gap-1">
        <span className="text-[11px] font-semibold text-tw-text-secondary uppercase tracking-wide whitespace-nowrap">Status:</span>
        <PillSelect value={filter.status ?? ''} options={mode === 'task' ? STATUS_TASK : STATUS_PROJ}
          placeholder="Any" active={!!filter.status} onChange={v => onChange({ ...filter, status: v || null })} />
        {filter.status && <ClearPill onClick={() => onChange({ ...filter, status: null })} />}
      </div>
      {mode === 'task' && <>
        <span className="self-stretch w-px bg-tw-border/50 mx-1 rounded-full" />
        <div className="inline-flex items-center gap-1">
          <span className="text-[11px] font-semibold text-tw-text-secondary uppercase tracking-wide whitespace-nowrap">Priority:</span>
          <PillSelect value={filter.priority ?? ''} options={PRIORITY}
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

// ─── Mobile variants (label left, control right) ─────────────────────────────

function LayerGroupMobile({ layer, filter, onChange }: LayerGroupProps) {
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
      {open && createPortal(
        <div style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.w, zIndex: 9999 }}
          className="bg-white border border-tw-border rounded-xl shadow-panel overflow-y-auto max-h-72 py-1" onMouseDown={e => e.preventDefault()}>
          <button onMouseDown={() => { onChange(null); setOpen(false) }}
            className={`w-full text-left px-3 py-2 text-xs hover:bg-tw-hover ${!filter ? 'text-tw-primary font-semibold bg-[#f0f6ff]' : 'text-tw-text'}`}>All</button>
          {depts.length > 0 && <>
            <div className="px-3 pt-2 pb-1"><span className="text-[10px] font-bold text-tw-text-secondary uppercase tracking-wider">Departments</span></div>
            {depts.map(d => <button key={d.id} onMouseDown={() => { onChange({ layerNumber: layer.number, targetType: 'department', targetId: d.id }); setOpen(false) }}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-tw-hover ${filter?.targetType === 'department' && filter.targetId === d.id ? 'text-tw-primary font-semibold bg-[#f0f6ff]' : 'text-tw-text'}`}>{d.name}</button>)}
          </>}
          {depts.some(d => (d.personnel?.length ?? 0) > 0) && <>
            <div className="px-3 pt-2 pb-1 border-t border-tw-border/30 mt-1"><span className="text-[10px] font-bold text-tw-text-secondary uppercase tracking-wider">People</span></div>
            {depts.flatMap(d => (d.personnel ?? []).map(p => <button key={p.id} onMouseDown={() => { onChange({ layerNumber: layer.number, targetType: 'personnel', targetId: p.id }); setOpen(false) }}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-tw-hover ${filter?.targetType === 'personnel' && filter.targetId === p.id ? 'text-tw-primary font-semibold bg-[#f0f6ff]' : 'text-tw-text'}`}>
              {p.name}<span className="ml-1.5 text-tw-text-secondary text-[10px]">· {d.name}</span></button>))}
          </>}
        </div>, document.body
      )}
    </div>
  )
}

function ExtraGroupMobile({ filter, personnel, mode, onChange }: ExtraGroupProps) {
  const STATUS_TASK = [
    { value: 'PENDING', label: 'Pending' }, { value: 'ASSIGNED', label: 'Assigned' },
    { value: 'IN_PROGRESS', label: 'In Progress' },
    { value: 'SUBMITTED', label: 'Submitted' }, { value: 'APPROVED', label: 'Approved' },
    { value: 'RETURNED', label: 'Returned' }, { value: 'CANCELLED', label: 'Cancelled' },
  ]
  const STATUS_PROJ = [{ value: 'active', label: 'Active' }, { value: 'archived', label: 'Archived' }]
  const PRIORITY = [{ value: 'CRITICAL', label: 'Critical' }, { value: 'HIGH', label: 'High' }, { value: 'MEDIUM', label: 'Medium' }, { value: 'LOW', label: 'Low' }]
  const DC = DATE_PILL

  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] font-semibold text-tw-text-secondary uppercase tracking-wide whitespace-nowrap flex-shrink-0">{label}</span>
      <div className="flex items-center gap-1.5 justify-end flex-wrap">{children}</div>
    </div>
  )

  return (
    <>
      <Row label="Status">
        <PillSelect value={filter.status ?? ''} options={mode === 'task' ? STATUS_TASK : STATUS_PROJ}
          placeholder="Any" active={!!filter.status} onChange={v => onChange({ ...filter, status: v || null })} />
        {filter.status && <ClearPill onClick={() => onChange({ ...filter, status: null })} />}
      </Row>
      {mode === 'task' && <>
        <div className="border-t border-tw-border/30" />
        <Row label="Priority">
          <PillSelect value={filter.priority ?? ''} options={PRIORITY}
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
  onChange: (f: ActiveFilters) => void
}

export default function FilterBar({ filters, layers, personnel, mode, onChange }: FilterBarProps) {
  const [expanded, setExpanded] = useState(false)

  const activeLayerCount = Object.keys(filters.layerFilters).length
  const ef = filters.extra
  const extraActive = [ef.status, ef.priority, ef.assignedTo, ef.createdFrom, ef.createdTo, ef.deadlineFrom, ef.deadlineTo].filter(Boolean).length
  const isActive = activeLayerCount > 0 || extraActive > 0
  const activeCount = activeLayerCount + (extraActive > 0 ? 1 : 0)

  const clearAll = () => onChange(DEFAULT_FILTERS)

  const setLayerFilter = (layerNumber: number, lf: LayerFilter | null) => {
    const next = { ...filters.layerFilters }
    if (lf === null) delete next[layerNumber]
    else next[layerNumber] = lf
    onChange({ ...filters, layerFilters: next })
  }

  return (
    <div className="mb-5">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setExpanded(e => !e)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
            isActive
              ? 'bg-[#f0f6ff] border-tw-primary text-tw-primary'
              : 'bg-white border-tw-border text-tw-text-secondary hover:border-tw-primary/50 hover:text-tw-text'
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18M7 8h10M10 12h4" />
          </svg>
          Filter
          {isActive && (
            <span className="bg-tw-primary text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold leading-none">
              {activeCount}
            </span>
          )}
          <svg className={`w-3 h-3 flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {isActive && !expanded && (
          <button onClick={clearAll} className="text-xs text-tw-text-secondary hover:text-tw-danger transition-colors">
            Clear all
          </button>
        )}
      </div>

      {/* Desktop: horizontal inline chips, wrapping */}
      {expanded && (
        <div className="hidden md:block mt-3 px-4 py-3 bg-[#f8f9ff] border border-tw-border/60 rounded-xl">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
            {layers.map((layer, i) => (
              <React.Fragment key={layer.id}>
                <LayerGroupInline layer={layer} filter={filters.layerFilters[layer.number]}
                  onChange={lf => setLayerFilter(layer.number, lf)} />
                <span className="self-stretch w-px bg-tw-border/50 mx-1 rounded-full" />
              </React.Fragment>
            ))}
            <ExtraGroupInline filter={filters.extra} personnel={personnel} mode={mode}
              onChange={f => onChange({ ...filters, extra: f })} />
            {isActive && (
              <>
                <span className="self-stretch w-px bg-tw-border/50 mx-1 rounded-full" />
                <button onClick={clearAll} className="text-xs text-tw-text-secondary hover:text-tw-danger transition-colors whitespace-nowrap">
                  Clear all
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Mobile: bottom sheet via portal */}
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
                    <span className="text-[11px] font-semibold text-tw-text-secondary uppercase tracking-wide whitespace-nowrap flex-shrink-0">
                      {layer.name}
                    </span>
                    <div className="flex justify-end">
                      <LayerGroupMobile layer={layer} filter={filters.layerFilters[layer.number]}
                        onChange={lf => setLayerFilter(layer.number, lf)} />
                    </div>
                  </div>
                  {i < layers.length - 1 && <div className="border-t border-tw-border/30" />}
                </React.Fragment>
              ))}
              {layers.length > 0 && <div className="border-t border-tw-border/30" />}
              <ExtraGroupMobile filter={filters.extra} personnel={personnel} mode={mode}
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
