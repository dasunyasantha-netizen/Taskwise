import { useEffect, useState } from 'react'
import type { AuthUser, Department } from '../types'
import { workspaceApi, type FixedRole } from '../services/apiService'
import RoleAssignments from './RoleAssignments'
import Select from './Select'
import { Icon } from './ui/Icon'

export default function FixedRoleManagement({ user, createRequest = 0, onChanged }: { user: AuthUser; createRequest?: number; onChanged?: () => void }) {
  const [roles, setRoles] = useState<FixedRole[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [assignmentRevision, setAssignmentRevision] = useState(0)
  const [assigning, setAssigning] = useState<FixedRole | null>(null)
  const emptyForm = { name: '', departmentId: '', supervisorId: '', isLetterAssigner: false }
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const load = () => Promise.all([workspaceApi.fixedRoles(), workspaceApi.getDepartments() as Promise<Department[]>])
    .then(([r, d]) => { setRoles(r); setDepartments(d) }).catch(e => setError(e.message))
  useEffect(() => { void load() }, [])
  useEffect(() => { if (createRequest) { setEditing('new'); setForm(emptyForm) } }, [createRequest])
  const department = departments.find(d => d.id === form.departmentId)
  const level = department?.layer?.number
  const managers = roles.filter(r => r.personnelId && r.id !== editing && r.layerNumber === (level || 0) - 1)
  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    // The custom dropdowns have no native `required`, so check them here.
    if (!form.departmentId) { setError('Select a department.'); return }
    if (!!level && level > 1 && !form.supervisorId) { setError('Select a reporting role.'); return }
    setBusy(true); setError('')
    try {
      const original = roles.find(r => r.id === editing)
      const body = original?.departmentId === form.departmentId && (original.supervisorId || '') === form.supervisorId
        ? { name: form.name, departmentId: form.departmentId, isLetterAssigner: form.isLetterAssigner } : form
      if (editing === 'new') await workspaceApi.createFixedRole(body)
      else await workspaceApi.updateFixedRole(editing!, body)
      setEditing(null); await load(); setAssignmentRevision(n => n + 1); onChanged?.()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save role.') }
    finally { setBusy(false) }
  }
  const filtered = roles.filter(r => [r.name, r.departmentName, r.phone].some(s => s?.toLowerCase().includes(search.toLowerCase())))
  const writable = user.actorType === 'director'
  return <div className="space-y-4">
    <div><h2 className="text-lg font-semibold tracking-tight inline-flex items-center gap-2"><span className="icon-tile tile-indigo w-8 h-8 rounded-lg"><Icon name="users" className="w-4 h-4" /></span>Roles</h2><p className="text-sm text-tw-text-secondary">{roles.length} fixed roles. Tasks, reporting relationships and history stay with each role when its phone assignment changes.</p></div>
    {writable && <button type="button" className="btn-secondary" onClick={() => { setEditing('new'); setForm(emptyForm) }}>Create role</button>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {editing !== null && writable && <Modal title={editing === 'new' ? 'Create role' : 'Edit role'} onClose={() => !busy && setEditing(null)}>
    <form onSubmit={save} className="space-y-4">
      <label className="block text-sm">Role name<input className="input mt-1" required maxLength={150} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></label>
      <div className="block text-sm">Department<Select className="mt-1" ariaLabel="Department" placeholder="Select department" value={form.departmentId}
        options={departments.map(d => ({ value: d.id, label: `${d.layer?.name ?? ''} — ${d.name}` }))}
        onChange={value => setForm(f => ({ ...f, departmentId: value, supervisorId: '' }))} /></div>
      {!!level && level > 1 && <div className="block text-sm">Reporting role<Select className="mt-1" ariaLabel="Reporting role" placeholder="Select reporting role" value={form.supervisorId}
        options={managers.map(r => ({ value: r.personnelId!, label: `${r.name} — ${r.departmentName}` }))}
        onChange={value => setForm(f => ({ ...f, supervisorId: value }))} /></div>}
      <label className="flex items-start gap-3 rounded-lg border border-tw-border p-3 text-sm">
        <input type="checkbox" className="mt-1" checked={form.isLetterAssigner} onChange={e => setForm(f => ({ ...f, isLetterAssigner: e.target.checked }))} />
        <span><span className="block font-medium">Manage company letters</span><span className="block text-tw-text-secondary mt-1">Log and assign letters, record replies in existing chains and reopen threads when new correspondence arrives.</span></span>
      </label>
      <p className="text-sm text-tw-text-secondary">{editing === 'new' ? 'Create the position first, then use Assign phone on its card to give it a mobile number.' : 'To change who holds this role, use Assign phone on its card.'}</p>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-3"><button disabled={busy} className="btn-primary">{busy ? 'Saving…' : 'Save role'}</button><button type="button" className="btn-secondary" disabled={busy} onClick={() => setEditing(null)}>Cancel</button></div>
    </form></Modal>}
    <input className="input" aria-label="Search roles" placeholder="Search role, department or assigned phone" value={search} onChange={e => setSearch(e.target.value)} />
    <div className="grid gap-3 sm:grid-cols-2">{filtered.map(r => <div key={r.id} className="card p-4">
      <div className="font-semibold">{r.name}{r.companyManagement && <span className="text-xs font-normal ml-2">Company management</span>}</div>
      <p className="text-sm text-tw-text-secondary">{r.departmentName || 'Company management'}</p>
      {r.isLetterAssigner && <p className="text-xs text-tw-primary mt-1">Manages company letters</p>}
      <p className="text-sm mt-2">{r.phone || 'No phone number assigned'}{r.phone && <span className="ml-2 text-xs text-tw-text-secondary">{r.accountConnected ? 'Account connected' : 'Awaiting verification'}</span>}</p>
      <p className="text-xs text-tw-text-secondary">Reports to: {roles.find(s => s.personnelId === r.supervisorId)?.name || 'Director'}</p>
      {writable && <div className="flex flex-wrap gap-2 mt-3">
        <button type="button" className="btn-secondary btn-sm" onClick={() => { setError(''); setEditing(r.id); setForm({ name: r.name, departmentId: r.departmentId || '', supervisorId: r.supervisorId || '', isLetterAssigner: r.isLetterAssigner === true }) }}>
          <Icon name="edit" className="w-3.5 h-3.5" /> Edit role
        </button>
        <button type="button" className="btn-primary btn-sm" onClick={() => setAssigning(r)}>
          <Icon name="phone" className="w-3.5 h-3.5" /> {r.phone ? 'Change phone' : 'Assign phone'}
        </button>
      </div>}
    </div>)}</div>
    {writable && assigning && <Modal title={`${assigning.phone ? 'Change phone' : 'Assign phone'} — ${assigning.name}`} onClose={() => setAssigning(null)}>
      <RoleAssignments only={`${assigning.actorType}:${assigning.actorId}`} refreshKey={assignmentRevision}
        onClose={() => setAssigning(null)} onSaved={() => { void load(); onChanged?.() }} />
    </Modal>}
    {/* Roles without a card here (e.g. extra Director accounts) are still assignable below. */}
    {writable && <RoleAssignments exclude={new Set(roles.map(r => `${r.actorType}:${r.actorId}`))} refreshKey={assignmentRevision} onSaved={() => { void load(); onChanged?.() }} />}
  </div>
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0b1220]/50 backdrop-blur-[3px] animate-fade-in" onClick={onClose}>
    <div role="dialog" aria-modal="true" aria-label={title} className="modal-panel w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-tw-border">
        <h3 className="font-semibold text-tw-text">{title}</h3>
        <button type="button" onClick={onClose} className="icon-btn w-8 h-8" aria-label="Close"><Icon name="x" className="w-4 h-4" /></button>
      </div>
      <div className="px-5 py-4 overflow-y-auto">{children}</div>
    </div>
  </div>
}
