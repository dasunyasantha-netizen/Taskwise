import React, { useEffect, useMemo, useState } from 'react'
import { startAuthentication } from '@simplewebauthn/browser'
import type { AuthUser, ImpersonationSession } from '../types'
import { authApi, webAuthnApi } from '../services/apiService'

interface Props {
  user: AuthUser
  onSessionStarted: (token: string, impersonatedUser: AuthUser) => void
}

interface AccessTarget {
  id: string
  actorType: 'director' | 'personnel'
  name: string
  phone: string
  email?: string
  loginId: string
  workspaceId: string
  role: string
  companyName: string
  companyPrefix?: string | null
}

export default function ImpersonationPage({ user, onSessionStarted }: Props) {
  const [activeTab, setActiveTab] = useState<'start' | 'history'>('start')
  const [targets, setTargets] = useState<AccessTarget[]>([])
  const [directoryLoading, setDirectoryLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<AccessTarget | null>(null)
  const [reason, setReason] = useState('')
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState('')
  const [sessions, setSessions] = useState<ImpersonationSession[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  useEffect(() => {
    authApi.listImpersonationTargets()
      .then(data => setTargets(data as AccessTarget[]))
      .catch(err => setStartError(err instanceof Error ? err.message : 'Could not load accounts'))
      .finally(() => setDirectoryLoading(false))
  }, [])

  useEffect(() => {
    if (activeTab !== 'history') return
    loadHistory()
  }, [activeTab])

  const loadHistory = () => {
    setHistoryLoading(true)
    authApi.listImpersonationSessions()
      .then(data => setSessions(data as ImpersonationSession[]))
      .finally(() => setHistoryLoading(false))
  }

  const revokeSession = async (id: string) => {
    setRevokingId(id)
    try {
      await authApi.revokeImpersonationSession(id)
      await authApi.listImpersonationSessions().then(data => setSessions(data as ImpersonationSession[]))
    } finally {
      setRevokingId(null)
    }
  }

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return targets
    return targets.filter(target => [
      target.name,
      target.phone,
      target.email,
      target.loginId,
      target.role,
      target.companyName,
      target.companyPrefix,
    ].some(value => value?.toLowerCase().includes(query)))
  }, [search, targets])

  const handleStart = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selected || reason.trim().length < 5 || starting) return
    setStarting(true)
    setStartError('')
    try {
      const loginId = user.loginId || user.phone
      if (!loginId) throw new Error('Your administrator login ID is unavailable')

      const optionsResponse = await webAuthnApi.getAuthOptions(loginId) as Record<string, unknown>
      const actorId = optionsResponse._actorId as string
      const actorType = optionsResponse._actorType as string
      const { _actorId: _actorId, _actorType: _actorType, ...options } = optionsResponse
      const credential = await startAuthentication({
        optionsJSON: options as unknown as Parameters<typeof startAuthentication>[0]['optionsJSON'],
      })
      const verification = await webAuthnApi.verifyAuthentication(actorId, actorType, credential)
      const result = await authApi.startImpersonation(
        selected.id,
        selected.actorType,
        reason.trim(),
        verification.token,
      )
      onSessionStarted(result.token, result.user as AuthUser)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to start support session'
      if (message.toLowerCase().includes('cancel') || message.toLowerCase().includes('not allowed')) {
        setStartError('Passkey verification was cancelled')
      } else if (message.includes('No passkeys registered')) {
        setStartError('Register a passkey in Settings before using support access.')
      } else {
        setStartError(message)
      }
    } finally {
      setStarting(false)
    }
  }

  const formatDuration = (session: ImpersonationSession) => {
    const end = session.endedAt ? new Date(session.endedAt).getTime() : Date.now()
    const seconds = Math.max(0, Math.round((end - new Date(session.startedAt).getTime()) / 1000))
    return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-tw-text">Support Access</h1>
        <p className="text-sm text-tw-text-secondary mt-1">
          System Admin only. Sessions require a passkey, expire after 15 minutes, and are fully audited.
        </p>
      </div>

      <div className="flex gap-1 bg-tw-hover rounded-xl p-1">
        {(['start', 'history'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold transition-all ${
              activeTab === tab ? 'bg-white text-tw-text shadow-sm' : 'text-tw-text-secondary hover:text-tw-text'
            }`}
          >
            {tab === 'start' ? 'Start Session' : 'Session History'}
          </button>
        ))}
      </div>

      {activeTab === 'start' && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-900">
            Use support access only for an approved support or administrative purpose. The target account,
            reason, administrator, IP address, session times, and write actions are recorded.
          </div>

          <div className="card p-4 space-y-3">
            <h2 className="font-semibold text-tw-text text-sm">1. Select an active account</h2>
            <input
              className="input w-full text-sm"
              placeholder="Search name, login ID, company, role, phone, or email..."
              value={search}
              onChange={event => { setSearch(event.target.value); setSelected(null) }}
            />
            <div className="max-h-72 overflow-y-auto divide-y divide-tw-border border border-tw-border rounded-xl">
              {directoryLoading ? (
                <div className="px-4 py-8 text-center text-sm text-tw-text-secondary">Loading accounts...</div>
              ) : filtered.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-tw-text-secondary">No accounts found</div>
              ) : filtered.map(target => (
                <button
                  type="button"
                  key={`${target.actorType}:${target.id}`}
                  onClick={() => { setSelected(target); setStartError('') }}
                  className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-tw-hover transition-colors ${
                    selected?.id === target.id && selected.actorType === target.actorType
                      ? 'bg-tw-primary/5 border-l-2 border-tw-primary'
                      : ''
                  }`}
                >
                  <div className="w-9 h-9 rounded-full bg-tw-primary/10 text-tw-primary font-bold flex items-center justify-center text-xs flex-shrink-0">
                    {target.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-tw-text truncate">{target.name}</span>
                      <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-tw-hover text-tw-text-secondary">
                        {target.actorType}
                      </span>
                    </div>
                    <div className="text-xs text-tw-text-secondary truncate">
                      {target.companyName} · {target.role} · {target.loginId}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {selected && (
            <form onSubmit={handleStart} className="card p-4 space-y-4">
              <h2 className="font-semibold text-tw-text text-sm">2. Record the reason and verify your passkey</h2>
              <div className="bg-tw-hover rounded-xl px-4 py-3">
                <div className="text-sm font-bold text-tw-text">{selected.name}</div>
                <div className="text-xs text-tw-text-secondary">
                  {selected.companyName} · {selected.role} · {selected.loginId}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-tw-text-secondary mb-1.5 uppercase tracking-wide">
                  Support reason
                </label>
                <textarea
                  className="input w-full text-sm min-h-24 resize-y"
                  placeholder="Example: Investigating ticket TW-1042 with company approval"
                  maxLength={500}
                  value={reason}
                  onChange={event => { setReason(event.target.value); setStartError('') }}
                />
                <div className="text-xs text-tw-text-secondary mt-1 text-right">{reason.length}/500</div>
              </div>

              {startError && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
                  {startError}
                </div>
              )}

              <button
                type="submit"
                disabled={reason.trim().length < 5 || starting}
                className="w-full py-3 rounded-xl bg-amber-500 text-white font-bold text-sm hover:bg-amber-600 active:scale-[0.99] disabled:opacity-50 transition-all"
              >
                {starting ? 'Verifying and starting...' : `Verify passkey and access as ${selected.name}`}
              </button>
            </form>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="card overflow-hidden">
          {historyLoading ? (
            <div className="p-8 text-center text-sm text-tw-text-secondary">Loading...</div>
          ) : sessions.length === 0 ? (
            <div className="p-8 text-center text-sm text-tw-text-secondary">No support-access sessions yet.</div>
          ) : (
            <div className="divide-y divide-tw-border">
              {sessions.map(session => (
                <div key={session.id} className="px-4 py-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-sm font-semibold text-tw-text">{session.targetName}</span>
                      <span className="text-xs text-tw-text-secondary ml-2">({session.targetActorType})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        session.endedAt ? 'bg-gray-100 text-gray-600' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {session.endReason || (session.endedAt ? 'ended' : 'active')}
                      </span>
                      {!session.endedAt && (
                        <button
                          type="button"
                          onClick={() => revokeSession(session.id)}
                          disabled={revokingId === session.id}
                          className="text-xs font-bold px-2 py-1 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
                        >
                          {revokingId === session.id ? 'Revoking...' : 'Revoke'}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-tw-text-secondary">
                    Admin: {session.adminName || 'System Admin'} · Started {new Date(session.startedAt).toLocaleString()} · {formatDuration(session)}
                  </div>
                  <div className="text-sm text-tw-text">{session.reason || 'Legacy session (no reason recorded)'}</div>
                  <div className="text-xs text-tw-text-secondary">IP: {session.ipAddress || 'unknown'}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
