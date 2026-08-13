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

export default function Select({ value, onChange, options, placeholder = 'Select...', className = '', disabled = false }: Props) {
  const [open, setOpen] = useState(false)
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0, openUpward: false })
  const ref = useRef<HTMLDivElement>(null)

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, close])

  const handleOpen = () => {
    if (disabled) return
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

  // Group options
  const groups: Record<string, SelectOption[]> = {}
  const ungrouped: SelectOption[] = []
  for (const opt of options) {
    if (opt.group) {
      if (!groups[opt.group]) groups[opt.group] = []
      groups[opt.group].push(opt)
    } else {
      ungrouped.push(opt)
    }
  }
  const hasGroups = Object.keys(groups).length > 0

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
      className="bg-white border border-tw-border rounded-xl shadow-panel overflow-hidden"
    >
      <div className="max-h-56 overflow-y-auto py-1">
        {ungrouped.map(opt => (
          <button key={opt.value} type="button"
            onMouseDown={e => { e.preventDefault(); onChange(opt.value); close() }}
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
                onMouseDown={e => { e.preventDefault(); onChange(opt.value); close() }}
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
