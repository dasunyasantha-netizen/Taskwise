import React, { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  value: string        // "YYYY-MM-DD" or ""
  onChange: (val: string) => void
  placeholder?: string
  minDate?: string
  maxDate?: string
  className?: string
  triggerClassName?: string
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAYS   = ['Su','Mo','Tu','We','Th','Fr','Sa']

export default function DatePicker({ value, onChange, placeholder = 'Select date', minDate, maxDate, className = '', triggerClassName }: Props) {
  const today = new Date()
  const parsed = value ? new Date(value + 'T00:00:00') : null

  const [open, setOpen]             = useState(false)
  const [viewYear, setViewYear]     = useState(parsed?.getFullYear() ?? today.getFullYear())
  const [viewMonth, setViewMonth]   = useState(parsed?.getMonth() ?? today.getMonth())
  const [showYearPicker, setShowYearPicker] = useState(false)
  const [dropPos, setDropPos]       = useState({ top: 0, left: 0, width: 0, openUpward: false })

  const ref = useRef<HTMLDivElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const t = e.target as Node
      if (ref.current?.contains(t) || dropRef.current?.contains(t)) return
      close()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, close])

  const handleOpen = () => {
    if (!open && ref.current) {
      const rect = ref.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      const openUpward = spaceBelow < 360 && rect.top > 360
      setDropPos({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 288), openUpward })
    }
    setOpen(o => !o)
  }

  useEffect(() => {
    if (parsed) { setViewYear(parsed.getFullYear()); setViewMonth(parsed.getMonth()) }
  }, [value])

  const minD = minDate ? new Date(minDate + 'T00:00:00') : null
  const maxD = maxDate ? new Date(maxDate + 'T00:00:00') : null

  const getDaysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate()
  const getFirstDay    = (y: number, m: number) => new Date(y, m, 1).getDay()

  const prevMonth = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) } else setViewMonth(m => m - 1) }
  const nextMonth = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) } else setViewMonth(m => m + 1) }

  const selectDay = (day: number) => {
    const d = new Date(viewYear, viewMonth, day)
    const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    onChange(iso)
    close()
  }

  const clear = (e: React.MouseEvent) => { e.stopPropagation(); onChange('') }

  const isSelected = (day: number) => {
    if (!parsed) return false
    return parsed.getFullYear() === viewYear && parsed.getMonth() === viewMonth && parsed.getDate() === day
  }

  const isToday = (day: number) => today.getFullYear() === viewYear && today.getMonth() === viewMonth && today.getDate() === day

  const isDisabled = (day: number) => {
    const d = new Date(viewYear, viewMonth, day)
    if (minD && d < minD) return true
    if (maxD && d > maxD) return true
    return false
  }

  const daysInMonth = getDaysInMonth(viewYear, viewMonth)
  const firstDay    = getFirstDay(viewYear, viewMonth)

  const displayValue = parsed
    ? parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : ''

  const yearRange = Array.from({ length: 12 }, (_, i) => viewYear - 5 + i)

  const dropdown = open ? createPortal(
    <div
      ref={dropRef}
      style={{
        position: 'fixed',
        top: dropPos.openUpward ? undefined : dropPos.top,
        bottom: dropPos.openUpward ? window.innerHeight - (dropPos.top - 4) : undefined,
        left: Math.min(dropPos.left, window.innerWidth - dropPos.width - 8),
        width: dropPos.width,
        zIndex: 9999,
      }}
      className="bg-white border border-tw-border rounded-xl shadow-panel overflow-hidden"
    >
      {/* Month / Year nav */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-tw-border">
        <button onMouseDown={e => { e.preventDefault(); prevMonth() }} className="p-1.5 rounded-lg hover:bg-tw-hover transition-colors text-tw-text-secondary hover:text-tw-text">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
        </button>
        <button
          onMouseDown={e => { e.preventDefault(); setShowYearPicker(y => !y) }}
          className="flex items-center gap-1 font-semibold text-sm text-tw-text hover:text-tw-primary transition-colors px-2 py-1 rounded-lg hover:bg-tw-hover"
        >
          {MONTHS[viewMonth]} {viewYear}
          <svg className={`w-3.5 h-3.5 transition-transform ${showYearPicker ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
        </button>
        <button onMouseDown={e => { e.preventDefault(); nextMonth() }} disabled={!!maxD && (viewYear > maxD.getFullYear() || (viewYear === maxD.getFullYear() && viewMonth >= maxD.getMonth()))} className="p-1.5 rounded-lg hover:bg-tw-hover transition-colors text-tw-text-secondary hover:text-tw-text disabled:opacity-30 disabled:cursor-not-allowed">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
        </button>
      </div>

      {showYearPicker && (
        <div className="grid grid-cols-4 gap-1 p-3 border-b border-tw-border bg-white">
          {yearRange.map(y => (
            <button key={y} onMouseDown={e => { e.preventDefault(); setViewYear(y); setShowYearPicker(false) }}
              className={`py-1.5 rounded-lg text-sm font-medium transition-colors ${y === viewYear ? 'bg-tw-primary text-white' : 'hover:bg-tw-hover text-tw-text'}`}>
              {y}
            </button>
          ))}
        </div>
      )}

      {!showYearPicker && (
        <>
          <div className="grid grid-cols-7 px-3 pt-3 pb-1">
            {DAYS.map(d => (
              <div key={d} className="text-center text-xs font-semibold text-tw-text-secondary py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 px-3 pb-3 gap-y-0.5">
            {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} />)}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
              const sel = isSelected(day)
              const tod = isToday(day)
              const dis = isDisabled(day)
              return (
                <button
                  key={day}
                  disabled={dis}
                  onMouseDown={e => { e.preventDefault(); if (!dis) selectDay(day) }}
                  className={`
                    w-full aspect-square flex items-center justify-center text-sm rounded-lg font-medium transition-colors
                    ${sel  ? 'bg-tw-primary text-white shadow-sm'              : ''}
                    ${!sel && tod  ? 'border border-tw-primary text-tw-primary' : ''}
                    ${!sel && !dis ? 'hover:bg-tw-hover text-tw-text'           : ''}
                    ${dis         ? 'text-tw-border cursor-not-allowed'         : ''}
                  `}
                >
                  {day}
                </button>
              )
            })}
          </div>
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-tw-border bg-tw-hover">
            <button onMouseDown={e => { e.preventDefault(); onChange(''); close() }} className="text-xs text-tw-text-secondary hover:text-tw-danger transition-colors font-medium">Clear</button>
            <button onMouseDown={e => { e.preventDefault(); selectDay(today.getDate()); setViewYear(today.getFullYear()); setViewMonth(today.getMonth()) }}
              className="text-xs text-tw-primary hover:underline font-medium">Today</button>
          </div>
        </>
      )}
    </div>,
    document.body
  ) : null

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={handleOpen}
        className={triggerClassName ?? 'w-full flex items-center justify-between border border-tw-border rounded-lg px-3 py-2 text-sm bg-white hover:border-tw-primary focus:outline-none focus:ring-2 focus:ring-tw-primary transition-colors'}
      >
        <div className="flex items-center gap-2 min-w-0">
          <svg className="w-4 h-4 text-tw-text-secondary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className={displayValue ? 'text-tw-text' : 'text-tw-text-secondary'}>{displayValue || placeholder}</span>
        </div>
        <div className="flex items-center gap-1">
          {value && (
            <span onClick={clear} className="text-tw-text-secondary hover:text-tw-danger transition-colors p-0.5 rounded" title="Clear">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </span>
          )}
          <svg className={`w-4 h-4 text-tw-text-secondary transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {dropdown}
    </div>
  )
}
