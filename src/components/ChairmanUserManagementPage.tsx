import React, { useEffect, useMemo, useState } from 'react'
import { workspaceApi } from '../services/apiService'

interface ManagedUser {
  id: string
  name: string
  loginId: string | null
  phone: string
  email: string | null
  nic: string | null
  isActive: boolean
  mustChangePassword: boolean
  createdAt: string
  department: {
    id: string
    name: string
    layer: { number: number; name: string }
  }
}

interface ResetResult {
  user: { id: string; name: string; loginId: string }
  temporaryPassword: string
}

function initials(name: string) {
  return name.split(' ').map(part => part[0]).join('').toUpperCase().slice(0, 2)
}

export default function ChairmanUserManagementPage() {
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<ManagedUser | null>(null)
  const [resetting, setResetting] = useState(false)
  const [result, setResult] = useState<ResetResult | null>(null)
  const [copied, setCopied] = useState(false)

  const loadUsers = () => {
    setLoading(true); setError('')
    workspaceApi.getManagedUsers()
      .then(data => setUsers(data as ManagedUser[]))
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load users'))
      .finally(() => setLoading(false))
  }

  useEffect(loadUsers, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return users
    return users.filter(user => [
      user.name,
      user.loginId,
      user.phone,
      user.email,
      user.nic,
      user.department.name,
    ].some(value => value?.toLowerCase().includes(q)))
  }, [users, search])

  const resetPassword = async () => {
    if (!selected) return
    setResetting(true); setError('')
    try {
      const response = await workspaceApi.resetManagedUserPassword(selected.id)
      setResult({ user: response.user, temporaryPassword: response.temporaryPassword })
      setUsers(current => current.map(user => user.id === selected.id ? { ...user, mustChangePassword: true } : user))
      setSelected(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password')
    } finally { setResetting(false) }
  }

  const copyCredentials = async () => {
    if (!result) return
    await navigator.clipboard.writeText(`TaskWise Login ID: ${result.user.loginId}\nTemporary Password: ${result.temporaryPassword}`)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  const activeCount = users.filter(user => user.isActive).length
  const forcedChangeCount = users.filter(user => user.mustChangePassword).length

  if (loading) return <div className="flex h-48 items-center justify-center text-sm text-tw-text-secondary">Loading users…</div>

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-tw-text">User Management</h1>
        <p className="text-sm text-tw-text-secondary mt-0.5">Manage personnel accounts in your company.</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="card px-4 py-3">
          <div className="text-xs text-tw-text-secondary">Total users</div>
          <div className="text-2xl font-bold text-tw-primary mt-1">{users.length}</div>
        </div>
        <div className="card px-4 py-3">
          <div className="text-xs text-tw-text-secondary">Active</div>
          <div className="text-2xl font-bold text-emerald-600 mt-1">{activeCount}</div>
        </div>
        <div className="card px-4 py-3">
          <div className="text-xs text-tw-text-secondary">Password change due</div>
          <div className="text-2xl font-bold text-amber-600 mt-1">{forcedChangeCount}</div>
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-tw-danger">{error}</div>}

      <div className="card overflow-hidden">
        <div className="border-b border-tw-border px-4 py-3 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-tw-text-secondary">🔎</span>
            <input
              className="input pl-9 text-sm"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search name, login ID, phone, NIC, or department…"
              autoFocus
            />
          </div>
          <div className="text-xs text-tw-text-secondary">{filtered.length} user{filtered.length !== 1 ? 's' : ''}</div>
        </div>

        <div className="sm:hidden divide-y divide-tw-border">
          {filtered.map(user => (
            <div key={user.id} className="p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-tw-primary/10 text-tw-primary font-bold text-sm flex items-center justify-center flex-shrink-0">{initials(user.name)}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-tw-text truncate">{user.name}</div>
                  <div className="text-xs text-tw-text-secondary truncate">{user.department.name}</div>
                  <div className="text-xs font-mono text-tw-primary mt-1 truncate">{user.loginId || user.phone}</div>
                </div>
                <span className={`text-[10px] font-semibold rounded-full px-2 py-1 ${user.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                  {user.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
              {user.mustChangePassword && <div className="mt-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5">Password change required at next login</div>}
              <button type="button" onClick={() => setSelected(user)} className="btn-secondary w-full mt-3 text-sm">Reset password</button>
            </div>
          ))}
        </div>

        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#f0f4ff] border-b-2 border-tw-primary/20">
                {['User', 'Login ID', 'Department', 'Contact', 'Status', 'Password'].map(label => (
                  <th key={label} className="text-left px-4 py-3 text-xs font-bold text-tw-primary uppercase tracking-wider whitespace-nowrap">{label}</th>
                ))}
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-tw-border">
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="py-10 text-center text-tw-text-secondary">No users found</td></tr>
              ) : filtered.map(user => (
                <tr key={user.id} className="hover:bg-tw-hover">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-tw-primary/10 text-tw-primary font-bold text-xs flex items-center justify-center flex-shrink-0">{initials(user.name)}</div>
                      <div>
                        <div className="font-medium text-tw-text">{user.name}</div>
                        {user.nic && <div className="text-[11px] text-tw-text-secondary">NIC {user.nic}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-tw-primary whitespace-nowrap">{user.loginId || user.phone}</td>
                  <td className="px-4 py-3 text-xs text-tw-text-secondary">{user.department.name}</td>
                  <td className="px-4 py-3 text-xs text-tw-text-secondary">
                    <div>{user.phone}</div>
                    {user.email && <div className="max-w-[180px] truncate">{user.email}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold rounded-full px-2 py-1 ${user.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                      {user.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {user.mustChangePassword
                      ? <span className="text-amber-700 font-semibold">Change required</span>
                      : <span className="text-tw-text-secondary">Set by user</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" onClick={() => setSelected(user)} className="btn-secondary text-xs whitespace-nowrap">Reset password</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !resetting && setSelected(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5" onClick={event => event.stopPropagation()}>
            <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center text-2xl mb-4">🔑</div>
            <h2 className="text-lg font-bold text-tw-text">Reset {selected.name}’s password?</h2>
            <p className="text-sm text-tw-text-secondary mt-2">
              Their temporary password will become <strong className="font-mono text-tw-text">Youth@123</strong>. After signing in, they must create a new private password before accessing TaskWise.
            </p>
            <div className="mt-3 rounded-xl bg-tw-hover px-3 py-2 text-sm">
              <span className="text-tw-text-secondary">Login ID: </span>
              <strong className="font-mono text-tw-text">{selected.loginId || selected.phone}</strong>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" className="btn-secondary text-sm" disabled={resetting} onClick={() => setSelected(null)}>Cancel</button>
              <button type="button" className="rounded-lg bg-amber-500 text-white px-4 py-2 text-sm font-semibold disabled:opacity-60" disabled={resetting} onClick={resetPassword}>
                {resetting ? 'Resetting…' : 'Reset password'}
              </button>
            </div>
          </div>
        </div>
      )}

      {result && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center text-2xl mb-4">✓</div>
            <h2 className="text-lg font-bold text-tw-text">Password reset complete</h2>
            <p className="text-sm text-tw-text-secondary mt-1">Share these temporary credentials securely with {result.user.name}.</p>
            <div className="mt-4 rounded-xl border border-tw-border overflow-hidden">
              <div className="px-3 py-2.5 border-b border-tw-border">
                <div className="text-[11px] uppercase font-semibold text-tw-text-secondary">Login ID</div>
                <div className="font-mono font-bold text-tw-text mt-0.5 break-all">{result.user.loginId}</div>
              </div>
              <div className="px-3 py-2.5 bg-amber-50">
                <div className="text-[11px] uppercase font-semibold text-amber-700">Temporary password</div>
                <div className="font-mono font-bold text-amber-800 mt-0.5">{result.temporaryPassword}</div>
              </div>
            </div>
            <div className="rounded-xl bg-blue-50 text-blue-700 text-xs px-3 py-2.5 mt-3">The user must change this password immediately after signing in.</div>
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" className="btn-secondary text-sm" onClick={copyCredentials}>{copied ? 'Copied!' : 'Copy credentials'}</button>
              <button type="button" className="btn-primary text-sm" onClick={() => { setResult(null); setCopied(false) }}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
