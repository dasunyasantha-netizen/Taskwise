import React, { useState, useRef } from 'react'
import type { AuthUser } from '../types'
import { workspaceApi } from '../services/apiService'

interface Props {
  user: AuthUser
  onUpdate: (updated: Partial<AuthUser>) => void
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
        const MAX_DIM = 256
        if (width > MAX_DIM || height > MAX_DIM) {
          const ratio = Math.min(MAX_DIM / width, MAX_DIM / height)
          width = Math.round(width * ratio)
          height = Math.round(height * ratio)
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
        const tryCompress = () => {
          const dataUrl = canvas.toDataURL('image/png')
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

export default function WorkspaceSettings({ user, onUpdate }: Props) {
  const [companyName, setCompanyName]   = useState(user.companyName || '')
  const [logoPreview, setLogoPreview]   = useState(user.companyLogo || '')
  const [saving, setSaving]             = useState(false)
  const [logoSaving, setLogoSaving]     = useState(false)
  const [msg, setMsg]   = useState('')
  const [err, setErr]   = useState('')
  const [logoErr, setLogoErr] = useState('')

  const fileRef = useRef<HTMLInputElement>(null)

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { setLogoErr('Please select an image file'); return }
    setLogoErr('')
    setLogoSaving(true)
    try {
      const compressed = await compressImage(file)
      setLogoPreview(compressed)
      // Save branding immediately
      await workspaceApi.update({ companyLogo: compressed, companyName: companyName || undefined })
      onUpdate({ companyLogo: compressed })
    } catch (err: unknown) {
      setLogoErr(err instanceof Error ? err.message : 'Failed to upload logo')
      setLogoPreview(user.companyLogo || '')
    } finally {
      setLogoSaving(false)
    }
  }

  const removeLogo = async () => {
    setLogoSaving(true)
    try {
      await workspaceApi.update({ companyLogo: null, companyName: companyName || undefined })
      setLogoPreview('')
      onUpdate({ companyLogo: undefined })
    } catch (err: unknown) {
      setLogoErr(err instanceof Error ? err.message : 'Failed to remove logo')
    } finally {
      setLogoSaving(false)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    setMsg('')
    setSaving(true)
    try {
      await workspaceApi.update({ companyName: companyName.trim() || null, companyLogo: logoPreview || null })
      onUpdate({ companyName: companyName.trim() || undefined })
      setMsg('Workspace settings saved')
    } catch (err: unknown) {
      setErr(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-xl font-semibold text-tw-text">Workspace Settings</h1>

      {/* Company branding */}
      <div className="card p-6">
        <h2 className="text-base font-semibold text-tw-text mb-1">Company Branding</h2>
        <p className="text-sm text-tw-text-secondary mb-5">Displayed in the sidebar and login screen for all workspace members.</p>

        {/* Logo upload */}
        <div className="mb-5">
          <label className="block text-sm font-medium text-tw-text mb-2">Company Logo</label>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-xl border-2 border-dashed border-tw-border flex items-center justify-center overflow-hidden bg-tw-hover">
              {logoPreview ? (
                <img src={logoPreview} alt="Logo" className="w-full h-full object-contain" />
              ) : (
                <span className="text-tw-text-secondary text-2xl">🏢</span>
              )}
            </div>
            <div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-secondary text-sm"
                  onClick={() => fileRef.current?.click()}
                  disabled={logoSaving}
                >
                  {logoSaving ? 'Processing…' : 'Upload Logo'}
                </button>
                {logoPreview && (
                  <button
                    type="button"
                    className="btn-secondary text-sm text-tw-danger hover:bg-red-50"
                    onClick={removeLogo}
                    disabled={logoSaving}
                  >
                    Remove
                  </button>
                )}
              </div>
              <p className="text-xs text-tw-text-secondary mt-1">PNG or JPG. Square logos work best. Max ~700 KB.</p>
              {logoErr && <p className="text-xs text-tw-danger mt-1">{logoErr}</p>}
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
        </div>

        {/* Company name + save */}
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-tw-text mb-1">Company Name <span className="text-tw-text-secondary font-normal">(optional)</span></label>
            <input
              className="input max-w-xs"
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
              placeholder="e.g. Acme Corp"
              maxLength={80}
            />
            <p className="text-xs text-tw-text-secondary mt-1">Shown in the sidebar header instead of "TaskWise".</p>
          </div>

          <div className="flex items-center gap-3">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save Branding'}
            </button>
            {msg && <span className="text-sm text-green-600">{msg}</span>}
            {err && <span className="text-sm text-tw-danger">{err}</span>}
          </div>
        </form>
      </div>

      {/* Workspace info */}
      <div className="card p-4">
        <h2 className="text-base font-semibold text-tw-text mb-3">Workspace Information</h2>
        <div className="space-y-2 text-sm">
          <div className="flex gap-3">
            <span className="text-tw-text-secondary w-28 flex-shrink-0">Workspace ID</span>
            <span className="text-tw-text font-mono text-xs bg-tw-hover px-2 py-0.5 rounded">{user.workspaceId}</span>
          </div>
          <div className="flex gap-3">
            <span className="text-tw-text-secondary w-28 flex-shrink-0">Director</span>
            <span className="text-tw-text">{user.name}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
