import React, { useState, useEffect } from 'react'
import type { Layer, Department, Personnel } from '../types'
import { workspaceApi } from '../services/apiService'
import Select from './Select'

export default function HierarchyPanel() {
  const [layers, setLayers] = useState<Layer[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'structure' | 'personnel'>('structure')

  // Modals
  const [showDeptModal, setShowDeptModal] = useState(false)
  const [showPersonnelModal, setShowPersonnelModal] = useState(false)
  const [showMoveModal, setShowMoveModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingPersonnel, setEditingPersonnel] = useState<Personnel | null>(null)
  const [editForm, setEditForm] = useState({ name: '', phone: '', email: '', nic: '', departmentId: '', supervisorId: '' })

  const [deptForm, setDeptForm] = useState({ name: '', layerId: '' })
  const [personnelForm, setPersonnelForm] = useState({ name: '', phone: '', email: '', nic: '', departmentId: '' })
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null)
  const [editingLayerName, setEditingLayerName] = useState('')
  const [movingPersonnel, setMovingPersonnel] = useState<Personnel | null>(null)
  const [moveTarget, setMoveTarget] = useState('')
  const [settingSupervisorFor, setSettingSupervisorFor] = useState<Personnel | null>(null)
  const [supervisorTarget, setSupervisorTarget] = useState('')

  const [allPersonnel, setAllPersonnel] = useState<Personnel[]>([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [personnelSearch, setPersonnelSearch] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const [l, p] = await Promise.all([
        workspaceApi.getLayers() as Promise<Layer[]>,
        workspaceApi.getPersonnel() as Promise<Personnel[]>,
      ])
      setLayers(l)
      setAllPersonnel(p)
    } catch { setError('Failed to load workspace data') }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const allDepts = layers.flatMap(l => l.departments || [])

  // ── Layer rename ─────────────────────────────────────────
  const startEditLayer = (layer: Layer) => {
    setEditingLayerId(layer.id)
    setEditingLayerName(layer.name)
  }
  const saveLayerName = async (layerId: string) => {
    if (!editingLayerName.trim()) return
    setSaving(true)
    try {
      await workspaceApi.updateLayer(layerId, { name: editingLayerName.trim() })
      setEditingLayerId(null)
      await load()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Error') }
    setSaving(false)
  }

  // ── Department ──────────────────────────────────────────
  const createDept = async () => {
    if (!deptForm.name || !deptForm.layerId) return
    setSaving(true)
    try {
      await workspaceApi.createDepartment(deptForm)
      setShowDeptModal(false); setDeptForm({ name: '', layerId: '' }); await load()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Error') }
    setSaving(false)
  }

  const deleteDept = async (id: string) => {
    if (!confirm('Delete this department? All personnel will be unassigned.')) return
    await workspaceApi.deleteDepartment(id); await load()
  }

  // ── Personnel ────────────────────────────────────────────
  const createPersonnel = async () => {
    if (!personnelForm.name || !personnelForm.phone || !personnelForm.departmentId) return
    setSaving(true)
    try {
      await workspaceApi.createPersonnel(personnelForm)
      setShowPersonnelModal(false); setPersonnelForm({ name: '', phone: '', email: '', nic: '', departmentId: '' }); await load()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Error') }
    setSaving(false)
  }

  const deletePersonnel = async (id: string) => {
    if (!confirm('Remove this personnel member?')) return
    await workspaceApi.deletePersonnel(id); await load()
  }

  const openEditModal = (p: Personnel) => {
    setEditingPersonnel(p)
    setEditForm({ name: p.name, phone: p.phone || '', email: p.email || '', nic: p.nic || '', departmentId: p.departmentId || '', supervisorId: p.supervisorId || '' })
    setShowEditModal(true)
  }

  const saveEdit = async () => {
    if (!editingPersonnel || !editForm.name || !editForm.phone) return
    setSaving(true)
    try {
      await workspaceApi.updatePersonnel(editingPersonnel.id, {
        name: editForm.name,
        phone: editForm.phone,
        email: editForm.email,
        nic: editForm.nic,
        departmentId: editForm.departmentId || undefined,
        supervisorId: editForm.supervisorId || null,
      })
      setShowEditModal(false); setEditingPersonnel(null); await load()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Error') }
    setSaving(false)
  }

  const movePersonnel = async () => {
    if (!movingPersonnel || !moveTarget) return
    setSaving(true)
    try {
      await workspaceApi.movePersonnel(movingPersonnel.id, { departmentId: moveTarget })
      setShowMoveModal(false); setMovingPersonnel(null); setMoveTarget(''); await load()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Error') }
    setSaving(false)
  }

  const saveSupervisor = async () => {
    if (!settingSupervisorFor) return
    setSaving(true)
    try {
      await workspaceApi.setSupervisor(settingSupervisorFor.id, supervisorTarget || null)
      setSettingSupervisorFor(null); setSupervisorTarget(''); await load()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Error') }
    setSaving(false)
  }

  if (loading) return <div className="p-8 text-tw-text-secondary text-sm">Loading hierarchy...</div>

  const layerColors = ['bg-blue-500', 'bg-indigo-500', 'bg-purple-500']

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-tw-text">Team Hierarchy</h1>
        <p className="text-sm text-tw-text-secondary mt-0.5 mb-4">Manage layers, departments and personnel</p>
        <div className="flex gap-2">
          <button onClick={() => setShowDeptModal(true)} className="flex-1 btn-secondary text-xs py-2.5 flex items-center justify-center gap-1">
            <span className="text-base leading-none">+</span> Department
          </button>
          <button onClick={() => setShowPersonnelModal(true)} className="flex-1 btn-secondary text-xs py-2.5 flex items-center justify-center gap-1">
            <span className="text-base leading-none">+</span> Personnel
          </button>
        </div>
      </div>

      {error && <div className="mb-4 bg-red-50 border border-red-200 text-tw-danger text-sm px-3 py-2 rounded-lg">{error}<button className="ml-2 underline" onClick={() => setError('')}>dismiss</button></div>}

      {/* Tabs */}
      <div className="flex gap-1 bg-tw-hover rounded-lg p-1 mb-6 w-fit">
        {(['structure', 'personnel'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors capitalize ${activeTab === tab ? 'bg-white text-tw-primary shadow-card' : 'text-tw-text-secondary hover:text-tw-text'}`}>
            {tab}
          </button>
        ))}
      </div>

      {/* STRUCTURE TAB */}
      {activeTab === 'structure' && (
        <div className="space-y-4">
          {layers.map((layer, idx) => (
            <div key={layer.id} className="card overflow-hidden">
              <div className={`px-4 py-3 flex items-center gap-3 ${layerColors[idx]} bg-opacity-10 border-b border-tw-border`}>
                <div className={`w-6 h-6 rounded-full ${layerColors[idx]} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>{layer.number}</div>
                {editingLayerId === layer.id ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      className="input text-sm py-1 px-2 h-auto"
                      value={editingLayerName}
                      onChange={e => setEditingLayerName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveLayerName(layer.id); if (e.key === 'Escape') setEditingLayerId(null) }}
                      autoFocus
                    />
                    <button onClick={() => saveLayerName(layer.id)} disabled={saving} className="btn-primary text-xs py-1 px-3">Save</button>
                    <button onClick={() => setEditingLayerId(null)} className="btn-secondary text-xs py-1 px-2">✕</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-1">
                    <div>
                      <div className="font-semibold text-tw-text text-sm">{layer.name}</div>
                      <div className="text-xs text-tw-text-secondary">{(layer.departments || []).length} departments</div>
                    </div>
                    <button onClick={() => startEditLayer(layer)} className="ml-2 text-xs text-tw-text-secondary hover:text-tw-primary" title="Rename layer">✏️</button>
                  </div>
                )}
              </div>
              {(layer.departments || []).length === 0 ? (
                <div className="px-4 py-4 text-sm text-tw-text-secondary italic">No departments in this layer yet.</div>
              ) : (
                <div className="divide-y divide-tw-border">
                  {(layer.departments || []).map(dept => {
                    const deptPersonnel = allPersonnel.filter(p => p.departmentId === dept.id)
                    return (
                      <div key={dept.id} className="px-4 py-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-tw-primary" />
                            <span className="font-medium text-sm text-tw-text">{dept.name}</span>
                            <span className="badge badge-gray">{deptPersonnel.length} people</span>
                          </div>
                          <button onClick={() => deleteDept(dept.id)} className="text-xs text-tw-text-secondary hover:text-tw-danger transition-colors">Delete</button>
                        </div>
                        {deptPersonnel.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {deptPersonnel.map(p => (
                              <div key={p.id} className="flex items-center gap-1.5 bg-tw-hover px-2.5 py-1 rounded-full">
                                <div className="w-5 h-5 rounded-full bg-tw-primary flex items-center justify-center text-white text-xs font-bold">
                                  {p.name.charAt(0).toUpperCase()}
                                </div>
                                <span className="text-xs text-tw-text">{p.name}</span>
                                <button onClick={() => { setMovingPersonnel(p); setShowMoveModal(true) }} className="text-xs text-tw-text-secondary hover:text-tw-primary ml-1" title="Move">⇄</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* PERSONNEL TAB */}
      {activeTab === 'personnel' && (
        <PersonnelTab
          allPersonnel={allPersonnel}
          layers={layers}
          allDepts={allDepts}
          personnelSearch={personnelSearch}
          setPersonnelSearch={setPersonnelSearch}
          openEditModal={openEditModal}
          setMovingPersonnel={setMovingPersonnel}
          setShowMoveModal={setShowMoveModal}
          deletePersonnel={deletePersonnel}
        />
      )}

      {/* MODAL: Create Department */}
      {showDeptModal && (
        <Modal title="Create Department" onClose={() => setShowDeptModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-tw-text mb-1">Layer</label>
              <Select
                value={deptForm.layerId}
                onChange={val => setDeptForm(f => ({ ...f, layerId: val }))}
                placeholder="Select layer..."
                options={layers.map(l => ({ value: l.id, label: l.name }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-tw-text mb-1">Department Name</label>
              <input className="input" placeholder="e.g. Engineering" value={deptForm.name} onChange={e => setDeptForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowDeptModal(false)} className="btn-secondary">Cancel</button>
              <button onClick={createDept} disabled={saving} className="btn-primary">{saving ? 'Creating...' : 'Create'}</button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL: Create Personnel */}
      {showPersonnelModal && (
        <Modal title="Add Personnel" onClose={() => setShowPersonnelModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-tw-text mb-1">Full Name</label>
              <input className="input" placeholder="John Smith" value={personnelForm.name} onChange={e => setPersonnelForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-tw-text mb-1">Phone Number <span className="text-tw-danger">*</span></label>
              <input className="input" type="tel" placeholder="07X XXXXXXX" value={personnelForm.phone} onChange={e => setPersonnelForm(f => ({ ...f, phone: e.target.value }))} />
              <p className="text-xs text-tw-text-secondary mt-0.5">Used as login username. Must be unique in this workspace.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-tw-text mb-1">Email <span className="text-tw-text-secondary font-normal">(optional)</span></label>
              <input className="input" type="email" placeholder="john@example.com" value={personnelForm.email} onChange={e => setPersonnelForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-tw-text mb-1">NIC <span className="text-tw-text-secondary font-normal">(optional)</span></label>
              <input className="input" placeholder="XXXXXXXXXV" value={personnelForm.nic} onChange={e => setPersonnelForm(f => ({ ...f, nic: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-tw-text mb-1">Department <span className="text-tw-danger">*</span></label>
              <Select
                value={personnelForm.departmentId}
                onChange={val => setPersonnelForm(f => ({ ...f, departmentId: val }))}
                placeholder="Select department..."
                options={layers.flatMap(l => (l.departments || []).map(d => ({ value: d.id, label: d.name, group: l.name })))}
              />
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
              <p className="text-xs text-blue-700">
                <strong>Auto login:</strong> Their password will be set to the last 6 digits of their phone number. They will be asked to change it on first login.
              </p>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowPersonnelModal(false)} className="btn-secondary">Cancel</button>
              <button onClick={createPersonnel} disabled={saving} className="btn-primary">{saving ? 'Adding...' : 'Add Personnel'}</button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL: Edit Personnel */}
      {showEditModal && editingPersonnel && (
        <Modal title={`Edit — ${editingPersonnel.name}`} onClose={() => { setShowEditModal(false); setEditingPersonnel(null) }}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-tw-text mb-1">Full Name <span className="text-tw-danger">*</span></label>
              <input className="input" placeholder="John Smith" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-tw-text mb-1">Phone Number <span className="text-tw-danger">*</span></label>
              <input className="input" type="tel" placeholder="07X XXXXXXX" value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} />
              {editForm.phone !== (editingPersonnel.phone || '') && (
                <div className="mt-1.5 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                  <p className="text-xs text-amber-700">⚠ Changing phone number will also update their login username.</p>
                </div>
              )}
              {editForm.phone === (editingPersonnel.phone || '') && (
                <p className="text-xs text-tw-text-secondary mt-0.5">This is also their login username.</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-tw-text mb-1">Email <span className="text-tw-text-secondary font-normal">(optional)</span></label>
              <input className="input" type="email" placeholder="john@example.com" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-tw-text mb-1">NIC <span className="text-tw-text-secondary font-normal">(optional)</span></label>
              <input className="input" placeholder="XXXXXXXXXV" value={editForm.nic} onChange={e => setEditForm(f => ({ ...f, nic: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-tw-text mb-1">Supervisor</label>
              <Select
                value={editForm.supervisorId}
                onChange={val => setEditForm(f => ({ ...f, supervisorId: val }))}
                placeholder="No supervisor set..."
                options={allPersonnel
                  .filter(p => p.id !== editingPersonnel.id && !p.deletedAt)
                  .map(p => {
                    const d = allDepts.find(d => d.id === p.departmentId)
                    const l = layers.find(l => l.id === d?.layerId)
                    return { value: p.id, label: p.name, group: `${l?.name} — ${d?.name}` }
                  })}
              />
              {editForm.supervisorId && (
                <button className="mt-1 text-xs text-tw-text-secondary underline" onClick={() => setEditForm(f => ({ ...f, supervisorId: '' }))}>Clear supervisor</button>
              )}
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <button onClick={() => { setShowEditModal(false); setEditingPersonnel(null) }} className="btn-secondary">Cancel</button>
              <button onClick={saveEdit} disabled={saving || !editForm.name || !editForm.phone} className="btn-primary">
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL: Set Supervisor */}
      {settingSupervisorFor && (
        <Modal title={`Set Supervisor — ${settingSupervisorFor.name}`} onClose={() => { setSettingSupervisorFor(null); setSupervisorTarget('') }}>
          <div className="space-y-4">
            <p className="text-sm text-tw-text-secondary">
              Select the person who directly supervises <strong>{settingSupervisorFor.name}</strong>.
              When they submit a task, it will go to this person for approval.
            </p>
            <Select
              value={supervisorTarget}
              onChange={val => setSupervisorTarget(val)}
              placeholder="Select supervisor…"
              options={allPersonnel
                .filter(p => p.id !== settingSupervisorFor.id && !p.deletedAt)
                .map(p => {
                  const dept = allDepts.find(d => d.id === p.departmentId)
                  const layer = layers.find(l => l.id === dept?.layerId)
                  return { value: p.id, label: `${p.name}`, group: `${layer?.name} — ${dept?.name}` }
                })}
            />
            {supervisorTarget && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                Tasks submitted by <strong>{settingSupervisorFor.name}</strong> will route to <strong>{allPersonnel.find(p => p.id === supervisorTarget)?.name}</strong> for approval.
              </div>
            )}
            <div className="flex gap-2 justify-end">
              {settingSupervisorFor.supervisorId && (
                <button onClick={() => { setSupervisorTarget(''); saveSupervisor() }} disabled={saving} className="btn-secondary text-xs text-tw-danger border-tw-danger">
                  Clear Supervisor
                </button>
              )}
              <button onClick={() => { setSettingSupervisorFor(null); setSupervisorTarget('') }} className="btn-secondary">Cancel</button>
              <button onClick={saveSupervisor} disabled={saving || !supervisorTarget} className="btn-primary">
                {saving ? 'Saving…' : 'Set Supervisor'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL: Move Personnel */}
      {showMoveModal && movingPersonnel && (
        <Modal title={`Move ${movingPersonnel.name}`} onClose={() => { setShowMoveModal(false); setMovingPersonnel(null) }}>
          <div className="space-y-4">
            <p className="text-sm text-tw-text-secondary">Select a new department for this person.</p>
            <Select
              value={moveTarget}
              onChange={val => setMoveTarget(val)}
              placeholder="Select department..."
              options={layers.flatMap(l =>
                (l.departments || [])
                  .filter(d => d.id !== movingPersonnel.departmentId)
                  .map(d => ({ value: d.id, label: d.name, group: l.name }))
              )}
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setShowMoveModal(false); setMovingPersonnel(null) }} className="btn-secondary">Cancel</button>
              <button onClick={movePersonnel} disabled={saving || !moveTarget} className="btn-primary">{saving ? 'Moving...' : 'Move'}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── Personnel expandable card (mobile only) ─────────────────────────────────

interface PersonnelCardProps {
  p: Personnel
  avatarColor: string
  dept: Department | undefined
  supervisor: Personnel | undefined
  openEditModal: (p: Personnel) => void
  setMovingPersonnel: (p: Personnel) => void
  setShowMoveModal: (v: boolean) => void
  deletePersonnel: (id: string) => void
}

function PersonnelCard({ p, avatarColor, dept, supervisor, openEditModal, setMovingPersonnel, setShowMoveModal, deletePersonnel }: PersonnelCardProps) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-tw-border last:border-0">
      {/* Row header — always visible */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-tw-hover transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className={`w-9 h-9 rounded-full ${avatarColor} flex items-center justify-center text-white text-sm font-bold shadow-sm flex-shrink-0`}>
          {p.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-tw-text text-sm leading-tight truncate">{p.name}</div>
          <div className="text-xs text-tw-text-secondary truncate">{dept?.name || <span className="italic">Unassigned</span>}</div>
        </div>
        <svg className={`w-4 h-4 text-tw-text-secondary flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded detail */}
      {open && (
        <div className="px-4 pb-4 space-y-3 bg-tw-hover/40">
          {/* Contact */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs pt-1">
            <div>
              <span className="text-tw-text-secondary uppercase tracking-wide font-semibold text-[10px]">Phone</span>
              <div className="text-tw-text mt-0.5">{p.phone || '—'}</div>
            </div>
            {p.email && (
              <div>
                <span className="text-tw-text-secondary uppercase tracking-wide font-semibold text-[10px]">Email</span>
                <div className="text-tw-text mt-0.5 break-all">{p.email}</div>
              </div>
            )}
            {p.nic && (
              <div>
                <span className="text-tw-text-secondary uppercase tracking-wide font-semibold text-[10px]">NIC</span>
                <div className="text-tw-text mt-0.5">{p.nic}</div>
              </div>
            )}
            <div>
              <span className="text-tw-text-secondary uppercase tracking-wide font-semibold text-[10px]">Supervisor</span>
              <div className="mt-0.5">
                {supervisor
                  ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-50 border border-teal-200 text-xs text-teal-700">
                      <span className="w-3.5 h-3.5 rounded-full bg-[#00a693] flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0">{supervisor.name.charAt(0)}</span>
                      {supervisor.name}
                    </span>
                  : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-xs text-amber-600">⚠ Not set</span>
                }
              </div>
            </div>
          </div>
          {/* Actions */}
          <div className="flex gap-2 pt-0.5">
            <button onClick={() => openEditModal(p)} className="flex-1 inline-flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-medium bg-[#0073ea] text-white hover:bg-[#0060c0] transition-colors">✏️ Edit</button>
            <button onClick={() => { setMovingPersonnel(p); setShowMoveModal(true) }} className="flex-1 inline-flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-medium bg-[#9c27b0] text-white hover:bg-[#7b1fa2] transition-colors">⇄ Move</button>
            <button onClick={() => deletePersonnel(p.id)} className="px-3 py-2 rounded-lg text-xs font-medium bg-red-500 text-white hover:bg-red-600 transition-colors">✕</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Personnel tab ────────────────────────────────────────────────────────────

interface PersonnelTabProps {
  allPersonnel: Personnel[]
  layers: Layer[]
  allDepts: Department[]
  personnelSearch: string
  setPersonnelSearch: (v: string) => void
  openEditModal: (p: Personnel) => void
  setMovingPersonnel: (p: Personnel) => void
  setShowMoveModal: (v: boolean) => void
  deletePersonnel: (id: string) => void
}

function PersonnelTab({ allPersonnel, layers, allDepts, personnelSearch, setPersonnelSearch, openEditModal, setMovingPersonnel, setShowMoveModal, deletePersonnel }: PersonnelTabProps) {
  const avatarColors = ['bg-[#0073ea]', 'bg-[#9c27b0]', 'bg-[#00a693]', 'bg-[#ff7575]', 'bg-[#ff9800]', 'bg-[#4caf50]']
  const deptHeaderColors = [
    'from-[#e8f0ff] to-[#f0e8ff] border-[#0073ea]/20 text-[#0073ea]',
    'from-[#f3e8ff] to-[#ffe8f0] border-[#9c27b0]/20 text-[#9c27b0]',
    'from-[#e8fff8] to-[#e8f8ff] border-[#00a693]/20 text-[#00a693]',
    'from-[#fff0e8] to-[#ffebe8] border-[#ff7575]/20 text-[#ff5c5c]',
    'from-[#fff8e8] to-[#fff0e8] border-[#ff9800]/20 text-[#ff9800]',
    'from-[#edfff0] to-[#e8fff5] border-[#4caf50]/20 text-[#4caf50]',
  ]

  const q = personnelSearch.trim().toLowerCase()
  const filtered = q
    ? allPersonnel.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.phone || '').toLowerCase().includes(q) ||
        (p.email || '').toLowerCase().includes(q) ||
        (p.nic || '').toLowerCase().includes(q)
      )
    : allPersonnel

  const layerGroups = layers.map((layer, layerIdx) => {
    const layerDeptIds = new Set((layer.departments || []).map(d => d.id))
    const members = filtered.filter(p => layerDeptIds.has(p.departmentId))
    return { layer, members, layerIdx }
  }).filter(g => g.members.length > 0)

  const unassigned = filtered.filter(p => !allDepts.find(d => d.id === p.departmentId))

  const renderLayerGroup = (
    key: string,
    headerClass: string,
    avatarClass: string,
    badgeLabel: string | number,
    title: string,
    members: Personnel[],
    layerIdx: number
  ) => (
    <div key={key} className="card overflow-hidden">
      <div className={`px-4 py-3 bg-gradient-to-r ${headerClass} border-b-2 flex items-center gap-3`}>
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold ${avatarClass}`}>
          {badgeLabel}
        </div>
        <span className="font-bold text-sm flex-1">{title}</span>
        <span className="text-xs font-semibold opacity-70">{members.length} {members.length === 1 ? 'person' : 'people'}</span>
      </div>

      {/* ── Mobile: expandable cards ── */}
      <div className="sm:hidden divide-y divide-tw-border">
        {members.map(p => (
          <PersonnelCard
            key={p.id}
            p={p}
            avatarColor={avatarColors[layerIdx % avatarColors.length]}
            dept={allDepts.find(d => d.id === p.departmentId)}
            supervisor={allPersonnel.find(s => s.id === p.supervisorId)}
            openEditModal={openEditModal}
            setMovingPersonnel={setMovingPersonnel}
            setShowMoveModal={setShowMoveModal}
            deletePersonnel={deletePersonnel}
          />
        ))}
      </div>

      {/* ── Desktop: table ── */}
      <table className="hidden sm:table w-full text-sm table-fixed">
        <colgroup>
          <col className="w-[28%]" /><col className="w-[20%]" /><col className="w-[18%]" /><col className="w-[20%]" /><col className="w-[14%]" />
        </colgroup>
        <thead>
          <tr className="bg-tw-hover border-b border-tw-border">
            {['Name', 'Contact', 'Department', 'Supervisor', 'Actions'].map(h => (
              <th key={h} className="text-left px-4 py-2 text-xs font-semibold text-tw-text-secondary uppercase tracking-wider">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-tw-border">
          {members.map(p => {
            const supervisor = allPersonnel.find(s => s.id === p.supervisorId)
            const dept = allDepts.find(d => d.id === p.departmentId)
            return (
              <tr key={p.id} className="hover:bg-[#f8f9ff] transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-full ${avatarColors[layerIdx % avatarColors.length]} flex items-center justify-center text-white text-sm font-bold shadow-sm`}>
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-semibold text-tw-text text-sm leading-tight truncate">{p.name}</div>
                      {p.nic && <div className="text-xs text-tw-text-secondary truncate">{p.nic}</div>}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="text-xs text-tw-text">{p.phone || '—'}</div>
                  {p.email && <div className="text-xs text-tw-text-secondary">{p.email}</div>}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-purple-50 text-purple-600 border border-purple-100">
                    {dept?.name || '—'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {supervisor
                    ? <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-teal-50 border border-teal-200 text-xs text-teal-700">
                        <div className="w-4 h-4 rounded-full bg-[#00a693] flex items-center justify-center text-white text-xs font-bold">{supervisor.name.charAt(0)}</div>
                        {supervisor.name}
                      </span>
                    : <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-xs text-amber-600"><span>⚠</span> Not set</span>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1.5">
                    <button onClick={() => openEditModal(p)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[#0073ea] text-white hover:bg-[#0060c0] transition-colors shadow-sm">✏️ Edit</button>
                    <button onClick={() => { setMovingPersonnel(p); setShowMoveModal(true) }} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[#9c27b0] text-white hover:bg-[#7b1fa2] transition-colors shadow-sm">⇄ Move</button>
                    <button onClick={() => deletePersonnel(p.id)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-500 text-white hover:bg-red-600 transition-colors shadow-sm">✕</button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <div className="relative">
        <span className="absolute inset-y-0 left-3 flex items-center text-tw-text-secondary pointer-events-none">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" /></svg>
        </span>
        <input
          className="input pl-9 pr-9"
          placeholder="Search by name, phone, email or NIC..."
          value={personnelSearch}
          onChange={e => setPersonnelSearch(e.target.value)}
        />
        {personnelSearch && (
          <button className="absolute inset-y-0 right-3 flex items-center text-tw-text-secondary hover:text-tw-text" onClick={() => setPersonnelSearch('')}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        )}
      </div>

      {allPersonnel.length === 0 ? (
        <div className="card px-4 py-8 text-center text-tw-text-secondary text-sm">No personnel yet. Add some using the button above.</div>
      ) : filtered.length === 0 ? (
        <div className="card px-4 py-8 text-center text-tw-text-secondary text-sm">No personnel match "<strong>{personnelSearch}</strong>".</div>
      ) : (
        <div className="space-y-4">
          {layerGroups.map(({ layer, members, layerIdx }) =>
            renderLayerGroup(layer.id, deptHeaderColors[layerIdx % deptHeaderColors.length], avatarColors[layerIdx % avatarColors.length], layer.number, layer.name, members, layerIdx)
          )}
          {unassigned.length > 0 && renderLayerGroup(
            'unassigned',
            'from-gray-50 to-gray-100 border-gray-200 text-gray-500',
            'bg-gray-400',
            '?',
            'Unassigned',
            unassigned,
            5
          )}
        </div>
      )}
    </div>
  )
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-panel w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-tw-border">
          <h3 className="font-semibold text-tw-text">{title}</h3>
          <button onClick={onClose} className="text-tw-text-secondary hover:text-tw-text text-xl leading-none">×</button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  )
}
