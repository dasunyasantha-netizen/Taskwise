import React, { useEffect, useMemo, useState } from 'react'
import { adminFeatureApi, type CompanyFeatureRow, type FeatureCatalogEntry } from '../services/apiService'

/**
 * System Administrator screen for granting and revoking company features.
 *
 * Features are opt-in: a company starts with none, and each toggle takes effect
 * on that company's next request — no redeploy, no migration.
 */
export default function CompanyFeaturesPage() {
  const [catalog, setCatalog] = useState<FeatureCatalogEntry[]>([])
  const [companies, setCompanies] = useState<CompanyFeatureRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [pending, setPending] = useState<string | null>(null)

  const load = async () => {
    setLoading(true); setError('')
    try {
      const data = await adminFeatureApi.list()
      setCatalog(data.catalog); setCompanies(data.companies)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load companies')
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return companies
    return companies.filter(c => [c.name, c.legalName, c.prefix].some(v => v?.toLowerCase().includes(q)))
  }, [companies, search])

  const toggle = async (company: CompanyFeatureRow, feature: FeatureCatalogEntry) => {
    const next = !company.features[feature.key]?.enabled
    if (!next && !confirm(`Turn off ${feature.name} for ${company.name}? Anyone using it loses access immediately.`)) return
    const token = `${company.id}:${feature.key}`
    setPending(token); setError('')
    // Optimistic: the row flips straight away and is rolled back if the call fails.
    const previous = companies
    setCompanies(cs => cs.map(c => c.id === company.id
      ? { ...c, features: { ...c.features, [feature.key]: { enabled: next, updatedAt: new Date().toISOString() } } }
      : c))
    try {
      await adminFeatureApi.set(company.id, feature.key, next)
    } catch (e: unknown) {
      setCompanies(previous)
      setError(e instanceof Error ? e.message : 'Failed to update feature')
    }
    setPending(null)
  }

  if (loading) return <div className="flex h-48 items-center justify-center text-sm text-tw-text-secondary">Loading companies…</div>

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-tw-text">Company Features</h1>
        <p className="text-sm text-tw-text-secondary mt-0.5">
          Grant optional modules to individual companies. Changes apply on the company's next request.
        </p>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-tw-danger">{error}</div>}

      <div className="grid gap-3 sm:grid-cols-2">
        {catalog.map(feature => (
          <div key={feature.key} className="card px-4 py-3">
            <div className="flex items-baseline justify-between gap-2">
              <div className="font-semibold text-sm text-tw-text">{feature.name}</div>
              <div className="text-xs text-tw-text-secondary">
                {companies.filter(c => c.features[feature.key]?.enabled).length} of {companies.length}
              </div>
            </div>
            <p className="text-xs text-tw-text-secondary mt-1">{feature.description}</p>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-tw-border px-4 py-3">
          <div className="relative max-w-md">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-tw-text-secondary">🔎</span>
            <input
              className="input pl-9 text-sm"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search company name or prefix…"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-tw-text-secondary">No companies match that search.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-tw-hover border-b border-tw-border">
                  <th className="text-left px-4 py-2 text-xs font-semibold text-tw-text-secondary uppercase tracking-wider">Company</th>
                  {catalog.map(f => (
                    <th key={f.key} className="text-left px-4 py-2 text-xs font-semibold text-tw-text-secondary uppercase tracking-wider whitespace-nowrap">
                      {f.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-tw-border">
                {filtered.map(company => (
                  <tr key={company.id} className="hover:bg-[#f8f9ff] transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-tw-text">{company.name}</div>
                      <div className="text-xs text-tw-text-secondary">
                        {company.prefix}
                        {company.status !== 'ACTIVE' && <span className="ml-2 badge badge-gray">{company.status}</span>}
                        {!company.hasWorkspace && <span className="ml-2 badge bg-amber-100 text-amber-800">No workspace</span>}
                      </div>
                    </td>
                    {catalog.map(feature => {
                      const enabled = company.features[feature.key]?.enabled === true
                      const busy = pending === `${company.id}:${feature.key}`
                      return (
                        <td key={feature.key} className="px-4 py-3">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={enabled}
                            aria-label={`${feature.name} for ${company.name}`}
                            disabled={busy}
                            onClick={() => toggle(company, feature)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                              enabled ? 'bg-tw-primary' : 'bg-gray-300'
                            }`}
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                              enabled ? 'translate-x-6' : 'translate-x-1'
                            }`} />
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
