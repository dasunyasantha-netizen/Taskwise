import { useState } from 'react'
import type { ViewMode } from '../types'
import { useLanguage } from '../i18n/Language'
import { Icon, type IconName } from './ui/Icon'
import { ThemeToggle } from './ui/Primitives'

export interface MobileNavItem {
  label: string
  view: ViewMode
  icon: IconName
  badge?: number
}

interface Props {
  /** Up to four primary destinations shown in the floating bar */
  primary: MobileNavItem[]
  /** Everything else — shown in the "More" sheet */
  more: MobileNavItem[]
  activeView: ViewMode
  onSelect: (view: ViewMode) => void
}

// ─── Floating bottom bar + "More" sheet (phones) ──────────────────────────────
export default function MobileNav({ primary, more, activeView, onSelect }: Props) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const moreActive = more.some(i => i.view === activeView)
  const moreBadge = more.reduce((n, i) => n + (i.badge || 0), 0)

  const go = (v: ViewMode) => { setOpen(false); onSelect(v) }

  return (
    <>
      {open && (
        <div className="md:hidden fixed inset-0 z-30 flex flex-col justify-end">
          <div className="absolute inset-0 bg-[#0b1220]/50 backdrop-blur-[3px] animate-fade-in" onClick={() => setOpen(false)} />
          <div className="relative bg-tw-surface rounded-t-3xl border-t border-tw-border shadow-panel animate-slide-up pb-[calc(6rem+env(safe-area-inset-bottom))]">
            <div className="w-10 h-1 bg-tw-border-strong rounded-full mx-auto mt-3 mb-3" />
            <div className="px-4 grid grid-cols-4 gap-2">
              {more.map(item => {
                const active = activeView === item.view
                return (
                  <button key={item.view} onClick={() => go(item.view)}
                    className={`flex flex-col items-center justify-center py-3 px-1 gap-2 rounded-2xl relative transition-colors border
                      ${active ? 'bg-tw-primary/10 border-tw-primary/30 text-tw-primary-text' : 'border-transparent text-tw-text-secondary hover:bg-tw-hover'}`}>
                    <Icon name={item.icon} className="w-[22px] h-[22px]" />
                    <span className="text-[10.5px] font-semibold leading-tight text-center">{t(item.label)}</span>
                    {!!item.badge && (
                      <span className="absolute top-1.5 right-2 bg-tw-danger text-white text-[9px] rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center font-bold">{item.badge}</span>
                    )}
                  </button>
                )
              })}
            </div>
            <div className="px-4 mt-4">
              <div className="section-label mb-2 px-1">{t('Theme')}</div>
              <ThemeToggle />
            </div>
          </div>
        </div>
      )}

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pointer-events-none">
        <div className="pointer-events-auto flex items-stretch gap-1 p-1.5 rounded-2xl bg-tw-surface/90 backdrop-blur-xl border border-tw-border shadow-panel">
          {primary.map(item => {
            const active = activeView === item.view && !open
            return (
              <button key={item.view} onClick={() => go(item.view)}
                className={`flex-1 flex flex-col items-center justify-center py-2 gap-1 rounded-xl relative transition-colors
                  ${active ? 'bg-tw-primary/10 text-tw-primary-text' : 'text-tw-text-secondary'}`}>
                <Icon name={item.icon} className="w-5 h-5" />
                <span className="text-[10px] font-semibold leading-none truncate max-w-full px-0.5">{t(item.label)}</span>
                {!!item.badge && (
                  <span className="absolute top-1 right-[18%] bg-tw-danger text-white text-[9px] rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center font-bold ring-2 ring-tw-surface">{item.badge}</span>
                )}
              </button>
            )
          })}
          {more.length > 0 && (
            <button onClick={() => setOpen(o => !o)}
              className={`flex-1 flex flex-col items-center justify-center py-2 gap-1 rounded-xl relative transition-colors
                ${open || moreActive ? 'bg-tw-primary/10 text-tw-primary-text' : 'text-tw-text-secondary'}`}>
              <Icon name={open ? 'x' : 'grid'} className="w-5 h-5" />
              <span className="text-[10px] font-semibold leading-none">{t('More')}</span>
              {moreBadge > 0 && !open && (
                <span className="absolute top-1.5 right-[26%] w-2 h-2 rounded-full bg-tw-danger ring-2 ring-tw-surface" />
              )}
            </button>
          )}
        </div>
      </nav>
    </>
  )
}
