import React, { useEffect, useState } from 'react'
import { type CountryCode } from 'libphonenumber-js/max'
import { authApi, type ManagedRoleContact } from '../services/apiService'
import PhoneField, { mobileNumber } from './phone/PhoneField'

export default function RoleAssignments({ onSaved, refreshKey = 0 }: { onSaved?: () => void; refreshKey?: number }) {
  const [roles, setRoles] = useState<ManagedRoleContact[]>([])
  const [selected, setSelected] = useState<ManagedRoleContact | null>(null)
  const [country, setCountry] = useState<CountryCode>('LK')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const [busy, setBusy] = useState(false)
  const load = () => authApi.managedRoleContacts().then(setRoles).catch(e => setError(e.message))
  useEffect(() => { void load() }, [refreshKey])
  const edit = (role: ManagedRoleContact) => {
    setSelected(role); setCountry((role.contact?.country || 'LK') as CountryCode)
    setPhone(role.contact?.phoneE164 || ''); setEmail(role.contact?.email || ''); setSaved(''); setError('')
  }
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (!selected) return
    setBusy(true); setError('')
    try {
      await authApi.assignRoleContact(selected.actorType, selected.actorId, { country, phone: mobileNumber(phone, country), email })
      setSelected(null); setSaved('Role assignment saved. The new person can open it after verifying their account.'); await load()
      onSaved?.()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save this assignment.') }
    finally { setBusy(false) }
  }
  if (!roles.length && !error) return null
  return <section className="card p-5 mt-5">
    <h2 className="text-lg font-semibold mb-2">Role assignments</h2>
    <p className="text-sm text-tw-text-secondary mb-4">Assign a mobile number to a role. Changing its number transfers access and ends the previous person’s sessions. Tasks and history stay with the role.</p>
    {error && <p role="alert" className="text-sm text-red-700 mb-3">{error}</p>}
    {saved && <p role="status" className="text-sm text-green-700 mb-3">{saved}</p>}
    {selected ? <form onSubmit={submit} className="space-y-3">
      <h3 className="font-semibold">{selected.roleName}</h3>
      <PhoneField country={country} number={phone} onCountry={setCountry} onNumber={setPhone} />
      {country !== 'LK' && <label className="block text-sm">Email address<input className="input mt-1 w-full" type="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>}
      <div className="flex gap-3"><button type="submit" disabled={busy} className="btn-primary">{busy ? 'Saving…' : 'Save assignment'}</button><button type="button" disabled={busy} onClick={() => setSelected(null)} className="btn-secondary">Cancel</button></div>
    </form> : <div className="space-y-2 max-h-96 overflow-y-auto">{roles.map(role => <button key={role.actorType + role.actorId} onClick={() => edit(role)} className="w-full border border-tw-border rounded-xl p-3 flex justify-between gap-3 text-left">
      <span><span className="block font-semibold text-sm">{role.roleName}</span><span className="text-xs text-tw-text-secondary">{role.name}</span></span>
      <span className="text-sm">{role.contact?.phoneE164 || 'Assign number'}<span className="block text-xs text-tw-text-secondary">{role.contact?.syswiseUserId ? 'Account connected' : 'Awaiting account verification'}</span></span>
    </button>)}</div>}
  </section>
}
