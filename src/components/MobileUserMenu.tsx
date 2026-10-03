import { useEffect, useRef, useState } from 'react'
import type { AuthUser } from '../types'
import { useLanguage } from '../i18n/Language'
import { Icon } from './ui/Icon'
import { ThemeToggle } from './ui/Primitives'

// ─── Avatar menu in the mobile header (profile, settings, theme, sign out) ───
export default function MobileUserMenu({ user, roleLabel, onProfile, onSettings, onLogout }: {
  user: AuthUser
  roleLabel: string
  onProfile: () => void
  onSettings?: () => void
  onLogout: () => void
}) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const initials = user.name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const row = 'w-full flex items-center gap-3 px-4 py-3 text-sm text-tw-text hover:bg-tw-hover transition-colors'

  return (
    <div ref={ref} className="relative md:hidden">
      <button onClick={() => setOpen(o => !o)} aria-label={t('Account')}
        className="flex items-center gap-1 pl-1 pr-1.5 py-1 rounded-xl border border-tw-border bg-tw-surface hover:bg-tw-hover transition-colors">
        {user.avatarUrl
          ? <img src={user.avatarUrl} alt="" className="w-7 h-7 rounded-lg object-cover" />
          : <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#3d9bff] to-tw-purple flex items-center justify-center text-white text-[11px] font-bold">{initials}</div>
        }
        <Icon name="chevronDown" className={`w-3.5 h-3.5 text-tw-text-secondary transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-tw-surface rounded-2xl shadow-panel border border-tw-border overflow-hidden z-50 animate-pop-in">
          <div className="px-4 py-3.5 flex items-center gap-3 border-b border-tw-border">
            {user.avatarUrl
              ? <img src={user.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover" />
              : <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#3d9bff] to-tw-purple flex items-center justify-center text-white text-xs font-bold">{initials}</div>}
            <div className="min-w-0">
              <div className="font-semibold text-tw-text text-sm truncate">{user.name}</div>
              <div className="text-xs text-tw-text-secondary">{t(roleLabel)}</div>
            </div>
          </div>
          <button onClick={() => { onProfile(); setOpen(false) }} className={row}>
            <Icon name="user" className="w-4 h-4 text-tw-text-secondary" />
            {t('My Profile')}
          </button>
          {onSettings && (
            <button onClick={() => { onSettings(); setOpen(false) }} className={row}>
              <Icon name="settings" className="w-4 h-4 text-tw-text-secondary" />
              {t('Settings')}
            </button>
          )}
          <div className="px-3 py-2.5 border-t border-tw-border">
            <ThemeToggle />
          </div>
          <button onClick={() => { onLogout(); setOpen(false) }}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-tw-danger hover:bg-tw-danger-light transition-colors border-t border-tw-border">
            <Icon name="logout" className="w-4 h-4" />
            {t('Sign out')}
          </button>
        </div>
      )}
    </div>
  )
}
