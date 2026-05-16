import React, { useState, useEffect, useCallback } from 'react'
import { auditApi } from '../services/apiService'
import DatePicker from './DatePicker'

interface UpdateItem {
  id: string
  type: 'comment' | 'update'
  taskId: string
  taskTitle: string
  projectName: string
  authorName: string
  content: string
  createdAt: string
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function yesterdayStr() {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

function formatDateLabel(dateStr: string) {
  const today = todayStr()
  const yesterday = yesterdayStr()
  if (dateStr === today)     return 'Today'
  if (dateStr === yesterday) return 'Yesterday'
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
}

function shiftDate(dateStr: string, delta: number) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + delta)
  return d.toISOString().slice(0, 10)
}

export default function RecentUpdatesView() {
  const [date, setDate] = useState(todayStr())
  const [items, setItems] = useState<UpdateItem[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<'all' | 'comment' | 'update'>('all')

  const load = useCallback(async (d: string) => {
    setLoading(true)
    try {
      const data = await auditApi.recentUpdates(d) as UpdateItem[]
      setItems(data)
    } catch { setItems([]) }
    setLoading(false)
  }, [])

  useEffect(() => { load(date) }, [date, load])

  // On first mount also load yesterday so the default view shows today + yesterday merged
  const [yesterdayItems, setYesterdayItems] = useState<UpdateItem[]>([])
  const [showBothDays, setShowBothDays] = useState(true)

  useEffect(() => {
    if (date !== todayStr()) { setShowBothDays(false); return }
    setShowBothDays(true)
    auditApi.recentUpdates(yesterdayStr()).then(d => setYesterdayItems(d as UpdateItem[])).catch(() => setYesterdayItems([]))
  }, [date])

  const displayed = showBothDays
    ? [...items, ...yesterdayItems].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    : items

  const filtered = filter === 'all' ? displayed : displayed.filter(i => i.type === filter)

  // Group by calendar date
  const groups: { date: string; items: UpdateItem[] }[] = []
  for (const item of filtered) {
    const d = item.createdAt.slice(0, 10)
    const last = groups[groups.length - 1]
    if (last && last.date === d) last.items.push(item)
    else groups.push({ date: d, items: [item] })
  }

  const isFuture = date > todayStr()

  return (
    <div className="flex flex-col h-full">

      {/* ── Mobile date nav (visible on small screens) ─────────────────── */}
      <div className="md:hidden flex items-center gap-2 px-4 py-3 bg-white border-b border-tw-border sticky top-0 z-10">
        <button
          onClick={() => { setDate(d => shiftDate(d, -1)) }}
          className="w-9 h-9 flex items-center justify-center rounded-lg border border-tw-border hover:bg-tw-hover active:scale-95 transition-all text-tw-text-secondary font-bold text-lg">
          ‹
        </button>
        <div className="flex-1 text-center">
          <div className="text-sm font-semibold text-tw-text">{formatDateLabel(date)}</div>
          {showBothDays && <div className="text-xs text-tw-text-secondary">showing today &amp; yesterday</div>}
        </div>
        <button
          onClick={() => { if (!isFuture) setDate(d => shiftDate(d, 1)) }}
          disabled={date >= todayStr()}
          className="w-9 h-9 flex items-center justify-center rounded-lg border border-tw-border hover:bg-tw-hover active:scale-95 transition-all text-tw-text-secondary font-bold text-lg disabled:opacity-30 disabled:cursor-not-allowed">
          ›
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-tw-text">Recent Updates</h1>
            <p className="text-sm text-tw-text-secondary mt-0.5">Comments and progress updates across all tasks</p>
          </div>

          {/* Desktop controls */}
          <div className="hidden md:flex items-center gap-3">
            {/* Filter pills */}
            <div className="flex rounded-lg border border-tw-border overflow-hidden text-sm">
              {(['all', 'comment', 'update'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 font-medium transition-colors capitalize ${filter === f ? 'bg-tw-primary text-white' : 'bg-white text-tw-text-secondary hover:bg-tw-hover'}`}>
                  {f === 'all' ? 'All' : f === 'comment' ? 'Comments' : 'Progress'}
                </button>
              ))}
            </div>
            {/* Date picker */}
            <DatePicker
              value={date}
              onChange={v => { if (v) setDate(v) }}
              maxDate={todayStr()}
              className="w-44"
            />
          </div>
        </div>

        {/* Mobile filter pills */}
        <div className="md:hidden flex gap-2 mb-4">
          {(['all', 'comment', 'update'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1 text-xs font-semibold rounded-full border transition-colors capitalize ${filter === f ? 'bg-tw-primary text-white border-tw-primary' : 'bg-white text-tw-text-secondary border-tw-border'}`}>
              {f === 'all' ? 'All' : f === 'comment' ? 'Comments' : 'Progress'}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-sm text-tw-text-secondary py-12 text-center">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="card p-12 text-center text-tw-text-secondary text-sm">
            No {filter === 'all' ? 'updates' : filter === 'comment' ? 'comments' : 'progress updates'} for {formatDateLabel(date).toLowerCase()}
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map(group => (
              <div key={group.date}>
                {/* Date header */}
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-xs font-bold text-tw-text-secondary uppercase tracking-wider">
                    {formatDateLabel(group.date)}
                  </span>
                  <div className="flex-1 h-px bg-tw-border" />
                  <span className="text-xs text-tw-text-secondary">{group.items.length} item{group.items.length !== 1 ? 's' : ''}</span>
                </div>

                <div className="space-y-2">
                  {group.items.map(item => (
                    <div key={item.id} className="card px-4 py-3 flex gap-3">
                      {/* Type indicator */}
                      <div className={`mt-0.5 w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold
                        ${item.type === 'comment' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'}`}>
                        {item.type === 'comment' ? '💬' : '📝'}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mb-1">
                          <span className="text-sm font-semibold text-tw-text">{item.authorName}</span>
                          <span className="text-xs text-tw-text-secondary">
                            {item.type === 'comment' ? 'commented on' : 'posted an update on'}
                          </span>
                          <span className="text-xs font-medium text-tw-primary truncate max-w-[200px]">{item.taskTitle}</span>
                          {item.projectName && (
                            <span className="text-xs text-tw-text-secondary">· {item.projectName}</span>
                          )}
                        </div>
                        <p className="text-sm text-tw-text leading-relaxed bg-tw-bg rounded-lg px-3 py-2 mt-1">{item.content}</p>
                      </div>

                      <div className="text-xs text-tw-text-secondary flex-shrink-0 pt-0.5">{formatTime(item.createdAt)}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
