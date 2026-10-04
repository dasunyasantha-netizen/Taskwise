import React, { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import type { Notification } from '../types'
import { notificationApi } from '../services/apiService'
import type { IconName } from './ui/Icon'
import { Icon } from './ui/Icon'
import { useLanguage } from '../i18n/Language'

type Props = {
  onOpenTask?: (taskId: string) => void | Promise<void>
  onOpenCompanyRequests?: () => void
  onOpenYso?: () => void
  onOpenLetter?: (id: string) => void
}

export default function NotificationsMenu({ onOpenTask, onOpenCompanyRequests, onOpenYso, onOpenLetter }: Props) {
  const { t } = useLanguage()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [position, setPosition] = useState({ left: 12, top: 12, width: 352, maxHeight: 400 })
  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return
    const bounds = buttonRef.current.getBoundingClientRect()
    const width = Math.min(352, window.innerWidth - 24)
    const top = Math.max(12, Math.min(bounds.bottom + 8, window.innerHeight - 80))
    const left = Math.max(12, Math.min(bounds.right - width, window.innerWidth - width - 12))
    setPosition({ left, top, width, maxHeight: window.innerHeight - top - 12 })
  }, [])
  useLayoutEffect(() => {
    if (!open) return
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open, updatePosition])

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
      if (ref.current && !ref.current.contains(e.target as Node) && !panelRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', handler)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handler)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

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
        ref={buttonRef}
        onClick={() => setOpen(o => !o)}
        className={`relative icon-btn ${open ? 'bg-tw-hover text-tw-text' : ''}`}
        aria-label={t('Notifications')}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Icon name="bell" className="w-[18px] h-[18px]" />
        {unread > 0 && (
          <span className="absolute top-0.5 right-0.5 bg-tw-danger text-white text-[10px] rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center font-bold ring-2 ring-tw-surface">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && createPortal(
        <div ref={panelRef} role="dialog" aria-label={t('Notifications')} style={position}
          className="fixed flex flex-col bg-tw-surface rounded-2xl shadow-panel border border-tw-border z-[60] overflow-hidden animate-pop-in">
          <div className="shrink-0 px-4 py-2.5 border-b border-tw-border">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 font-semibold text-tw-text text-sm inline-flex flex-wrap items-center gap-2">{t('Notifications')} {unread > 0 && <span className="badge badge-primary">{t('{count} new', { count: unread })}</span>}</span>
              <button onClick={() => { setOpen(false); buttonRef.current?.focus() }} aria-label={t('Close dialog')} className="icon-btn shrink-0">
                <Icon name="x" className="w-4 h-4" />
              </button>
            </div>
            {unread > 0 && (
              <button onClick={markAll} className="min-h-8 mt-1 text-xs font-semibold text-tw-primary-text hover:underline">
                {t('Mark all read')}
              </button>
            )}
          </div>
          <div className="min-h-0 max-h-96 overflow-y-auto overscroll-contain">
            {notifications.length === 0 ? (
              <div className="px-4 py-10 text-center text-tw-text-secondary text-sm">
                <span className="icon-tile tile-gray mx-auto mb-3"><Icon name="bell" className="w-5 h-5" /></span>
                <div>{t('No notifications yet')}</div>
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
                      <div className="text-xs font-semibold text-tw-text break-words">{n.title}</div>
                      <div className="text-xs text-tw-text-secondary mt-0.5 leading-relaxed break-words">{n.message}</div>
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
        </div>,
        document.body
      )}
    </div>
  )
}

