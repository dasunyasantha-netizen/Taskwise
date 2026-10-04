import React, { useState, useEffect } from 'react'
import { noticeApi, workspaceApi, type Notice } from '../services/apiService'
import type { AuthUser, Layer } from '../types'
import { OFFICE_CATEGORY_OPTIONS, hasFourLevelHierarchy, levelTakesCategory, officeCategoryLabel } from '../hierarchy'
import Select from './Select'
import DatePicker from './DatePicker'
import { PageHeader, EmptyState, LoadingBlock } from './ui/Primitives'
import { Icon } from './ui/Icon'
import { useConfirm } from './ConfirmDialog'

const AUDIENCE_LABELS: Record<string, string> = {
  ALL: 'Everyone',
  LAYER: 'Specific Level',
}

export default function BroadcastsPage({ user }: { user: AuthUser }) {
  const { confirm, dialog } = useConfirm()
  const [notices, setNotices]     = useState<Notice[]>([])
  const [layers, setLayers]       = useState<Layer[]>([])
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [message, setMessage]     = useState('')
  const [audience, setAudience]   = useState('ALL')
  const [layerNumber, setLayerNumber] = useState<number>(1)
  const [officeCategory, setOfficeCategory] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const [n, l] = await Promise.all([noticeApi.getAll(), workspaceApi.getLayers() as Promise<Layer[]>])
      setNotices(n); setLayers(l)
    } catch { /* silent */ }
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
        officeCategory: canTargetCategory && officeCategory ? officeCategory : null,
        expiresAt: expiresAt || null,
      })
      setMessage(''); setAudience('ALL'); setLayerNumber(1); setOfficeCategory(''); setExpiresAt('')
      setShowForm(false)
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create')
    }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    if (!(await confirm({ title: 'Delete this notice?', message: 'It will disappear for all users.', confirmLabel: 'Delete', tone: 'danger' }))) return
    try { await noticeApi.delete(id); await load() } catch { /* silent */ }
  }

  const now = new Date()
  const fourLevel = hasFourLevelHierarchy(user)
  // Only levels that actually split into Head Office and Provincial can be narrowed.
  const canTargetCategory = fourLevel && audience === 'LAYER' && levelTakesCategory(layerNumber)
  const levelOptions = layers.length > 0
    ? layers.map(l => ({ value: String(l.number), label: l.name }))
    : [
        { value: '1', label: 'Level 1 — Directors' },
        { value: '2', label: 'Level 2 — Deputy / Provincial Directors' },
        { value: '3', label: 'Level 3 — Assistant Directors' },
      ]

  return (
    <div className="page max-w-4xl">
      {dialog}
      <PageHeader icon="broadcast" tone="amber" title="Broadcasts" subtitle="Send banner notices to all or selected staff levels."
        actions={<button onClick={() => setShowForm(s => !s)}
          className={showForm ? 'btn-secondary' : 'btn-primary'}>
          {showForm ? <><Icon name="x" className="w-4 h-4" /> Cancel</> : <><Icon name="plus" className="w-4 h-4" /> New Notice</>}
        </button>} />

      {/* Compose form */}
      {showForm && (
        <div className="card p-5 mb-6 space-y-4 ring-1 ring-tw-primary/25">
          <h2 className="font-semibold text-tw-text inline-flex items-center gap-2"><span className="icon-tile tile-blue w-8 h-8 rounded-lg"><Icon name="edit" className="w-4 h-4" /></span>Compose Notice</h2>
          <div>
            <label className="label">Message</label>
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
              <label className="label">Audience</label>
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
                <label className="label">Level</label>
                <Select
                  value={String(layerNumber)}
                  onChange={v => { setLayerNumber(Number(v)); setOfficeCategory('') }}
                  options={levelOptions}
                />
              </div>
            )}
            {canTargetCategory && (
              <div>
                <label className="label">Category</label>
                <Select
                  value={officeCategory}
                  onChange={setOfficeCategory}
                  options={[
                    { value: '', label: 'Everyone at this level' },
                    ...OFFICE_CATEGORY_OPTIONS.map(o => ({ value: o.value, label: `${o.label} only` })),
                  ]}
                />
              </div>
            )}
            <div>
              <label className="label">Expires (optional)</label>
              <DatePicker value={expiresAt} onChange={setExpiresAt} placeholder="Select date" />
              <p className="text-xs text-tw-text-secondary mt-1">Leave blank to show until manually deleted.</p>
            </div>
          </div>
          {error && <p className="text-sm text-tw-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="btn-secondary text-sm">Cancel</button>
            <button disabled={saving || !message.trim()} onClick={handleCreate}
              className="btn-primary">
              {saving ? 'Sending…' : 'Send Notice'}
            </button>
          </div>
        </div>
      )}

      {/* Notice list */}
      {loading ? (
        <LoadingBlock />
      ) : notices.length === 0 ? (
        <div className="card">
          <EmptyState icon="broadcast" tone="amber" title="No notices yet" text='Click "New Notice" to broadcast a message to your staff.' />
        </div>
      ) : (
        <div className="space-y-3">
          {notices.map(n => {
            const expired = n.expiresAt && new Date(n.expiresAt) < now
            return (
              <div key={n.id} className={`card p-4 relative overflow-hidden ${expired ? 'opacity-60' : ''}`}>
                <span className={`absolute left-0 top-3 bottom-3 w-1 rounded-r-full ${expired ? 'bg-gray-300' : 'bg-amber-400'}`} />
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className={`badge ${expired ? 'badge-gray' : 'badge-warning'}`}>
                        {expired ? 'Expired' : 'Active'}
                      </span>
                      <span className="text-xs text-tw-text-secondary font-medium">
                        {n.audience === 'LAYER'
                          ? `Level ${n.layerNumber}${officeCategoryLabel(n.officeCategory) ? ` · ${officeCategoryLabel(n.officeCategory)}` : ''} only`
                          : AUDIENCE_LABELS[n.audience]}
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
                    className="flex-shrink-0 icon-btn hover:text-tw-danger" aria-label="Delete notice">
                    <Icon name="trash" className="w-4 h-4" />
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
