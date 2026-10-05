import React, { useEffect, useState } from 'react'
import { type CountryCode } from 'libphonenumber-js/max'
import { authApi, type ManagedRoleContact, type RoleHolder } from '../services/apiService'
import PhoneField, { mobileNumber } from './phone/PhoneField'
import { useConfirm } from './ConfirmDialog'

// What the form edits: the role's main number, one of its extra holders, or a new holder.
type Editing = { role: ManagedRoleContact; holder?: RoleHolder; adding?: boolean }

const roleKey = (role: { actorType: string; actorId: string }) => `${role.actorType}:${role.actorId}`

/**
 * Phone assignments for fixed roles. With `only`, it manages one role (opened from
 * that role's card); with `exclude`, it lists just the roles that have no card.
 */
export default function RoleAssignments({ onSaved, onClose, refreshKey = 0, only, exclude }: {
  onSaved?: () => void; onClose?: () => void; refreshKey?: number; only?: string; exclude?: Set<string>
}) {
  const [allRoles, setRoles] = useState<ManagedRoleContact[]>([])
  const roles = allRoles.filter(role => (only ? roleKey(role) === only : !exclude?.has(roleKey(role))))
  const [selected, setSelected] = useState<Editing | null>(null)
  const [holderName, setHolderName] = useState('')
  const [country, setCountry] = useState<CountryCode>('LK')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const [busy, setBusy] = useState(false)
  const { confirm, dialog } = useConfirm()
  const load = () => authApi.managedRoleContacts().then(setRoles).catch(e => setError(e.message))
  useEffect(() => { void load() }, [refreshKey])
  // A role without extra holders has nothing to choose: go straight to its number.
  const single = only ? roles[0] : undefined
  useEffect(() => { if (single && !single.holders && !selected) edit({ role: single }) }, [single?.actorId]) // eslint-disable-line react-hooks/exhaustive-deps
  const edit = (editing: Editing) => {
    const contact = editing.holder ? editing.holder.contact : editing.adding ? null : editing.role.contact
    setSelected(editing); setHolderName(editing.holder?.holderName || '')
    setCountry((contact?.country || 'LK') as CountryCode)
    setPhone(contact?.phoneE164 || ''); setEmail(contact?.email || ''); setSaved(''); setError('')
  }
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (!selected) return
    setBusy(true); setError('')
    const { role, holder, adding } = selected
    const contact = { country, phone: mobileNumber(phone, country), email }
    try {
      if (adding) await authApi.addRoleHolder(role.actorType, role.actorId, { ...contact, holderName })
      else await authApi.assignRoleContact(role.actorType, role.actorId, holder ? { ...contact, holderKey: holder.holderKey, holderName } : contact)
      setSelected(null)
      if (only && !role.holders) { await load(); onSaved?.(); onClose?.(); return }
      setSaved(adding ? 'Holder added. They can open the role after verifying their account.' : 'Role assignment saved. The new person can open it after verifying their account.')
      await load(); onSaved?.()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save this assignment.') }
    finally { setBusy(false) }
  }
  const remove = async (role: ManagedRoleContact, holder: RoleHolder) => {
    if (!(await confirm({ title: 'Remove {name}?', message: 'They lose access to this role immediately. Tasks and history stay with the role.',
      confirmLabel: 'Remove', tone: 'danger', vars: { name: holder.holderName } }))) return
    setError(''); setSaved('')
    try { await authApi.removeRoleHolder(role.actorType, role.actorId, holder.holderKey); setSaved('Holder removed.'); await load(); onSaved?.() }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not remove this holder.') }
  }
  const status = (c: { syswiseUserId: number | null } | null) => c?.syswiseUserId ? 'Account connected' : 'Awaiting account verification'
  if (!roles.length && !error) return null
  const named = !!selected && (selected.adding || !!selected.holder)
  const cancel = () => { if (only && !single?.holders) onClose?.(); else setSelected(null) }
  return <section className={only ? '' : 'card p-5 mt-5'}>
    {!only && <h2 className="text-lg font-semibold mb-2">Other role assignments</h2>}
    <p className="text-sm text-tw-text-secondary mb-4">Changing a role’s number transfers access and ends the previous person’s sessions. Tasks and history stay with the role.</p>
    {error && <p role="alert" className="text-sm text-red-700 mb-3">{error}</p>}
    {saved && <p role="status" className="text-sm text-green-700 mb-3">{saved}</p>}
    {selected ? <form onSubmit={submit} className="space-y-3">
      <h3 className="font-semibold">{selected.adding ? `Add a holder to ${selected.role.roleName}` : selected.holder ? `${selected.holder.holderName} (${selected.role.roleName})` : selected.role.roleName}</h3>
      {named && <>
        <label className="block text-sm">Holder name<input className="input mt-1 w-full" required minLength={2} maxLength={100} placeholder="e.g. Chairman Secretary" value={holderName} onChange={e => setHolderName(e.target.value)} /></label>
        <p className="text-xs text-tw-text-secondary">This person gets the same access as {selected.role.roleName} and signs in with their own number. The audit log records their name on everything they do.</p>
      </>}
      <PhoneField country={country} number={phone} onCountry={setCountry} onNumber={setPhone} />
      {country !== 'LK' && <label className="block text-sm">Email address<input className="input mt-1 w-full" type="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>}
      <div className="flex gap-3"><button type="submit" disabled={busy} className="btn-primary">{busy ? 'Saving…' : selected.adding ? 'Add holder' : 'Save assignment'}</button><button type="button" disabled={busy} onClick={cancel} className="btn-secondary">Cancel</button></div>
    </form> : <div className={`space-y-2 ${only ? '' : 'max-h-96 overflow-y-auto'}`}>{roles.map(role => <div key={role.actorType + role.actorId} className="space-y-2">
      <button onClick={() => edit({ role })} className="w-full border border-tw-border rounded-xl p-3 flex justify-between gap-3 text-left">
        <span><span className="block font-semibold text-sm">{role.roleName}</span><span className="text-xs text-tw-text-secondary">{role.holders?.length ? 'Main holder' : role.name}</span></span>
        <span className="text-sm">{role.contact?.phoneE164 || 'Assign number'}<span className="block text-xs text-tw-text-secondary">{status(role.contact)}</span></span>
      </button>
      {role.holders?.map(holder => <div key={holder.holderKey} className="ml-4 border border-tw-border rounded-xl p-3 flex justify-between gap-3 items-start">
        <button onClick={() => edit({ role, holder })} className="flex-1 flex justify-between gap-3 text-left">
          <span><span className="block font-semibold text-sm">{holder.holderName}</span><span className="text-xs text-tw-text-secondary">Same access as {role.roleName}</span></span>
          <span className="text-sm">{holder.contact.phoneE164}<span className="block text-xs text-tw-text-secondary">{status(holder.contact)}</span></span>
        </button>
        <button onClick={() => void remove(role, holder)} className="text-xs text-tw-danger">Remove</button>
      </div>)}
      {role.holders && <button onClick={() => edit({ role, adding: true })} className="ml-4 text-sm text-tw-primary">+ Add another holder to {role.roleName}</button>}
    </div>)}</div>}
    {dialog}
  </section>
}
