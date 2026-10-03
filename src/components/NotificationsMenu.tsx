import React, { useState, useEffect, useRef } from 'react'
import type { Notification } from '../types'
import { notificationApi } from '../services/apiService'
import type { IconName } from './ui/Icon'
import { Icon } from './ui/Icon'

type Props = {
  onOpenTask?: (taskId: string) => void | Promise<void>
  onOpenCompanyRequests?: () => void
  onOpenYso?: () => void
  onOpenLetter?: (id: string) => void
}

export default function NotificationsMenu({ onOpenTask, onOpenCompanyRequests, onOpenYso, onOpenLetter }: Props) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const fetchNotifications = async () => {
    try {
      const data = await notificationApi.list() as Notification[]
      setNotifications(data)
    } catch { /* silent */ }
  }

  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 15000)
    const onFocus = () => fetchNotifications()
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(interval); window.removeEventListener('focus', onFocus) }
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const unread = notifications.filter(n => !n.isRead).length

  const markRead = async (id: string) => {
    await notificationApi.read(id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n))
  }

  const markAll = async () => {
    await notificationApi.readAll()
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })))
  }

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.isRead) await markRead(notification.id)
    setOpen(false)

    if (notification.type === 'letter_update' && typeof notification.payload?.threadId === 'string') { onOpenLetter?.(notification.payload.threadId); return }

    if (notification.type === 'yso_update') { onOpenYso?.(); return }

    if (notification.type === 'company_request_submitted') {
      onOpenCompanyRequests?.()
      return
    }

    if (notification.taskId) {
      await onOpenTask?.(notification.taskId)
    }
  }

  const typeIcon: Record<string, { icon: IconName; tile: string }> = {
    letter_update:               { icon: 'letter',    tile: 'tile-blue' },
    yso_update:                  { icon: 'sprout',    tile: 'tile-green' },
    task_assigned:               { icon: 'tasks',     tile: 'tile-indigo' },
    task_returned:               { icon: 'sendBack',  tile: 'tile-amber' },
    task_submitted_for_approval: { icon: 'approve',   tile: 'tile-purple' },
    task_approved:               { icon: 'party',     tile: 'tile-green' },
    task_rejected:               { icon: 'xCircle',   tile: 'tile-red' },
    task_deadline_warning:       { icon: 'overdue',   tile: 'tile-amber' },
    subtask_created:             { icon: 'layers',    tile: 'tile-teal' },
    comment_added:               { icon: 'message',   tile: 'tile-blue' },
    personnel_moved:             { icon: 'swap',      tile: 'tile-gray' },
    company_request_submitted:   { icon: 'building',  tile: 'tile-purple' },
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`relative icon-btn ${open ? 'bg-tw-hover text-tw-text' : ''}`}
        aria-label="Notifications"
      >
        <Icon name="bell" className="w-[18px] h-[18px]" />
        {unread > 0 && (
          <span className="absolute top-0.5 right-0.5 bg-tw-danger text-white text-[10px] rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center font-bold ring-2 ring-tw-surface">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 w-[22rem] max-w-[calc(100vw-1.5rem)] bg-tw-surface rounded-2xl shadow-panel border border-tw-border z-50 overflow-hidden animate-pop-in">
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-tw-border">
            <span className="font-semibold text-tw-text text-sm inline-flex items-center gap-2">Notifications {unread > 0 && <span className="badge badge-primary">{unread} new</span>}</span>
            {unread > 0 && (
              <button onClick={markAll} className="text-xs font-semibold text-tw-primary-text hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-10 text-center text-tw-text-secondary text-sm">
                <span className="icon-tile tile-gray mx-auto mb-3"><Icon name="bell" className="w-5 h-5" /></span>
                <div>No notifications yet</div>
              </div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`px-4 py-3 border-b border-tw-border last:border-0 cursor-pointer hover:bg-tw-hover transition-colors ${!n.isRead ? 'bg-tw-primary/[0.05]' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <span className={`icon-tile w-8 h-8 rounded-lg ${typeIcon[n.type]?.tile ?? 'tile-gray'}`}>
                      <Icon name={typeIcon[n.type]?.icon ?? 'bell'} className="w-4 h-4" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-tw-text">{n.title}</div>
                      <div className="text-xs text-tw-text-secondary mt-0.5 leading-relaxed">{n.message}</div>
                      <div className="text-[11px] text-tw-text-muted mt-1">
                        {new Date(n.createdAt).toLocaleString()}
                      </div>
                    </div>
                    {!n.isRead && <div className="w-2 h-2 rounded-full bg-tw-primary mt-1 flex-shrink-0" />}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

