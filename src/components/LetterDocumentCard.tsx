import React from 'react'
import type { LetterFile } from '../services/letterService'
import { useLanguage } from '../i18n/Language'

export default function LetterDocumentCard({ file, onPreview, onDownload, onRetry }: {
  file: LetterFile
  onPreview: () => void
  onDownload: () => void
  onRetry?: () => void
}) {
  const { t: tr } = useLanguage()
  const state = ({
    READY: { label: tr('Saved to Drive'), tone: 'bg-emerald-500' },
    PENDING: { label: tr('Queued for Drive'), tone: 'bg-amber-400' },
    PROCESSING: { label: tr('Uploading to Drive'), tone: 'bg-amber-400 animate-pulse' },
    BLOCKED: { label: tr('Waiting for Drive'), tone: 'bg-slate-400' },
    FAILED: { label: tr('Drive upload failed'), tone: 'bg-red-500' },
  } as Record<string, { label: string; tone: string }>)[file.uploadState]
    || { label: file.uploadState, tone: 'bg-slate-400' }
  const pdf = file.mime === 'application/pdf'
  const size = file.size >= 1048576 ? `${(file.size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`
  const action = 'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tw-primary'
  return <div className="min-w-0 rounded-xl border border-tw-border bg-tw-surface p-3.5 hover:border-tw-border-strong transition-colors" data-letter-document>
    <div className="flex items-start gap-3">
      <span aria-hidden="true" className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[10px] font-bold uppercase ${pdf ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-700'}`}>
        {pdf ? 'PDF' : file.mime.split('/')[1]?.slice(0, 4)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-5 [overflow-wrap:anywhere]">{file.name}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-tw-text-secondary">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${state.tone}`} />
            {state.label}
          </span>
          <span className="whitespace-nowrap">{size}</span>
        </div>
        {(file.uploadError || file.previewError) && <p className="mt-1.5 text-xs text-amber-800 [overflow-wrap:anywhere]">{file.uploadError || file.previewError}</p>}
      </div>
    </div>
    <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
      {file.previewState === 'READY' && <button className={`${action} bg-blue-50 text-tw-primary hover:bg-blue-100`} onClick={onPreview}>
        <svg aria-hidden="true" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>
        {tr('Preview')}<span className="sr-only"> {file.name}</span>
      </button>}
      <button className={`${action} bg-slate-50 text-slate-700 hover:bg-slate-100`} onClick={onDownload}>
        <svg aria-hidden="true" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4"/></svg>
        {tr('Download')}<span className="sr-only"> {file.name}</span>
      </button>
      {onRetry && <button className={`${action} bg-amber-50 text-amber-800 hover:bg-amber-100`} onClick={onRetry}>{tr('Retry')}<span className="sr-only"> {file.name}</span></button>}
    </div>
  </div>
}
