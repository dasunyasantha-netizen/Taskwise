import React, { useState, useEffect, useRef } from 'react'

/**
 * Mobile-first progress update input.
 *
 * On mobile (< sm breakpoint):
 *   - Shows a compact "Add update…" trigger button
 *   - Tapping it opens a full bottom-sheet above the keyboard
 *   - Auto-growing textarea, always visible above keyboard
 *   - Submit button pinned to bottom of sheet
 *
 * On desktop (>= sm breakpoint):
 *   - Renders the standard inline textarea + button, unchanged
 */

interface Props {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  loading: boolean
  placeholder?: string
  label?: string
}

export default function ProgressUpdateSheet({
  value, onChange, onSubmit, loading,
  placeholder = 'What did you work on today?',
  label = 'Progress Update',
}: Props) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const sheetTextareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-focus sheet textarea when it opens
  useEffect(() => {
    if (sheetOpen) {
      setTimeout(() => sheetTextareaRef.current?.focus(), 80)
    }
  }, [sheetOpen])

  // Auto-grow inline desktop textarea
  const autoGrow = (el: HTMLTextAreaElement | null) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  const handleSubmit = () => {
    if (!value.trim() || loading) return
    onSubmit()
    setSheetOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() }
  }

  return (
    <>
      {/* ── Desktop: inline textarea ──────────────────────────────────── */}
      <div className="hidden sm:flex gap-2 items-end">
        <textarea
          ref={textareaRef}
          className="input flex-1 text-sm resize-none min-h-[2.5rem] overflow-hidden"
          rows={2}
          placeholder={placeholder}
          value={value}
          onChange={e => { onChange(e.target.value); autoGrow(e.target) }}
          onKeyDown={handleKeyDown}
        />
        <button
          onClick={handleSubmit}
          disabled={!value.trim() || loading}
          className="btn-primary text-sm px-4 py-2 h-fit flex-shrink-0 disabled:opacity-50"
        >
          {loading ? '…' : 'Add'}
        </button>
      </div>

      {/* ── Mobile: trigger + bottom sheet ───────────────────────────── */}
      <div className="sm:hidden">
        {/* Trigger button */}
        <button
          onClick={() => setSheetOpen(true)}
          className="w-full flex items-center gap-3 px-4 py-3 bg-white rounded-2xl border-2 border-dashed border-tw-primary/30 text-tw-primary/70 hover:border-tw-primary hover:text-tw-primary active:scale-[0.99] transition-all"
        >
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
          </svg>
          <span className="text-sm font-medium">
            {value.trim() ? `"${value.length > 40 ? value.slice(0, 40) + '…' : value}"` : `Add ${label.toLowerCase()}…`}
          </span>
          {value.trim() && (
            <span className="ml-auto text-xs bg-tw-primary/10 text-tw-primary font-semibold px-2 py-0.5 rounded-full">Draft</span>
          )}
        </button>

        {/* Bottom sheet */}
        {sheetOpen && (
          <div className="fixed inset-0 z-50 flex flex-col justify-end">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setSheetOpen(false)}
            />

            {/* Sheet */}
            <div
              className="relative bg-white rounded-t-3xl shadow-2xl flex flex-col"
              style={{ maxHeight: '80vh' }}
              onClick={e => e.stopPropagation()}
            >
              {/* Drag handle */}
              <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-tw-border flex-shrink-0">
                <div>
                  <h3 className="font-bold text-tw-text text-base">{label}</h3>
                  <p className="text-xs text-tw-text-secondary mt-0.5">Visible to your director</p>
                </div>
                <button
                  onClick={() => setSheetOpen(false)}
                  className="w-8 h-8 rounded-full bg-tw-hover flex items-center justify-center text-tw-text-secondary hover:text-tw-text transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              </div>

              {/* Textarea — scrollable within sheet */}
              <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">
                <textarea
                  ref={sheetTextareaRef}
                  className="w-full text-base text-tw-text bg-tw-hover/50 rounded-2xl px-4 py-3.5 resize-none focus:outline-none focus:ring-2 focus:ring-tw-primary/30 leading-relaxed"
                  rows={5}
                  placeholder={placeholder}
                  value={value}
                  onChange={e => onChange(e.target.value)}
                  style={{ minHeight: '8rem' }}
                />
                {value.trim() && (
                  <p className="text-xs text-tw-text-secondary mt-2 text-right">{value.length} characters</p>
                )}
              </div>

              {/* Submit — pinned to bottom, above keyboard */}
              <div
                className="flex-shrink-0 px-5 pb-6 pt-3 border-t border-tw-border bg-white"
                style={{ paddingBottom: `max(1.5rem, env(safe-area-inset-bottom))` }}
              >
                <div className="flex gap-3">
                  <button
                    onClick={() => setSheetOpen(false)}
                    className="flex-1 py-3.5 rounded-2xl border-2 border-gray-200 text-gray-600 font-bold text-sm active:opacity-80"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={!value.trim() || loading}
                    className="flex-1 py-3.5 rounded-2xl bg-tw-success text-white font-bold text-sm disabled:opacity-40 active:opacity-80 transition-opacity"
                  >
                    {loading ? 'Posting…' : 'Post Update'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
