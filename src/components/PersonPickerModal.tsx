import React, { useState, useEffect, useRef } from 'react'
import type { Personnel, Layer } from '../types'

interface Props {
  personnel: Personnel[]
  layers: Layer[]
  title?: string
  onSelect: (person: Personnel) => void
  onClose: () => void
}

export default function PersonPickerModal({ personnel, layers, title = 'Select Person', onSelect, onClose }: Props) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const allDepts = layers.flatMap(l => l.departments ?? [])

  const getLayerNumber = (p: Personnel) => {
    const dept = allDepts.find(d => d.id === p.departmentId)
    return layers.find(l => l.departments?.some(d => d.id === dept?.id))?.number ?? null
  }

  const getDeptName = (p: Personnel) => allDepts.find(d => d.id === p.departmentId)?.name ?? '—'

  const q = query.trim().toLowerCase()
  const filtered = q
    ? personnel.filter(p =>
        p.name.toLowerCase().includes(q) ||
        getDeptName(p).toLowerCase().includes(q) ||
        (p.phone ?? '').includes(q) ||
        (p.email ?? '').toLowerCase().includes(q)
      )
    : personnel

  // Group by layer number for display
  const grouped: Record<number, Personnel[]> = {}
  for (const p of filtered) {
    const ln = getLayerNumber(p) ?? 0
    if (!grouped[ln]) grouped[ln] = []
    grouped[ln].push(p)
  }
  const layerNums = Object.keys(grouped).map(Number).sort()

  const layerLabel: Record<number, string> = {}
  for (const l of layers) layerLabel[l.number] = l.name

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col" style={{ maxHeight: '80vh' }}>

        {/* Header */}
        <div className="px-5 py-4 border-b border-tw-border flex items-center justify-between">
          <h3 className="font-semibold text-tw-text">{title}</h3>
          <button onClick={onClose} className="text-tw-text-secondary hover:text-tw-text text-xl leading-none">×</button>
        </div>

        {/* Search */}
        <div className="px-4 pt-3 pb-2">
          <div className="flex items-center gap-2 border border-tw-border rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-tw-primary focus-within:border-tw-primary transition-all">
            <svg className="w-4 h-4 text-tw-text-secondary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              ref={inputRef}
              className="flex-1 text-sm outline-none bg-transparent placeholder-tw-text-secondary"
              placeholder="Search name, department, phone or email…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
            {query && (
              <button onClick={() => setQuery('')} className="text-tw-text-secondary hover:text-tw-text">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          <p className="text-xs text-tw-text-secondary mt-1.5 px-1">
            {filtered.length} of {personnel.length} people
          </p>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
          {filtered.length === 0 && (
            <div className="text-center py-10 text-sm text-tw-text-secondary">No results for "{query}"</div>
          )}

          {layerNums.map(ln => (
            <div key={ln}>
              {!q && (
                <div className="text-xs font-semibold text-tw-text-secondary uppercase tracking-wide mb-2 pt-1">
                  {layerLabel[ln] ?? `Layer ${ln}`}
                </div>
              )}
              <div className="space-y-1">
                {grouped[ln].map(p => {
                  const dept = getDeptName(p)
                  const highlight = (text: string) => {
                    if (!q) return text
                    const idx = text.toLowerCase().indexOf(q)
                    if (idx === -1) return text
                    return <>{text.slice(0, idx)}<mark className="bg-yellow-100 text-tw-text rounded px-0.5">{text.slice(idx, idx + q.length)}</mark>{text.slice(idx + q.length)}</>
                  }
                  return (
                    <button
                      key={p.id}
                      onClick={() => { onSelect(p); onClose() }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-tw-hover text-left transition-colors group"
                    >
                      <div className="w-8 h-8 rounded-full bg-tw-primary flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-tw-text">{highlight(p.name)}</div>
                        <div className="text-xs text-tw-text-secondary truncate">
                          {highlight(dept)}
                          {p.phone && <> · {highlight(p.phone)}</>}
                          {p.email && <> · {highlight(p.email)}</>}
                        </div>
                      </div>
                      <svg className="w-4 h-4 text-tw-text-secondary opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
