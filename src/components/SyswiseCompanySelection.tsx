import React, { useEffect, useRef, useState } from 'react'
import { authApi } from '../services/apiService'
import type { AuthUser } from '../types'
import { launcherHomeUrl } from '../services/launchSource'
import { Icon } from './ui/Icon'

export default function SyswiseCompanySelection({ code, onLogin, onLegacy }: {
  code: string; onLogin: (token: string, user: AuthUser) => void; onLegacy: () => void;
}) {
  const started = useRef(false)
  const [identity, setIdentity] = useState<Awaited<ReturnType<typeof authApi.exchangeSyswise>> | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const openRole = async (available: Awaited<ReturnType<typeof authApi.exchangeSyswise>>, id: string) => {
    setBusy(true); setError('')
    try {
      const result = await authApi.selectSyswiseRole(available.selectionToken, id)
      onLogin(result.token, result.user)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not open this company.'); setBusy(false) }
  }
  useEffect(() => {
    if (started.current) return
    started.current = true
    authApi.exchangeSyswise(code).then(async available => {
      setIdentity(available)
      if (available.roles.length === 1) await openRole(available, available.roles[0].contactId)
    }).catch(e => setError(e.message))
  }, [code])
  const choose = async (id: string) => {
    if (!identity || busy) return
    await openRole(identity, id)
  }
  const showChoice = Boolean(identity && identity.roles.length > 1)
  const companies = [...new Map((identity?.roles || []).map(role => [role.companyId, role.companyName])).entries()]
  return <main className="min-h-screen bg-tw-bg flex items-center justify-center p-5">
    <section className="card w-full max-w-lg p-6 sm:p-8">
      <img src="/taskwise/icon-192.png" alt="TaskWise" className="h-14 w-14 rounded-xl mb-5" />
      <h1 className="page-title">{showChoice ? 'Choose your company' : error ? 'Taskwise access' : 'Opening Taskwise'}</h1>
      <p className="mt-2 mb-6 text-sm text-tw-text-secondary">{showChoice ? 'Select the company and role you want to open in Taskwise.' : 'Connecting your account to your company role.'}</p>
      {!showChoice && !error && <p role="status" className="text-sm text-tw-text-secondary">Connecting your account…</p>}
      {showChoice && companies.map(([id, name]) => <div key={id} className="mb-5">
        <h2 className="font-semibold text-tw-text mb-2">{name}</h2>
        {identity!.roles.filter(r => r.companyId === id).map(role => <button key={role.contactId} disabled={busy}
          onClick={() => void choose(role.contactId)} className="w-full flex items-center justify-between p-4 mb-2 rounded-xl border border-tw-border bg-tw-surface text-left hover:border-tw-primary/50 hover:bg-tw-hover transition-colors disabled:opacity-50">
          <span>{role.roleName}</span><span aria-hidden="true" className="text-tw-text-muted"><Icon name="arrowRight" className="w-4 h-4" /></span>
        </button>)}
      </div>)}
      {error && <p role="alert" className="alert-error mb-4">{error}</p>}
      {error && identity?.roles.length === 1 && <button disabled={busy} onClick={() => void choose(identity.roles[0].contactId)} className="btn-primary block mb-4">Try again</button>}
      <a href={launcherHomeUrl()} className="text-sm text-tw-primary font-semibold">Back to your apps</a>
      {error && <button className="block mt-4 text-sm text-tw-text-secondary underline" onClick={onLegacy}>Use existing Taskwise login</button>}
    </section>
  </main>
}
