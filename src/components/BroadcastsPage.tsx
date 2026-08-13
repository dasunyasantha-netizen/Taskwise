import React, { useState, useEffect } from 'react'
import { noticeApi, type Notice } from '../services/apiService'
import Select from './Select'
import DatePicker from './DatePicker'

const AUDIENCE_LABELS: Record<string, string> = {
  ALL: 'Everyone',
  LAYER: 'Specific Level',
}

export default function BroadcastsPage() {
  const [notices, setNotices]     = useState<Notice[]>([])
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [message, setMessage]     = useState('')
  const [audience, setAudience]   = useState('ALL')
  const [layerNumber, setLayerNumber] = useState<number>(1)
  const [expiresAt, setExpiresAt] = useState('')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  const load = async () => {
    setLoading(true)
    try { setNotices(await noticeApi.getAll()) } catch { /* silent */ }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleCreate = async () => {
    if (!message.trim()) { setError('Message is required'); return }
    setSaving(true); setError('')
    try {
      await noticeApi.create({
        message: message.trim(),
        audience,
        layerNumber: audience === 'LAYER' ? layerNumber : null,
        expiresAt: expiresAt || null,
      })
      setMessage(''); setAudience('ALL'); setLayerNumber(1); setExpiresAt('')
      setShowForm(false)
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create')
    }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this notice? It will disappear for all users.')) return
    try { await noticeApi.delete(id); await load() } catch { /* silent */ }
  }

  const now = new Date()

  return (
    <div className="p-4 md:p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-tw-text">Broadcasts</h1>
          <p className="text-sm text-tw-text-secondary mt-0.5">Send banner notices to all or selected staff levels.</p>
        </div>
        <button onClick={() => setShowForm(s => !s)}
          className="px-4 py-2 rounded-lg bg-tw-primary text-white text-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-2">
          {showForm ? '✕ Cancel' : '+ New Notice'}
        </button>
      </div>

      {/* Compose form */}
      {showForm && (
        <div className="card p-5 mb-6 space-y-4 border-l-4 border-tw-primary">
          <h2 className="font-semibold text-tw-text">Compose Notice</h2>
          <div>
            <label className="block text-xs font-semibold text-tw-text-secondary uppercase tracking-wide mb-1">Message</label>
            <textarea
              className="input resize-none w-full"
              rows={5}
              placeholder="Type your notice here… You can write in multiple languages."
              value={message}
              onChange={e => setMessage(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-tw-text-secondary uppercase tracking-wide mb-1">Audience</label>
              <Select
                value={audience}
                onChange={setAudience}
                options={[
                  { value: 'ALL',   label: 'Everyone (all staff + directors)' },
                  { value: 'LAYER', label: 'Specific Level only' },
                ]}
              />
            </div>
            {audience === 'LAYER' && (
              <div>
                <label className="block text-xs font-semibold text-tw-text-secondary uppercase tracking-wide mb-1">Level</label>
                <Select
                  value={String(layerNumber)}
                  onChange={v => setLayerNumber(Number(v))}
                  options={[
                    { value: '1', label: 'Level 1 — Directors' },
                    { value: '2', label: 'Level 2 — Deputy / Provincial Directors' },
                    { value: '3', label: 'Level 3 — Assistant Directors' },
                  ]}
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-tw-text-secondary uppercase tracking-wide mb-1">Expires (optional)</label>
              <DatePicker value={expiresAt} onChange={setExpiresAt} placeholder="Select date" />
              <p className="text-xs text-tw-text-secondary mt-1">Leave blank to show until manually deleted.</p>
            </div>
          </div>
          {error && <p className="text-sm text-tw-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="btn-secondary text-sm">Cancel</button>
            <button disabled={saving || !message.trim()} onClick={handleCreate}
              className="px-5 py-2 rounded-lg bg-tw-primary text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50">
              {saving ? 'Sending…' : 'Send Notice'}
            </button>
          </div>
        </div>
      )}

      {/* Notice list */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-6 h-6 border-2 border-tw-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : notices.length === 0 ? (
        <div className="card p-12 text-center text-tw-text-secondary">
          <div className="text-4xl mb-3">📢</div>
          <p className="font-semibold text-tw-text">No notices yet</p>
          <p className="text-sm mt-1">Click "+ New Notice" to broadcast a message to your staff.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notices.map(n => {
            const expired = n.expiresAt && new Date(n.expiresAt) < now
            return (
              <div key={n.id} className={`card p-4 border-l-4 ${expired ? 'border-gray-300 opacity-60' : 'border-amber-400'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${expired ? 'bg-gray-100 text-gray-500' : 'bg-amber-100 text-amber-700'}`}>
                        {expired ? 'Expired' : 'Active'}
                      </span>
                      <span className="text-xs text-tw-text-secondary font-medium">
                        {n.audience === 'LAYER' ? `Level ${n.layerNumber} only` : AUDIENCE_LABELS[n.audience]}
                      </span>
                      <span className="text-xs text-tw-text-secondary">
                        · {new Date(n.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                      {n.expiresAt && (
                        <span className="text-xs text-tw-text-secondary">
                          · Expires {new Date(n.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </span>
                      )}
                      {n._count && (
                        <span className="text-xs text-tw-text-secondary">· {n._count.dismissals} dismissed</span>
                      )}
                    </div>
                    <p className="text-sm text-tw-text whitespace-pre-wrap leading-relaxed">{n.message}</p>
                  </div>
                  <button onClick={() => handleDelete(n.id)}
                    className="flex-shrink-0 text-tw-text-secondary hover:text-tw-danger transition-colors p-1 rounded">
                    🗑
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
