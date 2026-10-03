import React, { createContext, useContext } from 'react'
import type { AuthUser } from '../types'
import { authApi } from '../services/apiService'
import { si } from './sinhala'
import { ta } from './tamil'

export type Language = 'en' | 'si' | 'ta'
export const LANGUAGES: Array<{ value: Language; label: string; locale: string }> = [
  { value: 'en', label: 'English', locale: 'en-GB' },
  { value: 'si', label: 'සිංහල',   locale: 'si-LK' },
  { value: 'ta', label: 'தமிழ்',   locale: 'ta-LK' },
]
export const toLanguage = (value: unknown): Language =>
  value === 'si' || value === 'ta' ? value : 'en'

/** Maps a BCP-47 locale (as returned by useLanguage) back to its Language. */
export const languageOf = (locale: string): Language =>
  LANGUAGES.find(l => l.locale === locale)?.value ?? 'en'

const catalogs: Record<Exclude<Language, 'en'>, Record<string, string>> = { si, ta }

const LanguageContext = createContext<Language>('en')
export const LanguageProvider = ({ language, children }: { language: Language; children: React.ReactNode }) =>
  <LanguageContext.Provider value={language}><div lang={language}>{children}</div></LanguageContext.Provider>

type Vars = Record<string, string | number>
const fill = (text: string, vars?: Vars) =>
  vars ? text.replace(/\{(\w+)\}/g, (m, key) => (key in vars ? String(vars[key]) : m)) : text

// Server-built YSO penalty reasons (see server/src/helpers/ysoRules.ts).
const patterns: Array<{ re: RegExp; si: (m: RegExpExecArray) => string; ta: (m: RegExpExecArray) => string }> = [
  {
    re: /^Unmarked \/ unapproved attendance: (.+)$/,
    si: m => `ලකුණු නොකළ / අනුමත නොකළ සහභාගීත්වය: ${m[1]}`,
    ta: m => `குறிக்கப்படாத / அங்கீகரிக்கப்படாத வரவு: ${m[1]}`,
  },
  {
    re: /^Missing (program plan|progress report) for (\d{4}-\d{2}) \(due (\d{4}-\d{2}-\d{2})\)$/,
    si: m => `${m[2]} සඳහා ${m[1] === 'program plan' ? 'වැඩසටහන් සැලැස්ම' : 'ප්‍රගති වාර්තාව'} නොමැත (නියමිත දිනය ${m[3]})`,
    ta: m => `${m[2]} க்கான ${m[1] === 'program plan' ? 'நிகழ்ச்சித் திட்டம்' : 'முன்னேற்ற அறிக்கை'} இல்லை (கெடு ${m[3]})`,
  },
  {
    re: /^Missing Secretariat weeks ending (.+)$/,
    si: m => `වාර්තා නොකළ ප්‍රාදේශීය ලේකම් කාර්යාල සති (අවසන් වන දින): ${m[1]}`,
    ta: m => `அறிக்கையிடப்படாத பிரதேச செயலக வாரங்கள் (முடிவு திகதி): ${m[1]}`,
  },
  {
    re: /^Unsettled advance (.+): (\d+) overdue days in (\d{4}-\d{2})$/,
    si: m => `නොපියවූ අත්තිකාරම ${m[1]}: ${m[3]} හි ප්‍රමාද දින ${m[2]}`,
    ta: m => `தீர்க்கப்படாத முற்பணம் ${m[1]}: ${m[3]} இல் ${m[2]} தாமத நாட்கள்`,
  },
]

// The source strings are the English catalog. Translation never modifies persisted
// user input, reference numbers, enum values, or API payloads. Templates use
// {placeholders} so each language can order words naturally.
export function translate(source: string, language: Language, vars?: Vars): string {
  if (language === 'en') return fill(source, vars)
  const key = source.trim()
  const exact = catalogs[language][key]
  if (exact) return fill(source.replace(key, exact), vars)
  for (const p of patterns) {
    const m = p.re.exec(source)
    if (m) return p[language](m)
  }
  return fill(source, vars)
}

const monthNames: Record<Exclude<Language, 'en'>, string[]> = {
  si: ['ජනවාරි', 'පෙබරවාරි', 'මාර්තු', 'අප්‍රේල්', 'මැයි', 'ජූනි', 'ජූලි', 'අගෝස්තු', 'සැප්තැම්බර්', 'ඔක්තෝබර්', 'නොවැම්බර්', 'දෙසැම්බර්'],
  ta: ['ஜனவரி', 'பெப்ரவரி', 'மார்ச்', 'ஏப்ரல்', 'மே', 'ஜூன்', 'ஜூலை', 'ஆகஸ்ட்', 'செப்டெம்பர்', 'ஒக்டோபர்', 'நவம்பர்', 'டிசம்பர்'],
}
export const MONTH_NAMES = monthNames
export const WEEKDAY_INITIALS: Record<Exclude<Language, 'en'>, string[]> = {
  si: ['ඉ', 'ස', 'අ', 'බ', 'බ්‍ර', 'සි', 'සෙ'],
  ta: ['ஞா', 'தி', 'செ', 'பு', 'வி', 'வெ', 'ச'],
}

export function displayDate(value: string, language: Language, time = false): string {
  if (language === 'en') return time
    ? new Date(value).toLocaleString('en-GB', { timeZone: 'Asia/Colombo', dateStyle: 'medium', timeStyle: 'short' })
    : new Date(value + 'T00:00:00').toLocaleDateString('en-GB', { dateStyle: 'medium' })
  const names = monthNames[language]
  if (!time) {
    const [year, month, day] = value.split('-').map(Number)
    return `${year} ${names[month - 1]} ${day}`
  }
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Colombo', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value))
  const get = (key: string) => parts.find(part => part.type === key)?.value || ''
  return `${get('year')} ${names[Number(get('month')) - 1]} ${get('day')}, ${get('hour')}:${get('minute')}`
}

/** "October 2026" in the active language (YSO reporting month labels). */
export function monthYear(period: string, language: Language): string {
  const [year, month] = period.split('-').map(Number)
  if (language === 'en')
    return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  return `${year} ${monthNames[language][month - 1]}`
}

export function useLanguage() {
  const language = useContext(LanguageContext)
  return {
    language,
    locale: LANGUAGES.find(l => l.value === language)!.locale,
    t: (text: string, vars?: Vars) => translate(text, language, vars),
  }
}

export function LanguageToggle({ user, onUserUpdate }: { user: AuthUser; onUserUpdate: (value: Partial<AuthUser>) => void }) {
  const { language, t } = useLanguage()
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState('')
  const select = async (next: Language) => {
    if (next === language || saving) return
    setSaving(true); setError('')
    try {
      const saved = await authApi.language(next)
      onUserUpdate(saved)
    } catch { setError(t('Could not save language. Please retry.')) }
    finally { setSaving(false) }
  }
  return <div className="flex flex-col items-end gap-1">
    <div role="group" aria-label={t('Language')} className="seg">
      {LANGUAGES.map(l => <button key={l.value} type="button" lang={l.value} disabled={saving || !!user.impersonation} aria-pressed={language === l.value} onClick={() => select(l.value)} className={`seg-item min-h-8 ${language === l.value ? 'seg-item-active' : ''}`}>{l.label}</button>)}
    </div>
    {error && <span role="alert" className="text-xs text-rose-700">{error}</span>}
  </div>
}
