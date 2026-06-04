import React, { useState, useEffect, useRef } from 'react'
import type { AuthUser, ImpersonationSession } from '../types'
import { authApi, workspaceApi } from '../services/apiService'

interface Props {
  user: AuthUser
  onSessionStarted: (token: string, impersonatedUser: AuthUser) => void
}

interface PersonnelRow {
  id: string
  name: string
  phone: string
  email?: string
  department?: { name: string }
}

export default function ImpersonationPage({ user, onSessionStarted }: Props) {
  const [activeTab, setActiveTab] = useState<'start' | 'history' | 'password'>('start')

  // ── Start session state ────────────────────────────────────────────────────
  const [personnel, setPersonnel] = useState<PersonnelRow[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<PersonnelRow | null>(null)
  const [impPassword, setImpPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState('')
  const passwordRef = useRef<HTMLInputElement>(null)

  // ── History state ──────────────────────────────────────────────────────────
  const [sessions, setSessions] = useState<ImpersonationSession[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // ── Set password state ─────────────────────────────────────────────────────
  const [loginPassword, setLoginPassword] = useState('')
  const [newImpPassword, setNewImpPassword] = useState('')
  const [confirmImpPassword, setConfirmImpPassword] = useState('')
  const [showLoginPw, setShowLoginPw] = useState(false)
  const [showNewPw, setShowNewPw] = useState(false)
  const [pwLoading, setPwLoading] = useState(false)
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState(false)

  useEffect(() => {
    workspaceApi.getPersonnel().then((data: unknown) => {
      setPersonnel(data as PersonnelRow[])
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (activeTab === 'history') loadHistory()
  }, [activeTab])

  const loadHistory = async () => {
    setHistoryLoading(true)
    try {
      const data = await authApi.listImpersonationSessions()
      setSessions(data as ImpersonationSession[])
    } catch {
      // ignore
    } finally {
      setHistoryLoading(false)
    }
  }

  const filtered = search.trim()
    ? personnel.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.phone.includes(search) ||
        (p.email && p.email.toLowerCase().includes(search.toLowerCase())) ||
        (p.department?.name.toLowerCase().includes(search.toLowerCase()))
      )
    : personnel

  const selectUser = (p: PersonnelRow) => {
    setSelected(p)
    setStartError('')
    setTimeout(() => passwordRef.current?.focus(), 80)
  }

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected || !impPassword.trim()) return
    setStarting(true)
    setStartError('')
    try {
      const result = await authApi.startImpersonation(selected.id, impPassword) as {
        token: string
        user: AuthUser
        session: { id: string; startedAt: string }
      }
      onSessionStarted(result.token, result.user as AuthUser)
    } catch (err: unknown) {
      setStartError((err as Error).message || 'Failed to start session')
    } finally {
      setStarting(false)
    }
  }

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwError('')
    setPwSuccess(false)
    if (newImpPassword !== confirmImpPassword) { setPwError('Passwords do not match'); return }
    if (newImpPassword.length < 10) { setPwError('Impersonation password must be at least 10 characters'); return }
    setPwLoading(true)
    try {
      await authApi.setImpersonationPassword(loginPassword, newImpPassword)
      setPwSuccess(true)
      setLoginPassword('')
      setNewImpPassword('')
      setConfirmImpPassword('')
    } catch (err: unknown) {
      setPwError((err as Error).message || 'Failed to set password')
    } finally {
      setPwLoading(false)
    }
  }

  const formatDuration = (start: string, end: string | null) => {
    if (!end) return 'Active'
    const secs = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000)
    if (secs < 60) return `${secs}s`
    if (secs < 3600) return `${Math.round(secs / 60)}m`
    return `${Math.floor(secs / 3600)}h ${Math.round((secs % 3600) / 60)}m`
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-tw-text">User Access</h1>
        <p className="text-sm text-tw-text-secondary mt-0.5">
          View any user's account as Chairman. Every session is logged in the audit trail.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-tw-hover rounded-xl p-1">
        {(['start', 'history', 'password'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold transition-all ${
              activeTab === tab
                ? 'bg-white text-tw-text shadow-sm'
                : 'text-tw-text-secondary hover:text-tw-text'
            }`}
          >
            {tab === 'start' ? 'Start Session' : tab === 'history' ? 'Session History' : 'Set Password'}
          </button>
        ))}
      </div>

      {/* ── Start Session Tab ─────────────────────────────────────────────── */}
      {activeTab === 'start' && (
        <div className="space-y-4">
          {/* Security notice */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex gap-3">
            <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
            <p className="text-sm text-amber-800">
              This session will be recorded in the audit log. You will see the system exactly as the selected user sees it.
              All actions during this session are attributed to you as Chairman.
            </p>
          </div>

          {/* Step 1: Select user */}
          <div className="card p-4 space-y-3">
            <h2 className="font-semibold text-tw-text text-sm">Step 1 — Select a user</h2>
            <input
              className="input w-full text-sm"
              placeholder="Search by name, phone, email, or department…"
              value={search}
              onChange={e => { setSearch(e.target.value); setSelected(null) }}
            />
            <div className="max-h-64 overflow-y-auto divide-y divide-tw-border border border-tw-border rounded-xl">
              {filtered.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-tw-text-secondary">No users found</div>
              ) : (
                filtered.map(p => (
                  <button
                    key={p.id}
                    onClick={() => selectUser(p)}
                    className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-tw-hover transition-colors ${
                      selected?.id === p.id ? 'bg-tw-primary/5 border-l-2 border-tw-primary' : ''
                    }`}
                  >
                    <div className="w-8 h-8 rounded-full bg-tw-primary/10 text-tw-primary font-bold flex items-center justify-center text-xs flex-shrink-0">
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-tw-text truncate">{p.name}</div>
                      <div className="text-xs text-tw-text-secondary truncate">
                        {p.department?.name ?? '—'} · {p.phone}
                      </div>
                    </div>
                    {selected?.id === p.id && (
                      <svg className="w-4 h-4 text-tw-primary ml-auto flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
                      </svg>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Step 2: Enter password and confirm */}
          {selected && (
            <form onSubmit={handleStart} className="card p-4 space-y-4">
              <h2 className="font-semibold text-tw-text text-sm">
                Step 2 — Enter your Chairman impersonation password
              </h2>
              <div className="bg-tw-hover rounded-xl px-4 py-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-tw-primary/10 text-tw-primary font-bold flex items-center justify-center text-xs flex-shrink-0">
                  {selected.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="text-sm font-bold text-tw-text">{selected.name}</div>
                  <div className="text-xs text-tw-text-secondary">{selected.department?.name ?? '—'} · {selected.phone}</div>
                </div>
              </div>

              <div className="relative">
                <input
                  ref={passwordRef}
                  type={showPassword ? 'text' : 'password'}
                  className="input w-full text-sm pr-10"
                  placeholder="Chairman impersonation password"
                  value={impPassword}
                  onChange={e => { setImpPassword(e.target.value); setStartError('') }}
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-tw-text-secondary hover:text-tw-text"
                  tabIndex={-1}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {showPassword
                      ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
                      : <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></>
                    }
                  </svg>
                </button>
              </div>

              {startError && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
                  {startError}
                </div>
              )}

              <button
                type="submit"
                disabled={!impPassword.trim() || starting}
                className="w-full py-3 rounded-xl bg-amber-500 text-white font-bold text-sm hover:bg-amber-600 active:scale-[0.99] disabled:opacity-50 transition-all"
              >
                {starting ? 'Starting session…' : `View as ${selected.name}`}
              </button>
            </form>
          )}
        </div>
      )}

      {/* ── History Tab ───────────────────────────────────────────────────── */}
      {activeTab === 'history' && (
        <div className="card overflow-hidden">
          {historyLoading ? (
            <div className="p-8 text-center text-sm text-tw-text-secondary">Loading…</div>
          ) : sessions.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-tw-text font-semibold mb-1">No sessions yet</p>
              <p className="text-sm text-tw-text-secondary">Impersonation sessions will appear here.</p>
            </div>
          ) : (
            <div className="divide-y divide-tw-border">
              <div className="hidden md:grid grid-cols-[1fr_120px_120px_80px_100px] gap-3 px-4 py-2.5 bg-tw-hover text-xs font-bold text-tw-text-secondary uppercase tracking-wider">
                <span>User</span>
                <span>Started</span>
                <span>Ended</span>
                <span>Duration</span>
                <span>End reason</span>
              </div>
              {sessions.map(s => (
                <div key={s.id} className="px-4 py-3 hover:bg-tw-hover transition-colors">
                  <div className="md:grid md:grid-cols-[1fr_120px_120px_80px_100px] md:gap-3 md:items-center space-y-1 md:space-y-0">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-tw-primary/10 text-tw-primary font-bold flex items-center justify-center text-xs flex-shrink-0">
                        {s.targetName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-tw-text">{s.targetName}</div>
                        <div className="text-xs text-tw-text-secondary">{s.ipAddress ?? 'unknown IP'}</div>
                      </div>
                    </div>
                    <div className="text-xs text-tw-text-secondary">
                      {new Date(s.startedAt).toLocaleDateString()} {new Date(s.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div className="text-xs text-tw-text-secondary">
                      {s.endedAt
                        ? `${new Date(s.endedAt).toLocaleDateString()} ${new Date(s.endedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                        : <span className="text-amber-600 font-semibold">Active</span>
                      }
                    </div>
                    <div className="text-xs text-tw-text-secondary">
                      {formatDuration(s.startedAt, s.endedAt)}
                    </div>
                    <div>
                      {s.endReason ? (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          s.endReason === 'exit' ? 'bg-green-50 text-green-700' :
                          s.endReason === 'logout' ? 'bg-blue-50 text-blue-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>{s.endReason}</span>
                      ) : (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">active</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Set Password Tab ──────────────────────────────────────────────── */}
      {activeTab === 'password' && (
        <form onSubmit={handleSetPassword} className="card p-5 space-y-4">
          <div>
            <h2 className="font-semibold text-tw-text">Set Impersonation Password</h2>
            <p className="text-sm text-tw-text-secondary mt-1">
              This is a separate second password used only for impersonation sessions.
              It is stored as a secure hash and never exposes your real login password.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-tw-text-secondary mb-1.5 uppercase tracking-wide">
                Your current login password (to verify it's you)
              </label>
              <div className="relative">
                <input
                  type={showLoginPw ? 'text' : 'password'}
                  className="input w-full text-sm pr-10"
                  placeholder="Current login password"
                  value={loginPassword}
                  onChange={e => { setLoginPassword(e.target.value); setPwError(''); setPwSuccess(false) }}
                  autoComplete="current-password"
                />
                <button type="button" onClick={() => setShowLoginPw(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-tw-text-secondary" tabIndex={-1}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {showLoginPw
                      ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
                      : <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></>
                    }
                  </svg>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-tw-text-secondary mb-1.5 uppercase tracking-wide">
                New impersonation password (min. 10 characters)
              </label>
              <div className="relative">
                <input
                  type={showNewPw ? 'text' : 'password'}
                  className="input w-full text-sm pr-10"
                  placeholder="New impersonation password"
                  value={newImpPassword}
                  onChange={e => { setNewImpPassword(e.target.value); setPwError(''); setPwSuccess(false) }}
                  autoComplete="new-password"
                />
                <button type="button" onClick={() => setShowNewPw(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-tw-text-secondary" tabIndex={-1}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {showNewPw
                      ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
                      : <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></>
                    }
                  </svg>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-tw-text-secondary mb-1.5 uppercase tracking-wide">
                Confirm impersonation password
              </label>
              <input
                type="password"
                className="input w-full text-sm"
                placeholder="Confirm impersonation password"
                value={confirmImpPassword}
                onChange={e => { setConfirmImpPassword(e.target.value); setPwError(''); setPwSuccess(false) }}
                autoComplete="new-password"
              />
            </div>
          </div>

          {pwError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{pwError}</div>
          )}
          {pwSuccess && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-green-700 font-semibold">
              Impersonation password updated successfully.
            </div>
          )}

          <button
            type="submit"
            disabled={!loginPassword || !newImpPassword || !confirmImpPassword || pwLoading}
            className="w-full py-3 rounded-xl bg-tw-primary text-white font-bold text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {pwLoading ? 'Saving…' : 'Save Impersonation Password'}
          </button>
        </form>
      )}
    </div>
  )
}
