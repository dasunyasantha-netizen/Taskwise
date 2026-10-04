import React, { useEffect, useRef, useState } from 'react'
import { useLanguage, monthYear, languageOf } from '../i18n/Language'
import { Icon, type IconName } from './ui/Icon'
import DatePicker from './DatePicker'
import { ysoCalendarApi, type CalendarEvent, type CalendarEntry } from '../services/ysoCalendarService'

type DialogProps = { title: string; children: React.ReactNode; onClose: () => void }
const sourceLabels = { task: 'Task', letter: 'Letter', meeting: 'Meeting', reporting: 'YSO reporting', personal: 'Personal entry' }
const icons: Record<CalendarEvent['source'], IconName> = { task: 'tasks', letter: 'letter', meeting: 'group', reporting: 'sprout', personal: 'calendar' }
const shiftMonth = (period: string, shift: number) => {
  const [year, month] = period.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1 + shift, 1)).toISOString().slice(0, 7)
}
const today = () => new Date(Date.now() + 19800000).toISOString().slice(0, 10)
const emptyEntry = (date: string): CalendarEntry => ({ title: '', date, startTime: '09:00', endTime: '10:00', notes: '' })

export default function YsoCalendar({ period, onMonthChange, Dialog, refreshKey }: { period: string; onMonthChange: (value: string) => void; Dialog: React.ComponentType<DialogProps>; refreshKey?: unknown }) {
  const { t, locale } = useLanguage()
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true), [error, setError] = useState('')
  const [day, setDay] = useState(''), [form, setForm] = useState<CalendarEntry | null>(null)
  const [editing, setEditing] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState('')
  const [detail, setDetail] = useState(''), [deleting, setDeleting] = useState('')
  const request = useRef(0), timeline = useRef<HTMLDivElement>(null), busyRef = useRef(false)
  busyRef.current = busy
  const load = async () => {
    const ticket = ++request.current
    setLoading(true); setError('')
    try { const data = await ysoCalendarApi.list(period); if (ticket === request.current) setEvents(data.events) }
    catch (e: any) { if (ticket === request.current) setError(e.message) }
    finally { if (ticket === request.current) setLoading(false) }
  }
  useEffect(() => { setEvents([]); void load(); return () => { request.current++ } }, [period, refreshKey])
  useEffect(() => {
    if (day && !form && timeline.current) {
      const first = events.find(e => e.date === day && e.startTime)?.startTime
      const hour = first ? Number(first.slice(0, 2)) : 8
      const target = timeline.current.querySelector<HTMLElement>(`[data-hour="${hour}"]`)
      if (target) timeline.current.scrollTop = target.offsetTop
    }
  }, [day, !!form])
  const [year, month] = period.split('-').map(Number)
  const first = new Date(Date.UTC(year, month - 1, 1))
  const offset = (first.getUTCDay() + 6) % 7
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const cellCount = Math.ceil((offset + daysInMonth) / 7) * 7
  const cells = Array.from({ length: cellCount }, (_, i) => new Date(Date.UTC(year, month - 1, 1 - offset + i)).toISOString().slice(0, 10))
  const dateLabel = (date: string) => new Date(date + 'T00:00:00Z').toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  const dayEvents = events.filter(e => e.date === day)
  const openDay = (date: string) => { setDay(date); setForm(null); setEditing(''); setDetail(''); setDeleting(''); setNotice(''); if (date.slice(0, 7) !== period) onMonthChange(date.slice(0, 7)) }
  const closeDay = () => { if (!busyRef.current) { setDay(''); setForm(null) } }
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); if (!form || busy) return
    if (form.endTime && (!form.startTime || form.endTime <= form.startTime)) { setError(t('End time must be after start time.')); return }
    setBusy(true); setError('')
    try {
      if (editing) await ysoCalendarApi.update(editing, form); else await ysoCalendarApi.create(form)
      const date = form.date
      setDay(date); setForm(null); setEditing(''); setDetail(''); setNotice(t('Calendar entry saved.'))
      if (date.slice(0, 7) !== period) onMonthChange(date.slice(0, 7)); else await load()
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  const remove = async (id: string) => {
    setBusy(true); setError('')
    try { await ysoCalendarApi.remove(id); setDetail(''); setDeleting(''); setNotice(t('Calendar entry deleted.')); await load() }
    catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  const eventCard = (event: CalendarEvent) => (
    <div key={event.id} className={`yso-calendar-event yso-calendar-${event.source}`}>
      <button type="button" className="w-full text-left" onClick={() => { setDetail(detail === event.id ? '' : event.id); setDeleting('') }} aria-expanded={detail === event.id}>
        <span className="flex items-center gap-1.5 text-[10px] font-semibold text-tw-text-secondary mb-1"><Icon name={icons[event.source]} className="w-3 h-3" />{t(event.detail || sourceLabels[event.source])}{event.startTime && <span className="ml-auto tabular-nums">{event.startTime}{event.endTime ? `–${event.endTime}` : ''}</span>}</span>
        <span className="block text-xs font-semibold text-tw-text break-words">{t(event.title)}</span>
        {event.project && <span className="block text-[11px] text-tw-text-secondary mt-0.5 break-words">{t('Project')}: {event.project}</span>}
      </button>
      {detail === event.id && <div className="mt-2 space-y-2">
        {event.notes && <p className="text-xs whitespace-pre-wrap break-words text-tw-text-secondary">{event.notes}</p>}
        {event.source === 'personal' && <div className="flex flex-wrap items-center gap-3 text-xs">
          <button className="text-tw-primary-text font-semibold min-h-9" disabled={busy} onClick={() => { setEditing(event.sourceId!); setForm({ title: event.title, date: event.date, startTime: event.startTime || null, endTime: event.endTime || null, notes: event.notes || '' }); setDeleting('') }}>{t('Edit entry')}</button>
          <button className="text-tw-danger font-semibold min-h-9" disabled={busy} onClick={() => deleting === event.id ? void remove(event.sourceId!) : setDeleting(event.id)}>{t(deleting === event.id ? 'Confirm delete' : 'Delete entry')}</button>
          {deleting === event.id && <button className="min-h-9" disabled={busy} onClick={() => setDeleting('')}>{t('Cancel')}</button>}
        </div>}
      </div>}
    </div>
  )
  return <>
    <section className="card overflow-hidden yso-calendar" aria-label={t('Your calendar')}>
      <div className="flex items-center justify-between gap-2 px-4 pt-4">
        <div><h2 className="font-semibold text-sm flex items-center gap-2"><span className="icon-tile tile-teal w-8 h-8 rounded-xl"><Icon name="calendar" className="w-4 h-4" /></span>{t('Your calendar')}</h2></div>
        <div className="flex items-center gap-1"><button className="icon-btn w-9 h-9" aria-label={t('Refresh calendar')} disabled={loading} onClick={() => void load()}><Icon name="refresh" className="w-3.5 h-3.5" /></button><button className="chip text-[11px] min-h-9" onClick={() => { onMonthChange(today().slice(0, 7)); openDay(today()) }}>{t('Today')}</button></div>
      </div>
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <button className="icon-btn w-9 h-9" disabled={period === '2000-01'} aria-label={t('Previous month')} onClick={() => onMonthChange(shiftMonth(period, -1))}><Icon name="chevronLeft" className="w-4 h-4" /></button>
        <h3 className="text-sm font-semibold text-center">{monthYear(period, languageOf(locale))}</h3>
        <button className="icon-btn w-9 h-9" disabled={period === '2099-12'} aria-label={t('Next month')} onClick={() => onMonthChange(shiftMonth(period, 1))}><Icon name="chevronRight" className="w-4 h-4" /></button>
      </div>
      <div className="px-3 pb-3">
        <div className="grid grid-cols-7 mb-1" aria-hidden="true">{Array.from({ length: 7 }, (_, i) => <span key={i} className="text-[10px] font-medium text-tw-text-muted text-center py-1">{new Date(Date.UTC(2026, 9, 5 + i)).toLocaleDateString(locale, { weekday: 'short', timeZone: 'UTC' })}</span>)}</div>
        <div className="grid grid-cols-7 gap-1" aria-busy={loading}>
          {cells.map(date => {
            const items = events.filter(e => e.date === date), isToday = date === today()
            return <button key={date} aria-label={`${dateLabel(date)}${items.length ? `, ${items.length} ${t('events')}` : ''}`} aria-current={isToday ? 'date' : undefined}
              disabled={date < '2000-01-01' || date > '2099-12-31'}
              className={`yso-calendar-day ${date === day ? 'is-selected' : ''} ${isToday ? 'is-today' : ''} ${date.slice(0, 7) !== period ? 'is-outside' : ''}`}
              onClick={() => openDay(date)}><span>{Number(date.slice(8))}</span><span className="flex gap-0.5 justify-center h-1.5" aria-hidden="true">{[...new Set(items.map(e => e.source))].slice(0, 4).map(source => <i key={source} className={`yso-calendar-dot yso-calendar-${source}`} />)}</span></button>
          })}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-tw-border px-4 py-2.5 text-[10px] text-tw-text-secondary">
        {Object.entries(sourceLabels).map(([source, label]) => <span key={source} className="inline-flex items-center gap-1"><i className={`yso-calendar-dot yso-calendar-${source}`} />{t(label)}</span>)}
      </div>
      {loading && <p className="px-4 pb-3 text-xs text-tw-text-secondary" role="status">{t('Loading calendar…')}</p>}
      {error && !day && <div className="px-4 pb-3"><p className="text-xs text-tw-danger" role="alert">{error}</p><button className="text-xs font-semibold min-h-9 text-tw-primary-text" onClick={() => void load()}>{t('Retry')}</button></div>}
    </section>
    {day && <Dialog title={form ? t(editing ? 'Edit entry' : 'Add calendar entry') : dateLabel(day)} onClose={closeDay}>
      <p className="text-xs text-tw-text-secondary mb-3">{t('Sri Lanka time · UTC+05:30')}</p>
      {error && <p className="alert-error mb-3" role="alert">{error}</p>}
      {notice && <p className="alert-success mb-3" role="status">{notice}</p>}
      {form ? <form onSubmit={save} className="space-y-4">
        <label className="block"><span className="label">{t('Title')}</span><input className="input" required maxLength={200} value={form.title} autoFocus onChange={e => setForm({ ...form, title: e.target.value })} /></label>
        <div><span className="label">{t('Date')}</span><DatePicker value={form.date} onChange={date => setForm({ ...form, date })} clearable={false} minDate="2000-01-01" maxDate="2099-12-31" ariaLabel={t('Entry date')} /></div>
        <label className="flex items-center gap-2 text-sm min-h-10"><input type="checkbox" checked={!form.startTime} onChange={e => setForm({ ...form, startTime: e.target.checked ? null : '09:00', endTime: e.target.checked ? null : '10:00' })} />{t('All day')}</label>
        {form.startTime !== null && <div className="grid grid-cols-2 gap-3">
          <label><span className="label">{t('Start time')}</span><input type="time" className="input min-w-0" required value={form.startTime} onChange={e => setForm({ ...form, startTime: e.target.value })} /></label>
          <label><span className="label">{t('End time')}</span><input type="time" className="input min-w-0" value={form.endTime || ''} onChange={e => setForm({ ...form, endTime: e.target.value || null })} /></label>
        </div>}
        <label className="block"><span className="label">{t('Notes')}</span><textarea className="input min-h-24" maxLength={2000} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></label>
        <div className="flex gap-2"><button className="btn-primary flex-1" disabled={busy}>{t(busy ? 'Saving…' : 'Save entry')}</button><button type="button" className="btn-secondary" disabled={busy} onClick={() => setForm(null)}>{t('Cancel')}</button></div>
      </form> : <>
        <div className="flex items-center justify-between gap-2 mb-4"><p className="text-xs text-tw-text-secondary">{loading ? t('Loading calendar…') : `${dayEvents.length} ${t('events')}`}</p><button className="btn-primary text-xs" disabled={loading} onClick={() => { setEditing(''); setForm(emptyEntry(day)); setNotice('') }}><Icon name="plus" className="w-4 h-4" />{t('Add entry')}</button></div>
        {dayEvents.some(e => !e.startTime) && <div className="mb-4"><h3 className="section-label mb-2">{t('All day')}</h3><div className="space-y-2">{dayEvents.filter(e => !e.startTime).map(eventCard)}</div></div>}
        <h3 className="section-label mb-2">{t('Day schedule')}</h3>
        <div ref={timeline} className="yso-calendar-hours relative max-h-[45dvh] overflow-y-auto overscroll-contain pr-1" tabIndex={0} aria-label={t('Hourly schedule')}>
          {Array.from({ length: 24 }, (_, hour) => <div key={hour} data-hour={hour} className="grid grid-cols-[42px_minmax(0,1fr)] gap-2 min-h-12">
            <span className="text-[10px] tabular-nums text-tw-text-muted pt-2">{String(hour).padStart(2, '0')}:00</span>
            <div className="border-t border-tw-border py-1.5 space-y-1.5">{dayEvents.filter(e => e.startTime && Number(e.startTime.slice(0, 2)) === hour).map(eventCard)}</div>
          </div>)}
        </div>
      </>}
    </Dialog>}
  </>
}
