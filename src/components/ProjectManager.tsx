import React, { useState, useEffect } from 'react'
import type { Project } from '../types'
import { projectApi } from '../services/apiService'

interface Props {
  onSelectProject: (project: Project) => void
}

const PROJECT_COLORS = ['#0073ea', '#00c875', '#e2445c', '#fdab3d', '#a358df', '#037f4c', '#bb3354', '#0086c0']

export default function ProjectManager({ onSelectProject }: Props) {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', color: '#0073ea' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    try { setProjects(await projectApi.list() as Project[]) }
    catch { setError('Failed to load projects') }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const create = async () => {
    if (!form.name) return
    setSaving(true)
    try {
      await projectApi.create(form)
      setShowModal(false); setForm({ name: '', description: '', color: '#0073ea' }); await load()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Error') }
    setSaving(false)
  }

  const archive = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Archive this project?')) return
    await projectApi.update(id, { status: 'archived' }); await load()
  }

  const active = projects.filter(p => p.status === 'active')
  const archived = projects.filter(p => p.status === 'archived')

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-tw-text">Projects</h1>
          <p className="text-sm text-tw-text-secondary mt-0.5">{active.length} active project{active.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary">+ New Project</button>
      </div>

      {error && <div className="mb-4 bg-red-50 border border-red-200 text-tw-danger text-sm px-3 py-2 rounded-lg">{error}</div>}

      {loading ? (
        <div className="text-sm text-tw-text-secondary">Loading projects...</div>
      ) : (
        <>
          {active.length === 0 && archived.length === 0 ? (
            <div className="card p-12 text-center">
              <div className="text-4xl mb-4">📋</div>
              <p className="text-tw-text font-semibold mb-1">No projects yet</p>
              <p className="text-tw-text-secondary text-sm mb-4">Create your first project to start assigning tasks.</p>
              <button onClick={() => setShowModal(true)} className="btn-primary">Create Project</button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                {active.map(p => (
                  <div key={p.id} onClick={() => onSelectProject(p)}
                    className="card p-4 cursor-pointer hover:shadow-panel transition-shadow group">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                        <span className="font-semibold text-tw-text text-sm">{p.name}</span>
                      </div>
                      <button onClick={e => archive(p.id, e)}
                        className="text-xs text-tw-text-secondary opacity-0 group-hover:opacity-100 hover:text-tw-danger transition-all">
                        Archive
                      </button>
                    </div>
                    {p.description && <p className="text-xs text-tw-text-secondary mb-3 line-clamp-2">{p.description}</p>}
                    <div className="flex items-center justify-between">
                      <span className="badge badge-success">Active</span>
                      <span className="text-xs text-tw-text-secondary">{new Date(p.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>

              {archived.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-tw-text-secondary uppercase tracking-wide mb-3">Archived</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {archived.map(p => (
                      <div key={p.id} className="card p-4 opacity-60">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
                          <span className="font-medium text-tw-text text-sm">{p.name}</span>
                        </div>
                        <span className="badge badge-gray">Archived</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-panel w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-tw-border">
              <h3 className="font-semibold text-tw-text">New Project</h3>
              <button onClick={() => setShowModal(false)} className="text-tw-text-secondary hover:text-tw-text text-xl">×</button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-tw-text mb-1">Project Name</label>
                <input className="input" placeholder="e.g. Website Redesign" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-tw-text mb-1">Description (optional)</label>
                <textarea className="input resize-none" rows={2} placeholder="Brief description..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-tw-text mb-2">Color</label>
                <div className="flex gap-2">
                  {PROJECT_COLORS.map(c => (
                    <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                      className={`w-7 h-7 rounded-full transition-transform ${form.color === c ? 'ring-2 ring-offset-1 ring-tw-text scale-110' : 'hover:scale-105'}`}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
              <div className="flex gap-2 justify-end pt-1">
                <button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
                <button onClick={create} disabled={saving || !form.name} className="btn-primary">{saving ? 'Creating...' : 'Create Project'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
