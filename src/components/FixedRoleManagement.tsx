import { useEffect, useState } from 'react'
import type { AuthUser, Department } from '../types'
import { workspaceApi, type FixedRole } from '../services/apiService'
import RoleAssignments from './RoleAssignments'
import { Icon } from './ui/Icon'

export default function FixedRoleManagement({ user, createRequest = 0, onChanged }: { user: AuthUser; createRequest?: number; onChanged?: () => void }) {
  const [roles, setRoles] = useState<FixedRole[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [assignmentRevision, setAssignmentRevision] = useState(0)
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
    event.preventDefault(); setBusy(true); setError('')
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
  const writable = user.actorType === 'director' && !user.impersonation
  return <div className="space-y-4">
    <div><h2 className="text-lg font-semibold tracking-tight inline-flex items-center gap-2"><span className="icon-tile tile-indigo w-8 h-8 rounded-lg"><Icon name="users" className="w-4 h-4" /></span>Roles</h2><p className="text-sm text-tw-text-secondary">{roles.length} fixed roles. Tasks, reporting relationships and history stay with each role when its phone assignment changes.</p></div>
    {writable && <button type="button" className="btn-secondary" onClick={() => { setEditing('new'); setForm(emptyForm) }}>Create role</button>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {editing !== null && writable && <form onSubmit={save} className="card p-5 space-y-4">
      <h3 className="font-semibold">{editing === 'new' ? 'Create role' : 'Edit role'}</h3>
      <label className="block text-sm">Role name<input className="input mt-1" required maxLength={150} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></label>
      <label htmlFor="role-department" className="block text-sm">Department</label><select id="role-department" className="input mt-1" required value={form.departmentId} onChange={e => setForm(f => ({ ...f, departmentId: e.target.value, supervisorId: '' }))}>
        <option value="">Select department</option>{departments.map(d => <option key={d.id} value={d.id}>{d.layer?.name} — {d.name}</option>)}
      </select>
      {!!level && level > 1 && <label className="block text-sm">Reporting role<select className="input mt-1" required value={form.supervisorId} onChange={e => setForm(f => ({ ...f, supervisorId: e.target.value }))}>
        <option value="">Select reporting role</option>{managers.map(r => <option key={r.id} value={r.personnelId!}>{r.name} — {r.departmentName}</option>)}
      </select></label>}
      <label className="flex items-start gap-3 rounded-lg border border-tw-border p-3 text-sm">
        <input type="checkbox" className="mt-1" checked={form.isLetterAssigner} onChange={e => setForm(f => ({ ...f, isLetterAssigner: e.target.checked }))} />
        <span><span className="block font-medium">Manage company letters</span><span className="block text-tw-text-secondary mt-1">Log and assign letters, record replies in existing chains and reopen threads when new correspondence arrives.</span></span>
      </label>
      <p className="text-sm text-tw-text-secondary">Create the position first. The Director can assign a verified account’s mobile number below.</p>
      <div className="flex gap-3"><button disabled={busy} className="btn-primary">{busy ? 'Saving…' : 'Save role'}</button><button type="button" className="btn-secondary" disabled={busy} onClick={() => setEditing(null)}>Cancel</button></div>
    </form>}
    <input className="input" aria-label="Search roles" placeholder="Search role, department or assigned phone" value={search} onChange={e => setSearch(e.target.value)} />
    <div className="grid gap-3 sm:grid-cols-2">{filtered.map(r => <div key={r.id} className="card p-4">
      <div className="font-semibold">{r.name}{r.companyManagement && <span className="text-xs font-normal ml-2">Company management</span>}</div>
      <p className="text-sm text-tw-text-secondary">{r.departmentName || 'Company management'}</p>
      {r.isLetterAssigner && <p className="text-xs text-tw-primary mt-1">Manages company letters</p>}
      <p className="text-sm mt-2">{r.phone || 'No phone number assigned'}</p>
      <p className="text-xs text-tw-text-secondary">Reports to: {roles.find(s => s.personnelId === r.supervisorId)?.name || 'Director'}</p>
      {writable && <button className="text-sm text-tw-primary mt-3" onClick={() => { setEditing(r.id); setForm({ name: r.name, departmentId: r.departmentId || '', supervisorId: r.supervisorId || '', isLetterAssigner: r.isLetterAssigner === true }) }}>Edit role</button>}
    </div>)}</div>
    {writable && <RoleAssignments refreshKey={assignmentRevision} onSaved={() => { void load(); onChanged?.() }} />}
  </div>
}
