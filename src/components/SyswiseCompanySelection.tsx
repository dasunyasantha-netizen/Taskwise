import React, { useEffect, useRef, useState } from 'react'
import { authApi } from '../services/apiService'
import type { AuthUser } from '../types'
import { launcherHomeUrl } from '../services/launchSource'

export default function SyswiseCompanySelection({ code, onLogin, onLegacy }: {
  code: string; onLogin: (token: string, user: AuthUser) => void; onLegacy: () => void;
}) {
  const started = useRef(false)
  const [identity, setIdentity] = useState<Awaited<ReturnType<typeof authApi.exchangeSyswise>> | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    authApi.exchangeSyswise(code).then(setIdentity).catch(e => setError(e.message))
  }, [code])
  const choose = async (id: string) => {
    if (!identity || busy) return
    setBusy(true); setError('')
    try {
      const result = await authApi.selectSyswiseRole(identity.selectionToken, id)
      onLogin(result.token, result.user)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not open this company.'); setBusy(false) }
  }
  const companies = [...new Map((identity?.roles || []).map(role => [role.companyId, role.companyName])).entries()]
  return <main className="min-h-screen bg-tw-bg flex items-center justify-center p-5">
    <section className="card w-full max-w-lg p-6 sm:p-8">
      <img src="/taskwise/icon-192.png" alt="TaskWise" className="h-14 w-14 rounded-xl mb-5" />
      <h1 className="text-2xl font-bold text-tw-text">Choose your company</h1>
      <p className="mt-2 mb-6 text-sm text-tw-text-secondary">Select the company and role you want to open in Taskwise.</p>
      {!identity && !error && <p role="status" className="text-sm text-tw-text-secondary">Connecting your account…</p>}
      {companies.map(([id, name]) => <div key={id} className="mb-5">
        <h2 className="font-semibold text-tw-text mb-2">{name}</h2>
        {identity!.roles.filter(r => r.companyId === id).map(role => <button key={role.contactId} disabled={busy}
          onClick={() => void choose(role.contactId)} className="w-full flex items-center justify-between p-4 mb-2 rounded-xl border border-tw-border bg-white text-left hover:border-tw-primary disabled:opacity-50">
          <span>{role.roleName}</span><span aria-hidden="true">→</span>
        </button>)}
      </div>)}
      {error && <p role="alert" className="text-sm text-red-700 bg-red-50 p-3 rounded-xl mb-4">{error}</p>}
      <a href={launcherHomeUrl()} className="text-sm text-tw-primary font-semibold">Back to your apps</a>
      {error && <button className="block mt-4 text-sm text-tw-text-secondary underline" onClick={onLegacy}>Use existing Taskwise login</button>}
    </section>
  </main>
}
