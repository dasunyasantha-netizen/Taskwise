import React, { useState, useEffect, useRef } from 'react'
import type { Notification } from '../types'
import { notificationApi } from '../services/apiService'

export default function NotificationsMenu() {
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

  const typeIcon: Record<string, string> = {
    task_assigned: '📋',
    task_returned: '↩️',
    task_submitted_for_approval: '✅',
    task_approved: '🎉',
    task_rejected: '❌',
    task_deadline_warning: '⏰',
    subtask_created: '🔀',
    comment_added: '💬',
    personnel_moved: '🔄',
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="relative p-2 rounded-lg hover:bg-tw-hover transition-colors text-tw-text-secondary hover:text-tw-text"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-tw-danger text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-80 bg-white rounded-xl shadow-panel border border-tw-border z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-tw-border">
            <span className="font-semibold text-tw-text text-sm">Notifications</span>
            {unread > 0 && (
              <button onClick={markAll} className="text-xs text-tw-primary hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-tw-text-secondary text-sm">
                No notifications yet
              </div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  onClick={() => !n.isRead && markRead(n.id)}
                  className={`px-4 py-3 border-b border-tw-border last:border-0 cursor-pointer hover:bg-tw-hover transition-colors ${!n.isRead ? 'bg-blue-50' : ''}`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-base mt-0.5">{typeIcon[n.type] || '🔔'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-tw-text">{n.title}</div>
                      <div className="text-xs text-tw-text-secondary mt-0.5 leading-relaxed">{n.message}</div>
                      <div className="text-xs text-tw-text-secondary mt-1 opacity-60">
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
