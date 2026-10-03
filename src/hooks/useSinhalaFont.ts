import { useSyncExternalStore } from 'react'

// Sinhala typeface preference. Latin text keeps Figtree/Inter; the browser
// falls back per-glyph to this font for Sinhala (see the font stacks in
// tailwind.config.js). Saved per browser; index.html applies it before paint.
export type SinhalaFont = 'noto-sans' | 'noto-serif' | 'maname'

export const SINHALA_FONTS: Array<{ value: SinhalaFont; label: string; family: string }> = [
  { value: 'noto-sans',  label: 'Noto Sans Sinhala',  family: "'Noto Sans Sinhala'" },
  { value: 'noto-serif', label: 'Noto Serif Sinhala', family: "'Noto Serif Sinhala'" },
  { value: 'maname',     label: 'Maname',             family: "'Maname'" },
]

const KEY = 'tw_si_font'
const DEFAULT: SinhalaFont = 'noto-sans'
const listeners = new Set<() => void>()

function read(): SinhalaFont {
  try {
    const v = localStorage.getItem(KEY)
    return SINHALA_FONTS.some(f => f.value === v) ? (v as SinhalaFont) : DEFAULT
  } catch { return DEFAULT }
}

let current: SinhalaFont = read()

export function setSinhalaFont(next: SinhalaFont) {
  current = next
  try { next === DEFAULT ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, next) } catch { /* ignore */ }
  document.documentElement.dataset.siFont = next
  listeners.forEach(l => l())
}

function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l) } }

export function useSinhalaFont() {
  const font = useSyncExternalStore(subscribe, () => current)
  return { font, setFont: setSinhalaFont }
}
