import React, { createContext, useContext } from 'react'
import type { AuthUser } from '../types'
import { authApi } from '../services/apiService'
import { si } from './sinhala'

export type Language = 'en' | 'si'
const LanguageContext = createContext<Language>('en')
export const LanguageProvider = ({ language, children }: { language: Language; children: React.ReactNode }) =>
  <LanguageContext.Provider value={language}><div lang={language}>{children}</div></LanguageContext.Provider>

// The source strings are the English catalog. Translation never modifies persisted
// user input, reference numbers, enum values, or API payloads.
export function translate(source: string, language: Language): string {
  if (language === 'en') return source
  const exact = si[source.trim()]
  if (exact) return source.replace(source.trim(), exact)
  const attendance = /^Unmarked \/ unapproved attendance: (.+)$/.exec(source)
  if (attendance) return `ලකුණු නොකළ / අනුමත නොකළ සහභාගීත්වය: ${attendance[1]}`
  const missing = /^Missing (program plan|progress report) for (\d{4}-\d{2}) \(due (\d{4}-\d{2}-\d{2})\)$/.exec(source)
  if (missing) return `${missing[2]} සඳහා ${missing[1] === 'program plan' ? 'වැඩසටහන් සැලැස්ම' : 'ප්‍රගති වාර්තාව'} නොමැත (නියමිත දිනය ${missing[3]})`
  const weeks = /^Missing Secretariat weeks ending (.+)$/.exec(source)
  if (weeks) return `වාර්තා නොකළ ප්‍රාදේශීය ලේකම් කාර්යාල සති: ${weeks[1]}`
  const advance = /^Unsettled advance (.+): (\d+) overdue days in (\d{4}-\d{2})$/.exec(source)
  if (advance) return `නොපියවූ අත්තිකාරම ${advance[1]}: ${advance[3]} හි ප්‍රමාද දින ${advance[2]}`
  return source
}

const monthNames = ['ජනවාරි', 'පෙබරවාරි', 'මාර්තු', 'අප්‍රේල්', 'මැයි', 'ජූනි', 'ජූලි', 'අගෝස්තු', 'සැප්තැම්බර්', 'ඔක්තෝබර්', 'නොවැම්බර්', 'දෙසැම්බර්']
export function displayDate(value: string, language: Language, time = false): string {
  if (language === 'en') return time
    ? new Date(value).toLocaleString('en-GB', { timeZone: 'Asia/Colombo', dateStyle: 'medium', timeStyle: 'short' })
    : new Date(value + 'T00:00:00').toLocaleDateString('en-GB', { dateStyle: 'medium' })
  if (!time) {
    const [year, month, day] = value.split('-').map(Number)
    return `${year} ${monthNames[month - 1]} ${day}`
  }
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Colombo', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value))
  const get = (key: string) => parts.find(part => part.type === key)?.value || ''
  return `${get('year')} ${monthNames[Number(get('month')) - 1]} ${get('day')}, ${get('hour')}:${get('minute')}`
}

export function useLanguage() {
  const language = useContext(LanguageContext)
  return { language, locale: language === 'si' ? 'si-LK' : 'en-GB', t: (text: string) => translate(text, language) }
}

export function LanguageToggle({ user, onUserUpdate }: { user: AuthUser; onUserUpdate: (value: Partial<AuthUser>) => void }) {
  const { language } = useLanguage()
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState('')
  const select = async (next: Language) => {
    if (next === language || saving) return
    setSaving(true); setError('')
    try {
      const saved = await authApi.language(next)
      onUserUpdate(saved)
    } catch { setError(language === 'si' ? 'භාෂාව සුරැකීමට නොහැකි විය. නැවත උත්සාහ කරන්න.' : 'Could not save language. Please retry.') }
    finally { setSaving(false) }
  }
  return <div className="flex flex-col items-end gap-1">
    <div role="group" aria-label={language === 'si' ? 'භාෂාව' : 'Language'} className="inline-flex rounded-xl border border-slate-300 bg-white p-0.5 shadow-sm">
      {(['en', 'si'] as const).map(next => <button key={next} type="button" lang={next} disabled={saving || !!user.impersonation} aria-pressed={language === next} onClick={() => select(next)} className={`min-h-9 rounded-lg px-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700 ${language === next ? 'bg-teal-700 text-white' : 'text-slate-700 hover:bg-slate-100'}`}>{next === 'en' ? 'English' : 'සිංහල'}</button>)}
    </div>
    {error && <span role="alert" className="text-xs text-rose-700">{error}</span>}
  </div>
}
