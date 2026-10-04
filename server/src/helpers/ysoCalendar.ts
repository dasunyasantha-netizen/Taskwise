import { ensure } from './letters'
import { addDays, monthShift, validDate, validPeriod } from './ysoRules'

export function calendarRange(period: unknown) {
  ensure(validPeriod(period), 400, 'Choose a valid calendar month')
  return { from: addDays(period + '-01', -6), to: addDays(monthShift(period, 1) + '-01', 6) }
}

export function calendarEntry(value: Record<string, unknown>) {
  const title = typeof value.title === 'string' ? value.title.trim() : ''
  const notes = typeof value.notes === 'string' ? value.notes.trim() : ''
  ensure(title.length > 0 && title.length <= 200, 400, 'Title must contain 1–200 characters')
  ensure(value.notes == null || typeof value.notes === 'string', 400, 'Notes must be text')
  ensure(notes.length <= 2000, 400, 'Notes must be at most 2,000 characters')
  ensure(validDate(value.date) && /^20\d{2}/.test(value.date), 400, 'Choose a valid date')
  const time = (v: unknown) => {
    if (v == null || v === '') return null
    ensure(typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v), 400, 'Choose a valid time')
    return v
  }
  const startTime = time(value.startTime), endTime = time(value.endTime)
  ensure(!endTime || (startTime && endTime > startTime), 400, 'End time must be after start time on the same day')
  return { title, notes, date: value.date, startTime, endTime }
}

export type CalendarEvent = {
  id: string; source: 'task' | 'letter' | 'meeting' | 'reporting' | 'personal'
  title: string; date: string; startTime?: string | null; endTime?: string | null
  notes?: string; detail?: string; project?: string; sourceId?: string
}
