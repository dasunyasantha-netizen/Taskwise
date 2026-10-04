import React, { useState, useEffect } from 'react'
import type { AuthUser } from '../types'
import { authApi, webAuthnApi } from '../services/apiService'
import {
  startAuthentication,
} from '@simplewebauthn/browser'
import CompanyRequestModal from './CompanyRequestModal'
import Select from './Select'
import { launcherHomeUrl, launcherName, sharedIdentityUrl } from '../services/launchSource'
import { Icon } from './ui/Icon'
import { ThemeToggle } from './ui/Primitives'

interface Props {
  onLogin: (token: string, user: AuthUser) => void
}

// Fingerprint SVG icon
function FingerprintIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" />
      <path d="M14 13.12c0 2.38 0 6.38-1 8.88" />
      <path d="M17.29 21.02c.12-.6.43-2.3.5-3.02" />
      <path d="M2 12a10 10 0 0 1 18-6" />
      <path d="M2 17.5a14.5 14.5 0 0 0 4.56 5.46" />
      <path d="M6 10a6 6 0 0 1 11.74-1.47" />
      <path d="M6.54 15.91C7.36 18.55 8.69 21 9.67 21" />
      <path d="M6 10c0-.16.01-.32.01-.47" />
    </svg>
  )
}

export default function Auth({ onLogin }: Props) {
  const testing = new URLSearchParams(window.location.search).has('testing')
  const [phone, setPhone]         = useState('')
  const [password, setPassword]   = useState('')
  const [error, setError]         = useState('')
  const [loading, setLoading]     = useState(false)

  const [biometricPhone, setBiometricPhone] = useState('')
  const [biometricError, setBiometricError] = useState('')
  const [biometricLoading, setBiometricLoading] = useState(false)
  const [showBiometric, setShowBiometric] = useState(false)
  const [showCompanyRequest, setShowCompanyRequest] = useState(false)

  // Show biometric button if WebAuthn is supported
  const [webAuthnSupported, setWebAuthnSupported] = useState(false)
  useEffect(() => {
    setWebAuthnSupported(
      typeof window !== 'undefined' &&
      !!window.PublicKeyCredential
    )
  }, [])

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

  const handleBiometricLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setBiometricError('')
    if (!biometricPhone.trim()) { setBiometricError('Enter your phone number first'); return }
    setBiometricLoading(true)
    try {
      // Get auth options (includes actorId/actorType in response)
      const optionsRes = await webAuthnApi.getAuthOptions(biometricPhone.trim()) as Record<string, unknown>
      const actorId   = optionsRes._actorId as string
      const actorType = optionsRes._actorType as string

      // Strip our private fields before passing to browser lib
      const { _actorId: _a, _actorType: _b, ...authOptions } = optionsRes

      // Trigger browser biometric prompt
      const credential = await startAuthentication({ optionsJSON: authOptions as unknown as Parameters<typeof startAuthentication>[0]['optionsJSON'] })

      // Verify on server and get session token
      const result = await webAuthnApi.verifyAuthentication(actorId, actorType, credential)
      onLogin(result.token, result.user as AuthUser)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Biometric login failed'
      // User cancelled the prompt — don't show an alarming error
      if (msg.toLowerCase().includes('cancel') || msg.toLowerCase().includes('abort') || msg.toLowerCase().includes('not allowed')) {
        setBiometricError('Cancelled')
      } else {
        setBiometricError(msg)
      }
    } finally {
      setBiometricLoading(false)
    }
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
        <p className="text-tw-text-secondary text-sm">National Youth Services Council</p>
      </div>

      <div className="bg-tw-surface/90 backdrop-blur-xl border border-tw-border rounded-3xl p-6 md:p-8 w-full max-w-sm shadow-panel relative z-10 animate-pop-in">
        {!showBiometric ? (
          <>
            <h2 className="text-lg font-bold text-tw-text mb-5 text-center tracking-tight">{testing ? 'Company role testing' : 'Sign in to your account'}</h2>

            <a href={sharedIdentityUrl('login')} className="btn-primary w-full py-3 mb-3">
              <Icon name="key" className="w-4 h-4" /> Sign in with Syswise
            </a>
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 divider" />
              <span className="text-[11px] text-tw-text-muted text-center max-w-[60%]">Existing Taskwise login for users completing migration</span>
              <div className="flex-1 divider" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {testing && <div className="block label">Test role
                <div className="mt-1">
                  <Select ariaLabel="Test role" placeholder="Select a role" value={phone} onChange={setPhone}
                    options={[['TESTCHAIRMAN', 'Chairman'], ['TESTDIRECTOR', 'Director'], ['TESTDD', 'Deputy Director'],
                      ['TESTPD', 'Provincial Director'], ['TESTADHO', 'AD - Head Office'], ['TESTAD', 'AD - Provincial'],
                      ['TESTYSO', 'YSO'], ['TESTYSO2', 'YSO 2'], ['TESTLOGGER', 'Letter Logger'], ['TESTASSIGNER', 'Letter Assigner']]
                      .map(([id, label]) => ({ value: id, label: `${label} (${id})` }))} />
                </div>
              </div>}
              <div>
                <label className="label">Login ID</label>
                <input
                  type="text"
                  className="input"
                  placeholder="0712345678 or FF0712345678"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="label">Password</label>
                <input
                  type="password"
                  className="input"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
              </div>

              {error && (
                <div className="alert-error">
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading} className="btn-secondary w-full py-3 mt-2">
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
            </form>

            {webAuthnSupported && (
              <button
                type="button"
                onClick={() => { setShowBiometric(true); setBiometricPhone(phone) }}
                className="btn-ghost w-full py-3 mt-2"
              >
                <FingerprintIcon className="w-5 h-5" />
                Sign in with Biometrics
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowCompanyRequest(true)}
              className="btn-success w-full py-3 mt-3"
            >
              <Icon name="building" className="w-4 h-4" /> Create a New Company
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-5">
              <button
                type="button"
                onClick={() => { setShowBiometric(false); setBiometricError('') }}
                className="icon-btn w-8 h-8"
              >
                <Icon name="arrowLeft" className="w-4 h-4" />
              </button>
              <h2 className="text-lg font-bold text-tw-text">Biometric Sign In</h2>
            </div>

            <div className="flex justify-center mb-5">
              <div className="w-20 h-20 rounded-3xl bg-tw-primary/10 ring-1 ring-tw-primary/20 flex items-center justify-center">
                <FingerprintIcon className="w-10 h-10 text-tw-primary-text" />
              </div>
            </div>

            <form onSubmit={handleBiometricLogin} className="space-y-4">
              <div>
                <label className="label">Phone Number</label>
                <input
                  type="tel"
                  className="input"
                  placeholder="07X XXXXXXX"
                  value={biometricPhone}
                  onChange={e => setBiometricPhone(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              {biometricError && (
                <div className="alert-error">
                  {biometricError}
                </div>
              )}

              <button type="submit" disabled={biometricLoading} className="btn-primary w-full py-3">
                <FingerprintIcon className="w-5 h-5" />
                {biometricLoading ? 'Waiting for biometric…' : 'Use Fingerprint / Face ID'}
              </button>
            </form>

            <p className="mt-4 text-xs text-tw-text-secondary text-center">
              You need to set up biometrics from your profile first.
            </p>
          </>
        )}

        <div className="mt-5 px-3 py-2.5 panel-muted text-center flex items-center justify-center gap-2">
          <Icon name="info" className="w-3.5 h-3.5 text-tw-text-muted flex-shrink-0" />
          <p className="text-tw-text-secondary text-xs">Company access is activated only after Syswise approval.</p>
        </div>
      </div>

      <a href={launcherHomeUrl()} className="mt-5 min-h-11 inline-flex items-center gap-1.5 px-4 text-tw-text-secondary hover:text-tw-text text-sm relative z-10 transition-colors">
        <Icon name="arrowLeft" className="w-4 h-4" /> Back to {launcherName()}
      </a>
      <p className="mt-2 mb-5 text-tw-text-muted text-xs relative z-10">Created by SysWise</p>
      {showCompanyRequest && <CompanyRequestModal onClose={() => setShowCompanyRequest(false)} />}
    </div>
  )
}
