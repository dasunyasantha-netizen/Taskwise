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
    <div className="min-h-screen bg-[#1f2d3d] flex flex-col items-center justify-center px-4 relative overflow-hidden">
      {/* Watermark */}
      <div className="pointer-events-none absolute inset-0 flex items-end justify-center overflow-hidden">
        <img src="/taskwise/watermark.jpeg" alt="" className="w-72 select-none object-contain"
          style={{ opacity: 0.08, marginBottom: '-20px' }} />
      </div>

      <div className="text-center mb-6 relative z-10">
        <div className="inline-flex items-center gap-3 mb-1">
          <div className="w-10 h-10 bg-tw-primary rounded-xl flex items-center justify-center shadow-lg">
            <span className="text-white font-bold text-lg">T</span>
          </div>
          <span className="text-2xl font-bold text-white">TaskWise</span>
        </div>
      </div>

      <div className="bg-white rounded-3xl p-6 md:p-8 w-full max-w-sm shadow-2xl relative z-10">
        <div className="text-center mb-5">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-yellow-100 mb-3">
            <span className="text-2xl">🔒</span>
          </div>
          <h1 className="text-lg font-bold text-tw-text">Set Your Password</h1>
          <p className="text-sm text-tw-text-secondary mt-1">
            Welcome, <span className="font-medium text-tw-text">{user.name}</span>
          </p>
        </div>

        <div className="bg-blue-50 rounded-2xl px-4 py-3 mb-5">
          <p className="text-xs text-blue-700">
            Your temporary password is the <strong>last 6 digits of your phone number</strong> ({user.phone?.slice(-6)}).
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-tw-text-secondary uppercase tracking-wide mb-1.5">Temporary Password</label>
            <input type="password" className="input rounded-xl" placeholder="Last 6 digits of your phone"
              value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required autoFocus />
          </div>
          <div>
            <label className="block text-xs font-semibold text-tw-text-secondary uppercase tracking-wide mb-1.5">New Password</label>
            <input type="password" className="input rounded-xl" placeholder="Min 8 characters"
              value={newPassword} onChange={e => setNewPassword(e.target.value)} required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-tw-text-secondary uppercase tracking-wide mb-1.5">Confirm Password</label>
            <input type="password" className="input rounded-xl" placeholder="Repeat new password"
              value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-tw-danger text-sm px-3 py-2 rounded-xl">{error}</div>
          )}

          <button type="submit" disabled={loading}
            className="w-full py-3.5 rounded-2xl bg-tw-primary text-white font-bold text-sm active:opacity-80 disabled:opacity-60 mt-1">
            {loading ? 'Saving…' : 'Set Password & Continue'}
          </button>
        </form>

        <button onClick={onLogout}
          className="w-full mt-4 text-center text-xs text-tw-text-secondary hover:text-tw-danger transition-colors">
          Sign out
        </button>
      </div>

      <p className="mt-5 text-white/40 text-xs relative z-10">Created by SysWise</p>
    </div>
  )
}
