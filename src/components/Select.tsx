import React, { useState, useRef, useEffect } from 'react'

export interface SelectOption {
  value: string
  label: string
  group?: string
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
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

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

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        className={`w-full flex items-center justify-between border rounded-lg px-3 py-2 text-sm bg-white transition-colors text-left
          ${disabled ? 'opacity-50 cursor-not-allowed border-tw-border' : 'hover:border-tw-primary cursor-pointer border-tw-border focus:outline-none focus:ring-2 focus:ring-tw-primary'}
          ${open ? 'border-tw-primary ring-2 ring-tw-primary ring-opacity-20' : ''}`}
      >
        <span className={selected ? 'text-tw-text' : 'text-tw-text-secondary'}>
          {selected ? selected.label : placeholder}
        </span>
        <svg className={`w-4 h-4 text-tw-text-secondary flex-shrink-0 transition-transform ml-2 ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-tw-border rounded-xl shadow-panel overflow-hidden">
          <div className="max-h-56 overflow-y-auto py-1">
            {/* Ungrouped options */}
            {ungrouped.map(opt => (
              <button key={opt.value} type="button"
                onClick={() => { onChange(opt.value); setOpen(false) }}
                className={`w-full text-left px-3 py-2 text-sm transition-colors flex items-center justify-between
                  ${opt.value === value ? 'bg-tw-primary-light text-tw-primary font-medium' : 'text-tw-text hover:bg-tw-hover'}`}>
                {opt.label}
                {opt.value === value && (
                  <svg className="w-4 h-4 text-tw-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            ))}

            {/* Grouped options */}
            {hasGroups && Object.entries(groups).map(([group, opts]) => (
              <div key={group}>
                <div className="px-3 py-1.5 text-xs font-semibold text-tw-text-secondary uppercase tracking-wide bg-tw-hover border-t border-tw-border first:border-t-0">
                  {group}
                </div>
                {opts.map(opt => (
                  <button key={opt.value} type="button"
                    onClick={() => { onChange(opt.value); setOpen(false) }}
                    className={`w-full text-left px-4 py-2 text-sm transition-colors flex items-center justify-between
                      ${opt.value === value ? 'bg-tw-primary-light text-tw-primary font-medium' : 'text-tw-text hover:bg-tw-hover'}`}>
                    {opt.label}
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
        </div>
      )}
    </div>
  )
}
