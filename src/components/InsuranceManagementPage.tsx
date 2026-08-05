import React, { useEffect, useMemo, useState } from 'react'
import { insuranceApi } from '../services/apiService'
import type { InsurancePolicy, InsuranceQuotation, InsuranceSummary, InsuranceType } from '../types'

type RecordTab = 'quotations' | 'policies'
type FormData = Record<string, string | boolean>

const INSURANCE_TYPES: Array<{ value: InsuranceType; label: string }> = [
  { value: 'MOTOR', label: 'Motor' },
  { value: 'FIRE', label: 'Fire' },
  { value: 'CASUALTY', label: 'Casualty' },
  { value: 'MARINE', label: 'Marine' },
  { value: 'TRAVEL', label: 'Travel' },
]

const emptyForm = (): FormData => ({
  quotationNumber: '', policyNumber: '', insuranceType: 'MOTOR', customerName: '', contactNumber: '',
  sumInsured: '', premium: '', notes: '', issueDate: '', expiryDate: '', paid: false, paymentAmount: '',
  vehicleNumber: '', vehicleMakeModel: '', fuelType: '', vehicleUsage: '',
  propertyAddress: '', propertyType: '', propertyUsage: '', riskDescription: '', businessActivity: '',
  cargoDescription: '', transitFrom: '', transitTo: '', conveyance: '', passportNumber: '', destination: '',
  travelStartDate: '', travelEndDate: '',
})

const dateInput = (value?: string | null) => value ? value.slice(0, 10) : ''
const money = (value: number) => new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 }).format(value)
const displayDate = (value?: string | null) => value ? new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const typeLabel = (type: string) => INSURANCE_TYPES.find(item => item.value === type)?.label || type

function recordForm(record: InsuranceQuotation | InsurancePolicy): FormData {
  const form = emptyForm()
  for (const key of Object.keys(form)) {
    const value = (record as unknown as Record<string, unknown>)[key]
    if (typeof value === 'boolean') form[key] = value
    else if (value != null) form[key] = String(value)
  }
  form.issueDate = 'issueDate' in record ? dateInput(record.issueDate) : ''
  if ('expiryDate' in record) form.expiryDate = dateInput(record.expiryDate)
  form.travelStartDate = dateInput(record.travelStartDate)
  form.travelEndDate = dateInput(record.travelEndDate)
  return form
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-tw-text-secondary mb-1.5">{label}{required && <span className="text-tw-danger"> *</span>}</span>
      {children}
    </label>
  )
}

function TextInput({ value, onChange, type = 'text', placeholder, required, min, step }: {
  value: string; onChange: (value: string) => void; type?: string; placeholder?: string; required?: boolean; min?: string; step?: string
}) {
  return <input className="input text-sm" value={value} onChange={e => onChange(e.target.value)} type={type} placeholder={placeholder} required={required} min={min} step={step} />
}

function SubjectFields({ form, set }: { form: FormData; set: (key: string, value: string | boolean) => void }) {
  const type = form.insuranceType as InsuranceType
  if (type === 'MOTOR') return (
    <>
      <Field label="Vehicle number" required><TextInput value={String(form.vehicleNumber)} onChange={v => set('vehicleNumber', v)} placeholder="e.g. WP CAB-1234" /></Field>
      <Field label="Vehicle make and model" required><TextInput value={String(form.vehicleMakeModel)} onChange={v => set('vehicleMakeModel', v)} placeholder="e.g. Toyota Aqua" /></Field>
      <Field label="Fuel type" required>
        <select className="input text-sm" value={String(form.fuelType)} onChange={e => set('fuelType', e.target.value)}>
          <option value="">Select fuel type</option><option>Petrol</option><option>Diesel</option><option>Hybrid</option><option>Electric</option><option>Other</option>
        </select>
      </Field>
      <Field label="Vehicle usage" required>
        <select className="input text-sm" value={String(form.vehicleUsage)} onChange={e => set('vehicleUsage', e.target.value)}>
          <option value="">Select usage</option><option>Private</option><option>Commercial</option><option>Hiring</option><option>Goods carrying</option><option>Other</option>
        </select>
      </Field>
    </>
  )
  if (type === 'FIRE') return (
    <>
      <div className="md:col-span-2"><Field label="Property address" required><TextInput value={String(form.propertyAddress)} onChange={v => set('propertyAddress', v)} /></Field></div>
      <Field label="Property type" required>
        <select className="input text-sm" value={String(form.propertyType)} onChange={e => set('propertyType', e.target.value)}>
          <option value="">Select property type</option><option>Building</option><option>Contents</option><option>Building and contents</option><option>Stock</option><option>Machinery</option><option>Other</option>
        </select>
      </Field>
      <Field label="Property usage" required><TextInput value={String(form.propertyUsage)} onChange={v => set('propertyUsage', v)} placeholder="Residential, commercial, industrial…" /></Field>
    </>
  )
  if (type === 'CASUALTY') return (
    <>
      <Field label="Business or occupation" required><TextInput value={String(form.businessActivity)} onChange={v => set('businessActivity', v)} /></Field>
      <div className="md:col-span-2"><Field label="Risk / coverage description" required><textarea className="input text-sm min-h-24 resize-y" value={String(form.riskDescription)} onChange={e => set('riskDescription', e.target.value)} /></Field></div>
    </>
  )
  if (type === 'MARINE') return (
    <>
      <div className="md:col-span-2"><Field label="Cargo or insured subject" required><textarea className="input text-sm min-h-20 resize-y" value={String(form.cargoDescription)} onChange={e => set('cargoDescription', e.target.value)} /></Field></div>
      <Field label="Transit from" required><TextInput value={String(form.transitFrom)} onChange={v => set('transitFrom', v)} /></Field>
      <Field label="Transit to" required><TextInput value={String(form.transitTo)} onChange={v => set('transitTo', v)} /></Field>
      <Field label="Conveyance" required><TextInput value={String(form.conveyance)} onChange={v => set('conveyance', v)} placeholder="Vessel, air freight, road…" /></Field>
    </>
  )
  return (
    <>
      <Field label="Passport number" required><TextInput value={String(form.passportNumber)} onChange={v => set('passportNumber', v)} /></Field>
      <Field label="Destination" required><TextInput value={String(form.destination)} onChange={v => set('destination', v)} /></Field>
      <Field label="Travel start date" required><TextInput value={String(form.travelStartDate)} onChange={v => set('travelStartDate', v)} type="date" /></Field>
      <Field label="Travel end date" required><TextInput value={String(form.travelEndDate)} onChange={v => set('travelEndDate', v)} type="date" /></Field>
    </>
  )
}

function RecordFormModal({ kind, initial, onClose, onSaved }: {
  kind: 'quotation' | 'policy'; initial?: InsuranceQuotation | InsurancePolicy | null; onClose: () => void; onSaved: () => Promise<void>
}) {
  const [form, setForm] = useState<FormData>(() => initial ? recordForm(initial) : emptyForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (key: string, value: string | boolean) => setForm(f => ({ ...f, [key]: value }))
  const premium = Number(form.premium) || 0
  const payment = form.paid ? premium : Number(form.paymentAmount) || 0
  const remaining = Math.max(0, premium - payment)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError('')
    try {
      const payload = { ...form, paymentAmount: form.paid ? form.premium : form.paymentAmount }
      if (kind === 'quotation') {
        if (initial) await insuranceApi.updateQuotation(initial.id, payload)
        else await insuranceApi.createQuotation(payload)
      } else {
        if (initial) await insuranceApi.updatePolicy(initial.id, payload)
        else await insuranceApi.createPolicy(payload)
      }
      await onSaved(); onClose()
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to save record') }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 p-3 md:p-6 flex items-center justify-center" onClick={onClose}>
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[94vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-tw-border flex items-center justify-between">
          <div><h2 className="font-bold text-tw-text">{initial ? 'Edit' : 'Create'} {kind === 'quotation' ? 'Quotation' : 'Policy'}</h2><p className="text-xs text-tw-text-secondary mt-0.5">Fields change according to the insurance type.</p></div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-tw-hover text-tw-text-secondary text-xl">×</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && <div className="mb-4 bg-red-50 border border-red-200 text-tw-danger text-sm px-3 py-2 rounded-lg">{error}</div>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label={kind === 'quotation' ? 'Quotation number' : 'Policy number'} required>
              <TextInput value={String(form[kind === 'quotation' ? 'quotationNumber' : 'policyNumber'])} onChange={v => set(kind === 'quotation' ? 'quotationNumber' : 'policyNumber', v)} placeholder="Enter the number manually" />
            </Field>
            <Field label="Insurance type" required>
              <select className="input text-sm" value={String(form.insuranceType)} onChange={e => set('insuranceType', e.target.value)} disabled={!!initial && kind === 'policy' && 'sourceQuotation' in initial && !!initial.sourceQuotation}>
                {INSURANCE_TYPES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </Field>
            <Field label="Customer name" required><TextInput value={String(form.customerName)} onChange={v => set('customerName', v)} /></Field>
            <Field label="Contact number" required><TextInput value={String(form.contactNumber)} onChange={v => set('contactNumber', v)} type="tel" /></Field>
            <SubjectFields form={form} set={set} />
            <Field label="Sum insured (LKR)" required><TextInput value={String(form.sumInsured)} onChange={v => set('sumInsured', v)} type="number" min="0.01" step="0.01" /></Field>
            <Field label="Premium (LKR)" required><TextInput value={String(form.premium)} onChange={v => set('premium', v)} type="number" min="0.01" step="0.01" /></Field>
            {kind === 'policy' && (
              <>
                <Field label="Issue date" required><TextInput value={String(form.issueDate)} onChange={v => set('issueDate', v)} type="date" /></Field>
                <Field label="Expiry date" required><TextInput value={String(form.expiryDate)} onChange={v => set('expiryDate', v)} type="date" /></Field>
                <div className="md:col-span-2 rounded-xl border border-tw-border bg-gray-50 p-4">
                  <label className="flex items-center gap-2 text-sm font-semibold text-tw-text mb-3"><input type="checkbox" checked={Boolean(form.paid)} onChange={e => set('paid', e.target.checked)} className="w-4 h-4" /> Paid in full</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Payment amount (LKR)"><TextInput value={form.paid ? String(premium || '') : String(form.paymentAmount)} onChange={v => set('paymentAmount', v)} type="number" min="0" step="0.01" /></Field>
                    <div><span className="block text-xs font-semibold text-tw-text-secondary mb-1.5">Remaining amount</span><div className={`input text-sm font-bold flex items-center ${remaining > 0 ? 'text-tw-danger' : 'text-emerald-600'}`}>{money(remaining)}</div></div>
                  </div>
                </div>
              </>
            )}
            <div className="md:col-span-2"><Field label="Notes"><textarea className="input text-sm min-h-20 resize-y" value={String(form.notes)} onChange={e => set('notes', e.target.value)} placeholder="Optional notes" /></Field></div>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-tw-border flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn-primary" disabled={saving}>{saving ? 'Saving…' : initial ? 'Save Changes' : kind === 'quotation' ? 'Create Quotation' : 'Add Policy'}</button>
        </div>
      </form>
    </div>
  )
}

function ConvertModal({ quotation, onClose, onSaved }: { quotation: InsuranceQuotation; onClose: () => void; onSaved: () => Promise<void> }) {
  const today = new Date().toISOString().slice(0, 10)
  const nextYear = new Date(); nextYear.setFullYear(nextYear.getFullYear() + 1)
  const [form, setForm] = useState<FormData>({ policyNumber: '', premium: String(quotation.premium), issueDate: today, expiryDate: nextYear.toISOString().slice(0, 10), paid: false, paymentAmount: '' })
  const [saving, setSaving] = useState(false); const [error, setError] = useState('')
  const premium = Number(form.premium) || 0; const payment = form.paid ? premium : Number(form.paymentAmount) || 0
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError('')
    try { await insuranceApi.convertQuotation(quotation.id, { ...form, paymentAmount: form.paid ? form.premium : form.paymentAmount }); await onSaved(); onClose() }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to convert quotation') }
    setSaving(false)
  }
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 p-4 flex items-center justify-center" onClick={onClose}>
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-5" onClick={e => e.stopPropagation()}>
        <h2 className="font-bold text-tw-text text-lg">Convert to Policy</h2><p className="text-sm text-tw-text-secondary mb-4">Quotation {quotation.quotationNumber} · {quotation.customerName}</p>
        {error && <div className="mb-3 bg-red-50 border border-red-200 text-tw-danger text-sm px-3 py-2 rounded-lg">{error}</div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2"><Field label="Policy number" required><TextInput value={String(form.policyNumber)} onChange={v => setForm(f => ({ ...f, policyNumber: v }))} /></Field></div>
          <Field label="Premium (LKR)" required><TextInput value={String(form.premium)} onChange={v => setForm(f => ({ ...f, premium: v }))} type="number" min="0.01" step="0.01" /></Field>
          <Field label="Payment amount (LKR)"><TextInput value={form.paid ? String(premium) : String(form.paymentAmount)} onChange={v => setForm(f => ({ ...f, paymentAmount: v }))} type="number" min="0" step="0.01" /></Field>
          <Field label="Issue date" required><TextInput value={String(form.issueDate)} onChange={v => setForm(f => ({ ...f, issueDate: v }))} type="date" /></Field>
          <Field label="Expiry date" required><TextInput value={String(form.expiryDate)} onChange={v => setForm(f => ({ ...f, expiryDate: v }))} type="date" /></Field>
          <label className="sm:col-span-2 flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm font-semibold"><input type="checkbox" checked={Boolean(form.paid)} onChange={e => setForm(f => ({ ...f, paid: e.target.checked }))} /> Paid in full <span className="ml-auto text-xs text-tw-text-secondary">Balance: {money(Math.max(0, premium - payment))}</span></label>
        </div>
        <div className="flex justify-end gap-2 mt-5"><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={saving}>{saving ? 'Converting…' : 'Convert to Policy'}</button></div>
      </form>
    </div>
  )
}

function RenewModal({ quotation, onClose, onSaved }: { quotation: InsuranceQuotation; onClose: () => void; onSaved: () => Promise<void> }) {
  const [number, setNumber] = useState(''); const [premium, setPremium] = useState(String(quotation.premium)); const [saving, setSaving] = useState(false); const [error, setError] = useState('')
  const submit = async (e: React.FormEvent) => { e.preventDefault(); setSaving(true); setError(''); try { await insuranceApi.renewQuotation(quotation.id, { quotationNumber: number, premium }); await onSaved(); onClose() } catch (err) { setError(err instanceof Error ? err.message : 'Unable to renew quotation') } setSaving(false) }
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 p-4 flex items-center justify-center" onClick={onClose}>
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        <h2 className="font-bold text-tw-text text-lg">Renew Quotation</h2><p className="text-sm text-tw-text-secondary mb-4">A new quotation will be valid for one calendar month.</p>
        {error && <div className="mb-3 bg-red-50 border border-red-200 text-tw-danger text-sm px-3 py-2 rounded-lg">{error}</div>}
        <div className="space-y-4"><Field label="New quotation number" required><TextInput value={number} onChange={setNumber} /></Field><Field label="Premium (LKR)" required><TextInput value={premium} onChange={setPremium} type="number" min="0.01" step="0.01" /></Field></div>
        <div className="flex justify-end gap-2 mt-5"><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={saving}>{saving ? 'Renewing…' : 'Create Renewal'}</button></div>
      </form>
    </div>
  )
}

const badgeClass: Record<string, string> = { ACTIVE: 'badge-success', CONVERTED: 'badge-primary', EXPIRED: 'badge-danger', RENEWED: 'badge-warning', COMPLETED: 'badge-success' }

function subjectPairs(record: InsuranceQuotation | InsurancePolicy): Array<[string, string]> {
  if (record.insuranceType === 'MOTOR') return [['Vehicle number', record.vehicleNumber || '—'], ['Make and model', record.vehicleMakeModel || '—'], ['Fuel type', record.fuelType || '—'], ['Usage', record.vehicleUsage || '—']]
  if (record.insuranceType === 'FIRE') return [['Property address', record.propertyAddress || '—'], ['Property type', record.propertyType || '—'], ['Property usage', record.propertyUsage || '—']]
  if (record.insuranceType === 'CASUALTY') return [['Business / occupation', record.businessActivity || '—'], ['Risk / coverage', record.riskDescription || '—']]
  if (record.insuranceType === 'MARINE') return [['Cargo / subject', record.cargoDescription || '—'], ['Transit from', record.transitFrom || '—'], ['Transit to', record.transitTo || '—'], ['Conveyance', record.conveyance || '—']]
  return [['Passport number', record.passportNumber || '—'], ['Destination', record.destination || '—'], ['Travel start', displayDate(record.travelStartDate)], ['Travel end', displayDate(record.travelEndDate)]]
}

function DetailModal({ record, kind, onClose, onEdit, onConvert, onRenew }: {
  record: InsuranceQuotation | InsurancePolicy; kind: 'quotation' | 'policy'; onClose: () => void; onEdit: () => void; onConvert?: () => void; onRenew?: () => void
}) {
  const quote = kind === 'quotation' ? record as InsuranceQuotation : null
  const policy = kind === 'policy' ? record as InsurancePolicy : null
  const pairs: Array<[string, React.ReactNode]> = [
    [kind === 'quotation' ? 'Quotation number' : 'Policy number', kind === 'quotation' ? quote!.quotationNumber : policy!.policyNumber],
    ['Insurance type', typeLabel(record.insuranceType)], ['Customer', record.customerName], ['Contact number', record.contactNumber],
    ...subjectPairs(record), ['Sum insured', money(record.sumInsured)], ['Premium', money(record.premium)],
    ...(quote ? [['Issue date', displayDate(quote.issueDate)], ['Valid until', displayDate(quote.expiresAt)]] as Array<[string, string]> : []),
    ...(policy ? [['Issue date', displayDate(policy.issueDate)], ['Expiry date', displayDate(policy.expiryDate)], ['Payment received', money(policy.paymentAmount)], ['Remaining amount', money(policy.remainingAmount)]] as Array<[string, string]> : []),
    ['Created by', record.createdByName], ['Notes', record.notes || '—'],
  ]
  return (
    <div className="fixed inset-0 z-50 bg-black/40 p-3 md:p-6 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-tw-border flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h2 className="font-bold text-tw-text text-lg">{kind === 'quotation' ? quote!.quotationNumber : policy!.policyNumber}</h2><span className={`badge ${badgeClass[record.status] || 'badge-gray'}`}>{record.status.replace('_', ' ')}</span></div><p className="text-sm text-tw-text-secondary mt-0.5">{record.customerName}</p></div><button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-tw-hover text-tw-text-secondary text-xl">×</button></div>
        <div className="flex-1 overflow-y-auto p-5"><div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">{pairs.map(([label, value]) => <div key={label} className={label === 'Notes' || label.includes('Risk') || label.includes('Cargo') || label.includes('Property address') ? 'sm:col-span-2' : ''}><div className="text-xs font-semibold text-tw-text-secondary mb-1">{label}</div><div className={`text-sm font-medium break-words ${label === 'Remaining amount' && policy && policy.remainingAmount > 0 ? 'text-tw-danger' : 'text-tw-text'}`}>{value}</div></div>)}</div></div>
        <div className="px-5 py-4 border-t border-tw-border flex flex-wrap justify-end gap-2">
          {quote?.status === 'ACTIVE' && <button className="btn-secondary" onClick={onEdit}>Edit</button>}
          {policy && <button className="btn-secondary" onClick={onEdit}>Edit Policy / Payment</button>}
          {quote?.status === 'EXPIRED' && onRenew && <button className="btn-primary" onClick={onRenew}>Renew Quotation</button>}
          {quote?.status === 'ACTIVE' && onConvert && <button className="btn-primary" onClick={onConvert}>Convert to Policy</button>}
        </div>
      </div>
    </div>
  )
}

export default function InsuranceManagementPage() {
  const [summary, setSummary] = useState<InsuranceSummary | null>(null)
  const [quotations, setQuotations] = useState<InsuranceQuotation[]>([])
  const [policies, setPolicies] = useState<InsurancePolicy[]>([])
  const [tab, setTab] = useState<RecordTab>('quotations')
  const [search, setSearch] = useState(''); const [type, setType] = useState(''); const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true); const [error, setError] = useState('')
  const [formKind, setFormKind] = useState<'quotation' | 'policy' | null>(null)
  const [selected, setSelected] = useState<InsuranceQuotation | InsurancePolicy | null>(null)
  const [editing, setEditing] = useState<InsuranceQuotation | InsurancePolicy | null>(null)
  const [convert, setConvert] = useState<InsuranceQuotation | null>(null); const [renew, setRenew] = useState<InsuranceQuotation | null>(null)

  const load = async () => {
    setLoading(true); setError('')
    try {
      const [s, q, p] = await Promise.all([insuranceApi.summary(), insuranceApi.quotations(), insuranceApi.policies()])
      setSummary(s as InsuranceSummary); setQuotations(q as InsuranceQuotation[]); setPolicies(p as InsurancePolicy[])
      if (selected) {
        const updated = selected && ('quotationNumber' in selected ? (q as InsuranceQuotation[]).find(x => x.id === selected.id) : (p as InsurancePolicy[]).find(x => x.id === selected.id))
        setSelected(updated || null)
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to load insurance records') }
    setLoading(false)
  }
  useEffect(() => { load() }, [])
  useEffect(() => { setStatus(''); setSelected(null) }, [tab])

  const records = useMemo(() => {
    const source = tab === 'quotations' ? quotations : policies
    const q = search.trim().toLowerCase()
    return source.filter(record => {
      const haystack = Object.values(record).filter(value => typeof value === 'string' || typeof value === 'number').join(' ').toLowerCase()
      const statusMatch = !status || (tab === 'quotations'
        ? record.status === status
        : status === 'PAID' ? (record as InsurancePolicy).paid : status === 'OUTSTANDING' ? !(record as InsurancePolicy).paid : true)
      return (!q || haystack.includes(q)) && (!type || record.insuranceType === type) && statusMatch
    })
  }, [tab, quotations, policies, search, type, status])

  const cards = summary ? [
    { label: 'Active quotations', value: summary.activeQuotations, sub: `${summary.expiredQuotations} expired`, color: 'text-blue-600', icon: '📝' },
    { label: 'Completed policies', value: summary.completedPolicies, sub: `${summary.expiringPolicies} expire within 30 days`, color: 'text-emerald-600', icon: '🛡️' },
    { label: 'Policy premium', value: money(summary.totalPolicyPremium), sub: `${money(summary.totalPayments)} collected`, color: 'text-indigo-600', icon: '💼' },
    { label: 'Outstanding', value: money(summary.outstandingAmount), sub: `${summary.unpaidPolicies} policies not fully paid`, color: 'text-tw-danger', icon: '💳' },
  ] : []

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div><h1 className="text-xl md:text-2xl font-bold text-tw-text">Insurance Management</h1><p className="text-sm text-tw-text-secondary mt-0.5">Fairfirst quotations, policies and customer payments.</p></div>
        <div className="flex gap-2"><button className="btn-secondary flex-1 sm:flex-none" onClick={() => { setEditing(null); setFormKind('policy') }}>+ Add Policy</button><button className="btn-primary flex-1 sm:flex-none" onClick={() => { setEditing(null); setFormKind('quotation') }}>+ Create Quotation</button></div>
      </div>
      {error && <div className="bg-red-50 border border-red-200 text-tw-danger text-sm px-4 py-3 rounded-xl">{error}</div>}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">{cards.map(card => <div key={card.label} className="card p-4"><div className="flex items-center gap-2 text-xs text-tw-text-secondary mb-1"><span>{card.icon}</span>{card.label}</div><div className={`text-lg md:text-xl font-bold truncate ${card.color}`}>{card.value}</div><div className="text-xs text-tw-text-secondary mt-1 truncate">{card.sub}</div></div>)}</div>
      <div className="card overflow-hidden">
        <div className="p-3 md:p-4 border-b border-tw-border space-y-3">
          <div className="inline-flex rounded-xl border border-tw-border bg-gray-50 p-1 w-full sm:w-auto">
            <button onClick={() => setTab('quotations')} className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-semibold ${tab === 'quotations' ? 'bg-white text-tw-primary shadow-sm' : 'text-tw-text-secondary'}`}>Quotations ({quotations.length})</button>
            <button onClick={() => setTab('policies')} className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-semibold ${tab === 'policies' ? 'bg-white text-tw-primary shadow-sm' : 'text-tw-text-secondary'}`}>Policies ({policies.length})</button>
          </div>
          <div className="flex flex-col md:flex-row gap-2">
            <input className="input text-sm flex-1" value={search} onChange={e => setSearch(e.target.value)} placeholder={`Search ${tab} by number, customer, contact or insured details…`} />
            <select className="input text-sm md:max-w-[180px]" value={type} onChange={e => setType(e.target.value)}><option value="">All insurance types</option>{INSURANCE_TYPES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
            <select className="input text-sm md:max-w-[180px]" value={status} onChange={e => setStatus(e.target.value)}>{tab === 'quotations' ? <><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="CONVERTED">Converted</option><option value="EXPIRED">Expired</option><option value="RENEWED">Renewed</option></> : <><option value="">All payments</option><option value="PAID">Paid</option><option value="OUTSTANDING">Outstanding</option></>}</select>
          </div>
        </div>
        {loading ? <div className="py-12 text-center text-sm text-tw-text-secondary">Loading insurance records…</div> : records.length === 0 ? <div className="py-12 text-center"><div className="text-3xl mb-2">🔎</div><div className="font-semibold text-tw-text">No records found</div><div className="text-sm text-tw-text-secondary mt-1">Try changing the search or filters.</div></div> : (
          <>
            <div className="md:hidden divide-y divide-tw-border">{records.map(record => { const isQuote = 'quotationNumber' in record; const policy = !isQuote ? record as InsurancePolicy : null; return <button key={record.id} onClick={() => setSelected(record)} className="w-full text-left p-4 active:bg-tw-hover"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="font-semibold text-tw-text truncate">{isQuote ? record.quotationNumber : policy!.policyNumber}</div><div className="text-sm text-tw-text-secondary truncate">{record.customerName} · {record.contactNumber}</div></div><span className={`badge ${isQuote ? badgeClass[record.status] : policy!.paid ? 'badge-success' : 'badge-warning'}`}>{isQuote ? record.status : policy!.paid ? 'PAID' : 'OUTSTANDING'}</span></div><div className="flex items-center justify-between mt-3 text-xs text-tw-text-secondary"><span>{typeLabel(record.insuranceType)}</span><span className="font-semibold text-tw-text">{money(record.premium)}</span></div>{policy && !policy.paid && <div className="text-xs text-tw-danger mt-1 text-right">Balance {money(policy.remainingAmount)}</div>}</button> })}</div>
            <div className="hidden md:block overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-[#f0f4ff] border-b border-tw-border"><th className="px-4 py-3 text-left text-xs font-bold text-tw-primary uppercase">{tab === 'quotations' ? 'Quotation' : 'Policy'}</th><th className="px-4 py-3 text-left text-xs font-bold text-tw-primary uppercase">Customer</th><th className="px-4 py-3 text-left text-xs font-bold text-tw-primary uppercase">Type</th><th className="px-4 py-3 text-right text-xs font-bold text-tw-primary uppercase">Premium</th><th className="px-4 py-3 text-left text-xs font-bold text-tw-primary uppercase">{tab === 'quotations' ? 'Valid until' : 'Expiry'}</th><th className="px-4 py-3 text-center text-xs font-bold text-tw-primary uppercase">Status</th></tr></thead><tbody className="divide-y divide-tw-border">{records.map(record => { const isQuote = 'quotationNumber' in record; const policy = !isQuote ? record as InsurancePolicy : null; return <tr key={record.id} onClick={() => setSelected(record)} className="hover:bg-tw-hover cursor-pointer"><td className="px-4 py-3 font-semibold text-tw-text">{isQuote ? record.quotationNumber : policy!.policyNumber}</td><td className="px-4 py-3"><div className="font-medium text-tw-text">{record.customerName}</div><div className="text-xs text-tw-text-secondary">{record.contactNumber}</div></td><td className="px-4 py-3 text-tw-text-secondary">{typeLabel(record.insuranceType)}</td><td className="px-4 py-3 text-right font-semibold">{money(record.premium)}{policy && !policy.paid && <div className="text-xs text-tw-danger">{money(policy.remainingAmount)} due</div>}</td><td className="px-4 py-3 text-tw-text-secondary">{displayDate(isQuote ? record.expiresAt : policy!.expiryDate)}</td><td className="px-4 py-3 text-center"><span className={`badge ${isQuote ? badgeClass[record.status] : policy!.paid ? 'badge-success' : 'badge-warning'}`}>{isQuote ? record.status : policy!.paid ? 'PAID' : 'OUTSTANDING'}</span></td></tr> })}</tbody></table></div>
          </>
        )}
      </div>
      {formKind && <RecordFormModal kind={formKind} initial={editing} onClose={() => { setFormKind(null); setEditing(null) }} onSaved={load} />}
      {selected && <DetailModal record={selected} kind={'quotationNumber' in selected ? 'quotation' : 'policy'} onClose={() => setSelected(null)} onEdit={() => { setEditing(selected); setFormKind('quotationNumber' in selected ? 'quotation' : 'policy'); setSelected(null) }} onConvert={'quotationNumber' in selected ? () => { setConvert(selected); setSelected(null) } : undefined} onRenew={'quotationNumber' in selected ? () => { setRenew(selected); setSelected(null) } : undefined} />}
      {convert && <ConvertModal quotation={convert} onClose={() => setConvert(null)} onSaved={load} />}
      {renew && <RenewModal quotation={renew} onClose={() => setRenew(null)} onSaved={load} />}
    </div>
  )
}
