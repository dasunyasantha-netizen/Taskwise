import React, { useState } from 'react'
import type { AuthUser } from '../types'
import { authApi } from '../services/apiService'

interface Props {
  onLogin: (token: string, user: AuthUser) => void
}

export default function Auth({ onLogin }: Props) {
  const [phone, setPhone]         = useState('')
  const [password, setPassword]   = useState('')
  const [error, setError]         = useState('')
  const [loading, setLoading]     = useState(false)

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
        <h2 className="text-lg font-bold text-tw-text mb-5 text-center">Sign in to your account</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-tw-text mb-1">Phone Number</label>
            <input
              type="tel"
              className="input"
              placeholder="07X XXXXXXX"
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

        <div className="mt-5 p-3 bg-[#f0f4ff] rounded-2xl text-center">
          <p className="text-tw-text-secondary text-xs">New to TaskWise? Contact us to set up your workspace.</p>
          <p className="text-tw-primary font-bold text-sm mt-0.5">0741 008 484</p>
        </div>
      </div>

      <p className="mt-5 text-white/40 text-xs relative z-10">Created by SysWise</p>
    </div>
  )
}
