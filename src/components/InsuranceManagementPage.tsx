import React, { useEffect, useMemo, useState } from 'react'
import { insuranceApi } from '../services/apiService'
import type { InsurancePolicy, InsuranceQuotation, InsuranceSummary, InsuranceType } from '../types'
import Select from './Select'
import DatePicker from './DatePicker'

type RecordTab = 'quotations' | 'policies'
type FormData = Record<string, string | boolean>

const INSURANCE_TYPES: Array<{ value: InsuranceType; label: string }> = [
  { value: 'MOTOR', label: 'Motor' },
  { value: 'FIRE', label: 'Fire' },
  { value: 'CASUALTY', label: 'Casualty' },
  { value: 'MARINE', label: 'Marine' },
  { value: 'TRAVEL', label: 'Travel' },
]

const FUEL_TYPES = [
  { value: 'Petrol', label: 'Petrol' },
  { value: 'Diesel', label: 'Diesel' },
  { value: 'Hybrid', label: 'Hybrid' },
  { value: 'Electric', label: 'Electric' },
  { value: 'Other', label: 'Other' },
]

const VEHICLE_USAGES = [
  { value: 'Private', label: 'Private' },
  { value: 'Commercial', label: 'Commercial' },
  { value: 'Hiring', label: 'Hiring' },
  { value: 'Goods carrying', label: 'Goods carrying' },
  { value: 'Other', label: 'Other' },
]

const PROPERTY_TYPES = [
  { value: 'Building', label: 'Building' },
  { value: 'Contents', label: 'Contents' },
  { value: 'Building and contents', label: 'Building and contents' },
  { value: 'Stock', label: 'Stock' },
  { value: 'Machinery', label: 'Machinery' },
  { value: 'Other', label: 'Other' },
]

const QUOTATION_STATUSES = [
  { value: '', label: 'All statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'RENEWED', label: 'Renewed' },
]

const POLICY_STATUSES = [
  { value: '', label: 'All statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'EXPIRED', label: 'Expired' },
]

const BUSINESS_TYPES = [
  { value: 'NEW', label: 'New' },
  { value: 'RENEWAL', label: 'Renewal' },
]

const emptyForm = (): FormData => ({
  quotationNumber: '', policyNumber: '', insuranceType: 'MOTOR', customerName: '', contactNumber: '',
  introducer: '', partner: '',
  companyPolicyNumber: '', salesCode: '', businessType: 'NEW', gwp: '',
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

function normalizedMoneyInput(value: string): string {
  const cleaned = value.replace(/,/g, '').replace(/[^\d.]/g, '')
  const decimalIndex = cleaned.indexOf('.')
  if (decimalIndex === -1) return cleaned.replace(/^0+(?=\d)/, '')
  const whole = cleaned.slice(0, decimalIndex).replace(/^0+(?=\d)/, '') || '0'
  const decimals = cleaned.slice(decimalIndex + 1).replace(/\./g, '').slice(0, 2)
  return `${whole}.${decimals}`
}

function formattedMoneyInput(value: string): string {
  if (!value) return ''
  const [whole, decimals] = value.split('.')
  const grouped = (whole || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return value.includes('.') ? `${grouped}.${decimals ?? ''}` : grouped
}

function MoneyInput({ value, onChange, required }: {
  value: string; onChange: (value: string) => void; required?: boolean
}) {
  return (
    <input
      className="input text-sm"
      value={formattedMoneyInput(value)}
      onChange={event => onChange(normalizedMoneyInput(event.target.value))}
      type="text"
      inputMode="decimal"
      placeholder="0.00"
      required={required}
    />
  )
}

function SubjectFields({ form, set }: { form: FormData; set: (key: string, value: string | boolean) => void }) {
  const type = form.insuranceType as InsuranceType
  if (type === 'MOTOR') return (
    <>
      <Field label="Vehicle number" required><TextInput value={String(form.vehicleNumber)} onChange={v => set('vehicleNumber', v)} placeholder="e.g. WP CAB-1234" /></Field>
      <Field label="Vehicle make and model" required><TextInput value={String(form.vehicleMakeModel)} onChange={v => set('vehicleMakeModel', v)} placeholder="e.g. Toyota Aqua" /></Field>
      <Field label="Fuel type" required>
        <Select value={String(form.fuelType)} onChange={v => set('fuelType', v)} options={FUEL_TYPES} placeholder="Select fuel type" />
      </Field>
      <Field label="Vehicle usage" required>
        <Select value={String(form.vehicleUsage)} onChange={v => set('vehicleUsage', v)} options={VEHICLE_USAGES} placeholder="Select usage" />
      </Field>
    </>
  )
  if (type === 'FIRE') return (
    <>
      <div className="md:col-span-2"><Field label="Property address" required><TextInput value={String(form.propertyAddress)} onChange={v => set('propertyAddress', v)} /></Field></div>
      <Field label="Property type" required>
        <Select value={String(form.propertyType)} onChange={v => set('propertyType', v)} options={PROPERTY_TYPES} placeholder="Select property type" />
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
      <Field label="Travel start date" required><DatePicker compact value={String(form.travelStartDate)} onChange={v => set('travelStartDate', v)} placeholder="Select travel start date" /></Field>
      <Field label="Travel end date" required><DatePicker compact value={String(form.travelEndDate)} onChange={v => set('travelEndDate', v)} minDate={String(form.travelStartDate) || undefined} placeholder="Select travel end date" /></Field>
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
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center sm:p-4 md:p-6" onClick={onClose}>
      <form onSubmit={submit} className="bg-white shadow-2xl w-full max-w-3xl h-[100dvh] sm:h-auto sm:max-h-[94dvh] flex flex-col sm:rounded-2xl" onClick={e => e.stopPropagation()}>
        <div className="shrink-0 px-5 py-4 border-b border-tw-border flex items-center justify-between">
          <div><h2 className="font-bold text-tw-text">{initial ? 'Edit' : 'Create'} {kind === 'quotation' ? 'Quotation' : 'Policy'}</h2><p className="text-xs text-tw-text-secondary mt-0.5">Fields change according to the insurance type.</p></div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-tw-hover text-tw-text-secondary text-xl">×</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {error && <div className="mb-4 bg-red-50 border border-red-200 text-tw-danger text-sm px-3 py-2 rounded-lg">{error}</div>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label={kind === 'quotation' ? 'Quotation number' : 'Policy number'}>
              <div className="input text-sm flex items-center bg-gray-50 text-tw-text-secondary">
                {initial ? String(form[kind === 'quotation' ? 'quotationNumber' : 'policyNumber']) : 'Assigned automatically when saved'}
              </div>
            </Field>
            <Field label="Insurance type" required>
              <Select
                value={String(form.insuranceType)}
                onChange={v => set('insuranceType', v)}
                options={INSURANCE_TYPES}
                disabled={!!initial && kind === 'policy' && 'sourceQuotation' in initial && !!initial.sourceQuotation}
              />
            </Field>
            <Field label="Customer name" required><TextInput value={String(form.customerName)} onChange={v => set('customerName', v)} /></Field>
            <Field label="Contact number" required><TextInput value={String(form.contactNumber)} onChange={v => set('contactNumber', v)} type="tel" /></Field>
            <Field label="Introducer"><TextInput value={String(form.introducer)} onChange={v => set('introducer', v)} placeholder="Person who introduced the business" /></Field>
            {kind === 'quotation' && <Field label="Partner"><TextInput value={String(form.partner)} onChange={v => set('partner', v)} placeholder="Partner name" /></Field>}
            {kind === 'policy' && (
              <>
                <Field label="Company policy number" required><TextInput value={String(form.companyPolicyNumber)} onChange={v => set('companyPolicyNumber', v)} placeholder="Policy number issued by Fairfirst" required /></Field>
                <Field label="Sales code" required><TextInput value={String(form.salesCode)} onChange={v => set('salesCode', v)} required /></Field>
                <Field label="Business type" required><Select value={String(form.businessType)} onChange={v => set('businessType', v)} options={BUSINESS_TYPES} /></Field>
                <Field label="GWP — Gross Written Premium (LKR)" required><MoneyInput value={String(form.gwp)} onChange={v => set('gwp', v)} required /></Field>
              </>
            )}
            <SubjectFields form={form} set={set} />
            <Field label="Sum insured (LKR)" required><MoneyInput value={String(form.sumInsured)} onChange={v => set('sumInsured', v)} required /></Field>
            <Field label="Premium (LKR)" required><MoneyInput value={String(form.premium)} onChange={v => set('premium', v)} required /></Field>
            {kind === 'policy' && (
              <>
                <Field label="Issue date" required><DatePicker compact value={String(form.issueDate)} onChange={v => set('issueDate', v)} placeholder="Select issue date" /></Field>
                <Field label="Expiry date" required><DatePicker compact value={String(form.expiryDate)} onChange={v => set('expiryDate', v)} minDate={String(form.issueDate) || undefined} placeholder="Select expiry date" /></Field>
                <div className="md:col-span-2 rounded-xl border border-tw-border bg-gray-50 p-4">
                  <label className="flex items-center gap-2 text-sm font-semibold text-tw-text mb-3"><input type="checkbox" checked={Boolean(form.paid)} onChange={e => set('paid', e.target.checked)} className="w-4 h-4" /> Paid in full</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Payment amount (LKR)"><MoneyInput value={form.paid ? String(premium || '') : String(form.paymentAmount)} onChange={v => set('paymentAmount', v)} /></Field>
                    <div><span className="block text-xs font-semibold text-tw-text-secondary mb-1.5">Remaining amount</span><div className={`input text-sm font-bold flex items-center ${remaining > 0 ? 'text-tw-danger' : 'text-emerald-600'}`}>{money(remaining)}</div></div>
                  </div>
                  <p className="text-xs text-tw-text-secondary mt-3">{form.insuranceType === 'MOTOR' ? 'Motor policies are cancelled automatically if no payment is recorded within 30 days of the issue date.' : 'Only motor policies are cancelled for non-payment — this policy stays active until its expiry date.'}</p>
                </div>
              </>
            )}
            <div className="md:col-span-2"><Field label="Notes"><textarea className="input text-sm min-h-20 resize-y" value={String(form.notes)} onChange={e => set('notes', e.target.value)} placeholder="Optional notes" /></Field></div>
          </div>
        </div>
        <div className="shrink-0 px-5 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] border-t border-tw-border bg-white grid grid-cols-2 sm:flex sm:justify-end gap-2">
          <button type="button" className="btn-secondary w-full sm:w-auto" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn-primary w-full sm:w-auto" disabled={saving}>{saving ? 'Saving…' : initial ? 'Save Changes' : kind === 'quotation' ? 'Create Quotation' : 'Add Policy'}</button>
        </div>
      </form>
    </div>
  )
}

function ConvertModal({ quotation, onClose, onSaved }: { quotation: InsuranceQuotation; onClose: () => void; onSaved: () => Promise<void> }) {
  const today = new Date().toISOString().slice(0, 10)
  const nextYear = new Date(); nextYear.setFullYear(nextYear.getFullYear() + 1)
  const [form, setForm] = useState<FormData>({ premium: String(quotation.premium), gwp: '', companyPolicyNumber: '', salesCode: '', businessType: 'NEW', issueDate: today, expiryDate: nextYear.toISOString().slice(0, 10), paid: false, paymentAmount: '' })
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
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[94dvh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
        <h2 className="font-bold text-tw-text text-lg">Convert to Policy</h2><p className="text-sm text-tw-text-secondary mb-4">Quotation {quotation.quotationNumber} · {quotation.customerName}</p>
        {error && <div className="mb-3 bg-red-50 border border-red-200 text-tw-danger text-sm px-3 py-2 rounded-lg">{error}</div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2"><Field label="Policy number"><div className="input text-sm flex items-center bg-gray-50 text-tw-text-secondary">Assigned automatically when converted</div></Field></div>
          <div className="sm:col-span-2"><Field label="Company policy number" required><TextInput value={String(form.companyPolicyNumber)} onChange={v => setForm(f => ({ ...f, companyPolicyNumber: v }))} placeholder="Policy number issued by Fairfirst" required /></Field></div>
          <Field label="Sales code" required><TextInput value={String(form.salesCode)} onChange={v => setForm(f => ({ ...f, salesCode: v }))} required /></Field>
          <Field label="Business type" required><Select value={String(form.businessType)} onChange={v => setForm(f => ({ ...f, businessType: v }))} options={BUSINESS_TYPES} /></Field>
          <Field label="Premium (LKR)" required><MoneyInput value={String(form.premium)} onChange={v => setForm(f => ({ ...f, premium: v }))} required /></Field>
          <Field label="GWP — Gross Written Premium (LKR)" required><MoneyInput value={String(form.gwp)} onChange={v => setForm(f => ({ ...f, gwp: v }))} required /></Field>
          <Field label="Payment amount (LKR)"><MoneyInput value={form.paid ? String(premium) : String(form.paymentAmount)} onChange={v => setForm(f => ({ ...f, paymentAmount: v }))} /></Field>
          <Field label="Issue date" required><DatePicker compact value={String(form.issueDate)} onChange={v => setForm(f => ({ ...f, issueDate: v }))} placeholder="Select issue date" /></Field>
          <Field label="Expiry date" required><DatePicker compact value={String(form.expiryDate)} onChange={v => setForm(f => ({ ...f, expiryDate: v }))} minDate={String(form.issueDate) || undefined} placeholder="Select expiry date" /></Field>
          <label className="sm:col-span-2 flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm font-semibold"><input type="checkbox" checked={Boolean(form.paid)} onChange={e => setForm(f => ({ ...f, paid: e.target.checked }))} /> Paid in full <span className="ml-auto text-xs text-tw-text-secondary">Balance: {money(Math.max(0, premium - payment))}</span></label>
        </div>
        <div className="flex justify-end gap-2 mt-5"><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={saving}>{saving ? 'Converting…' : 'Convert to Policy'}</button></div>
      </form>
    </div>
  )
}

function RenewModal({ quotation, onClose, onSaved }: { quotation: InsuranceQuotation; onClose: () => void; onSaved: () => Promise<void> }) {
  const [premium, setPremium] = useState(String(quotation.premium)); const [saving, setSaving] = useState(false); const [error, setError] = useState('')
  const submit = async (e: React.FormEvent) => { e.preventDefault(); setSaving(true); setError(''); try { await insuranceApi.renewQuotation(quotation.id, { premium }); await onSaved(); onClose() } catch (err) { setError(err instanceof Error ? err.message : 'Unable to renew quotation') } setSaving(false) }
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 p-4 flex items-center justify-center" onClick={onClose}>
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        <h2 className="font-bold text-tw-text text-lg">Renew Quotation</h2><p className="text-sm text-tw-text-secondary mb-4">A new quotation will be valid for 30 days.</p>
        {error && <div className="mb-3 bg-red-50 border border-red-200 text-tw-danger text-sm px-3 py-2 rounded-lg">{error}</div>}
        <div className="space-y-4"><Field label="New quotation number"><div className="input text-sm flex items-center bg-gray-50 text-tw-text-secondary">Assigned automatically when renewed</div></Field><Field label="Premium (LKR)" required><MoneyInput value={premium} onChange={setPremium} required /></Field></div>
        <div className="flex justify-end gap-2 mt-5"><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={saving}>{saving ? 'Renewing…' : 'Create Renewal'}</button></div>
      </form>
    </div>
  )
}

function ReactivatePolicyModal({ policy, onClose, onSaved }: { policy: InsurancePolicy; onClose: () => void; onSaved: () => Promise<void> }) {
  const today = new Date().toISOString().slice(0, 10)
  const nextYear = new Date(); nextYear.setFullYear(nextYear.getFullYear() + 1)
  const [form, setForm] = useState<FormData>({
    premium: String(policy.premium), gwp: policy.gwp > 0 ? String(policy.gwp) : '',
    companyPolicyNumber: policy.companyPolicyNumber || '',
    salesCode: policy.salesCode || '', businessType: policy.businessType || 'RENEWAL',
    issueDate: today, expiryDate: nextYear.toISOString().slice(0, 10), paymentAmount: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError('')
    try { await insuranceApi.reactivatePolicy(policy.id, form); await onSaved(); onClose() }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to reactivate policy') }
    setSaving(false)
  }
  const set = (key: string, value: string) => setForm(current => ({ ...current, [key]: value }))
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 p-3 sm:p-4 flex items-center justify-center" onClick={onClose}>
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[94dvh] overflow-y-auto p-5" onClick={event => event.stopPropagation()}>
        <h2 className="font-bold text-tw-text text-lg">Reactivate Policy</h2>
        <p className="text-sm text-tw-text-secondary mb-4">{policy.policyNumber} · {policy.customerName}</p>
        {error && <div className="mb-3 bg-red-50 border border-red-200 text-tw-danger text-sm px-3 py-2 rounded-lg">{error}</div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2"><Field label="Company policy number" required><TextInput value={String(form.companyPolicyNumber)} onChange={value => set('companyPolicyNumber', value)} placeholder="Policy number issued by Fairfirst" required /></Field></div>
          <Field label="Sales code" required><TextInput value={String(form.salesCode)} onChange={value => set('salesCode', value)} required /></Field>
          <Field label="Business type" required><Select value={String(form.businessType)} onChange={value => set('businessType', value)} options={BUSINESS_TYPES} /></Field>
          <Field label="New premium (LKR)" required><MoneyInput value={String(form.premium)} onChange={value => set('premium', value)} required /></Field>
          <Field label="New GWP (LKR)" required><MoneyInput value={String(form.gwp)} onChange={value => set('gwp', value)} required /></Field>
          <Field label="New issue date" required><DatePicker compact value={String(form.issueDate)} onChange={value => set('issueDate', value)} placeholder="Select issue date" /></Field>
          <Field label="New expiry date" required><DatePicker compact value={String(form.expiryDate)} onChange={value => set('expiryDate', value)} minDate={String(form.issueDate)} placeholder="Select expiry date" /></Field>
          <div className="sm:col-span-2"><Field label="Payment received to reactivate (LKR)" required><MoneyInput value={String(form.paymentAmount)} onChange={value => set('paymentAmount', value)} required /></Field></div>
        </div>
        <div className="grid grid-cols-2 sm:flex sm:justify-end gap-2 mt-5"><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={saving}>{saving ? 'Reactivating…' : 'Reactivate Policy'}</button></div>
      </form>
    </div>
  )
}

const badgeClass: Record<string, string> = { ACTIVE: 'badge-success', CONVERTED: 'badge-primary', EXPIRED: 'badge-danger', CANCELLED: 'badge-danger', RENEWED: 'badge-warning' }

function subjectPairs(record: InsuranceQuotation | InsurancePolicy): Array<[string, string]> {
  if (record.insuranceType === 'MOTOR') return [['Vehicle number', record.vehicleNumber || '—'], ['Make and model', record.vehicleMakeModel || '—'], ['Fuel type', record.fuelType || '—'], ['Usage', record.vehicleUsage || '—']]
  if (record.insuranceType === 'FIRE') return [['Property address', record.propertyAddress || '—'], ['Property type', record.propertyType || '—'], ['Property usage', record.propertyUsage || '—']]
  if (record.insuranceType === 'CASUALTY') return [['Business / occupation', record.businessActivity || '—'], ['Risk / coverage', record.riskDescription || '—']]
  if (record.insuranceType === 'MARINE') return [['Cargo / subject', record.cargoDescription || '—'], ['Transit from', record.transitFrom || '—'], ['Transit to', record.transitTo || '—'], ['Conveyance', record.conveyance || '—']]
  return [['Passport number', record.passportNumber || '—'], ['Destination', record.destination || '—'], ['Travel start', displayDate(record.travelStartDate)], ['Travel end', displayDate(record.travelEndDate)]]
}

function DetailModal({ record, kind, onClose, onEdit, onConvert, onRenew, onReactivate }: {
  record: InsuranceQuotation | InsurancePolicy; kind: 'quotation' | 'policy'; onClose: () => void; onEdit: () => void; onConvert?: () => void; onRenew?: () => void; onReactivate?: () => void
}) {
  const quote = kind === 'quotation' ? record as InsuranceQuotation : null
  const policy = kind === 'policy' ? record as InsurancePolicy : null
  const pairs: Array<[string, React.ReactNode]> = [
    [kind === 'quotation' ? 'Quotation number' : 'Policy number', kind === 'quotation' ? quote!.quotationNumber : policy!.policyNumber],
    ['Insurance type', typeLabel(record.insuranceType)], ['Customer', record.customerName], ['Contact number', record.contactNumber],
    ['Introducer', record.introducer || '—'], ...(quote ? [['Partner', quote.partner || '—']] as Array<[string, string]> : []),
    ...subjectPairs(record), ['Sum insured', money(record.sumInsured)], ['Premium', money(record.premium)],
    ...(quote ? [['Issue date', displayDate(quote.issueDate)], ['Valid until', displayDate(quote.expiresAt)]] as Array<[string, string]> : []),
    ...(policy ? [['Company policy number', policy.companyPolicyNumber || '—'], ['Sales code', policy.salesCode || '—'], ['Business type', policy.businessType || '—'], ['GWP', money(policy.gwp)], ['Issue date', displayDate(policy.issueDate)], ['Expiry date', displayDate(policy.expiryDate)], ['Payment received', money(policy.paymentAmount)], ['Remaining amount', money(policy.remainingAmount)]] as Array<[string, string]> : []),
    ['Created by', record.createdByName], ['Notes', record.notes || '—'],
  ]
  return (
    <div className="fixed inset-0 z-50 bg-black/40 p-3 md:p-6 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-tw-border flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h2 className="font-bold text-tw-text text-lg">{kind === 'quotation' ? quote!.quotationNumber : policy!.policyNumber}</h2><span className={`badge ${badgeClass[record.status] || 'badge-gray'}`}>{record.status.replace('_', ' ')}</span></div><p className="text-sm text-tw-text-secondary mt-0.5">{record.customerName}</p></div><button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-tw-hover text-tw-text-secondary text-xl">×</button></div>
        <div className="flex-1 overflow-y-auto p-5"><div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">{pairs.map(([label, value]) => <div key={label} className={label === 'Notes' || label.includes('Risk') || label.includes('Cargo') || label.includes('Property address') ? 'sm:col-span-2' : ''}><div className="text-xs font-semibold text-tw-text-secondary mb-1">{label}</div><div className={`text-sm font-medium break-words ${label === 'Remaining amount' && policy && policy.remainingAmount > 0 ? 'text-tw-danger' : 'text-tw-text'}`}>{value}</div></div>)}</div></div>
        <div className="px-5 py-4 border-t border-tw-border flex flex-wrap justify-end gap-2">
          {quote?.status === 'ACTIVE' && <button className="btn-secondary" onClick={onEdit}>Edit</button>}
          {policy?.status === 'ACTIVE' && <button className="btn-secondary" onClick={onEdit}>Edit Policy / Payment</button>}
          {policy && ['CANCELLED', 'EXPIRED'].includes(policy.status) && onReactivate && <button className="btn-primary" onClick={onReactivate}>Reactivate Policy</button>}
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
  const [reactivate, setReactivate] = useState<InsurancePolicy | null>(null)

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
  useEffect(() => {
    const refresh = () => { load() }
    window.addEventListener('taskwise:insurance-updated', refresh)
    return () => window.removeEventListener('taskwise:insurance-updated', refresh)
  }, [])
  useEffect(() => { setStatus(''); setSelected(null) }, [tab])

  const records = useMemo(() => {
    const source = tab === 'quotations' ? quotations : policies
    const q = search.trim().toLowerCase()
    return source.filter(record => {
      const haystack = Object.values(record).filter(value => typeof value === 'string' || typeof value === 'number').join(' ').toLowerCase()
      const statusMatch = !status || record.status === status
      return (!q || haystack.includes(q)) && (!type || record.insuranceType === type) && statusMatch
    })
  }, [tab, quotations, policies, search, type, status])

  const cards = summary ? (tab === 'quotations' ? [
    { status: 'ACTIVE', label: 'Active', value: money(summary.quotationTotals.ACTIVE.value), sub: `${summary.quotationTotals.ACTIVE.count} quotations`, color: 'text-emerald-600', icon: '📝' },
    { status: 'EXPIRED', label: 'Expired', value: money(summary.quotationTotals.EXPIRED.value), sub: `${summary.quotationTotals.EXPIRED.count} quotations`, color: 'text-tw-danger', icon: '⌛' },
    { status: 'RENEWED', label: 'Renewed', value: money(summary.quotationTotals.RENEWED.value), sub: `${summary.quotationTotals.RENEWED.count} quotations`, color: 'text-amber-600', icon: '🔄' },
  ] : [
    { status: 'ACTIVE', label: 'Active', value: money(summary.policyTotals.ACTIVE.value), sub: `${summary.policyTotals.ACTIVE.count} policies · GWP`, color: 'text-emerald-600', icon: '🛡️' },
    { status: 'CANCELLED', label: 'Cancelled', value: money(summary.policyTotals.CANCELLED.value), sub: `${summary.policyTotals.CANCELLED.count} unpaid motor policies · GWP`, color: 'text-tw-danger', icon: '⛔' },
    { status: 'EXPIRED', label: 'Expired', value: money(summary.policyTotals.EXPIRED.value), sub: `${summary.policyTotals.EXPIRED.count} policies · GWP`, color: 'text-amber-600', icon: '⌛' },
    { status: '', label: 'Final', value: money(summary.finalPolicyGwp), sub: 'Active GWP − cancelled and expired GWP', color: summary.finalPolicyGwp < 0 ? 'text-tw-danger' : 'text-indigo-600', icon: '📊' },
  ]) : []

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div><h1 className="text-xl md:text-2xl font-bold text-tw-text">Insurance Management</h1><p className="text-sm text-tw-text-secondary mt-0.5">Fairfirst quotations, policies and customer payments.</p></div>
        <div className="flex gap-2"><button className="btn-secondary flex-1 sm:flex-none" onClick={() => { setEditing(null); setFormKind('policy') }}>+ Add Policy</button><button className="btn-primary flex-1 sm:flex-none" onClick={() => { setEditing(null); setFormKind('quotation') }}>+ Create Quotation</button></div>
      </div>
      {error && <div className="bg-red-50 border border-red-200 text-tw-danger text-sm px-4 py-3 rounded-xl">{error}</div>}
      <div className={`grid grid-cols-2 ${tab === 'quotations' ? 'xl:grid-cols-3' : 'xl:grid-cols-4'} gap-3`}>{cards.map(card => <button type="button" key={card.label} onClick={() => setStatus(card.status)} className={`card p-4 text-left transition-all hover:border-tw-primary ${status === card.status ? 'ring-2 ring-tw-primary border-tw-primary' : ''}`}><div className="flex items-center gap-2 text-xs text-tw-text-secondary mb-1"><span>{card.icon}</span>{card.label}</div><div className={`text-lg md:text-xl font-bold truncate ${card.color}`}>{card.value}</div><div className="text-xs text-tw-text-secondary mt-1 truncate">{card.sub}</div></button>)}</div>
      <div className="card overflow-hidden">
        <div className="p-3 md:p-4 border-b border-tw-border space-y-3">
          <div className="inline-flex rounded-xl border border-tw-border bg-gray-50 p-1 w-full sm:w-auto">
            <button onClick={() => setTab('quotations')} className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-semibold ${tab === 'quotations' ? 'bg-white text-tw-primary shadow-sm' : 'text-tw-text-secondary'}`}>Quotations ({quotations.length})</button>
            <button onClick={() => setTab('policies')} className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-semibold ${tab === 'policies' ? 'bg-white text-tw-primary shadow-sm' : 'text-tw-text-secondary'}`}>Policies ({policies.length})</button>
          </div>
          <div className="flex flex-col md:flex-row gap-2">
            <input className="input text-sm flex-1" value={search} onChange={e => setSearch(e.target.value)} placeholder={`Search ${tab} by number, customer, introducer${tab === 'quotations' ? ', partner' : ', company policy number, sales code'} or insured details…`} />
            <Select
              className="md:w-[190px]"
              value={type}
              onChange={setType}
              options={[{ value: '', label: 'All insurance types' }, ...INSURANCE_TYPES]}
            />
            <Select
              className="md:w-[190px]"
              value={status}
              onChange={setStatus}
              options={tab === 'quotations' ? QUOTATION_STATUSES : POLICY_STATUSES}
            />
          </div>
        </div>
        {loading ? <div className="py-12 text-center text-sm text-tw-text-secondary">Loading insurance records…</div> : records.length === 0 ? <div className="py-12 text-center"><div className="text-3xl mb-2">🔎</div><div className="font-semibold text-tw-text">No records found</div><div className="text-sm text-tw-text-secondary mt-1">Try changing the search or filters.</div></div> : (
          <>
            <div className="md:hidden divide-y divide-tw-border">{records.map(record => { const isQuote = 'quotationNumber' in record; const policy = !isQuote ? record as InsurancePolicy : null; return <button key={record.id} onClick={() => setSelected(record)} className="w-full text-left p-4 active:bg-tw-hover"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="font-semibold text-tw-text truncate">{isQuote ? record.quotationNumber : policy!.policyNumber}</div>{policy?.companyPolicyNumber && <div className="text-xs text-tw-text-secondary truncate">Company No. {policy.companyPolicyNumber}</div>}<div className="text-sm text-tw-text-secondary truncate">{record.customerName} · {record.contactNumber}</div></div><span className={`badge ${badgeClass[record.status] || 'badge-gray'}`}>{record.status}</span></div><div className="flex items-center justify-between mt-3 text-xs text-tw-text-secondary"><span>{typeLabel(record.insuranceType)}</span><span className="font-semibold text-tw-text">{isQuote ? money(record.premium) : `GWP ${money(policy!.gwp)}`}</span></div>{policy && <div className={`text-xs mt-1 text-right ${policy.remainingAmount > 0 ? 'text-tw-danger' : 'text-emerald-600'}`}>Premium {money(policy.premium)} · Balance {money(policy.remainingAmount)}</div>}</button> })}</div>
            <div className="hidden md:block overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-[#f0f4ff] border-b border-tw-border"><th className="px-4 py-3 text-left text-xs font-bold text-tw-primary uppercase">{tab === 'quotations' ? 'Quotation' : 'Policy'}</th><th className="px-4 py-3 text-left text-xs font-bold text-tw-primary uppercase">Customer</th><th className="px-4 py-3 text-left text-xs font-bold text-tw-primary uppercase">Type</th><th className="px-4 py-3 text-right text-xs font-bold text-tw-primary uppercase">{tab === 'quotations' ? 'Premium' : 'GWP / Premium'}</th><th className="px-4 py-3 text-left text-xs font-bold text-tw-primary uppercase">{tab === 'quotations' ? 'Valid until' : 'Expiry'}</th><th className="px-4 py-3 text-center text-xs font-bold text-tw-primary uppercase">Status</th></tr></thead><tbody className="divide-y divide-tw-border">{records.map(record => { const isQuote = 'quotationNumber' in record; const policy = !isQuote ? record as InsurancePolicy : null; return <tr key={record.id} onClick={() => setSelected(record)} className="hover:bg-tw-hover cursor-pointer"><td className="px-4 py-3 font-semibold text-tw-text">{isQuote ? record.quotationNumber : policy!.policyNumber}{policy?.companyPolicyNumber && <div className="text-xs font-normal text-tw-text-secondary">Company No. {policy.companyPolicyNumber}</div>}</td><td className="px-4 py-3"><div className="font-medium text-tw-text">{record.customerName}</div><div className="text-xs text-tw-text-secondary">{record.contactNumber}</div></td><td className="px-4 py-3 text-tw-text-secondary">{typeLabel(record.insuranceType)}</td><td className="px-4 py-3 text-right font-semibold">{isQuote ? money(record.premium) : <><div>{money(policy!.gwp)}</div><div className="text-xs text-tw-text-secondary">Premium {money(policy!.premium)}</div>{policy!.remainingAmount > 0 && <div className="text-xs text-tw-danger">{money(policy!.remainingAmount)} due</div>}</>}</td><td className="px-4 py-3 text-tw-text-secondary">{displayDate(isQuote ? record.expiresAt : policy!.expiryDate)}</td><td className="px-4 py-3 text-center"><span className={`badge ${badgeClass[record.status] || 'badge-gray'}`}>{record.status}</span></td></tr> })}</tbody></table></div>
          </>
        )}
      </div>
      {formKind && <RecordFormModal kind={formKind} initial={editing} onClose={() => { setFormKind(null); setEditing(null) }} onSaved={load} />}
      {selected && <DetailModal record={selected} kind={'quotationNumber' in selected ? 'quotation' : 'policy'} onClose={() => setSelected(null)} onEdit={() => { setEditing(selected); setFormKind('quotationNumber' in selected ? 'quotation' : 'policy'); setSelected(null) }} onConvert={'quotationNumber' in selected ? () => { setConvert(selected); setSelected(null) } : undefined} onRenew={'quotationNumber' in selected ? () => { setRenew(selected); setSelected(null) } : undefined} onReactivate={'policyNumber' in selected ? () => { setReactivate(selected); setSelected(null) } : undefined} />}
      {convert && <ConvertModal quotation={convert} onClose={() => setConvert(null)} onSaved={load} />}
      {renew && <RenewModal quotation={renew} onClose={() => setRenew(null)} onSaved={load} />}
      {reactivate && <ReactivatePolicyModal policy={reactivate} onClose={() => setReactivate(null)} onSaved={load} />}
    </div>
  )
}
