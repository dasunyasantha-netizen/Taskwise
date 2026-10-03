import { useState } from 'react'
import type { AuthUser, ViewMode } from '../types'
import { useLanguage } from '../i18n/Language'
import { Icon, type IconName } from './ui/Icon'

export type SidebarIcon = IconName

// ─── Types ────────────────────────────────────────────────────────────────────
export interface SidebarItem {
  label: string
  view: ViewMode
  icon: SidebarIcon
  badge?: number
  badgeTone?: 'danger' | 'warning'
}
export interface SidebarSection {
  title?: string
  items: SidebarItem[]
}
interface Props {
  user: AuthUser
  roleLabel: string
  sections: SidebarSection[]
  activeView: ViewMode
  onSelect: (view: ViewMode) => void
  onLogout: () => void
  /** Optional call-to-action card (e.g. pending approvals) */
  highlight?: { title: string; cta: string; onClick: () => void }
}

const COLLAPSE_KEY = 'tw_sidebar_collapsed'

// ─── Sidebar ──────────────────────────────────────────────────────────────────
export default function Sidebar({ user, roleLabel, sections, activeView, onSelect, onLogout, highlight }: Props) {
  const { t } = useLanguage()
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === '1' } catch { return false }
  })
  const toggle = () => setCollapsed(c => {
    try { localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1') } catch { /* ignore */ }
    return !c
  })

  const initials = user.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
  const companyName = user.companyName || 'TaskWise'
  const visibleSections = sections.filter(s => s.items.length > 0)

  // Floating panel stays pinned while the page scrolls; clear the fixed Support Access banner (56px)
  const top = user.impersonation ? 68 : 12

  return (
    <div className="hidden md:block flex-shrink-0 relative z-10 pl-3 py-3">
    <aside
      className={`sticky flex flex-col rounded-3xl overflow-hidden
        bg-gradient-to-b from-tw-surface to-tw-surface-2 border border-tw-border shadow-card
        dark:from-[#18212e] dark:via-[#141b26] dark:to-[#10161f] dark:border-white/[0.06] dark:shadow-[0_10px_40px_-12px_rgba(0,0,0,0.6)]
        transition-[width] duration-200 ease-out
        ${collapsed ? 'w-[68px]' : 'w-64'}`}
      style={{ top, height: `calc(100vh - ${top + 12}px)` }}
    >
      {/* Ambient glow */}
      <div className="pointer-events-none absolute -bottom-24 left-1/2 -translate-x-1/2 w-72 h-48 rounded-full bg-tw-primary/[0.08] dark:bg-tw-primary/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 -left-10 w-40 h-32 rounded-full bg-tw-purple/[0.08] dark:bg-tw-purple/20 blur-3xl" />

      {/* ── Brand ─────────────────────────────────────────────────────────── */}
      <div className={`relative flex items-center gap-2.5 pt-4 pb-3 ${collapsed ? 'px-3 flex-col' : 'px-4'}`}>
        {user.companyLogo ? (
          <img src={user.companyLogo} alt="Logo"
            className="w-9 h-9 rounded-xl object-contain bg-white p-1 flex-shrink-0 ring-1 ring-tw-border shadow-sm" />
        ) : (
          <div className="w-9 h-9 rounded-xl bg-tw-surface ring-1 ring-tw-border dark:bg-white/[0.08] dark:ring-white/10 flex items-center justify-center flex-shrink-0 shadow-sm">
            <span className="text-tw-text font-bold text-sm">{companyName[0]?.toUpperCase() || 'T'}</span>
          </div>
        )}
        {!collapsed && <span className="flex-1 min-w-0 font-semibold text-tw-text text-[15px] truncate">{companyName}</span>}
        <button onClick={toggle}
          title={t(collapsed ? 'Expand sidebar' : 'Collapse sidebar')}
          aria-label={t(collapsed ? 'Expand sidebar' : 'Collapse sidebar')}
          className="p-1.5 rounded-lg text-tw-text-muted hover:text-tw-text hover:bg-tw-hover transition-colors flex-shrink-0">
          <Icon name={collapsed ? 'expand' : 'collapse'} className="w-4 h-4" />
        </button>
      </div>
      <div className={`relative h-px bg-tw-border ${collapsed ? 'mx-3' : 'mx-4'}`} />

      {/* ── Navigation ────────────────────────────────────────────────────── */}
      <nav className={`relative flex-1 overflow-y-auto overflow-x-hidden py-2 ${collapsed ? 'px-2.5' : 'px-3'}`}>
        {visibleSections.map((section, si) => (
          <div key={section.title ?? si} className={si > 0 ? 'mt-3' : ''}>
            {section.title && (collapsed
              ? (si > 0 && <div className="h-px bg-tw-border mx-1.5 mb-3" />)
              : <div className="px-3 pt-1 pb-1.5 section-label">{t(section.title)}</div>
            )}
            <div className="space-y-0.5">
              {section.items.map(item => {
                const active = activeView === item.view
                const badgeCls = item.badgeTone === 'warning' ? 'bg-tw-warning' : 'bg-tw-danger'
                return (
                  <button key={item.view} onClick={() => onSelect(item.view)}
                    title={collapsed ? t(item.label) : undefined}
                    aria-current={active ? 'page' : undefined}
                    className={`group relative w-full flex items-center rounded-xl text-sm transition-all border
                      ${collapsed ? 'justify-center h-10' : 'gap-3 px-3 py-2'}
                      ${active
                        ? 'bg-tw-primary/[0.08] border-tw-primary/35 text-tw-primary-text shadow-[0_0_18px_-8px_rgba(0,115,234,0.55)] dark:bg-tw-primary/[0.14] dark:border-tw-primary/45 dark:shadow-[0_0_18px_-6px_rgba(0,115,234,0.7)]'
                        : 'border-transparent text-tw-text-secondary hover:text-tw-text hover:bg-tw-hover'}`}>
                    <Icon name={item.icon} />
                    {!collapsed && <span className="flex-1 text-left truncate font-medium">{t(item.label)}</span>}
                    {!!item.badge && (collapsed
                      ? <span className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full ring-2 ring-tw-surface ${badgeCls}`} />
                      : <span className={`${badgeCls} text-white text-[11px] rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center font-bold leading-none`}>{item.badge}</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        ))}

        {/* ── Highlight card ──────────────────────────────────────────────── */}
        {highlight && !collapsed && (
          <div className="mt-5 mb-2 rounded-2xl p-px bg-gradient-to-br from-tw-border via-tw-border/40 to-tw-purple/60 dark:from-white/15 dark:via-white/[0.04]">
            <div className="rounded-[15px] bg-tw-surface/95 dark:bg-[#18202c]/95 backdrop-blur p-3.5">
              <p className="text-[13px] font-semibold text-tw-text leading-snug">{highlight.title}</p>
              <button onClick={highlight.onClick} className="btn-primary w-full mt-3 py-2 text-xs rounded-lg">
                {highlight.cta}
              </button>
            </div>
          </div>
        )}
      </nav>

      {/* ── User ──────────────────────────────────────────────────────────── */}
      <div className={`relative h-px bg-tw-border ${collapsed ? 'mx-3' : 'mx-4'}`} />
      <div className={`relative py-3 ${collapsed ? 'px-2.5 space-y-1' : 'px-3'}`}>
        <div className={`flex items-center ${collapsed ? 'flex-col gap-1' : 'gap-1'}`}>
          <button onClick={() => onSelect('profile' as ViewMode)} title={collapsed ? user.name : undefined}
            className={`flex items-center gap-2.5 rounded-xl border transition-colors min-w-0
              ${collapsed ? 'p-1.5 justify-center' : 'flex-1 px-2 py-1.5'}
              ${activeView === 'profile' ? 'bg-tw-hover border-tw-border' : 'border-transparent hover:bg-tw-hover'}`}>
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="Avatar" className="w-8 h-8 rounded-full object-cover flex-shrink-0 ring-1 ring-tw-border" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#3d9bff] to-tw-purple flex items-center justify-center text-white text-xs font-bold flex-shrink-0">{initials}</div>
            )}
            {!collapsed && (
              <div className="min-w-0 text-left">
                <div className="text-[13px] font-semibold text-tw-text truncate">{user.name}</div>
                <div className="text-[11px] text-tw-text-secondary truncate">{t(roleLabel)}</div>
              </div>
            )}
          </button>
          <button onClick={onLogout} title={t('Sign out')} aria-label={t('Sign out')}
            className="p-2 rounded-lg text-tw-text-muted hover:text-tw-danger hover:bg-tw-hover transition-colors flex-shrink-0">
            <Icon name="logout" className="w-4 h-4" />
          </button>
        </div>
        {!collapsed && <p className="text-center text-[10.5px] text-tw-text-muted mt-2">Created by SysWise</p>}
      </div>
    </aside>
    </div>
  )
}
