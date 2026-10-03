import { useState } from 'react'
import type { AuthUser, ViewMode } from '../types'
import { useLanguage } from '../i18n/Language'

// ─── Icons (outline, 24px grid, stroke = currentColor) ───────────────────────
const ICON_PATHS: Record<string, string[]> = {
  dashboard:  ['M3 10.5 12 3l9 7.5', 'M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5'],
  updates:    ['M12 7v5l3 2', 'M21 12a9 9 0 1 1-9-9 9 9 0 0 1 9 9Z'],
  broadcast:  ['M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1Z', 'M15.5 8.5a5 5 0 0 1 0 7', 'M18.5 5.5a9 9 0 0 1 0 13'],
  letter:     ['M3 6.5A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5Z', 'm3.5 6 8.5 7 8.5-7'],
  project:    ['M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z'],
  tasks:      ['M9 6h11', 'M9 12h11', 'M9 18h11', 'm3.5 6 1 1 2-2', 'm3.5 12 1 1 2-2', 'm3.5 18 1 1 2-2'],
  group:      ['M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20', 'M10 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z', 'M20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35', 'M15.5 4.6a3.5 3.5 0 0 1 0 6.8'],
  approve:    ['M9 12.5 11 14.5 15.5 10', 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z'],
  overdue:    ['M12 8v4l2.5 1.5', 'M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z', 'M5 3 2.5 5.5', 'M19 3l2.5 2.5'],
  reports:    ['M4 20V10', 'M10 20V4', 'M16 20v-7', 'M21 20H3'],
  analytics:  ['M3 17l6-6 4 4 8-8', 'M15 7h6v6'],
  audit:      ['M8 3h8l4 4v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h3', 'M8 12h8', 'M8 16h5', 'M8 8h3'],
  hierarchy:  ['M12 3v4', 'M10 3h4v4h-4Z', 'M4 17h4v4H4Z', 'M16 17h4v4h-4Z', 'M10 17h4v4h-4Z', 'M6 17v-3h12v3', 'M12 7v10'],
  sprout:     ['M12 21v-9', 'M12 12c0-4 3-7 8-7 0 5-3 8-8 8', 'M12 14c0-3-2.5-5.5-7-5.5 0 4 2.5 6.5 7 6.5'],
  shield:     ['M12 3 4.5 6v5.5c0 4.5 3.2 8.3 7.5 9.5 4.3-1.2 7.5-5 7.5-9.5V6Z', 'm9 12 2 2 4-4'],
  lock:       ['M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z', 'M8 11V7a4 4 0 1 1 8 0v4'],
  building:   ['M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16', 'M15 9h4a1 1 0 0 1 1 1v11', 'M3 21h18', 'M8 8h3', 'M8 12h3', 'M8 16h3'],
  puzzle:     ['M10 4a2 2 0 1 1 4 0v1h4a1 1 0 0 1 1 1v4h-1a2 2 0 1 0 0 4h1v4a1 1 0 0 1-1 1h-4v-1a2 2 0 1 0-4 0v1H6a1 1 0 0 1-1-1v-4h1a2 2 0 1 0 0-4H5V6a1 1 0 0 1 1-1h4Z'],
  settings:   ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z'],
  queue:      ['M4 6h16', 'M4 12h16', 'M4 18h10'],
  board:      ['M4 4h6v16H4Z', 'M14 4h6v10h-6Z'],
  logout:     ['M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3', 'M10 17l5-5-5-5', 'M15 12H4'],
  collapse:   ['M4 5h16v14H4Z', 'M9 5v14', 'm15 10-2 2 2 2'],
  expand:     ['M4 5h16v14H4Z', 'M9 5v14', 'm13 10 2 2-2 2'],
}
export type SidebarIcon = keyof typeof ICON_PATHS

function Icon({ name, className = 'w-[18px] h-[18px]' }: { name: SidebarIcon; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON_PATHS[name].map((d, i) => <path key={i} d={d} />)}
    </svg>
  )
}

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
      className={`sticky flex flex-col rounded-2xl overflow-hidden
        bg-gradient-to-b from-[#1b2533] via-[#161e2a] to-[#121821] border border-white/[0.07]
        shadow-[0_10px_40px_-12px_rgba(0,0,0,0.45)] transition-[width] duration-200 ease-out
        ${collapsed ? 'w-[68px]' : 'w-64'}`}
      style={{ top, height: `calc(100vh - ${top + 12}px)` }}
    >
      {/* Ambient glow */}
      <div className="pointer-events-none absolute -bottom-24 left-1/2 -translate-x-1/2 w-72 h-48 rounded-full bg-tw-primary/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 -left-10 w-40 h-32 rounded-full bg-tw-purple/20 blur-3xl" />

      {/* ── Brand ─────────────────────────────────────────────────────────── */}
      <div className={`relative flex items-center gap-2.5 pt-4 pb-3 ${collapsed ? 'px-3 flex-col' : 'px-4'}`}>
        {user.companyLogo ? (
          <img src={user.companyLogo} alt="Logo"
            className="w-9 h-9 rounded-xl object-contain bg-white p-1 flex-shrink-0 shadow-sm" />
        ) : (
          <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center flex-shrink-0 shadow-sm">
            <span className="text-[#121821] font-bold text-sm">{companyName[0]?.toUpperCase() || 'T'}</span>
          </div>
        )}
        {!collapsed && <span className="flex-1 min-w-0 font-semibold text-white text-[15px] truncate">{companyName}</span>}
        <button onClick={toggle}
          title={t(collapsed ? 'Expand sidebar' : 'Collapse sidebar')}
          aria-label={t(collapsed ? 'Expand sidebar' : 'Collapse sidebar')}
          className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.08] transition-colors flex-shrink-0">
          <Icon name={collapsed ? 'expand' : 'collapse'} className="w-4 h-4" />
        </button>
      </div>
      <div className={`relative h-px bg-white/[0.08] ${collapsed ? 'mx-3' : 'mx-4'}`} />

      {/* ── Navigation ────────────────────────────────────────────────────── */}
      <nav className={`relative flex-1 overflow-y-auto overflow-x-hidden py-2 ${collapsed ? 'px-2.5' : 'px-3'}
        [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.12)_transparent]`}>
        {visibleSections.map((section, si) => (
          <div key={section.title ?? si} className={si > 0 ? 'mt-3' : ''}>
            {section.title && (collapsed
              ? (si > 0 && <div className="h-px bg-white/[0.08] mx-1.5 mb-3" />)
              : <div className="px-3 pt-1 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/35">{t(section.title)}</div>
            )}
            <div className="space-y-0.5">
              {section.items.map(item => {
                const active = activeView === item.view
                const badgeCls = item.badgeTone === 'warning' ? 'bg-tw-warning' : 'bg-tw-danger'
                return (
                  <button key={item.view} onClick={() => onSelect(item.view)}
                    title={collapsed ? t(item.label) : undefined}
                    className={`group relative w-full flex items-center rounded-xl text-sm transition-all border
                      ${collapsed ? 'justify-center h-10' : 'gap-3 px-3 py-2'}
                      ${active
                        ? 'bg-tw-primary/[0.14] border-tw-primary/45 text-[#6cb4ff] shadow-[0_0_18px_-6px_rgba(0,115,234,0.7)]'
                        : 'border-transparent text-white/65 hover:text-white hover:bg-white/[0.06]'}`}>
                    <Icon name={item.icon} />
                    {!collapsed && <span className="flex-1 text-left truncate font-medium">{t(item.label)}</span>}
                    {!!item.badge && (collapsed
                      ? <span className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full ring-2 ring-[#161e2a] ${badgeCls}`} />
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
          <div className="mt-5 mb-2 rounded-2xl p-px bg-gradient-to-br from-white/15 via-white/[0.04] to-tw-purple/60">
            <div className="rounded-[15px] bg-[#18202c]/95 backdrop-blur p-3.5">
              <p className="text-[13px] font-semibold text-white leading-snug">{highlight.title}</p>
              <button onClick={highlight.onClick}
                className="mt-3 w-full rounded-lg py-2 text-xs font-semibold text-white bg-gradient-to-b from-[#3d9bff] to-tw-primary shadow-[0_4px_14px_-4px_rgba(0,115,234,0.8)] hover:brightness-110 transition">
                {highlight.cta}
              </button>
            </div>
          </div>
        )}
      </nav>

      {/* ── User ──────────────────────────────────────────────────────────── */}
      <div className={`relative h-px bg-white/[0.08] ${collapsed ? 'mx-3' : 'mx-4'}`} />
      <div className={`relative py-3 ${collapsed ? 'px-2.5 space-y-1' : 'px-3'}`}>
        <div className={`flex items-center ${collapsed ? 'flex-col gap-1' : 'gap-1'}`}>
          <button onClick={() => onSelect('profile' as ViewMode)} title={collapsed ? user.name : undefined}
            className={`flex items-center gap-2.5 rounded-xl border transition-colors min-w-0
              ${collapsed ? 'p-1.5 justify-center' : 'flex-1 px-2 py-1.5'}
              ${activeView === 'profile' ? 'bg-white/[0.08] border-white/10' : 'border-transparent hover:bg-white/[0.06]'}`}>
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="Avatar" className="w-8 h-8 rounded-full object-cover flex-shrink-0 ring-1 ring-white/15" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#3d9bff] to-tw-purple flex items-center justify-center text-white text-xs font-bold flex-shrink-0">{initials}</div>
            )}
            {!collapsed && (
              <div className="min-w-0 text-left">
                <div className="text-[13px] font-semibold text-white truncate">{user.name}</div>
                <div className="text-[11px] text-white/45 truncate">{t(roleLabel)}</div>
              </div>
            )}
          </button>
          <button onClick={onLogout} title={t('Sign out')} aria-label={t('Sign out')}
            className="p-2 rounded-lg text-white/40 hover:text-tw-danger hover:bg-white/[0.06] transition-colors flex-shrink-0">
            <Icon name="logout" className="w-4 h-4" />
          </button>
        </div>
        {!collapsed && <p className="text-center text-[10.5px] text-white/25 mt-2">Created by SysWise</p>}
      </div>
    </aside>
    </div>
  )
}
