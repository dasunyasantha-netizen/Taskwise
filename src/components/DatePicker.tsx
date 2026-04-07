import React, { useState, useEffect, useRef } from 'react'

interface Props {
  value: string        // "YYYY-MM-DD" or ""
  onChange: (val: string) => void
  placeholder?: string
  minDate?: string
  className?: string
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAYS   = ['Su','Mo','Tu','We','Th','Fr','Sa']

export default function DatePicker({ value, onChange, placeholder = 'Select date', minDate, className = '' }: Props) {
  const today = new Date()
  const parsed = value ? new Date(value + 'T00:00:00') : null

  const [open, setOpen]         = useState(false)
  const [viewYear, setViewYear]  = useState(parsed?.getFullYear() ?? today.getFullYear())
  const [viewMonth, setViewMonth] = useState(parsed?.getMonth() ?? today.getMonth())
  const [showYearPicker, setShowYearPicker] = useState(false)

  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // When value changes externally, sync view
  useEffect(() => {
    if (parsed) { setViewYear(parsed.getFullYear()); setViewMonth(parsed.getMonth()) }
  }, [value])

  const minD = minDate ? new Date(minDate + 'T00:00:00') : null

  const getDaysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate()
  const getFirstDay    = (y: number, m: number) => new Date(y, m, 1).getDay()

  const prevMonth = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) } else setViewMonth(m => m - 1) }
  const nextMonth = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) } else setViewMonth(m => m + 1) }

  const selectDay = (day: number) => {
    const d = new Date(viewYear, viewMonth, day)
    const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    onChange(iso)
    setOpen(false)
  }

  const clear = (e: React.MouseEvent) => { e.stopPropagation(); onChange('') }

  const isSelected = (day: number) => {
    if (!parsed) return false
    return parsed.getFullYear() === viewYear && parsed.getMonth() === viewMonth && parsed.getDate() === day
  }

  const isToday = (day: number) => today.getFullYear() === viewYear && today.getMonth() === viewMonth && today.getDate() === day

  const isDisabled = (day: number) => {
    if (!minD) return false
    const d = new Date(viewYear, viewMonth, day)
    return d < minD
  }

  const daysInMonth = getDaysInMonth(viewYear, viewMonth)
  const firstDay    = getFirstDay(viewYear, viewMonth)

  const displayValue = parsed
    ? parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : ''

  // Year range for year picker
  const yearRange = Array.from({ length: 12 }, (_, i) => viewYear - 5 + i)

  return (
    <div ref={ref} className={`relative ${className}`}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between border border-tw-border rounded-lg px-3 py-2 text-sm bg-white hover:border-tw-primary focus:outline-none focus:ring-2 focus:ring-tw-primary transition-colors"
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

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 bg-white border border-tw-border rounded-xl shadow-panel w-72 overflow-hidden">

          {/* Month / Year nav */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-tw-border">
            <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-tw-hover transition-colors text-tw-text-secondary hover:text-tw-text">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
            </button>

            <button
              onClick={() => setShowYearPicker(y => !y)}
              className="flex items-center gap-1 font-semibold text-sm text-tw-text hover:text-tw-primary transition-colors px-2 py-1 rounded-lg hover:bg-tw-hover"
            >
              {MONTHS[viewMonth]} {viewYear}
              <svg className={`w-3.5 h-3.5 transition-transform ${showYearPicker ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
            </button>

            <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-tw-hover transition-colors text-tw-text-secondary hover:text-tw-text">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
            </button>
          </div>

          {/* Year picker overlay */}
          {showYearPicker && (
            <div className="grid grid-cols-4 gap-1 p-3 border-b border-tw-border bg-white">
              {yearRange.map(y => (
                <button key={y} onClick={() => { setViewYear(y); setShowYearPicker(false) }}
                  className={`py-1.5 rounded-lg text-sm font-medium transition-colors ${y === viewYear ? 'bg-tw-primary text-white' : 'hover:bg-tw-hover text-tw-text'}`}>
                  {y}
                </button>
              ))}
            </div>
          )}

          {/* Day headers */}
          {!showYearPicker && (
            <>
              <div className="grid grid-cols-7 px-3 pt-3 pb-1">
                {DAYS.map(d => (
                  <div key={d} className="text-center text-xs font-semibold text-tw-text-secondary py-1">{d}</div>
                ))}
              </div>

              {/* Days grid */}
              <div className="grid grid-cols-7 px-3 pb-3 gap-y-0.5">
                {/* Empty cells before first day */}
                {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} />)}

                {/* Day cells */}
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                  const sel  = isSelected(day)
                  const tod  = isToday(day)
                  const dis  = isDisabled(day)
                  return (
                    <button
                      key={day}
                      disabled={dis}
                      onClick={() => selectDay(day)}
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

              {/* Footer */}
              <div className="flex items-center justify-between px-4 py-2.5 border-t border-tw-border bg-tw-hover">
                <button onClick={() => { onChange(''); setOpen(false) }} className="text-xs text-tw-text-secondary hover:text-tw-danger transition-colors font-medium">Clear</button>
                <button onClick={() => { selectDay(today.getDate()); setViewYear(today.getFullYear()); setViewMonth(today.getMonth()) }}
                  className="text-xs text-tw-primary hover:underline font-medium">Today</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
