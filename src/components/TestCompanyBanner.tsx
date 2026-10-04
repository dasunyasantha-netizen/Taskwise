import React, { useEffect, useState } from 'react'
import { testSandboxApi, type TestFeedback } from '../services/apiService'
import type { AuthUser, ViewMode } from '../types'
import { Icon } from './ui/Icon'

export const isTestCompany = (user: AuthUser) => user.workspaceId === 'taskwise-company-testing-v1'

export default function TestCompanyBanner({ user, view }: { user: AuthUser; view: ViewMode }) {
  const [panel, setPanel] = useState<'feedback' | 'review' | 'reset' | null>(null)
  const [nextReset, setNextReset] = useState('')
  const [rows, setRows] = useState<TestFeedback[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [form, setForm] = useState({ screen: view as string, expected: '', actual: '', suggestion: '' })
  useEffect(() => { testSandboxApi.status().then(s => setNextReset(s.nextResetAt)).catch(() => setError('Test status unavailable')) }, [])
  useEffect(() => { setForm(f => ({ ...f, screen: view })) }, [view])
  useEffect(() => {
    if (!panel) return
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) setPanel(null) }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [panel, busy])
  const open = async (value: typeof panel) => {
    setPanel(value); setError(''); setSaved(false)
    if (value === 'review') {
      try { setRows(await testSandboxApi.listFeedback()) }
      catch (e) { setError(e instanceof Error ? e.message : 'Could not load feedback') }
    }
  }
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('')
    try { await testSandboxApi.feedback(form); setSaved(true); setForm(f => ({ ...f, expected: '', actual: '', suggestion: '' })) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save feedback') }
    finally { setBusy(false) }
  }
  const reset = async () => {
    setBusy(true); setError('')
    try { await testSandboxApi.reset(); window.location.reload() }
    catch (e) { setError(e instanceof Error ? e.message : 'Reset failed'); setBusy(false) }
  }
  return <>
    <div className="test-company-banner fixed inset-x-0 top-0 z-40 flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-amber-50 border-b border-amber-300 text-amber-950">
      <div className="min-w-0 text-xs"><strong className="block">TEST COMPANY · {user.loginId || user.name}</strong>
        <span>Sample data restored daily · {nextReset ? new Date(nextReset).toLocaleString('en-GB', { timeZone: 'Asia/Colombo', hour: '2-digit', minute: '2-digit' }) : '00:00'} Sri Lanka</span>
      </div>
      <div className="flex gap-1 items-center">
        <button className="btn-secondary text-xs" onClick={() => void open('feedback')}><Icon name="message" className="w-4 h-4" /> Feedback</button>
        {user.actorType === 'director' && <>
          <button className="icon-btn w-8 h-8" title="Review feedback" aria-label="Review feedback" onClick={() => void open('review')}><Icon name="reports" className="w-4 h-4" /></button>
          <button className="icon-btn w-8 h-8" title="Reset test company" aria-label="Reset test company" onClick={() => void open('reset')}><Icon name="refresh" className="w-4 h-4" /></button>
        </>}
      </div>
    </div>
    {panel && <div className="fixed inset-0 z-[10000] bg-black/40 flex items-center justify-center p-3" onClick={() => !busy && setPanel(null)}>
      <section role="dialog" aria-modal="true" aria-labelledby="test-panel-title" className="bg-tw-surface text-tw-text border border-tw-border rounded-lg p-5 w-full max-w-xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4"><h2 id="test-panel-title" className="font-semibold text-lg">{panel === 'review' ? 'Company feedback' : panel === 'reset' ? 'Reset test company' : 'Role feedback'}</h2>
          <button className="icon-btn w-8 h-8" aria-label="Close" disabled={busy} onClick={() => setPanel(null)}><Icon name="x" className="w-4 h-4" /></button></div>
        {error && <p role="alert" className="alert-error mb-3">{error}</p>}
        {panel === 'feedback' && <form onSubmit={submit} className="space-y-3">
          <p className="text-sm text-tw-text-muted">{user.name} · Feedback is retained after resets.</p>
          {saved && <p role="status" className="text-sm text-green-600">Feedback saved.</p>}
          {(['screen', 'expected', 'actual', 'suggestion'] as const).map(key => <label key={key} className="block text-sm">
            {{ screen: 'Screen', expected: 'Expected behaviour', actual: 'What happened', suggestion: 'Suggested change' }[key]}
            {key === 'screen' ? <input autoFocus className="input mt-1" required maxLength={2000} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
              : <textarea className="input mt-1" required maxLength={2000} rows={3} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />}
          </label>)}
          <button disabled={busy} className="btn-primary"><Icon name="check" className="w-4 h-4" />{busy ? 'Saving...' : 'Submit feedback'}</button>
        </form>}
        {panel === 'reset' && <><p className="text-sm mb-4">Restore all sample scenarios and test accounts? Current testing changes will be cleared. Saved feedback will remain.</p>
          <button disabled={busy} className="btn-primary" onClick={() => void reset()}><Icon name="refresh" className="w-4 h-4" />{busy ? 'Restoring...' : 'Restore sample data'}</button></>}
        {panel === 'review' && <div className="space-y-4">{rows.length === 0 && <p className="text-sm text-tw-text-muted">No feedback yet.</p>}
          {rows.map(row => <article key={row.id} className="border-b border-tw-border pb-4 text-sm break-words">
            <strong>{row.role} · {row.screen}</strong><p className="text-xs text-tw-text-muted">{new Date(row.createdAt).toLocaleString('en-GB', { timeZone: 'Asia/Colombo' })}</p>
            <p className="mt-2 whitespace-pre-wrap">Expected: {row.expected}</p><p className="whitespace-pre-wrap">Actual: {row.actual}</p><p className="whitespace-pre-wrap">Suggestion: {row.suggestion}</p>
          </article>)}
        </div>}
      </section>
    </div>}
  </>
}
