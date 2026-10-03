import React, { useState, useEffect, useCallback } from 'react'
import { auditApi } from '../services/apiService'
import DatePicker from './DatePicker'
import { PageHeader, EmptyState, LoadingBlock } from './ui/Primitives'
import { Icon } from './ui/Icon'

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
      <div className="md:hidden flex items-center gap-2 px-4 py-3 bg-tw-surface/90 backdrop-blur border-b border-tw-border sticky top-0 z-10">
        <button
          onClick={() => { setDate(d => shiftDate(d, -1)) }}
          className="icon-btn border-tw-border bg-tw-surface active:scale-95">
          <Icon name="chevronLeft" className="w-4 h-4" />
        </button>
        <div className="flex-1 text-center">
          <div className="text-sm font-semibold text-tw-text">{formatDateLabel(date)}</div>
          {showBothDays && <div className="text-xs text-tw-text-secondary">showing today &amp; yesterday</div>}
        </div>
        <button
          onClick={() => { if (!isFuture) setDate(d => shiftDate(d, 1)) }}
          disabled={date >= todayStr()}
          className="icon-btn border-tw-border bg-tw-surface active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed">
          <Icon name="chevronRight" className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-auto page">
        <PageHeader icon="updates" tone="teal" title="Recent Updates" subtitle="Comments and progress updates across all tasks"
          actions={
          <div className="hidden md:flex items-center gap-3">
            {/* Filter pills */}
            <div className="seg">
              {(['all', 'comment', 'update'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`seg-item capitalize ${filter === f ? 'seg-item-active' : ''}`}>
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
          </div>} />

        {/* Mobile filter pills */}
        <div className="md:hidden flex gap-2 mb-4">
          {(['all', 'comment', 'update'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`chip capitalize font-semibold ${filter === f ? 'chip-active' : ''}`}>
              {f === 'all' ? 'All' : f === 'comment' ? 'Comments' : 'Progress'}
            </button>
          ))}
        </div>

        {loading ? (
          <LoadingBlock />
        ) : filtered.length === 0 ? (
          <div className="card">
            <EmptyState icon="message" tone="teal" title={`No ${filter === 'all' ? 'updates' : filter === 'comment' ? 'comments' : 'progress updates'} for ${formatDateLabel(date).toLowerCase()}`} />
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map(group => (
              <div key={group.date}>
                {/* Date header */}
                <div className="flex items-center gap-3 mb-3">
                  <span className="section-label">
                    {formatDateLabel(group.date)}
                  </span>
                  <div className="flex-1 h-px bg-tw-border" />
                  <span className="text-xs text-tw-text-secondary">{group.items.length} item{group.items.length !== 1 ? 's' : ''}</span>
                </div>

                <div className="space-y-2">
                  {group.items.map(item => (
                    <div key={item.id} className="card px-4 py-3 flex gap-3">
                      {/* Type indicator */}
                      <span className={`icon-tile w-8 h-8 rounded-lg mt-0.5 ${item.type === 'comment' ? 'tile-blue' : 'tile-green'}`}>
                        <Icon name={item.type === 'comment' ? 'message' : 'note'} className="w-4 h-4" />
                      </span>

                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mb-1">
                          <span className="text-sm font-semibold text-tw-text">{item.authorName}</span>
                          <span className="text-xs text-tw-text-secondary">
                            {item.type === 'comment' ? 'commented on' : 'posted an update on'}
                          </span>
                          <span className="text-xs font-semibold text-tw-primary-text truncate max-w-[200px]">{item.taskTitle}</span>
                          {item.projectName && (
                            <span className="text-xs text-tw-text-secondary">· {item.projectName}</span>
                          )}
                        </div>
                        <p className="text-sm text-tw-text leading-relaxed panel-muted px-3 py-2 mt-1.5">{item.content}</p>
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
