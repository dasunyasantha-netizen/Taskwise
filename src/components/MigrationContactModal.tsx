import { useMemo, useState } from 'react'
import {
  getCountries, getCountryCallingCode, parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js/max'
import { authApi } from '../services/apiService'

type Props = {
  currentPhone?: string
  onSaved: () => void
}

const countryNames = new Intl.DisplayNames(['en'], { type: 'region' })
const countries = getCountries().map(code => ({
  code,
  label: countryNames.of(code) || code,
  callingCode: getCountryCallingCode(code),
})).sort((a, b) => a.label.localeCompare(b.label))

export default function MigrationContactModal({ currentPhone, onSaved }: Props) {
  const initial = currentPhone ? parsePhoneNumberFromString(currentPhone) : undefined
  const [country, setCountry] = useState<CountryCode>(initial?.country || 'LK')
  const [phone, setPhone] = useState(initial?.nationalNumber || '')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const selected = useMemo(() => countries.find(item => item.code === country), [country])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    const parsed = parsePhoneNumberFromString(phone, country)
    if (!parsed?.isValid() || parsed.country !== country ||
        !['MOBILE', 'FIXED_LINE_OR_MOBILE'].includes(parsed.getType() || '') ||
        (country === 'LK' && parsed.getType() !== 'MOBILE')) {
      setError('Enter a valid mobile number for the selected country.')
      return
    }
    if (country !== 'LK' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter an email address so we can connect your account.')
      return
    }
    setSaving(true)
    try {
      await authApi.saveMigrationContact({
        country, phone: parsed.number, email: country === 'LK' ? undefined : email.trim(),
      })
      onSaved()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save your number. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[10050] flex items-end justify-center p-3 sm:items-center sm:p-6 bg-[#0b1220]/50 backdrop-blur-[3px] animate-fade-in" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="migration-contact-title"
        className="w-full max-w-md rounded-[28px] bg-tw-surface border border-tw-border p-6 shadow-panel sm:p-8 animate-pop-in">
        <div className="mb-5 icon-tile tile-blue h-14 w-14 rounded-2xl" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-7 w-7">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.6 3.6h2.5l1.2 4.2-1.8 1.6a16 16 0 0 0 6.1 6.1l1.6-1.8 4.2 1.2v2.5a2 2 0 0 1-2.2 2 17.8 17.8 0 0 1-15.6-15.6 2 2 0 0 1 2-2.2Z" />
          </svg>
        </div>
        <h2 id="migration-contact-title" className="text-2xl font-bold tracking-tight text-slate-900">Enter your mobile number</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Please enter your mobile number for our upcoming system migration. This will help us keep your account connected. We’ll let you know when the update is ready.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-sm font-semibold text-slate-800" htmlFor="migration-country">Country</label>
          <select id="migration-country" value={country} onChange={event => setCountry(event.target.value as CountryCode)}
            className="input">
            {countries.map(item => <option key={item.code} value={item.code}>{item.label} (+{item.callingCode})</option>)}
          </select>
          <label className="block text-sm font-semibold text-slate-800" htmlFor="migration-phone">Mobile number</label>
          <div className="flex overflow-hidden rounded-xl border border-tw-border bg-tw-surface focus-within:border-tw-primary/60 focus-within:ring-4 focus-within:ring-tw-primary/15">
            <span className="flex items-center border-r border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-600">+{selected?.callingCode}</span>
            <input id="migration-phone" type="tel" inputMode="tel" autoComplete="tel-national" required
              value={phone} onChange={event => setPhone(event.target.value)} placeholder="Mobile number"
              className="min-w-0 flex-1 px-4 py-3 text-sm text-tw-text bg-transparent outline-none" />
          </div>
          {country !== 'LK' && <>
            <label className="block text-sm font-semibold text-slate-800" htmlFor="migration-email">Email address</label>
            <input id="migration-email" type="email" autoComplete="email" required value={email}
              onChange={event => setEmail(event.target.value)} placeholder="you@example.com"
              className="input" />
          </>}
          {error && <p role="alert" className="alert-error">{error}</p>}
          <button type="submit" disabled={saving}
            className="btn-primary w-full py-3.5">
            {saving ? 'Saving…' : 'Save number'}
          </button>
          <p className="text-center text-xs leading-5 text-slate-500">Your current Taskwise login will continue to work.</p>
        </form>
      </section>
    </div>
  )
}
