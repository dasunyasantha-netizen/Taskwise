import React, { useState, useEffect } from 'react'
import type { AuthUser, Layer, Department, Personnel } from '../types'
import { workspaceApi, type ManagerCandidate } from '../services/apiService'
import {
  OFFICE_CATEGORY_OPTIONS, hasFourLevelHierarchy, levelNeedsManager, levelTakesCategory,
  needsManager, officeCategoryLabel, tierWord,
} from '../hierarchy'
import Select from './Select'

export default function HierarchyPanel({ user }: { user: AuthUser }) {
  const [layers, setLayers] = useState<Layer[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'structure' | 'personnel'>('structure')

  // Modals
  const [showDeptModal, setShowDeptModal] = useState(false)
  const [showPersonnelModal, setShowPersonnelModal] = useState(false)
  const [showMoveModal, setShowMoveModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [createdCredentials, setCreatedCredentials] = useState<{
    name: string
    loginId: string
    temporaryPassword: string
  } | null>(null)
  const [copiedCredential, setCopiedCredential] = useState<'login' | 'password' | 'both' | null>(null)
  const [editingPersonnel, setEditingPersonnel] = useState<Personnel | null>(null)
  const [editForm, setEditForm] = useState({ name: '', phone: '', email: '', nic: '', departmentId: '', supervisorId: '' })

  const [deptForm, setDeptForm] = useState({ name: '', layerId: '', officeCategory: '' })
  const [editingDept, setEditingDept] = useState<Department | null>(null)
  const [deptEditForm, setDeptEditForm] = useState({ name: '', officeCategory: '' })
  const [personnelForm, setPersonnelForm] = useState({
    name: '', phone: '', email: '', nic: '', departmentId: '', password: '', isActive: true,
    layerId: '', officeCategory: '', supervisorId: '',
  })
  // Reporting-manager candidates for the level currently selected in a modal.
  const [managers, setManagers] = useState<ManagerCandidate[]>([])
  const [managersForLevel, setManagersForLevel] = useState<number | null>(null)
  const [showAllManagers, setShowAllManagers] = useState(false)
  const [moveSupervisorId, setMoveSupervisorId] = useState('')
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null)
  const [editingLayerName, setEditingLayerName] = useState('')
  const [movingPersonnel, setMovingPersonnel] = useState<Personnel | null>(null)
  const [moveTarget, setMoveTarget] = useState('')

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
      // People added since the last fetch can themselves be managers, so the
      // cached candidate list is dropped rather than served stale.
      setManagersForLevel(null)
    } catch { setError('Failed to load workspace data') }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const allDepts = layers.flatMap(l => l.departments || [])
  const fourLevel = hasFourLevelHierarchy(user)
  const word = tierWord(user)

  const levelOfDept = (deptId?: string | null): number | undefined =>
    layers.find(l => (l.departments || []).some(d => d.id === deptId))?.number
  const levelOfPerson = (p: Personnel): number | undefined => levelOfDept(p.departmentId)
  const categoryOfDept = (deptId?: string | null): string | null =>
    allDepts.find(d => d.id === deptId)?.officeCategory ?? null

  /** Everyone whose level requires a reporting manager but has none set. */
  const unmanaged = fourLevel
    ? allPersonnel.filter(p => needsManager(user, levelOfPerson(p), p.supervisorId))
    : []

  // Manager candidates are fetched per level, so a modal only ever offers people
  // exactly one level above the person being created or moved.
  const loadManagers = async (level: number | undefined) => {
    if (!fourLevel || !level || !levelNeedsManager(level)) { setManagers([]); setManagersForLevel(null); return }
    if (managersForLevel === level) return
    try {
      const items = await workspaceApi.getManagerCandidates(level)
      setManagers(items); setManagersForLevel(level)
    } catch { setManagers([]); setManagersForLevel(null) }
  }

  /** True when this person's level obliges them to have a reporting manager. */
  const managerRequiredFor = (person: Personnel) => fourLevel && levelNeedsManager(levelOfPerson(person) ?? 0)

  /**
   * Supervisor choices for an existing person. Under the four-level hierarchy a
   * manager sits exactly one level up; otherwise any colleague is allowed, as
   * before.
   */
  const supervisorOptionsFor = (person: Personnel) => {
    const level = levelOfPerson(person)
    return allPersonnel
      .filter(p => p.id !== person.id && !p.deletedAt
        && (!fourLevel || (level !== undefined && levelOfPerson(p) === level - 1)))
      .map(p => {
        const d = allDepts.find(dept => dept.id === p.departmentId)
        const l = layers.find(layer => layer.id === d?.layerId)
        return {
          value: p.id,
          label: p.name,
          group: [l?.name, d?.name, officeCategoryLabel(d?.officeCategory)].filter(Boolean).join(' — '),
        }
      })
  }

  /**
   * Manager options for a level, preferring the same office category but always
   * offering the full list behind "show all" — cross-category lines are allowed.
   */
  const managerOptions = (category: string | null) => {
    const sameCategory = category ? managers.filter(m => m.department.officeCategory === category) : []
    const list = showAllManagers || sameCategory.length === 0 ? managers : sameCategory
    return list.map(m => ({
      value: m.id,
      label: m.name,
      group: [m.department.name, officeCategoryLabel(m.department.officeCategory)].filter(Boolean).join(' · '),
    }))
  }

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
  const deptFormLevel = layers.find(l => l.id === deptForm.layerId)?.number
  const deptFormNeedsCategory = fourLevel && deptFormLevel !== undefined && levelTakesCategory(deptFormLevel)

  const createDept = async () => {
    if (!deptForm.name || !deptForm.layerId) return
    if (deptFormNeedsCategory && !deptForm.officeCategory) return
    setSaving(true)
    try {
      await workspaceApi.createDepartment({
        name: deptForm.name,
        layerId: deptForm.layerId,
        ...(deptFormNeedsCategory ? { officeCategory: deptForm.officeCategory } : {}),
      })
      setShowDeptModal(false); setDeptForm({ name: '', layerId: '', officeCategory: '' }); await load()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Error') }
    setSaving(false)
  }

  const openDeptEdit = (dept: Department) => {
    setEditingDept(dept)
    setDeptEditForm({ name: dept.name, officeCategory: dept.officeCategory || '' })
  }

  const saveDeptEdit = async () => {
    if (!editingDept || !deptEditForm.name) return
    const level = levelOfDept(editingDept.id)
    const takesCategory = fourLevel && level !== undefined && levelTakesCategory(level)
    if (takesCategory && !deptEditForm.officeCategory) return
    const affected = allPersonnel.filter(p => p.departmentId === editingDept.id).length
    if (takesCategory && deptEditForm.officeCategory !== (editingDept.officeCategory || '') && affected > 0) {
      const to = officeCategoryLabel(deptEditForm.officeCategory)
      if (!confirm(`Move ${editingDept.name} and its ${affected} ${affected === 1 ? 'member' : 'members'} to ${to}?`)) return
    }
    setSaving(true)
    try {
      await workspaceApi.updateDepartment(editingDept.id, {
        name: deptEditForm.name,
        ...(takesCategory ? { officeCategory: deptEditForm.officeCategory } : {}),
      })
      setEditingDept(null); await load()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Error') }
    setSaving(false)
  }

  const deleteDept = async (id: string) => {
    if (!confirm('Delete this department? All personnel will be unassigned.')) return
    await workspaceApi.deleteDepartment(id); await load()
  }

  // ── Personnel ────────────────────────────────────────────
  const personnelFormLevel = fourLevel
    ? layers.find(l => l.id === personnelForm.layerId)?.number
    : levelOfDept(personnelForm.departmentId)
  const personnelNeedsCategory = fourLevel && personnelFormLevel !== undefined && levelTakesCategory(personnelFormLevel)
  const personnelNeedsManager = fourLevel && personnelFormLevel !== undefined && levelNeedsManager(personnelFormLevel)

  const personnelDeptOptions = (() => {
    const layer = layers.find(l => l.id === personnelForm.layerId)
    if (!layer) return []
    return (layer.departments || [])
      .filter(d => !personnelNeedsCategory || d.officeCategory === personnelForm.officeCategory)
      .map(d => ({ value: d.id, label: d.name }))
  })()

  const resetPersonnelForm = () => setPersonnelForm({
    name: '', phone: '', email: '', nic: '', departmentId: '', password: '', isActive: true,
    layerId: '', officeCategory: '', supervisorId: '',
  })

  const createPersonnel = async () => {
    if (!personnelForm.name || !personnelForm.phone || !personnelForm.departmentId) return
    if (personnelNeedsCategory && !personnelForm.officeCategory) return
    if (personnelNeedsManager && !personnelForm.supervisorId) return
    setSaving(true)
    try {
      const { layerId: _layerId, officeCategory: _officeCategory, supervisorId, ...rest } = personnelForm
      const created = await workspaceApi.createPersonnel({
        ...rest,
        ...(personnelNeedsManager ? { supervisorId } : {}),
      })
      setCreatedCredentials({
        name: created.name,
        loginId: created.loginId,
        temporaryPassword: created.temporaryPassword,
      })
      setCopiedCredential(null)
      setShowPersonnelModal(false)
      resetPersonnelForm()
      await load()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Error') }
    setSaving(false)
  }

  const copyCredential = async (kind: 'login' | 'password' | 'both') => {
    if (!createdCredentials) return
    const text = kind === 'login'
      ? createdCredentials.loginId
      : kind === 'password'
        ? createdCredentials.temporaryPassword
        : `TaskWise login\nUsername: ${createdCredentials.loginId}\nTemporary password: ${createdCredentials.temporaryPassword}`
    await navigator.clipboard.writeText(text)
    setCopiedCredential(kind)
    window.setTimeout(() => setCopiedCredential(null), 1800)
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
    // An existing user at a managed level who still has no manager stays
    // flagged rather than blocking an unrelated edit, so the empty value is
    // simply left out of the request.
    const leaveManagerAlone = !editForm.supervisorId && managerRequiredFor(editingPersonnel)
    setSaving(true)
    try {
      await workspaceApi.updatePersonnel(editingPersonnel.id, {
        name: editForm.name,
        phone: editForm.phone,
        email: editForm.email,
        nic: editForm.nic,
        departmentId: editForm.departmentId || undefined,
        ...(leaveManagerAlone ? {} : { supervisorId: editForm.supervisorId || null }),
      })
      setShowEditModal(false); setEditingPersonnel(null); await load()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Error') }
    setSaving(false)
  }

  // Moving across levels re-opens the reporting line, so the modal asks for a
  // manager at the destination level before it will save.
  const moveTargetLevel = levelOfDept(moveTarget)
  const moveChangesLevel = !!movingPersonnel && moveTargetLevel !== undefined
    && moveTargetLevel !== levelOfPerson(movingPersonnel)
  const moveNeedsManager = fourLevel && moveChangesLevel && moveTargetLevel !== undefined && levelNeedsManager(moveTargetLevel)

  const movePersonnel = async () => {
    if (!movingPersonnel || !moveTarget) return
    if (moveNeedsManager && !moveSupervisorId) return
    setSaving(true)
    try {
      await workspaceApi.movePersonnel(movingPersonnel.id, {
        departmentId: moveTarget,
        ...(moveNeedsManager ? { supervisorId: moveSupervisorId } : {}),
      })
      setShowMoveModal(false); setMovingPersonnel(null); setMoveTarget(''); setMoveSupervisorId(''); await load()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Error') }
    setSaving(false)
  }

  // Manager candidates follow whichever level the open modal is working at.
  useEffect(() => { if (showPersonnelModal) loadManagers(personnelFormLevel) }, [showPersonnelModal, personnelFormLevel])
  useEffect(() => { if (showMoveModal) loadManagers(moveTargetLevel) }, [showMoveModal, moveTargetLevel])

  if (loading) return <div className="p-8 text-tw-text-secondary text-sm">Loading hierarchy...</div>

  const layerColors = ['bg-blue-500', 'bg-indigo-500', 'bg-purple-500', 'bg-teal-500']

  // Levels 2 and 3 list their departments under Head Office and Provincial
  // headings; every other level is a single ungrouped list.
  const groupDepartments = (layer: Layer): Array<{ key: string; label: string | null; departments: Department[] }> => {
    const depts = layer.departments || []
    if (!fourLevel || !levelTakesCategory(layer.number)) return [{ key: 'all', label: null, departments: depts }]
    return [
      ...OFFICE_CATEGORY_OPTIONS.map(o => ({ key: o.value, label: o.label, departments: depts.filter(d => d.officeCategory === o.value) })),
      { key: 'untagged', label: 'Not categorised', departments: depts.filter(d => !d.officeCategory) },
    ].filter(g => g.departments.length > 0)
  }

  const localPhonePreview = personnelForm.phone.replace(/\D/g, '').replace(/^94/, '0').replace(/^([^0])/, '0$1').slice(0, 10)
  const loginPreview = personnelForm.phone ? `${user.companyPrefix || ''}${localPhonePreview}` : `${user.companyPrefix || ''}0712345678`

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-tw-text">Team Hierarchy</h1>
        <p className="text-sm text-tw-text-secondary mt-0.5 mb-4">Manage {word.toLowerCase()}s, departments and personnel</p>
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

      {unmanaged.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <strong>{unmanaged.length}</strong> {unmanaged.length === 1 ? 'user has' : 'users have'} no reporting manager.
          Their approvals escalate straight to the Director until one is set.
          <button className="ml-2 underline" onClick={() => setActiveTab('personnel')}>Review</button>
        </div>
      )}

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
                <div className="px-4 py-4 text-sm text-tw-text-secondary italic">No departments in this {word.toLowerCase()} yet.</div>
              ) : (
                <div className="divide-y divide-tw-border">
                  {groupDepartments(layer).map(group => (
                    <div key={group.key}>
                      {group.label && (
                        <div className="px-4 py-1.5 bg-tw-hover text-[11px] font-semibold uppercase tracking-wide text-tw-text-secondary">
                          {group.label}
                        </div>
                      )}
                      <div className="divide-y divide-tw-border">
                        {group.departments.map(dept => {
                          const deptPersonnel = allPersonnel.filter(p => p.departmentId === dept.id)
                          return (
                            <div key={dept.id} className="px-4 py-3">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full bg-tw-primary" />
                                  <span className="font-medium text-sm text-tw-text">{dept.name}</span>
                                  <span className="badge badge-gray">{deptPersonnel.length} people</span>
                                  {fourLevel && levelTakesCategory(layer.number) && !dept.officeCategory && (
                                    <span className="badge bg-amber-100 text-amber-800">Not categorised</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-3">
                                  <button onClick={() => openDeptEdit(dept)} className="text-xs text-tw-text-secondary hover:text-tw-primary transition-colors">Edit</button>
                                  <button onClick={() => deleteDept(dept.id)} className="text-xs text-tw-text-secondary hover:text-tw-danger transition-colors">Delete</button>
                                </div>
                              </div>
                              {deptPersonnel.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-2">
                                  {deptPersonnel.map(p => (
                                    <div key={p.id} className="flex items-center gap-1.5 bg-tw-hover px-2.5 py-1 rounded-full">
                                      <div className="w-5 h-5 rounded-full bg-tw-primary flex items-center justify-center text-white text-xs font-bold">
                                        {p.name.charAt(0).toUpperCase()}
                                      </div>
                                      <span className="text-xs text-tw-text">{p.name}</span>
                                      {needsManager(user, layer.number, p.supervisorId) && (
                                        <span className="text-xs text-amber-600" title="No reporting manager">⚠</span>
                                      )}
                                      <button onClick={() => { setMovingPersonnel(p); setShowMoveModal(true) }} className="text-xs text-tw-text-secondary hover:text-tw-primary ml-1" title="Move">⇄</button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
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
          fourLevel={fourLevel}
        />
      )}

      {/* MODAL: Create Department */}
      {showDeptModal && (
        <Modal title="Create Department" onClose={() => setShowDeptModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-tw-text mb-1">{word}</label>
              <Select
                value={deptForm.layerId}
                onChange={val => setDeptForm(f => ({ ...f, layerId: val, officeCategory: '' }))}
                placeholder={`Select ${word.toLowerCase()}...`}
                options={layers.map(l => ({ value: l.id, label: l.name }))}
              />
            </div>
            {deptFormNeedsCategory && (
              <div>
                <label className="block text-sm font-medium text-tw-text mb-1">Category <span className="text-tw-danger">*</span></label>
                <div className="grid grid-cols-2 gap-2">
                  {OFFICE_CATEGORY_OPTIONS.map(option => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setDeptForm(f => ({ ...f, officeCategory: option.value }))}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                        deptForm.officeCategory === option.value
                          ? 'border-tw-primary bg-tw-primary/10 text-tw-primary'
                          : 'border-tw-border text-tw-text-secondary hover:border-tw-primary/40'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-tw-text-secondary mt-1">
                  Head Office and Provincial hold the same permissions and see the same data.
                </p>
              </div>
            )}
            {fourLevel && deptFormLevel === 4 && (
              <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                Level 4 departments are job roles — Doctors, Engineers, and so on — shared across Head Office and Provincial.
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-tw-text mb-1">Department Name</label>
              <input className="input" placeholder={fourLevel && deptFormLevel === 4 ? 'e.g. Doctors' : 'e.g. Engineering'} value={deptForm.name} onChange={e => setDeptForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowDeptModal(false)} className="btn-secondary">Cancel</button>
              <button
                onClick={createDept}
                disabled={saving || !deptForm.name || !deptForm.layerId || (deptFormNeedsCategory && !deptForm.officeCategory)}
                className="btn-primary"
              >{saving ? 'Creating...' : 'Create'}</button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL: Edit Department */}
      {editingDept && (() => {
        const level = levelOfDept(editingDept.id)
        const takesCategory = fourLevel && level !== undefined && levelTakesCategory(level)
        const memberCount = allPersonnel.filter(p => p.departmentId === editingDept.id).length
        const changing = takesCategory && deptEditForm.officeCategory !== (editingDept.officeCategory || '')
        return (
          <Modal title={`Edit ${editingDept.name}`} onClose={() => setEditingDept(null)}>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-tw-text mb-1">Department Name</label>
                <input className="input" value={deptEditForm.name} onChange={e => setDeptEditForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              {takesCategory && (
                <div>
                  <label className="block text-sm font-medium text-tw-text mb-1">Category <span className="text-tw-danger">*</span></label>
                  <div className="grid grid-cols-2 gap-2">
                    {OFFICE_CATEGORY_OPTIONS.map(option => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setDeptEditForm(f => ({ ...f, officeCategory: option.value }))}
                        className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                          deptEditForm.officeCategory === option.value
                            ? 'border-tw-primary bg-tw-primary/10 text-tw-primary'
                            : 'border-tw-border text-tw-text-secondary hover:border-tw-primary/40'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  {changing && memberCount > 0 && (
                    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      {memberCount} {memberCount === 1 ? 'person moves' : 'people move'} to {officeCategoryLabel(deptEditForm.officeCategory)} with this department.
                      Permissions and data access do not change.
                    </div>
                  )}
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <button onClick={() => setEditingDept(null)} className="btn-secondary">Cancel</button>
                <button
                  onClick={saveDeptEdit}
                  disabled={saving || !deptEditForm.name || (takesCategory && !deptEditForm.officeCategory)}
                  className="btn-primary"
                >{saving ? 'Saving...' : 'Save Changes'}</button>
              </div>
            </div>
          </Modal>
        )
      })()}

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
              <p className="text-xs text-tw-text-secondary mt-0.5">Login ID preview: <span className="font-mono font-semibold text-tw-primary">{loginPreview}</span></p>
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
              <label className="block text-sm font-medium text-tw-text mb-1">Temporary Password</label>
              <input className="input" type="password" placeholder="Leave blank to generate securely" value={personnelForm.password} onChange={e => setPersonnelForm(f => ({ ...f, password: e.target.value }))} />
              <p className="text-xs text-tw-text-secondary mt-1">
                Leave blank to generate a unique temporary password. It will be shown once after creation.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm text-tw-text">
              <input type="checkbox" checked={personnelForm.isActive} onChange={e => setPersonnelForm(f => ({ ...f, isActive: e.target.checked }))} />
              Active user
            </label>
            {fourLevel ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-tw-text mb-1">{word} <span className="text-tw-danger">*</span></label>
                  <Select
                    value={personnelForm.layerId}
                    onChange={val => setPersonnelForm(f => ({ ...f, layerId: val, officeCategory: '', departmentId: '', supervisorId: '' }))}
                    placeholder={`Select ${word.toLowerCase()}...`}
                    options={layers.map(l => ({ value: l.id, label: l.name }))}
                  />
                </div>

                {personnelNeedsCategory && (
                  <div>
                    <label className="block text-sm font-medium text-tw-text mb-1">Category <span className="text-tw-danger">*</span></label>
                    <div className="grid grid-cols-2 gap-2">
                      {OFFICE_CATEGORY_OPTIONS.map(option => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setPersonnelForm(f => ({ ...f, officeCategory: option.value, departmentId: '', supervisorId: '' }))}
                          className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                            personnelForm.officeCategory === option.value
                              ? 'border-tw-primary bg-tw-primary/10 text-tw-primary'
                              : 'border-tw-border text-tw-text-secondary hover:border-tw-primary/40'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {personnelForm.layerId && (!personnelNeedsCategory || personnelForm.officeCategory) && (
                  <div>
                    <label className="block text-sm font-medium text-tw-text mb-1">Department <span className="text-tw-danger">*</span></label>
                    <Select
                      value={personnelForm.departmentId}
                      onChange={val => setPersonnelForm(f => ({ ...f, departmentId: val }))}
                      placeholder="Select department..."
                      options={personnelDeptOptions}
                    />
                    {personnelDeptOptions.length === 0 && (
                      <p className="text-xs text-amber-700 mt-1">
                        No matching departments yet — create one first.
                      </p>
                    )}
                  </div>
                )}

                {personnelNeedsManager && personnelFormLevel !== undefined && (
                  <div>
                    <label className="block text-sm font-medium text-tw-text mb-1">
                      Reporting manager <span className="text-tw-danger">*</span>
                    </label>
                    <Select
                      value={personnelForm.supervisorId}
                      onChange={val => setPersonnelForm(f => ({ ...f, supervisorId: val }))}
                      placeholder={`Select a level ${personnelFormLevel - 1} manager...`}
                      options={managerOptions(personnelForm.officeCategory || null)}
                    />
                    {personnelForm.officeCategory && managers.some(m => m.department.officeCategory !== personnelForm.officeCategory) && (
                      <button
                        type="button"
                        className="mt-1 text-xs text-tw-text-secondary underline"
                        onClick={() => setShowAllManagers(v => !v)}
                      >
                        {showAllManagers
                          ? `Show only ${officeCategoryLabel(personnelForm.officeCategory)} managers`
                          : 'Show managers from every category'}
                      </button>
                    )}
                    {managers.length === 0 && (
                      <p className="text-xs text-amber-700 mt-1">
                        No level {personnelFormLevel - 1} users exist yet — create one before adding this user.
                      </p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div>
                <label className="block text-sm font-medium text-tw-text mb-1">Department <span className="text-tw-danger">*</span></label>
                <Select
                  value={personnelForm.departmentId}
                  onChange={val => setPersonnelForm(f => ({ ...f, departmentId: val }))}
                  placeholder="Select department..."
                  options={layers.flatMap(l => (l.departments || []).map(d => ({ value: d.id, label: d.name, group: l.name })))}
                />
              </div>
            )}
            <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
              <p className="text-xs text-blue-700">
                <strong>Login ID:</strong> The backend generates the login ID from the company prefix and normalized phone number.
              </p>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowPersonnelModal(false)} className="btn-secondary">Cancel</button>
              <button
                onClick={createPersonnel}
                disabled={
                  saving || !personnelForm.name || !personnelForm.phone || !personnelForm.departmentId
                  || (personnelNeedsCategory && !personnelForm.officeCategory)
                  || (personnelNeedsManager && !personnelForm.supervisorId)
                }
                className="btn-primary"
              >{saving ? 'Adding...' : 'Add Personnel'}</button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL: Newly created credentials */}
      {createdCredentials && (
        <Modal title="Personnel Account Created" onClose={() => setCreatedCredentials(null)}>
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3">
              <p className="text-sm font-semibold text-green-800">{createdCredentials.name} can now sign in.</p>
              <p className="text-xs text-green-700 mt-1">Share these credentials securely. The password is shown only on this screen.</p>
            </div>

            <CredentialRow
              label="Username / Login ID"
              value={createdCredentials.loginId}
              copied={copiedCredential === 'login'}
              onCopy={() => copyCredential('login')}
            />
            <CredentialRow
              label="Temporary Password"
              value={createdCredentials.temporaryPassword}
              copied={copiedCredential === 'password'}
              onCopy={() => copyCredential('password')}
            />

            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
              The user will be asked to change a system-generated password after their first login.
            </div>

            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
              <button onClick={() => setCreatedCredentials(null)} className="btn-secondary">Done</button>
              <button onClick={() => copyCredential('both')} className="btn-primary">
                {copiedCredential === 'both' ? 'Copied!' : 'Copy Username & Password'}
              </button>
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
              <label className="block text-sm font-medium text-tw-text mb-1">
                {managerRequiredFor(editingPersonnel) ? 'Reporting manager' : 'Supervisor'}
                {managerRequiredFor(editingPersonnel) && <span className="text-tw-danger"> *</span>}
              </label>
              <Select
                value={editForm.supervisorId}
                onChange={val => setEditForm(f => ({ ...f, supervisorId: val }))}
                placeholder={managerRequiredFor(editingPersonnel)
                  ? `Select a level ${(levelOfPerson(editingPersonnel) ?? 1) - 1} manager...`
                  : 'No supervisor set...'}
                options={supervisorOptionsFor(editingPersonnel)}
              />
              {managerRequiredFor(editingPersonnel) && !editForm.supervisorId && (
                <p className="text-xs text-amber-700 mt-1">
                  This user has no reporting manager, so their approvals go straight to the Director.
                </p>
              )}
              {editForm.supervisorId && !managerRequiredFor(editingPersonnel) && (
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
                  .map(d => ({
                    value: d.id,
                    label: d.name,
                    group: [l.name, officeCategoryLabel(d.officeCategory)].filter(Boolean).join(' · '),
                  }))
              )}
            />
            {moveNeedsManager && moveTargetLevel !== undefined && (
              <div>
                <label className="block text-sm font-medium text-tw-text mb-1">
                  Reporting manager <span className="text-tw-danger">*</span>
                </label>
                <p className="text-xs text-tw-text-secondary mb-1">
                  This move changes their level, so they need a level {moveTargetLevel - 1} manager.
                </p>
                <Select
                  value={moveSupervisorId}
                  onChange={val => setMoveSupervisorId(val)}
                  placeholder={`Select a level ${moveTargetLevel - 1} manager...`}
                  options={managerOptions(categoryOfDept(moveTarget))}
                />
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setShowMoveModal(false); setMovingPersonnel(null); setMoveSupervisorId('') }} className="btn-secondary">Cancel</button>
              <button onClick={movePersonnel} disabled={saving || !moveTarget || (moveNeedsManager && !moveSupervisorId)} className="btn-primary">{saving ? 'Moving...' : 'Move'}</button>
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
  /** True when this person's level is expected to have a reporting manager. */
  managerExpected: boolean
}

function PersonnelCard({ p, avatarColor, dept, supervisor, openEditModal, setMovingPersonnel, setShowMoveModal, deletePersonnel, managerExpected }: PersonnelCardProps) {
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
                  : managerExpected
                    ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-xs text-amber-600">⚠ Not set</span>
                    : <span className="text-xs text-tw-text-secondary">Director</span>
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
  fourLevel: boolean
}

function PersonnelTab({ allPersonnel, layers, allDepts, personnelSearch, setPersonnelSearch, openEditModal, setMovingPersonnel, setShowMoveModal, deletePersonnel, fourLevel }: PersonnelTabProps) {
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
  ) => {
  // Level 1 reports to the Director, and companies without the four-level
  // hierarchy never require a manager, so neither is flagged as missing one.
  const managerExpected = fourLevel && typeof badgeLabel === 'number' && levelNeedsManager(badgeLabel)
  return (
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
            managerExpected={managerExpected}
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
            {['Name', 'Contact', 'Department', fourLevel ? 'Reporting manager' : 'Supervisor', 'Actions'].map(h => (
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
                  {fourLevel && officeCategoryLabel(dept?.officeCategory) && (
                    <div className="text-[11px] text-tw-text-secondary mt-1">{officeCategoryLabel(dept?.officeCategory)}</div>
                  )}
                </td>
                <td className="px-4 py-3">
                  {supervisor
                    ? <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-teal-50 border border-teal-200 text-xs text-teal-700">
                        <div className="w-4 h-4 rounded-full bg-[#00a693] flex items-center justify-center text-white text-xs font-bold">{supervisor.name.charAt(0)}</div>
                        {supervisor.name}
                      </span>
                    : managerExpected
                      ? <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-xs text-amber-600"><span>⚠</span> Not set</span>
                      : <span className="text-xs text-tw-text-secondary">Director</span>}
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
  }

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
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-panel w-full max-w-md max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)] flex flex-col my-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-tw-border flex-shrink-0">
          <h3 className="font-semibold text-tw-text">{title}</h3>
          <button onClick={onClose} className="text-tw-text-secondary hover:text-tw-text text-xl leading-none">×</button>
        </div>
        <div className="px-5 py-4 overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>
  )
}

function CredentialRow({ label, value, copied, onCopy }: { label: string; value: string; copied: boolean; onCopy: () => void }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-tw-text-secondary mb-1.5 uppercase tracking-wide">{label}</label>
      <div className="flex items-stretch gap-2">
        <div className="min-w-0 flex-1 bg-tw-hover border border-tw-border rounded-lg px-3 py-2.5 font-mono font-bold text-sm text-tw-text break-all select-all">
          {value}
        </div>
        <button type="button" onClick={onCopy} className="btn-secondary px-3 text-xs flex-shrink-0">
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  )
}
