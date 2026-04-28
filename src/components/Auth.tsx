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
    <div className="min-h-screen bg-tw-bg flex flex-col items-center justify-center">
      <div className="card p-8 w-full max-w-md shadow-panel">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="w-9 h-9 bg-tw-primary rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-base">T</span>
            </div>
            <span className="text-2xl font-bold text-tw-text">TaskWise</span>
          </div>
          <p className="text-tw-text-secondary text-sm">Hierarchical Task Management</p>
        </div>

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
            className="btn-primary w-full justify-center flex items-center gap-2 py-2.5"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        {/* Contact notice for new workspace setup */}
        <div className="mt-6 p-3 bg-tw-hover rounded-lg text-center">
          <p className="text-tw-text-secondary text-xs">
            New to TaskWise? Contact us to set up your workspace.
          </p>
          <p className="text-tw-primary font-semibold text-sm mt-0.5">0741 008 484</p>
        </div>
      </div>

      {/* SysWise branding */}
      <p className="mt-6 text-tw-text-secondary text-xs">
        Created by{' '}
        <span className="font-semibold text-tw-text">SysWise</span>
      </p>
    </div>
  )
}
