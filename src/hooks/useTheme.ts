import { useSyncExternalStore } from 'react'

// Light / dark / follow-the-OS theme. The choice is per browser (localStorage);
// index.html applies it before first paint so there is no flash.
export type ThemePref = 'light' | 'dark' | 'system'

const KEY = 'tw_theme'
const listeners = new Set<() => void>()
const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch { return 'system' }
}

let pref: ThemePref = readPref()

function resolved(p: ThemePref): 'light' | 'dark' {
  return p === 'system' ? (media?.matches ? 'dark' : 'light') : p
}

function apply() {
  const mode = resolved(pref)
  document.documentElement.classList.toggle('dark', mode === 'dark')
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mode === 'dark' ? '#0b1017' : '#f4f6fa')
  listeners.forEach(l => l())
}

media?.addEventListener('change', () => { if (pref === 'system') apply() })

export function setThemePref(next: ThemePref) {
  pref = next
  try { next === 'system' ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, next) } catch { /* ignore */ }
  apply()
}

function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l) } }

export function useTheme() {
  const p = useSyncExternalStore(subscribe, () => pref)
  const mode = useSyncExternalStore(subscribe, () => resolved(pref))
  return { pref: p, mode, setPref: setThemePref }
}
