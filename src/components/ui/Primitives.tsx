import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import { useTheme, type ThemePref } from '../../hooks/useTheme'
import { useSinhalaFont, SINHALA_FONTS } from '../../hooks/useSinhalaFont'
import { useLanguage } from '../../i18n/Language'

export type Tone = 'blue' | 'purple' | 'red' | 'green' | 'amber' | 'teal' | 'indigo' | 'gray'

// Literal class names so Tailwind keeps them in the build
export const TILE: Record<Tone, string> = {
  blue: 'tile-blue', purple: 'tile-purple', red: 'tile-red', green: 'tile-green',
  amber: 'tile-amber', teal: 'tile-teal', indigo: 'tile-indigo', gray: 'tile-gray',
}

// ─── Page header ──────────────────────────────────────────────────────────────
export function PageHeader({ title, subtitle, icon, tone = 'blue', actions, className = '' }: {
  title: ReactNode; subtitle?: ReactNode; icon?: IconName; tone?: Tone; actions?: ReactNode; className?: string
}) {
  return (
    <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 md:mb-6 ${className}`}>
      <div className="flex items-center gap-3 min-w-0">
        {icon && <span className={`icon-tile ${TILE[tone]} hidden sm:inline-flex w-11 h-11`}><Icon name={icon} className="w-5 h-5" /></span>}
        <div className="min-w-0">
          <h1 className="page-title truncate">{title}</h1>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────
export function EmptyState({ icon = 'inbox', tone = 'gray', title, text, action, className = '' }: {
  icon?: IconName; tone?: Tone; title: ReactNode; text?: ReactNode; action?: ReactNode; className?: string
}) {
  return (
    <div className={`flex flex-col items-center justify-center text-center px-6 py-12 ${className}`}>
      <span className={`icon-tile ${TILE[tone]} w-14 h-14 rounded-2xl mb-4`}><Icon name={icon} className="w-6 h-6" /></span>
      <p className="font-semibold text-tw-text">{title}</p>
      {text && <p className="text-sm text-tw-text-secondary mt-1 max-w-sm">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

// ─── Stat card ────────────────────────────────────────────────────────────────
export function StatCard({ label, value, icon, tone = 'blue', hint, onClick }: {
  label: ReactNode; value: ReactNode; icon: IconName; tone?: Tone; hint?: ReactNode; onClick?: () => void
}) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag onClick={onClick}
      className={`card relative overflow-hidden p-4 md:p-5 text-left flex flex-col gap-3 ${onClick ? 'card-hover cursor-pointer group' : ''}`}>
      <div className="flex items-center justify-between">
        <span className={`icon-tile ${TILE[tone]}`}><Icon name={icon} className="w-5 h-5" /></span>
        {onClick && <Icon name="arrowRight" className="w-4 h-4 text-tw-text-muted group-hover:text-tw-primary-text group-hover:translate-x-0.5 transition-all" />}
      </div>
      <div>
        <div className="text-2xl md:text-[1.9rem] font-bold tracking-tight text-tw-text leading-none">{value}</div>
        <div className="text-xs md:text-sm text-tw-text-secondary mt-1.5">{label}</div>
        {hint && <div className="text-[11px] text-tw-text-muted mt-1">{hint}</div>}
      </div>
    </Tag>
  )
}

// ─── Loading ──────────────────────────────────────────────────────────────────
export function Spinner({ className = 'w-5 h-5' }: { className?: string }) {
  return <span className={`inline-block rounded-full border-2 border-tw-primary/25 border-t-tw-primary animate-spin ${className}`} />
}

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-tw-text-secondary">
      <Spinner /> {label}
    </div>
  )
}

// ─── Theme toggle ─────────────────────────────────────────────────────────────
const THEME_OPTS: Array<{ value: ThemePref; icon: IconName; label: string }> = [
  { value: 'light',  icon: 'sun',     label: 'Light' },
  { value: 'dark',   icon: 'moon',    label: 'Dark' },
  { value: 'system', icon: 'monitor', label: 'System' },
]

/** Three-way segmented switch (Light / Dark / System). */
export function ThemeToggle({ compact = false, className = '' }: { compact?: boolean; className?: string }) {
  const { t } = useLanguage()
  const { pref, mode, setPref } = useTheme()
  if (compact) {
    // Single button cycling light → dark → system
    const next: ThemePref = pref === 'light' ? 'dark' : pref === 'dark' ? 'system' : 'light'
    const cur = THEME_OPTS.find(o => o.value === pref)!
    return (
      <button onClick={() => setPref(next)} title={`${t('Theme')}: ${t(cur.label)}`} aria-label={t('Theme')}
        className={`icon-btn ${className}`}>
        <Icon name={pref === 'system' ? (mode === 'dark' ? 'moon' : 'sun') : cur.icon} className="w-4 h-4" />
      </button>
    )
  }
  return (
    <div className={`flex items-center p-1 rounded-xl bg-tw-hover border border-tw-border ${className}`} role="radiogroup" aria-label={t('Theme')}>
      {THEME_OPTS.map(o => (
        <button key={o.value} role="radio" aria-checked={pref === o.value} onClick={() => setPref(o.value)}
          title={t(o.label)}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all
            ${pref === o.value ? 'bg-tw-surface text-tw-text shadow-card' : 'text-tw-text-secondary hover:text-tw-text'}`}>
          <Icon name={o.icon} className="w-3.5 h-3.5" />
          {t(o.label)}
        </button>
      ))}
    </div>
  )
}

// ─── Sinhala font picker ──────────────────────────────────────────────────────
const SINHALA_SAMPLE = 'ශ්‍රී ලංකා ජාතික තරුණ සේවා සභාව'

/** Lets the user choose the typeface used for all Sinhala text (incl. inputs). */
export function SinhalaFontPicker({ className = '' }: { className?: string }) {
  const { t } = useLanguage()
  const { font, setFont } = useSinhalaFont()
  return (
    <div className={`grid gap-2 sm:grid-cols-3 ${className}`} role="radiogroup" aria-label={t('Sinhala font')}>
      {SINHALA_FONTS.map(f => {
        const active = font === f.value
        return (
          <button key={f.value} type="button" role="radio" aria-checked={active} onClick={() => setFont(f.value)}
            className={`text-left rounded-xl border px-3.5 py-3 transition-all ${active
              ? 'border-tw-primary/50 bg-tw-primary/[0.07] ring-1 ring-tw-primary/30'
              : 'border-tw-border bg-tw-surface hover:border-tw-border-strong hover:bg-tw-hover'}`}>
            <div className="flex items-center justify-between gap-2">
              <span className={`text-xs font-semibold ${active ? 'text-tw-primary-text' : 'text-tw-text-secondary'}`}>
                {f.label}{f.value === 'noto-sans' && <span className="font-normal text-tw-text-muted"> · {t('Default')}</span>}
              </span>
              {active && <Icon name="check" className="w-4 h-4 text-tw-primary-text flex-shrink-0" />}
            </div>
            <p lang="si" className="mt-1.5 text-[15px] leading-relaxed text-tw-text" style={{ fontFamily: `${f.family}, sans-serif` }}>
              {SINHALA_SAMPLE}
            </p>
          </button>
        )
      })}
    </div>
  )
}
