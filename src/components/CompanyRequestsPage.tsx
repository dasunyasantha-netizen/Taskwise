import React, { useEffect, useState } from 'react'
import { companyApi, type CompanyRequestDetail, type CompanyRequestSummary } from '../services/apiService'

function fmt(d: string) {
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

const statuses = ['', 'PENDING', 'MORE_INFORMATION_REQUIRED', 'APPROVED', 'REJECTED', 'CANCELLED']

export default function CompanyRequestsPage() {
  const [requests, setRequests] = useState<CompanyRequestSummary[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const [selected, setSelected] = useState<CompanyRequestDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState({ status: 'PENDING', q: '', reference: '', from: '', to: '' })
  const [prefix, setPrefix] = useState('')
  const [reason, setReason] = useState('')
  const [instructions, setInstructions] = useState('')
  const [note, setNote] = useState('')
  const [actionError, setActionError] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  const load = async () => {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams()
      Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v) })
      const res = await companyApi.listRequests(params.toString())
      setRequests(res.requests)
      setPendingCount(res.pendingCount)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load company requests')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const open = async (id: string) => {
    setActionError('')
    const detail = await companyApi.getRequest(id)
    setSelected(detail)
    setPrefix(detail.finalPrefix || detail.suggestedPrefix)
    setReason('')
    setInstructions(detail.moreInfoInstructions || '')
    setNote(detail.internalNote || '')
  }

  const runAction = async (action: string) => {
    if (!selected) return
    setActionLoading(true); setActionError('')
    try {
      await companyApi.action(selected.id, { action, prefix, reason, instructions, note })
      await load()
      await open(selected.id)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setActionLoading(false)
    }
  }

  const downloadDocument = async () => {
    if (!selected) return
    const doc = await companyApi.document(selected.id)
    const a = document.createElement('a')
    a.href = doc.data
    a.download = doc.name || 'company-document'
    a.click()
  }

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-tw-text">Company Approval Queue</h1>
          <p className="text-sm text-tw-text-secondary">{pendingCount} pending request{pendingCount === 1 ? '' : 's'}</p>
        </div>
        <button onClick={load} className="btn-secondary">Refresh</button>
      </div>

      <div className="card p-4 mb-4">
        <div className="grid md:grid-cols-5 gap-3">
          <select className="input" value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
            {statuses.map(s => <option key={s} value={s}>{s || 'All statuses'}</option>)}
          </select>
          <input className="input" placeholder="Company search" value={filters.q} onChange={e => setFilters(f => ({ ...f, q: e.target.value }))} />
          <input className="input" placeholder="Reference" value={filters.reference} onChange={e => setFilters(f => ({ ...f, reference: e.target.value }))} />
          <input className="input" type="date" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} />
          <div className="flex gap-2">
            <input className="input" type="date" value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} />
            <button onClick={load} className="btn-primary">Filter</button>
          </div>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-tw-danger text-sm px-3 py-2 rounded-lg mb-4">{error}</div>}

      <div className="grid lg:grid-cols-[1fr_420px] gap-4">
        <div className="card overflow-hidden">
          {loading ? (
            <div className="p-8 text-sm text-tw-text-secondary">Loading...</div>
          ) : requests.length === 0 ? (
            <div className="p-8 text-sm text-tw-text-secondary">No requests match the filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#f0f4ff] border-b-2 border-tw-primary/20">
                    {['Company', 'Reg No.', 'Applicant', 'Contact', 'Prefix', 'Submitted', 'Status'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-bold text-tw-primary uppercase whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-tw-border">
                  {requests.map(r => (
                    <tr key={r.id} onClick={() => open(r.id)} className={`cursor-pointer hover:bg-tw-hover ${selected?.id === r.id ? 'bg-blue-50' : ''}`}>
                      <td className="px-4 py-3 font-semibold text-tw-text">{r.legalName}<div className="text-xs text-tw-text-secondary">{r.reference}</div></td>
                      <td className="px-4 py-3">{r.registrationNumber}</td>
                      <td className="px-4 py-3">{r.applicantName}</td>
                      <td className="px-4 py-3 text-xs">{r.applicantPhone}<br />{r.applicantEmail}</td>
                      <td className="px-4 py-3 font-mono font-bold">{r.finalPrefix || r.suggestedPrefix}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{fmt(r.createdAt)}</td>
                      <td className="px-4 py-3"><span className="badge badge-primary">{r.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <aside className="card p-4 h-fit">
          {!selected ? (
            <div className="text-sm text-tw-text-secondary">Select a request to review details.</div>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="flex justify-between gap-3">
                  <h2 className="font-bold text-tw-text">{selected.legalName}</h2>
                  <span className="badge badge-primary">{selected.status}</span>
                </div>
                <div className="text-xs text-tw-text-secondary mt-1">{selected.reference} · {fmt(selected.createdAt)}</div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-tw-text-secondary">Reg No.</span><div className="font-medium">{selected.registrationNumber}</div></div>
                <div><span className="text-tw-text-secondary">Industry</span><div className="font-medium">{selected.industry}</div></div>
                <div className="col-span-2"><span className="text-tw-text-secondary">Address</span><div className="font-medium">{selected.address}</div></div>
                <div className="col-span-2"><span className="text-tw-text-secondary">Reason</span><div className="font-medium whitespace-pre-wrap">{selected.reason}</div></div>
                <div className="col-span-2"><span className="text-tw-text-secondary">Applicant</span><div className="font-medium">{selected.applicantName}<br />{selected.applicantPhone}<br />{selected.applicantEmail}</div></div>
              </div>

              {selected.hasSupportingDocument && (
                <button onClick={downloadDocument} className="btn-secondary w-full">Download Supporting Document</button>
              )}

              <div>
                <label className="block text-xs font-bold text-tw-text-secondary uppercase mb-1">Approval prefix</label>
                <input className="input font-mono uppercase" value={prefix} onChange={e => setPrefix(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6))} />
                <p className="text-xs text-tw-text-secondary mt-1">Letters only, 2 to 6 characters. Rechecked during approval.</p>
              </div>

              <textarea className="input resize-none" rows={2} placeholder="Internal note" value={note} onChange={e => setNote(e.target.value)} />
              <textarea className="input resize-none" rows={2} placeholder="Instructions for more information" value={instructions} onChange={e => setInstructions(e.target.value)} />
              <textarea className="input resize-none" rows={2} placeholder="Rejection reason" value={reason} onChange={e => setReason(e.target.value)} />

              {actionError && <div className="bg-red-50 border border-red-200 text-tw-danger text-sm px-3 py-2 rounded-lg">{actionError}</div>}

              <div className="grid grid-cols-2 gap-2">
                <button disabled={actionLoading} onClick={() => runAction('approve')} className="bg-green-600 text-white rounded-lg px-3 py-2 font-semibold text-sm">Approve</button>
                <button disabled={actionLoading} onClick={() => runAction('reject')} className="btn-danger text-sm">Reject</button>
                <button disabled={actionLoading} onClick={() => runAction('more_info')} className="btn-secondary text-sm">Request More Info</button>
                <button disabled={actionLoading} onClick={() => runAction('pending')} className="btn-secondary text-sm">Return to Pending</button>
                <button disabled={actionLoading} onClick={() => runAction('note')} className="btn-secondary text-sm col-span-2">Save Internal Note</button>
                <button disabled={actionLoading} onClick={() => runAction('prefix')} className="btn-secondary text-sm col-span-2">Save Prefix</button>
              </div>

              {selected.actions && selected.actions.length > 0 && (
                <div className="border-t border-tw-border pt-3">
                  <div className="text-xs font-bold text-tw-text-secondary uppercase mb-2">Audit trail</div>
                  <div className="space-y-2 max-h-52 overflow-y-auto">
                    {selected.actions.map(a => (
                      <div key={a.id} className="text-xs bg-tw-hover rounded-lg p-2">
                        <div className="font-semibold">{a.action}</div>
                        <div className="text-tw-text-secondary">{a.actorDirector?.name || 'System'} · {new Date(a.createdAt).toLocaleString()}</div>
                        {a.note && <div className="mt-1">{a.note}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
