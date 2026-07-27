import React, { useState, useEffect } from 'react'
import type { AuthUser } from '../types'
import { authApi, webAuthnApi } from '../services/apiService'
import {
  startAuthentication,
} from '@simplewebauthn/browser'
import CompanyRequestModal from './CompanyRequestModal'

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
    <div className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden"
      style={{ background: '#1f2d3d' }}>
      {/* Login background image */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <img src="/taskwise/login-bg.png" alt="" className="w-full h-full object-cover select-none"
          style={{ opacity: 0.25 }} />
      </div>

      {/* Branding above card */}
      <div className="text-center mb-6 relative z-10">
        <div className="inline-flex items-center gap-3 mb-2">
          <div className="w-12 h-12 bg-tw-primary rounded-2xl flex items-center justify-center shadow-lg">
            <span className="text-white font-bold text-xl">T</span>
          </div>
          <span className="text-3xl font-bold text-white">TaskWise</span>
        </div>
        <p className="text-white/60 text-sm">National Youth Services Council</p>
      </div>

      <div className="bg-white rounded-3xl p-6 md:p-8 w-full max-w-sm shadow-2xl relative z-10">
        {!showBiometric ? (
          <>
            <h2 className="text-lg font-bold text-tw-text mb-5 text-center">Sign in to your account</h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-tw-text mb-1">Login ID</label>
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
                <label className="block text-sm font-medium text-tw-text mb-1">Password</label>
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
                <div className="bg-red-50 border border-red-200 text-tw-danger text-sm px-3 py-2 rounded-lg">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-2xl bg-tw-primary text-white font-bold text-sm flex items-center justify-center gap-2 active:opacity-80 disabled:opacity-60 mt-2"
              >
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
            </form>

            {webAuthnSupported && (
              <button
                type="button"
                onClick={() => { setShowBiometric(true); setBiometricPhone(phone) }}
                className="mt-4 w-full py-3 rounded-2xl border-2 border-tw-border text-tw-text text-sm font-medium flex items-center justify-center gap-2 hover:border-tw-primary hover:text-tw-primary transition-colors"
              >
                <FingerprintIcon className="w-5 h-5" />
                Sign in with Biometrics
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowCompanyRequest(true)}
              className="mt-4 w-full py-3 rounded-2xl bg-green-600 text-white text-sm font-bold hover:bg-green-700 transition-colors"
            >
              Create a New Company
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-5">
              <button
                type="button"
                onClick={() => { setShowBiometric(false); setBiometricError('') }}
                className="w-8 h-8 rounded-lg hover:bg-tw-bg flex items-center justify-center text-tw-text-secondary"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h2 className="text-lg font-bold text-tw-text">Biometric Sign In</h2>
            </div>

            <div className="flex justify-center mb-5">
              <div className="w-20 h-20 rounded-full bg-tw-primary/10 flex items-center justify-center">
                <FingerprintIcon className="w-10 h-10 text-tw-primary" />
              </div>
            </div>

            <form onSubmit={handleBiometricLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-tw-text mb-1">Phone Number</label>
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
                <div className="bg-red-50 border border-red-200 text-tw-danger text-sm px-3 py-2 rounded-lg">
                  {biometricError}
                </div>
              )}

              <button
                type="submit"
                disabled={biometricLoading}
                className="w-full py-3.5 rounded-2xl bg-tw-primary text-white font-bold text-sm flex items-center justify-center gap-2 active:opacity-80 disabled:opacity-60"
              >
                <FingerprintIcon className="w-5 h-5" />
                {biometricLoading ? 'Waiting for biometric…' : 'Use Fingerprint / Face ID'}
              </button>
            </form>

            <p className="mt-4 text-xs text-tw-text-secondary text-center">
              You need to set up biometrics from your profile first.
            </p>
          </>
        )}

        <div className="mt-5 p-3 bg-[#f0f4ff] rounded-2xl text-center">
          <p className="text-tw-text-secondary text-xs">Company access is activated only after Syswise approval.</p>
        </div>
      </div>

      <p className="mt-5 text-white/40 text-xs relative z-10">Created by SysWise</p>
      {showCompanyRequest && <CompanyRequestModal onClose={() => setShowCompanyRequest(false)} />}
    </div>
  )
}
