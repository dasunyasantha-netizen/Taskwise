import React, { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useLanguage, MONTH_NAMES, WEEKDAY_INITIALS } from '../i18n/Language'

interface Props {
  value: string        // "YYYY-MM-DD", or "YYYY-MM" in month mode
  onChange: (val: string) => void
  placeholder?: string
  /** Show the × clear control when a value is set (default true) */
  clearable?: boolean
  minDate?: string
  maxDate?: string
  className?: string
  triggerClassName?: string
  compact?: boolean
  mode?: 'date' | 'month'
  ariaLabel?: string
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAYS   = ['Su','Mo','Tu','We','Th','Fr','Sa']

export default function DatePicker({ value, onChange, placeholder = 'Select date', minDate, maxDate, className = '', triggerClassName, compact = false, mode = 'date', ariaLabel, clearable = true }: Props) {
  const { t, locale, language } = useLanguage()
  const today = new Date()
  const parsed = value ? new Date(value + (mode === 'month' ? '-01' : '') + 'T00:00:00') : null

  const [open, setOpen]             = useState(false)
  const [viewYear, setViewYear]     = useState(parsed?.getFullYear() ?? today.getFullYear())
  const [viewMonth, setViewMonth]   = useState(parsed?.getMonth() ?? today.getMonth())
  const [showYearPicker, setShowYearPicker] = useState(false)
  const [dropPos, setDropPos]       = useState({ top: 0, left: 0, width: 0, openUpward: false })

  const ref = useRef<HTMLDivElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => { setOpen(false); ref.current?.querySelector('button')?.focus() }, [])

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
      const estimatedHeight = mode === 'month' ? 260 : compact ? 312 : 360
      const openUpward = spaceBelow < estimatedHeight && rect.top > spaceBelow
      const width = Math.min(compact ? 272 : Math.max(rect.width, 288), window.innerWidth - 16)
      setDropPos({
        top: openUpward ? rect.top - 4 : rect.bottom + 4,
        left: rect.left,
        width,
        openUpward,
      })
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

  const selectMonth = (month: number) => {
    onChange(`${viewYear}-${String(month + 1).padStart(2, '0')}`)
    close()
  }
  const monthDisabled = (month: number) => {
    const start = new Date(viewYear, month, 1)
    const end = new Date(viewYear, month + 1, 0)
    return !!((minD && end < minD) || (maxD && start > maxD))
  }

  const displayValue = parsed
    ? language !== 'en' ? `${parsed.getFullYear()} ${MONTH_NAMES[language][parsed.getMonth()]}${mode === 'date' ? ` ${parsed.getDate()}` : ''}` : parsed.toLocaleDateString(locale, { month: 'short', ...(mode === 'date' ? { day: 'numeric' as const } : {}), year: 'numeric' })
    : ''

  const yearRange = Array.from({ length: 12 }, (_, i) => viewYear - 5 + i)

  const dropdown = open ? createPortal(
    <div
      ref={dropRef}
      data-system-picker="true"
      onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); close() } }}
      style={{
        position: 'fixed',
        top: dropPos.openUpward ? undefined : dropPos.top,
        bottom: dropPos.openUpward ? window.innerHeight - dropPos.top : undefined,
        left: Math.max(8, Math.min(dropPos.left, window.innerWidth - dropPos.width - 8)),
        width: dropPos.width,
        zIndex: 9999,
      }}
      className="bg-tw-surface border border-tw-border rounded-xl shadow-panel animate-pop-in overflow-hidden"
    >
      {/* Month / Year nav */}
      <div className={`flex items-center justify-between border-b border-tw-border ${compact ? 'px-3 py-2' : 'px-4 py-3'}`}>
        <button type="button" aria-label={t(mode === 'month' ? 'Previous year' : 'Previous month')} onClick={e => { e.preventDefault(); mode === 'month' ? setViewYear(y => y - 1) : prevMonth() }} className="p-1.5 rounded-lg hover:bg-tw-hover transition-colors text-tw-text-secondary hover:text-tw-text">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
        </button>
        <button
          type="button"
          onClick={e => { e.preventDefault(); setShowYearPicker(y => !y) }}
          className="flex items-center gap-1 font-semibold text-sm text-tw-text hover:text-tw-primary transition-colors px-2 py-1 rounded-lg hover:bg-tw-hover"
        >
          {mode === 'date' ? t(MONTHS[viewMonth]) + ' ' : ''}{viewYear}
          <svg className={`w-3.5 h-3.5 transition-transform ${showYearPicker ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
        </button>
        <button type="button" aria-label={t(mode === 'month' ? 'Next year' : 'Next month')} onClick={e => { e.preventDefault(); mode === 'month' ? setViewYear(y => y + 1) : nextMonth() }} disabled={!!maxD && (viewYear > maxD.getFullYear() || (viewYear === maxD.getFullYear() && (mode === 'month' || viewMonth >= maxD.getMonth())))} className="p-1.5 rounded-lg hover:bg-tw-hover transition-colors text-tw-text-secondary hover:text-tw-text disabled:opacity-30 disabled:cursor-not-allowed">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
        </button>
      </div>

      {showYearPicker && (
        <div className={`grid grid-cols-4 gap-1 border-b border-tw-border bg-tw-surface ${compact ? 'p-2' : 'p-3'}`}>
          {yearRange.map(y => (
            <button type="button" key={y} onClick={e => { e.preventDefault(); setViewYear(y); setShowYearPicker(false) }}
              className={`py-1.5 rounded-lg text-sm font-medium transition-colors ${y === viewYear ? 'bg-tw-primary text-white' : 'hover:bg-tw-hover text-tw-text'}`}>
              {y}
            </button>
          ))}
        </div>
      )}

      {!showYearPicker && mode === 'month' && (
        <div className="grid grid-cols-3 gap-1 p-3">
          {MONTHS.map((month, index) => (
            <button type="button" key={month} disabled={monthDisabled(index)} onClick={() => selectMonth(index)}
              className={`min-h-11 rounded-lg text-sm font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${parsed?.getFullYear() === viewYear && parsed?.getMonth() === index ? 'bg-tw-primary text-white' : 'text-tw-text hover:bg-tw-hover'}`}>
              {language !== 'en' ? MONTH_NAMES[language][index] : month.slice(0, 3)}
            </button>
          ))}
        </div>
      )}
      {!showYearPicker && mode === 'date' && (
        <>
          <div className={`grid grid-cols-7 ${compact ? 'px-2 pt-2 pb-0.5' : 'px-3 pt-3 pb-1'}`}>
            {(language !== 'en' ? WEEKDAY_INITIALS[language] : DAYS).map(d => (
              <div key={d} className="text-center text-xs font-semibold text-tw-text-secondary py-1">{d}</div>
            ))}
          </div>
          <div className={`grid grid-cols-7 gap-y-0.5 ${compact ? 'px-2 pb-2' : 'px-3 pb-3'}`}>
            {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} />)}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
              const sel = isSelected(day)
              const tod = isToday(day)
              const dis = isDisabled(day)
              return (
                <button
                  type="button"
                  key={day}
                  disabled={dis}
                  onClick={e => { e.preventDefault(); if (!dis) selectDay(day) }}
                  className={`
                    w-full ${compact ? 'h-8' : 'aspect-square'} flex items-center justify-center text-sm rounded-lg font-medium transition-colors
                    ${sel  ? 'bg-gradient-to-b from-[#3d9bff] to-tw-primary text-white shadow-cta' : ''}
                    ${!sel && tod  ? 'ring-1 ring-inset ring-tw-primary/60 text-tw-primary-text' : ''}
                    ${!sel && !dis ? 'hover:bg-tw-hover text-tw-text'           : ''}
                    ${dis         ? 'text-tw-text-muted/50 cursor-not-allowed'  : ''}
                  `}
                >
                  {day}
                </button>
              )
            })}
          </div>
          <div className={`flex items-center justify-between border-t border-tw-border bg-tw-surface-2 ${compact ? 'px-3 py-2' : 'px-4 py-2.5'}`}>
            <button type="button" onClick={e => { e.preventDefault(); onChange(''); close() }} className="text-xs text-tw-text-secondary hover:text-tw-danger transition-colors font-medium">{t('Clear')}</button>
            <button type="button" onClick={e => { e.preventDefault(); onChange(`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`); close() }}
              disabled={!!((minD && today < minD) || (maxD && new Date(today.getFullYear(), today.getMonth(), today.getDate()) > maxD))} className="text-xs text-tw-primary-text hover:underline font-semibold disabled:opacity-30">{t('Today')}</button>
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
        onKeyDown={e => { if (e.key === 'Escape' && open) { e.stopPropagation(); close() } }}
        aria-label={ariaLabel}
        aria-expanded={open}
        className={triggerClassName ?? `w-full flex items-center justify-between gap-2 border rounded-xl px-3.5 py-2.5 text-sm bg-tw-surface hover:border-tw-border-strong focus:outline-none focus:ring-4 focus:ring-tw-primary/15 focus:border-tw-primary/60 transition-all ${open ? 'border-tw-primary/60 ring-4 ring-tw-primary/15' : 'border-tw-border'}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <svg className="w-4 h-4 text-tw-text-secondary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className={`truncate whitespace-nowrap ${displayValue ? 'text-tw-text' : 'text-tw-text-secondary'}`}>{displayValue || t(placeholder)}</span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {value && clearable && (
            <span onClick={clear} className="text-tw-text-secondary hover:text-tw-danger transition-colors p-0.5 rounded" title={t('Clear')}>
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
