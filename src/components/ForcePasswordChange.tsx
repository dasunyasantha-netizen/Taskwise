import React, { useState } from 'react'
import type { AuthUser } from '../types'
import { authApi } from '../services/apiService'
import { Icon } from './ui/Icon'

interface Props {
  user: AuthUser
  onPasswordChanged: () => void
  onLogout: () => void
}

export default function ForcePasswordChange({ user, onPasswordChanged, onLogout }: Props) {
  const [newPassword, setNewPassword]         = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)
    try {
      await authApi.completeForcedPasswordChange(newPassword)
      onPasswordChanged()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to change password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-tw-bg flex flex-col items-center justify-center px-4 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -bottom-40 left-1/2 -translate-x-1/2 w-[900px] h-[420px] rounded-[50%] bg-tw-primary/20 dark:bg-tw-primary/30 blur-[90px]" />
        <div className="absolute -bottom-24 left-[20%] w-[420px] h-[280px] rounded-[50%] bg-tw-purple/25 dark:bg-tw-purple/30 blur-[90px]" />
      </div>

      <div className="text-center mb-6 relative z-10">
        <div className="inline-flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-[#3d9bff] to-tw-primary shadow-cta">
            <span className="text-white font-bold text-lg">T</span>
          </div>
          <span className="text-2xl font-bold tracking-tight text-tw-text">TaskWise</span>
        </div>
      </div>

      <div className="bg-tw-surface/90 backdrop-blur-xl border border-tw-border rounded-3xl p-6 md:p-8 w-full max-w-sm shadow-panel relative z-10 animate-pop-in">
        <div className="text-center mb-5">
          <span className="icon-tile tile-amber w-12 h-12 rounded-2xl mb-3"><Icon name="lock" className="w-6 h-6" /></span>
          <h1 className="text-lg font-bold text-tw-text">Set Your Password</h1>
          <p className="text-sm text-tw-text-secondary mt-1">
            Welcome, <span className="font-medium text-tw-text">{user.name}</span>
          </p>
        </div>

        <div className="alert-info mb-5">
          <p className="text-xs">
            Choose a new private password for your account. You will use it for future TaskWise sign-ins.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">New Password</label>
            <input type="password" className="input rounded-xl" placeholder="Min 8 characters"
              value={newPassword} onChange={e => setNewPassword(e.target.value)} required autoFocus />
          </div>
          <div>
            <label className="label">Confirm Password</label>
            <input type="password" className="input rounded-xl" placeholder="Repeat new password"
              value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
          </div>

          {error && (
            <div className="alert-error">{error}</div>
          )}

          <button type="submit" disabled={loading}
            className="btn-primary w-full py-3 mt-1">
            {loading ? 'Saving…' : 'Set Password & Continue'}
          </button>
        </form>

        <button onClick={onLogout}
          className="w-full mt-4 text-center text-xs text-tw-text-secondary hover:text-tw-danger transition-colors">
          Sign out
        </button>
      </div>

      <p className="mt-5 text-tw-text-muted text-xs relative z-10">Created by SysWise</p>
    </div>
  )
}
