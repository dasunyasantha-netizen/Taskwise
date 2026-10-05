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
  const [status, setStatus] = useState<'all' | RoleStatus>('all')
  const [limit, setLimit] = useState(PAGE)
  useEffect(() => { setLimit(PAGE) }, [search, status])
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
  const searched = roles.filter(r => [r.name, r.departmentName, r.phone].some(s => s?.toLowerCase().includes(search.toLowerCase())))
  const counts = { all: searched.length, unassigned: 0, awaiting: 0, connected: 0 }
  searched.forEach(r => { counts[roleStatus(r)] += 1 })
  const filtered = status === 'all' ? searched : searched.filter(r => roleStatus(r) === status)
  const visible = filtered.slice(0, limit)
  const supervisorName = (r: FixedRole) => roles.find(s => s.personnelId === r.supervisorId)?.name || 'Director'
  const openEdit = (r: FixedRole) => { setError(''); setEditing(r.id); setForm({ name: r.name, departmentId: r.departmentId || '', supervisorId: r.supervisorId || '', isLetterAssigner: r.isLetterAssigner === true }) }
  const writable = user.actorType === 'director'
  return <div className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><h2 className="text-lg font-semibold tracking-tight inline-flex items-center gap-2"><span className="icon-tile tile-indigo w-8 h-8 rounded-lg"><Icon name="users" className="w-4 h-4" /></span>Roles</h2><p className="text-sm text-tw-text-secondary">{roles.length} fixed roles. Tasks, reporting relationships and history stay with each role when its phone assignment changes.</p></div>
      {writable && <button type="button" className="btn-primary" onClick={() => { setError(''); setEditing('new'); setForm(emptyForm) }}><Icon name="plus" className="w-4 h-4" /> Create role</button>}
    </div>
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
    <div className="flex flex-col lg:flex-row lg:items-center gap-3">
      <div className="relative flex-1">
        <Icon name="search" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-tw-text-secondary pointer-events-none" />
        <input className="input pl-9" type="search" aria-label="Search roles" placeholder="Search role, department or phone" value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      <div className="seg overflow-x-auto scrollbar-hide" role="group" aria-label="Filter by phone status">
        {STATUS_FILTERS.map(f => <button key={f.key} type="button" aria-pressed={status === f.key} onClick={() => setStatus(f.key)}
          className={`seg-item shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 ${status === f.key ? 'seg-item-active' : ''}`}>
          {f.label}<span className="rounded-full bg-tw-hover px-1.5 text-[11px] tabular-nums">{counts[f.key]}</span>
        </button>)}
      </div>
    </div>

    <div className="card overflow-hidden">
      {/* Column headings (desktop) */}
      <div className={`hidden md:grid ${ROW_COLS} gap-4 px-4 py-2.5 border-b border-tw-border bg-tw-surface-2/60 text-[11px] font-semibold uppercase tracking-[0.08em] text-tw-text-secondary`}>
        <span>Role</span><span>Phone</span><span>Reports to</span><span className="w-[13.5rem]" />
      </div>
      {!visible.length && <p className="px-4 py-10 text-center text-sm text-tw-text-secondary">{roles.length ? 'No roles match this search or filter.' : 'Loading roles…'}</p>}
      <ul className="divide-y divide-tw-border">{visible.map(r => {
        const st = roleStatus(r)
        return <li key={r.id} className={`grid grid-cols-1 ${ROW_COLS} gap-x-4 gap-y-1.5 px-4 py-3 md:items-center hover:bg-tw-hover/50 transition-colors`}>
          <div className="min-w-0">
            <div className="font-semibold text-sm text-tw-text truncate">{r.name}</div>
            <div className="text-xs text-tw-text-secondary truncate">
              {r.departmentName || 'Company management'}
              {r.isLetterAssigner && <span className="ml-1 text-tw-primary-text">· Manages letters</span>}
            </div>
          </div>
          <div className="min-w-0 flex flex-wrap items-center gap-2">
            {r.phone && <span className="text-sm tabular-nums text-tw-text">{r.phone}</span>}
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[st].className}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${STATUS_STYLE[st].dot}`} />{STATUS_STYLE[st].label}
            </span>
          </div>
          <div className="text-xs md:text-sm text-tw-text-secondary truncate"><span className="md:hidden">Reports to </span>{supervisorName(r)}</div>
          {writable && <div className="flex items-center gap-2 md:w-[13.5rem] md:justify-end pt-1 md:pt-0">
            <button type="button" className="btn-secondary btn-sm whitespace-nowrap" onClick={() => openEdit(r)} aria-label={`Edit ${r.name}`}>
              <Icon name="edit" className="w-3.5 h-3.5" /> Edit
            </button>
            <button type="button" className={`${r.phone ? 'btn-secondary' : 'btn-primary'} btn-sm whitespace-nowrap`} onClick={() => setAssigning(r)}>
              <Icon name="phone" className="w-3.5 h-3.5" /> {r.phone ? 'Change phone' : 'Assign phone'}
            </button>
          </div>}
        </li>
      })}</ul>
      {filtered.length > visible.length && <button type="button" onClick={() => setLimit(n => n + PAGE * 2)}
        className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 border-t border-tw-border bg-tw-surface-2/60 text-sm font-semibold text-tw-primary-text hover:bg-tw-hover transition-colors">
        Show more <span className="font-normal text-tw-text-secondary tabular-nums">({visible.length} of {filtered.length})</span>
        <Icon name="chevronDown" className="w-4 h-4" />
      </button>}
    </div>
    {writable && assigning && <Modal title={`${assigning.phone ? 'Change phone' : 'Assign phone'} — ${assigning.name}`} onClose={() => setAssigning(null)}>
      <RoleAssignments only={`${assigning.actorType}:${assigning.actorId}`} refreshKey={assignmentRevision}
        onClose={() => setAssigning(null)} onSaved={() => { void load(); onChanged?.() }} />
    </Modal>}
    {/* Roles without a card here (e.g. extra Director accounts) are still assignable below. */}
    {writable && <RoleAssignments exclude={new Set(roles.map(r => `${r.actorType}:${r.actorId}`))} refreshKey={assignmentRevision} onSaved={() => { void load(); onChanged?.() }} />}
  </div>
}

type RoleStatus = 'unassigned' | 'awaiting' | 'connected'
const PAGE = 25
// One literal string so Tailwind generates it; shared by the heading row and every role row.
const ROW_COLS = 'md:grid-cols-[minmax(0,2fr)_minmax(0,1.6fr)_minmax(0,1.2fr)_auto]'
const roleStatus = (r: FixedRole): RoleStatus => !r.phone ? 'unassigned' : r.accountConnected ? 'connected' : 'awaiting'
const STATUS_FILTERS: { key: 'all' | RoleStatus; label: string }[] = [
  { key: 'all', label: 'All' }, { key: 'unassigned', label: 'Unassigned' },
  { key: 'awaiting', label: 'Awaiting verification' }, { key: 'connected', label: 'Connected' },
]
const STATUS_STYLE: Record<RoleStatus, { label: string; className: string; dot: string }> = {
  unassigned: { label: 'No phone', className: 'bg-tw-hover text-tw-text-secondary', dot: 'bg-gray-400' },
  awaiting: { label: 'Awaiting verification', className: 'bg-amber-500/15 text-amber-700', dot: 'bg-amber-500' },
  connected: { label: 'Connected', className: 'bg-emerald-500/15 text-emerald-700', dot: 'bg-emerald-500' },
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
