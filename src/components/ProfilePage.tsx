import React, { useState, useRef, useEffect, useCallback } from 'react'
import type { AuthUser } from '../types'
import { authApi, workspaceApi, webAuthnApi } from '../services/apiService'
import { startRegistration } from '@simplewebauthn/browser'

interface Props {
  user: AuthUser
  onUserUpdate: (updated: Partial<AuthUser>) => void
}

function compressImage(file: File, maxBytes = 650_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = ev => {
      const img = new Image()
      img.onload = () => {
        let quality = 0.85
        let width = img.width
        let height = img.height
        // Shrink if very large
        const MAX_DIM = 512
        if (width > MAX_DIM || height > MAX_DIM) {
          const ratio = Math.min(MAX_DIM / width, MAX_DIM / height)
          width = Math.round(width * ratio)
          height = Math.round(height * ratio)
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0, width, height)

        const tryCompress = () => {
          const dataUrl = canvas.toDataURL('image/jpeg', quality)
          if (dataUrl.length <= maxBytes || quality <= 0.3) {
            resolve(dataUrl)
          } else {
            quality -= 0.1
            tryCompress()
          }
        }
        tryCompress()
      }
      img.onerror = reject
      img.src = ev.target!.result as string
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

interface WebAuthnCred {
  id: string
  deviceName?: string
  deviceType: string
  backedUp: boolean
  createdAt: string
  lastUsedAt?: string
}

export default function ProfilePage({ user, onUserUpdate }: Props) {
  const [name, setName]       = useState(user.name)
  const [phone, setPhone]     = useState(user.phone || '')
  const [email, setEmail]     = useState(user.email || '')
  const [nic, setNic]         = useState(user.nic || '')
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl || '')
  const [avatarPreview, setAvatarPreview] = useState(user.avatarUrl || '')

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword]         = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [profileSaving, setProfileSaving]   = useState(false)
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [avatarSaving, setAvatarSaving]     = useState(false)
  const [profileMsg, setProfileMsg]   = useState('')
  const [profileErr, setProfileErr]   = useState('')
  const [passwordMsg, setPasswordMsg] = useState('')
  const [passwordErr, setPasswordErr] = useState('')
  const [avatarErr, setAvatarErr]     = useState('')

  // WebAuthn / biometric state
  const [webAuthnCreds, setWebAuthnCreds]   = useState<WebAuthnCred[]>([])
  const [newDeviceName, setNewDeviceName]   = useState('')
  const [biometricAdding, setBiometricAdding] = useState(false)
  const [biometricMsg, setBiometricMsg]     = useState('')
  const [biometricErr, setBiometricErr]     = useState('')
  const [webAuthnSupported, setWebAuthnSupported] = useState(false)

  const fileRef = useRef<HTMLInputElement>(null)

  const loadCreds = useCallback(async () => {
    try {
      const creds = await webAuthnApi.listCredentials()
      setWebAuthnCreds(creds)
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    setWebAuthnSupported(typeof window !== 'undefined' && !!window.PublicKeyCredential)
    loadCreds()
  }, [loadCreds])

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setAvatarErr('Please select an image file')
      return
    }
    setAvatarErr('')
    setAvatarSaving(true)
    try {
      const compressed = await compressImage(file)
      setAvatarPreview(compressed)
      const res = await workspaceApi.uploadAvatar(compressed) as { avatarUrl: string }
      setAvatarUrl(res.avatarUrl)
      onUserUpdate({ avatarUrl: res.avatarUrl })
    } catch (err: unknown) {
      setAvatarErr(err instanceof Error ? err.message : 'Failed to upload avatar')
      setAvatarPreview(avatarUrl) // revert preview
    } finally {
      setAvatarSaving(false)
    }
  }

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setProfileErr('')
    setProfileMsg('')
    if (!name.trim()) { setProfileErr('Name is required'); return }
    if (!phone.trim()) { setProfileErr('Phone is required'); return }
    setProfileSaving(true)
    try {
      await workspaceApi.updateProfile({ name: name.trim(), phone: phone.trim(), email: email.trim() || undefined, nic: nic.trim() || undefined })
      onUserUpdate({ name: name.trim(), phone: phone.trim(), email: email.trim() || undefined, nic: nic.trim() || undefined })
      setProfileMsg('Profile updated successfully')
    } catch (err: unknown) {
      setProfileErr(err instanceof Error ? err.message : 'Failed to update profile')
    } finally {
      setProfileSaving(false)
    }
  }

  const handlePasswordSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordErr('')
    setPasswordMsg('')
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordErr('All password fields are required'); return
    }
    if (newPassword.length < 8) {
      setPasswordErr('New password must be at least 8 characters'); return
    }
    if (newPassword !== confirmPassword) {
      setPasswordErr('New passwords do not match'); return
    }
    setPasswordSaving(true)
    try {
      await authApi.changePassword(currentPassword, newPassword)
      setPasswordMsg('Password changed successfully')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: unknown) {
      setPasswordErr(err instanceof Error ? err.message : 'Failed to change password')
    } finally {
      setPasswordSaving(false)
    }
  }

  const handleAddBiometric = async () => {
    setBiometricErr('')
    setBiometricMsg('')
    setBiometricAdding(true)
    try {
      const options = await webAuthnApi.getRegistrationOptions()
      const regResponse = await startRegistration({ optionsJSON: options as Parameters<typeof startRegistration>[0]['optionsJSON'] })
      await webAuthnApi.verifyRegistration(regResponse, newDeviceName.trim() || undefined)
      setBiometricMsg('Biometric login set up successfully!')
      setNewDeviceName('')
      await loadCreds()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Registration failed'
      if (msg.toLowerCase().includes('cancel') || msg.toLowerCase().includes('abort') || msg.toLowerCase().includes('not allowed')) {
        setBiometricErr('Cancelled')
      } else {
        setBiometricErr(msg)
      }
    } finally {
      setBiometricAdding(false)
    }
  }

  const handleDeleteCred = async (id: string) => {
    try {
      await webAuthnApi.deleteCredential(id)
      setWebAuthnCreds(prev => prev.filter(c => c.id !== id))
    } catch (err: unknown) {
      setBiometricErr(err instanceof Error ? err.message : 'Failed to remove')
    }
  }

  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-xl font-semibold text-tw-text">My Profile</h1>

      {/* Avatar */}
      <div className="card p-6">
        <h2 className="text-base font-semibold text-tw-text mb-4">Profile Photo</h2>
        <div className="flex items-center gap-5">
          <div className="relative">
            {avatarPreview ? (
              <img src={avatarPreview} alt="Avatar" className="w-20 h-20 rounded-full object-cover border-2 border-tw-border" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-tw-primary flex items-center justify-center border-2 border-tw-border">
                <span className="text-white font-bold text-xl">{initials}</span>
              </div>
            )}
            {avatarSaving && (
              <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
          <div>
            <button
              className="btn-secondary text-sm"
              onClick={() => fileRef.current?.click()}
              disabled={avatarSaving}
            >
              {avatarSaving ? 'Uploading…' : 'Change Photo'}
            </button>
            <p className="text-xs text-tw-text-secondary mt-1">JPG, PNG or WebP. Max ~700 KB after compression.</p>
            {avatarErr && <p className="text-xs text-tw-danger mt-1">{avatarErr}</p>}
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
      </div>

      {/* Profile info */}
      <div className="card p-6">
        <h2 className="text-base font-semibold text-tw-text mb-4">Personal Information</h2>
        <form onSubmit={handleProfileSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-tw-text mb-1">Full Name</label>
              <input className="input" value={name} onChange={e => setName(e.target.value)} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-tw-text mb-1">Phone Number</label>
              <input className="input" type="tel" value={phone} onChange={e => setPhone(e.target.value)} required />
              {phone.trim() !== (user.phone || '').trim() && (
                <p className="mt-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-snug">
                  Your phone number is your login username. After saving, use <strong>{phone.trim()}</strong> to log in next time.
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-tw-text mb-1">Email <span className="text-tw-text-secondary font-normal">(optional)</span></label>
              <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-tw-text mb-1">NIC <span className="text-tw-text-secondary font-normal">(optional)</span></label>
              <input className="input" value={nic} onChange={e => setNic(e.target.value)} placeholder="XXXXXXXXXV" />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button type="submit" className="btn-primary" disabled={profileSaving}>
              {profileSaving ? 'Saving…' : 'Save Changes'}
            </button>
            {profileMsg && <span className="text-sm text-green-600">{profileMsg}</span>}
            {profileErr && <span className="text-sm text-tw-danger">{profileErr}</span>}
          </div>
        </form>
      </div>

      {/* Change password */}
      <div className="card p-6">
        <h2 className="text-base font-semibold text-tw-text mb-4">Change Password</h2>
        <form onSubmit={handlePasswordSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-tw-text mb-1">Current Password</label>
            <input className="input" type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder="••••••••" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-tw-text mb-1">New Password</label>
              <input className="input" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Min 8 characters" />
            </div>
            <div>
              <label className="block text-sm font-medium text-tw-text mb-1">Confirm New Password</label>
              <input className="input" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repeat password" />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button type="submit" className="btn-primary" disabled={passwordSaving}>
              {passwordSaving ? 'Changing…' : 'Change Password'}
            </button>
            {passwordMsg && <span className="text-sm text-green-600">{passwordMsg}</span>}
            {passwordErr && <span className="text-sm text-tw-danger">{passwordErr}</span>}
          </div>
        </form>
      </div>

      {/* Biometric / Passkey login */}
      {webAuthnSupported && (
        <div className="card p-6">
          <h2 className="text-base font-semibold text-tw-text mb-1">Biometric Login</h2>
          <p className="text-xs text-tw-text-secondary mb-4">Use your fingerprint or Face ID to sign in without a password.</p>

          {webAuthnCreds.length > 0 && (
            <div className="space-y-2 mb-4">
              {webAuthnCreds.map(cred => (
                <div key={cred.id} className="flex items-center justify-between bg-tw-bg rounded-xl px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">
                      {cred.deviceType === 'multiDevice' ? '☁️' : '📱'}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-tw-text">
                        {cred.deviceName || (cred.deviceType === 'multiDevice' ? 'Synced passkey' : 'This device')}
                      </p>
                      <p className="text-xs text-tw-text-secondary">
                        Added {new Date(cred.createdAt).toLocaleDateString()}
                        {cred.lastUsedAt && ` · Last used ${new Date(cred.lastUsedAt).toLocaleDateString()}`}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteCred(cred.id)}
                    className="w-7 h-7 rounded-lg bg-red-100 hover:bg-red-200 text-red-600 flex items-center justify-center transition-colors flex-shrink-0"
                    title="Remove"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              className="input flex-1"
              placeholder="Device name (optional, e.g. iPhone 15)"
              value={newDeviceName}
              onChange={e => setNewDeviceName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddBiometric() } }}
            />
            <button
              type="button"
              onClick={handleAddBiometric}
              disabled={biometricAdding}
              className="btn-primary whitespace-nowrap"
            >
              {biometricAdding ? 'Setting up…' : webAuthnCreds.length === 0 ? 'Set Up Biometrics' : 'Add Another'}
            </button>
          </div>

          {biometricMsg && <p className="mt-2 text-sm text-green-600">{biometricMsg}</p>}
          {biometricErr && <p className="mt-2 text-sm text-tw-danger">{biometricErr}</p>}
        </div>
      )}

      {/* Role info */}
      <div className="card p-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-tw-primary/10 flex items-center justify-center flex-shrink-0">
          <span className="text-tw-primary text-sm font-bold">{user.actorType === 'director' ? 'D' : 'P'}</span>
        </div>
        <div>
          <p className="text-sm font-medium text-tw-text capitalize">{user.actorType}</p>
          <p className="text-xs text-tw-text-secondary">Workspace ID: {user.workspaceId}</p>
        </div>
      </div>
    </div>
  )
}
