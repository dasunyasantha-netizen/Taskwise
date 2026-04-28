import React, { useState } from 'react'
import type { AuthUser } from '../types'
import { authApi } from '../services/apiService'

interface Props {
  user: AuthUser
  onPasswordChanged: () => void
  onLogout: () => void
}

export default function ForcePasswordChange({ user, onPasswordChanged, onLogout }: Props) {
  const [currentPassword, setCurrentPassword] = useState('')
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
    if (newPassword === currentPassword) {
      setError('New password must be different from your temporary password')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)
    try {
      await authApi.changePassword(currentPassword, newPassword)
      onPasswordChanged()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to change password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-tw-bg flex flex-col items-center justify-center">
      <div className="card p-8 w-full max-w-md shadow-panel">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-yellow-100 mb-3">
            <span className="text-2xl">🔒</span>
          </div>
          <h1 className="text-xl font-bold text-tw-text">Set Your Password</h1>
          <p className="text-sm text-tw-text-secondary mt-1">
            Welcome, <span className="font-medium text-tw-text">{user.name}</span>. You must set a new password before continuing.
          </p>
        </div>

        {/* Info box */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-5">
          <p className="text-sm text-blue-700">
            Your temporary password is the <strong>last 6 digits of your phone number</strong> ({user.phone?.slice(-6)}).
            Enter it below, then choose a new password.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-tw-text mb-1">Temporary Password</label>
            <input
              type="password"
              className="input"
              placeholder="Last 6 digits of your phone"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-tw-text mb-1">New Password</label>
            <input
              type="password"
              className="input"
              placeholder="Min 8 characters"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-tw-text mb-1">Confirm New Password</label>
            <input
              type="password"
              className="input"
              placeholder="Repeat new password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
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
            {loading ? 'Saving…' : 'Set Password & Continue'}
          </button>
        </form>

        <button
          onClick={onLogout}
          className="w-full mt-3 text-center text-xs text-tw-text-secondary hover:text-tw-danger transition-colors"
        >
          Sign out
        </button>
      </div>

      <p className="mt-6 text-tw-text-secondary text-xs">
        Created by <span className="font-semibold text-tw-text">SysWise</span>
      </p>
    </div>
  )
}
