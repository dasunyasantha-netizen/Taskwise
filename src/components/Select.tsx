import React, { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'

export interface SelectOption {
  value: string
  label: string
  group?: string
  /** Optional swatch colour shown as a dot before the label (e.g. project colour) */
  color?: string
}

function Dot({ color }: { color: string }) {
  return <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
}

interface Props {
  value: string
  onChange: (val: string) => void
  options: SelectOption[]
  placeholder?: string
  className?: string
  disabled?: boolean
}

/** Below this many options a search box is more clutter than help. */
const SEARCH_THRESHOLD = 8

export default function Select({ value, onChange, options, placeholder = 'Select...', className = '', disabled = false }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0, openUpward: false })
  const ref = useRef<HTMLDivElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const close = useCallback(() => { setOpen(false); setQuery('') }, [])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      // The dropdown is portalled out of this subtree, so it has to be checked
      // separately — otherwise clicking the search box would close the list.
      if (ref.current?.contains(target) || dropRef.current?.contains(target)) return
      close()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, close])

  useEffect(() => { if (open) searchRef.current?.focus() }, [open])

  const handleOpen = () => {
    if (disabled) return
    setQuery('')
    if (!open && ref.current) {
      const rect = ref.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      const openUpward = spaceBelow < 240 && rect.top > 240
      setDropPos({
        top: openUpward ? rect.top - 8 : rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        openUpward,
      })
    }
    setOpen(o => !o)
  }

  const selected = options.find(o => o.value === value)

  const showSearch = options.length > SEARCH_THRESHOLD
  const needle = query.trim().toLowerCase()
  // Matching the group too means a department or tier name finds its people.
  const visible = needle
    ? options.filter(o => `${o.label} ${o.group ?? ''}`.toLowerCase().includes(needle))
    : options

  // Group options
  const groups: Record<string, SelectOption[]> = {}
  const ungrouped: SelectOption[] = []
  for (const opt of visible) {
    if (opt.group) {
      if (!groups[opt.group]) groups[opt.group] = []
      groups[opt.group].push(opt)
    } else {
      ungrouped.push(opt)
    }
  }
  const hasGroups = Object.keys(groups).length > 0

  const pick = (val: string) => { onChange(val); close() }

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); close() }
    // Enter takes the only sensible choice: the first thing still on screen.
    if (e.key === 'Enter' && visible.length > 0) { e.preventDefault(); pick(visible[0].value) }
  }

  const dropdown = open ? createPortal(
    <div
      style={{
        position: 'fixed',
        top: dropPos.openUpward ? undefined : dropPos.top,
        bottom: dropPos.openUpward ? window.innerHeight - dropPos.top : undefined,
        left: dropPos.left,
        width: dropPos.width,
        zIndex: 9999,
      }}
      ref={dropRef}
      className="bg-white border border-tw-border rounded-xl shadow-panel overflow-hidden"
    >
      {showSearch && (
        <div className="p-2 border-b border-tw-border">
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder={`Search ${options.length} options…`}
            className="w-full border border-tw-border rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-tw-primary"
          />
        </div>
      )}
      <div className="max-h-56 overflow-y-auto py-1">
        {visible.length === 0 && (
          <div className="px-3 py-4 text-sm text-tw-text-secondary text-center">No matches for “{query.trim()}”</div>
        )}
        {ungrouped.map(opt => (
          <button key={opt.value} type="button"
            onMouseDown={e => { e.preventDefault(); pick(opt.value) }}
            className={`w-full text-left px-3 py-2 text-sm transition-colors flex items-center justify-between gap-2
              ${opt.value === value ? 'bg-tw-primary-light text-tw-primary font-medium' : 'text-tw-text hover:bg-tw-hover'}`}>
            <span className="flex items-center gap-2 min-w-0">
              {opt.color && <Dot color={opt.color} />}
              <span className="truncate">{opt.label}</span>
            </span>
            {opt.value === value && (
              <svg className="w-4 h-4 text-tw-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
        ))}

        {hasGroups && Object.entries(groups).map(([group, opts]) => (
          <div key={group}>
            <div className="px-3 py-1.5 text-xs font-semibold text-tw-text-secondary uppercase tracking-wide bg-tw-hover border-t border-tw-border first:border-t-0">
              {group}
            </div>
            {opts.map(opt => (
              <button key={opt.value} type="button"
                onMouseDown={e => { e.preventDefault(); pick(opt.value) }}
                className={`w-full text-left px-4 py-2 text-sm transition-colors flex items-center justify-between gap-2
                  ${opt.value === value ? 'bg-tw-primary-light text-tw-primary font-medium' : 'text-tw-text hover:bg-tw-hover'}`}>
                <span className="flex items-center gap-2 min-w-0">
                  {opt.color && <Dot color={opt.color} />}
                  <span className="truncate">{opt.label}</span>
                </span>
                {opt.value === value && (
                  <svg className="w-4 h-4 text-tw-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>,
    document.body
  ) : null

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={handleOpen}
        className={`w-full flex items-center justify-between border rounded-lg px-3 py-2 text-sm bg-white transition-colors text-left
          ${disabled ? 'opacity-50 cursor-not-allowed border-tw-border' : 'hover:border-tw-primary cursor-pointer border-tw-border focus:outline-none focus:ring-2 focus:ring-tw-primary'}
          ${open ? 'border-tw-primary ring-2 ring-tw-primary ring-opacity-20' : ''}`}
      >
        <span className={`flex items-center gap-2 min-w-0 ${selected ? 'text-tw-text' : 'text-tw-text-secondary'}`}>
          {selected?.color && <Dot color={selected.color} />}
          <span className="truncate">{selected ? selected.label : placeholder}</span>
        </span>
        <svg className={`w-4 h-4 text-tw-text-secondary flex-shrink-0 transition-transform ml-2 ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {dropdown}
    </div>
  )
}
