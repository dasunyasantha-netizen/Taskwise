import { api } from './apiService'
export type CalendarEvent = {
  id: string; source: 'task' | 'letter' | 'meeting' | 'reporting' | 'personal'
  title: string; date: string; startTime?: string | null; endTime?: string | null
  notes?: string; detail?: string; project?: string; sourceId?: string
}
export type CalendarEntry = { title: string; date: string; startTime: string | null; endTime: string | null; notes: string }
export const ysoCalendarApi = {
  list: (period: string) => api.get<{ events: CalendarEvent[] }>('/yso/calendar?period=' + encodeURIComponent(period)),
  create: (data: CalendarEntry) => api.post('/yso/calendar/entries', data),
  update: (id: string, data: CalendarEntry) => api.put('/yso/calendar/entries/' + encodeURIComponent(id), data),
  remove: (id: string) => api.delete('/yso/calendar/entries/' + encodeURIComponent(id)),
}
