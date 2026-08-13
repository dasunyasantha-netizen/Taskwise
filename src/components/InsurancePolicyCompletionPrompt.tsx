import React, { useEffect, useState } from 'react'
import { insuranceApi } from '../services/apiService'
import type { IncompleteInsurancePolicy } from '../types'
import Select from './Select'

const BUSINESS_TYPES = [
  { value: 'NEW', label: 'New' },
  { value: 'RENEWAL', label: 'Renewal' },
]

function normalizeAmount(value: string): string {
  const cleaned = value.replace(/,/g, '').replace(/[^\d.]/g, '')
  const dot = cleaned.indexOf('.')
  if (dot === -1) return cleaned.replace(/^0+(?=\d)/, '')
  const whole = cleaned.slice(0, dot).replace(/^0+(?=\d)/, '') || '0'
  return `${whole}.${cleaned.slice(dot + 1).replace(/\./g, '').slice(0, 2)}`
}

function formatAmount(value: string): string {
  if (!value) return ''
  const [whole, decimals] = value.split('.')
  const grouped = (whole || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return value.includes('.') ? `${grouped}.${decimals ?? ''}` : grouped
}

export default function InsurancePolicyCompletionPrompt() {
  const [policies, setPolicies] = useState<IncompleteInsurancePolicy[]>([])
  const [checked, setChecked] = useState(false)
  const [companyPolicyNumber, setCompanyPolicyNumber] = useState('')
  const [salesCode, setSalesCode] = useState('')
  const [businessType, setBusinessType] = useState('NEW')
  const [gwp, setGwp] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    insuranceApi.incompletePolicies()
      .then(result => setPolicies(result as IncompleteInsurancePolicy[]))
      .catch(() => {})
      .finally(() => setChecked(true))
  }, [])

  const current = policies[0]
  useEffect(() => {
    setCompanyPolicyNumber(current?.companyPolicyNumber || '')
    setSalesCode(current?.salesCode || '')
    setBusinessType(current?.businessType || 'NEW')
    setGwp(current?.gwp && current.gwp > 0 ? String(current.gwp) : '')
    setError('')
  }, [current?.id])

  if (!checked || !current) return null

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError('')
    try {
      await insuranceApi.completePolicyBusinessDetails(current.id, { companyPolicyNumber, salesCode, businessType, gwp })
      setPolicies(existing => existing.slice(1))
      window.dispatchEvent(new CustomEvent('taskwise:insurance-updated'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update policy')
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-[10000] bg-slate-950/70 backdrop-blur-sm p-3 sm:p-6 flex items-center justify-center">
      <form onSubmit={submit} className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="px-5 sm:px-6 py-5 border-b border-tw-border">
          <div className="w-11 h-11 rounded-xl bg-blue-100 text-xl flex items-center justify-center mb-3">🛡️</div>
          <h2 className="text-xl font-bold text-tw-text">Complete Policy Information</h2>
          <p className="text-sm text-tw-text-secondary mt-1">Fairfirst now requires Company Policy Number, Sales Code, Business Type, and GWP for every policy.</p>
        </div>
        <div className="px-5 sm:px-6 py-5 space-y-4">
          <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3">
            <div className="font-bold text-tw-text">{current.policyNumber}</div>
            <div className="text-sm text-tw-text-secondary mt-0.5">{current.customerName} · {current.status}</div>
            <div className="text-xs text-blue-700 mt-2">{policies.length} incomplete {policies.length === 1 ? 'policy' : 'policies'} remaining</div>
          </div>
          {error && <div className="rounded-lg bg-red-50 border border-red-200 text-tw-danger text-sm px-3 py-2">{error}</div>}
          <label className="block"><span className="block text-xs font-semibold text-tw-text-secondary mb-1.5">Company policy number <span className="text-tw-danger">*</span></span><input className="input text-sm" value={companyPolicyNumber} onChange={event => setCompanyPolicyNumber(event.target.value)} placeholder="Policy number issued by Fairfirst" required autoFocus /></label>
          <label className="block"><span className="block text-xs font-semibold text-tw-text-secondary mb-1.5">Sales code <span className="text-tw-danger">*</span></span><input className="input text-sm" value={salesCode} onChange={event => setSalesCode(event.target.value)} required /></label>
          <label className="block"><span className="block text-xs font-semibold text-tw-text-secondary mb-1.5">Business type <span className="text-tw-danger">*</span></span><Select value={businessType} onChange={setBusinessType} options={BUSINESS_TYPES} /></label>
          <label className="block"><span className="block text-xs font-semibold text-tw-text-secondary mb-1.5">GWP — Gross Written Premium (LKR) <span className="text-tw-danger">*</span></span><input className="input text-sm" type="text" inputMode="decimal" value={formatAmount(gwp)} onChange={event => setGwp(normalizeAmount(event.target.value))} placeholder="0.00" required /></label>
        </div>
        <div className="px-5 sm:px-6 py-4 border-t border-tw-border bg-gray-50">
          <button className="btn-primary w-full" disabled={saving}>{saving ? 'Saving…' : policies.length === 1 ? 'Save and Continue' : 'Save and Open Next Policy'}</button>
          <p className="text-xs text-center text-tw-text-secondary mt-2">These mandatory records must be completed before continuing to TaskWise.</p>
        </div>
      </form>
    </div>
  )
}
