import React, { useState, useEffect } from 'react'
import type { AuthUser } from '../types'
import { authApi } from '../services/apiService'
import CompanyRequestModal from './CompanyRequestModal'
import Select from './Select'
import { launcherHomeUrl, launcherName, sharedIdentityUrl } from '../services/launchSource'
import { Icon } from './ui/Icon'
import { ThemeToggle } from './ui/Primitives'

interface Props {
  onLogin: (token: string, user: AuthUser) => void
}

export default function Auth({ onLogin }: Props) {
  const params = new URLSearchParams(window.location.search)
  // The role-testing sandbox keeps its sample-role sign-in; the company request
  // form stays public. Everyone else signs in on the Pickiti login page.
  const testing = params.has('testing')
  const companyRequest = params.has('company-request')
  const pickitiLogin = sharedIdentityUrl('login', 'pickiti')
  useEffect(() => { if (!testing && !companyRequest) window.location.replace(pickitiLogin) }, [testing, companyRequest, pickitiLogin])

  const [phone, setPhone]         = useState('')
  const [password, setPassword]   = useState('')
  const [error, setError]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [showCompanyRequest, setShowCompanyRequest] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await authApi.login(phone, password)
      onLogin(res.token, res.user as AuthUser)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  if (!testing && !companyRequest) {
    return <main className="min-h-screen bg-tw-bg flex items-center justify-center p-5">
      <p role="status" className="text-sm text-tw-text-secondary">Taking you to Pickiti… <a href={pickitiLogin} className="text-tw-primary font-semibold">Continue</a></p>
    </main>
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden bg-tw-bg">
      {/* Backdrop: soft photo + glow (matches the app shell) */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <img src="/taskwise/login-bg.png" alt="" className="w-full h-full object-cover select-none opacity-[0.07] dark:opacity-[0.06]" />
        <div className="absolute -bottom-40 left-1/2 -translate-x-1/2 w-[900px] h-[420px] rounded-[50%] bg-tw-primary/20 dark:bg-tw-primary/30 blur-[90px]" />
        <div className="absolute -bottom-24 left-[20%] w-[420px] h-[280px] rounded-[50%] bg-tw-purple/25 dark:bg-tw-purple/30 blur-[90px]" />
      </div>

      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle compact className="border-tw-border bg-tw-surface/80 backdrop-blur" />
      </div>

      {/* Branding above card */}
      <div className="text-center mb-6 relative z-10">
        <div className="inline-flex items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-gradient-to-br from-[#3d9bff] to-tw-primary shadow-cta">
            <span className="text-white font-bold text-xl">T</span>
          </div>
          <span className="text-3xl font-bold tracking-tight text-tw-text">TaskWise</span>
        </div>
      </div>

      <div className="bg-tw-surface/90 backdrop-blur-xl border border-tw-border rounded-3xl p-6 md:p-8 w-full max-w-sm shadow-panel relative z-10 animate-pop-in">
        {testing ? <>
          <h2 className="text-lg font-bold text-tw-text mb-5 text-center tracking-tight">Company role testing</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="block label">Test role
              <div className="mt-1">
                <Select ariaLabel="Test role" placeholder="Select a role" value={phone} onChange={setPhone}
                  options={[['TESTCHAIRMAN', 'Chairman'], ['TESTDIRECTOR', 'Director'], ['TESTDD', 'Deputy Director'],
                    ['TESTPD', 'Provincial Director'], ['TESTADHO', 'AD - Head Office'], ['TESTAD', 'AD - Provincial'],
                    ['TESTYSO', 'YSO'], ['TESTYSO2', 'YSO 2'], ['TESTLOGGER', 'Letter Logger'], ['TESTASSIGNER', 'Letter Assigner']]
                    .map(([id, label]) => ({ value: id, label: `${label} (${id})` }))} />
              </div>
            </div>
            <div>
              <label className="label">Password</label>
              <input type="password" className="input" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            {error && <div className="alert-error">{error}</div>}
            <button type="submit" disabled={loading} className="btn-primary w-full py-3 mt-2">
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </> : <>
          <h2 className="text-lg font-bold text-tw-text mb-3 text-center tracking-tight">Create a New Company</h2>
          <p className="text-sm text-tw-text-secondary text-center mb-5">Request a TaskWise company. Access is activated after Syswise approval.</p>
          <button type="button" onClick={() => setShowCompanyRequest(true)} className="btn-success w-full py-3">
            <Icon name="building" className="w-4 h-4" /> Start company request
          </button>
          <a href={pickitiLogin} className="btn-secondary w-full py-3 mt-3">Already have access? Sign in with Pickiti</a>
        </>}
      </div>

      <a href={launcherHomeUrl()} className="mt-5 min-h-11 inline-flex items-center gap-1.5 px-4 text-tw-text-secondary hover:text-tw-text text-sm relative z-10 transition-colors">
        <Icon name="arrowLeft" className="w-4 h-4" /> Back to {launcherName()}
      </a>
      <p className="mt-2 mb-5 text-tw-text-muted text-xs relative z-10">Created by SysWise</p>
      {showCompanyRequest && <CompanyRequestModal onClose={() => setShowCompanyRequest(false)} />}
    </div>
  )
}
