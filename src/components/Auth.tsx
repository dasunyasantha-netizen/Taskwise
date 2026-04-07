import React, { useState } from 'react'
import type { AuthUser } from '../types'
import { authApi } from '../services/apiService'

interface Props {
  onLogin: (token: string, user: AuthUser) => void
}

export default function Auth({ onLogin }: Props) {
  const [tab, setTab]           = useState<'director' | 'personnel'>('director')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = tab === 'director'
        ? await authApi.directorLogin(email, password)
        : await authApi.personnelLogin(email, password)
      onLogin(res.token, res.user as AuthUser)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-tw-bg flex items-center justify-center">
      <div className="card p-8 w-full max-w-md shadow-panel">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-tw-primary rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">T</span>
            </div>
            <span className="text-2xl font-bold text-tw-text">TaskWise</span>
          </div>
          <p className="text-tw-text-secondary text-sm">Hierarchical Task Management</p>
        </div>

        {/* Tab switcher */}
        <div className="flex bg-tw-hover rounded-lg p-1 mb-6">
          <button
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              tab === 'director'
                ? 'bg-white text-tw-primary shadow-card'
                : 'text-tw-text-secondary hover:text-tw-text'
            }`}
            onClick={() => setTab('director')}
          >
            Director
          </button>
          <button
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              tab === 'personnel'
                ? 'bg-white text-tw-primary shadow-card'
                : 'text-tw-text-secondary hover:text-tw-text'
            }`}
            onClick={() => setTab('personnel')}
          >
            Personnel
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-tw-text mb-1">Email</label>
            <input
              type="email"
              className="input"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
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
            {loading ? 'Signing in…' : `Sign in as ${tab === 'director' ? 'Director' : 'Personnel'}`}
          </button>
        </form>
      </div>
    </div>
  )
}
