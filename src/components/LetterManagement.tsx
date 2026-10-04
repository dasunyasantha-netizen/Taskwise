import React, { useState, useEffect, useRef } from 'react'
import {
  letters,
  Letter,
  LetterContext,
  LetterFile,
  LetterList,
  DriveSettings,
} from '../services/letterService'
import DatePicker from './DatePicker'
import Select from './Select'
import LetterDocumentCard from './LetterDocumentCard'
import type { AuthUser } from '../types'
import { LanguageToggle, useLanguage, displayDate, languageOf } from '../i18n/Language'
import { EmptyState } from './ui/Primitives'
import { Icon } from './ui/Icon'
const box = 'card p-4 sm:p-5'
const button = 'btn-primary min-h-[44px]'
const secondary = 'btn-secondary min-h-[44px]'
const timestamp = (value: string, locale = 'en-GB') =>
  displayDate(value, languageOf(locale), true)
const letterColumns =
  'grid-cols-[170px_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,0.8fr)_110px_64px_76px]'
const shortDate = (value: string, locale = 'en-GB') =>
  displayDate(value, languageOf(locale))
function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  const { t: tr, locale } = useLanguage()
  return (
    <label className="block text-sm font-medium text-tw-text space-y-1.5">
      <span>{tr(label)}</span>
      {children}
    </label>
  )
}
function Status({ closed }: { closed: boolean }) {
  const { t: tr, locale } = useLanguage()
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${closed ? 'bg-slate-100 text-slate-600' : 'bg-blue-50 text-tw-primary'}`}
    >
      {closed ? tr("Closed") : tr("Open")}
    </span>
  )
}
function Dialog({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  const { t: tr, locale } = useLanguage()
  const ref = useRef<HTMLDivElement>(null),
    closeRef = useRef(onClose),
    id = React.useId()
  closeRef.current = onClose
  useEffect(() => {
    const previous = document.activeElement as HTMLElement
    ref.current?.focus()
    const handler = (e: KeyboardEvent) => {
      if (document.querySelector('[data-system-picker]')) return
      if (e.key === 'Escape') closeRef.current()
      if (e.key === 'Tab') {
        const nodes = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]'
          ) || []
        )
        const first = nodes[0],
          last = nodes[nodes.length - 1]
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault()
          last?.focus()
        } else if (
          !e.shiftKey &&
          (document.activeElement === last ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault()
          first?.focus()
        }
      }
    }
    document.addEventListener('keydown', handler)
    return () => {
      document.removeEventListener('keydown', handler)
      previous?.focus()
    }
  }, [])
  return (
    <div className="fixed inset-0 z-[100] p-3 flex items-center justify-center bg-[#0b1220]/50 backdrop-blur-[3px] animate-fade-in">
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        className="modal-panel max-w-2xl max-h-[90dvh] overflow-y-auto overscroll-contain p-4 sm:p-6"
      >
        <div className="flex items-start justify-between gap-3 mb-5">
          <h2 id={id} className="text-xl font-bold tracking-tight">
            {tr(title)}
          </h2>
          <button
            type="button"
            className="icon-btn border-tw-border"
            onClick={onClose}
            aria-label={tr("Close dialog")}
          >
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
async function uploadData(files: File[]) {
  if (
    files.length > 4 ||
    files.some((f) => f.size > 4 * 1024 * 1024) ||
    files.reduce((a, f) => a + f.size, 0) > 8 * 1024 * 1024
  )
    throw new Error('Use up to 4 files, at most 4 MB each and 8 MB combined.')
  return Promise.all(
    files.map(
      (file) =>
        new Promise<{ name: string; base64: string }>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () =>
            resolve({
              name: file.name,
              base64: String(reader.result).split(',')[1],
            })
          reader.onerror = () =>
            reject(new Error('Could not read ' + file.name))
          reader.readAsDataURL(file)
        })
    )
  )
}
function LetterForm({
  kind,
  context,
  thread,
  onClose,
  onSaved,
}: {
  kind: string
  context: LetterContext
  thread?: Letter
  onClose: () => void
  onSaved: (id: string) => Promise<void>
}) {
  const { t: tr, locale } = useLanguage()
  const [form, setForm] = useState({
    subject: '',
    sender: '',
    senderContact: '',
    externalReference: '',
    channel: 'PHYSICAL',
    receivedDate: context.today,
    correspondenceDate: context.today,
    correspondent: thread?.sender || '',
    notes: '',
    personKey: kind === 'NEW' ? context.me.key : '',
  })
  const [selectedFiles, setFiles] = useState<File[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [matches, setMatches] = useState<Letter[]>([])
  const attempt = useRef({ body: '', id: '' })
  const set = (key: string, value: string) =>
    setForm((f) => ({ ...f, [key]: value }))
  useEffect(() => {
    if (kind !== 'NEW') return
    const q = form.externalReference || form.sender
    let active = true
    const timer = setTimeout(() => {
      if (q.trim().length >= 3)
        letters
          .list(new URLSearchParams({ q }).toString())
          .then((r) => {
            if (active) setMatches(r.items.slice(0, 4))
          })
          .catch(() => {})
      else setMatches([])
    }, 350)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [form.sender, form.externalReference, kind])
  const title = (
    {
      NEW: 'Log incoming letter',
      INCOMING:
        thread?.status === 'CLOSED'
          ? 'Receive reply & reopen'
          : 'Add incoming correspondence',
      OUTGOING: 'Record outgoing reply & close',
      TRANSFER: 'Assign letter',
      SHARE: 'Share for viewing',
      NOTE: 'Add internal note',
    } as Record<string, string>
  )[kind]
  return (
    <Dialog title={title} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          setError('')
          try {
            if (['NEW', 'INCOMING'].includes(kind) && !form.receivedDate)
              throw new Error(tr("Choose the received date."))
            if (
              kind === 'OUTGOING' &&
              (!form.correspondenceDate || !selectedFiles.length)
            )
              throw new Error(
                tr("Choose the reply date and attach the outgoing letter.")
              )
            if (['TRANSFER', 'SHARE'].includes(kind) && !form.personKey)
              throw new Error(tr("Choose a staff member."))
            const data = {
                ...form,
                kind,
                version: thread?.version,
                files: await uploadData(selectedFiles),
              },
              body = JSON.stringify(data)
            if (attempt.current.body !== body)
              attempt.current = { body, id: crypto.randomUUID() }
            const payload = { ...data, requestId: attempt.current.id }
            const result =
              kind === 'NEW'
                ? await letters.create(payload)
                : (await letters.event(thread!.id, payload), { id: thread!.id })
            await onSaved(result.id)
            onClose()
          } catch (e) {
            setError((e as Error).message)
          } finally {
            setBusy(false)
          }
        }}
      >
        {kind === 'NEW' && (
          <>
            <div className="rounded-xl bg-blue-50 p-3 text-sm text-blue-900">
              {tr("A reference number is generated on save. You remain the recorded letter enterer.")}</div>
            <Field label="Sender">
              <input
                required
                maxLength={250}
                className="input"
                value={form.sender}
                onChange={(e) => set('sender', e.target.value)}
              />
            </Field>
            <Field label="Subject">
              <input
                required
                maxLength={250}
                className="input"
                value={form.subject}
                onChange={(e) => set('subject', e.target.value)}
              />
            </Field>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Sender contact (optional)">
                <input
                  maxLength={300}
                  className="input"
                  value={form.senderContact}
                  onChange={(e) => set('senderContact', e.target.value)}
                />
              </Field>
              <Field label="Sender's reference (optional)">
                <input
                  maxLength={200}
                  className="input"
                  value={form.externalReference}
                  onChange={(e) => set('externalReference', e.target.value)}
                />
              </Field>
            </div>
            {matches.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
                <p className="font-semibold mb-2">
                  {tr("Possibly related correspondence")}</p>
                <p className="mb-2">
                  {tr("If this is a reply, open the existing thread instead of creating another reference.")}</p>
                {matches.map((t) => (
                  <button
                    type="button"
                    key={t.id}
                    className="block text-left min-h-11 text-tw-primary underline"
                    onClick={() => {
                      void onSaved(t.id)
                      onClose()
                    }}
                  >
                    {t.reference} · {t.subject}
                  </button>
                ))}
              </div>
            )}
            <Field label="Letter format">
              <Select
                ariaLabel={tr("Letter format")}
                value={form.channel}
                onChange={(v) => set('channel', v)}
                options={[
                  { value: 'PHYSICAL', label: tr("Physical letter") },
                  { value: 'DIGITAL', label: tr("Digital correspondence") },
                ]}
                className="[&>button]:min-h-11"
              />
            </Field>
          </>
        )}
        {['NEW', 'INCOMING'].includes(kind) && (
          <Field label="Received date">
            <DatePicker
              compact
              ariaLabel={tr("Received date")}
              value={form.receivedDate}
              onChange={(v) => set('receivedDate', v)}
              minDate={
                kind === 'INCOMING' ? thread?.latestReceivedDate : undefined
              }
              maxDate={context.today}
              className="[&>button]:min-h-11"
            />
          </Field>
        )}
        {kind === 'INCOMING' && (
          <>
            <Field label="Reply sender">
              <input
                required
                className="input"
                maxLength={250}
                value={form.correspondent}
                onChange={(e) => set('correspondent', e.target.value)}
              />
            </Field>
            <p className="text-sm text-tw-text-secondary">
              {tr('This stays under {reference}. A closed thread reopens with its existing assignee.', { reference: thread?.reference ?? '' })}</p>
          </>
        )}
        {kind === 'OUTGOING' && (
          <>
            <div className="rounded-xl bg-blue-50 p-3 text-sm">
              {tr("Record a reply that has already been sent. Saving closes the inquiry; Taskwise does not send email or post letters.")}</div>
            <Field label="Reply date">
              <DatePicker
                compact
                ariaLabel={tr("Reply date")}
                value={form.correspondenceDate}
                minDate={thread?.latestReceivedDate}
                maxDate={context.today}
                onChange={(v) => set('correspondenceDate', v)}
                className="[&>button]:min-h-11"
              />
            </Field>
            <Field label="Recipient">
              <input
                required
                maxLength={250}
                className="input"
                value={form.correspondent}
                onChange={(e) => set('correspondent', e.target.value)}
              />
            </Field>
          </>
        )}
        {['NEW', 'TRANSFER', 'SHARE'].includes(kind) && (
          <Field label={kind === 'SHARE' ? tr("Staff member") : tr("Assign to")}>
            <Select
              ariaLabel={kind === 'SHARE' ? tr("Staff member") : tr("Assign to")}
              value={form.personKey}
              onChange={(v) => set('personKey', v)}
              options={context.people
                .filter(
                  (p) => kind !== 'TRANSFER' || p.key !== thread?.assignedTo
                )
                .map((p) => ({
                  value: p.key,
                  label: p.key === context.me.key ? `${p.name} (${tr("me")})` : p.name,
                }))}
              className="[&>button]:min-h-11"
            />
          </Field>
        )}
        <Field
          label={
            kind === 'NEW'
              ? tr("Important details")
              : kind === 'TRANSFER'
                ? tr("Handover note")
                : tr("Notes")
          }
        >
          <textarea
            required={['NOTE', 'TRANSFER'].includes(kind)}
            rows={4}
            maxLength={10000}
            className="input"
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
          />
        </Field>
        {!['TRANSFER', 'SHARE'].includes(kind) && !context.driveConnected && (
          <p role="alert" className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
            {tr("Google Drive is not connected. Contact your administrator to connect Google Drive before uploading documents.")}</p>
        )}
        {!['TRANSFER', 'SHARE'].includes(kind) && context.driveConnected && (
          <Field
            label={
              kind === 'OUTGOING'
                ? tr("Copy of outgoing letter (required)")
                : tr("Original documents")
            }
          >
            <input
              type="file"
              accept="application/pdf,image/png,image/jpeg"
              multiple
              required={kind === 'OUTGOING'}
              className="sr-only peer"
              onChange={(e) => setFiles(Array.from(e.target.files || []))}
            />
            <span className="inline-flex min-h-11 items-center rounded-lg border border-tw-border bg-blue-50 px-3 py-2 text-sm font-semibold text-tw-primary cursor-pointer peer-focus-visible:ring-2 peer-focus-visible:ring-teal-700">
              {tr('Choose files')}
            </span>
            <span className="block text-xs text-tw-text-secondary" aria-live="polite">
              {selectedFiles.length ? selectedFiles.map(file => file.name).join(', ') : tr('No files selected')}
            </span>
            <span className="block text-xs text-tw-text-secondary">
              {tr("PDF, PNG or JPG · up to 4 files · 4 MB each / 8 MB total. Saved to Google Drive in the background.")}</span>
          </Field>
        )}
        <p className="text-xs text-tw-text-secondary">
          {tr("The system logs the current time automatically. Dates and delay metrics use Sri Lanka time.")}</p>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button className={button} disabled={busy}>
            {busy
              ? tr("Saving…")
              : kind === 'OUTGOING'
                ? tr("Save reply & close")
                : kind === 'INCOMING' && thread?.status === 'CLOSED'
                  ? tr("Save & reopen")
                  : kind === 'NEW'
                    ? tr("Save incoming letter")
                    : tr("Save action")}
          </button>
          <button
            type="button"
            className={secondary}
            onClick={onClose}
            disabled={busy}
          >
            {tr("Cancel")}</button>
        </div>
      </form>
    </Dialog>
  )
}
function Preview({ file, onClose }: { file: LetterFile; onClose: () => void }) {
  const { t: tr, locale } = useLanguage()
  const [page, setPage] = useState(file.previews[0]?.page || 1),
    [url, setUrl] = useState(''),
    [error, setError] = useState('')
  useEffect(() => {
    let live = true,
      objectUrl = ''
    setUrl('')
    setError('')
    letters
      .file(file.id, String(page))
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob)
        if (live) setUrl(objectUrl)
        else URL.revokeObjectURL(objectUrl)
      })
      .catch((e) => {
        if (live) setError(e.message)
      })
    return () => {
      live = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [file.id, page])
  return (
    <Dialog title={file.name} onClose={onClose}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <button
          className={secondary}
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
        >
          {tr("Previous")}</button>
        <span className="text-sm">
          {tr("Page")}{page} / {file.pageCount || file.previews.length}
        </span>
        <button
          className={secondary}
          disabled={page >= file.previews.length}
          onClick={() => setPage((p) => p + 1)}
        >
          {tr("Next")}</button>
      </div>
      {(file.pageCount || 0) > file.previews.length && (
        <p className="text-sm mb-3">
          {tr('Quick preview includes the first {count} pages. Download the original for the complete document.', { count: file.previews.length })}</p>
      )}
      {error ? (
        <p role="alert">{error}</p>
      ) : url ? (
        <img
          src={url}
          alt={`${file.name}, page ${page}`}
          className="w-full rounded-lg border border-tw-border"
        />
      ) : (
        <p role="status">{tr("Loading preview…")}</p>
      )}
    </Dialog>
  )
}

type Holder = { name: string; open: number; overdue: number; maxDays: number }
const workloadColumns = 'grid-cols-[minmax(0,1fr)_90px_90px_110px]'
function Workload({ holders, limit }: { holders: Holder[]; limit: number }) {
  const { t: tr } = useLanguage()
  const [sort, setSort] = useState<{ key: keyof Holder; dir: 'asc' | 'desc' }>({ key: 'maxDays', dir: 'desc' })
  const rows = [...holders].sort((a, b) => {
    const x = a[sort.key], y = b[sort.key]
    const c = typeof x === 'string' ? x.localeCompare(String(y)) : Number(x) - Number(y)
    return sort.dir === 'asc' ? c : -c
  })
  const columns: { label: string; key: keyof Holder; first: 'asc' | 'desc' }[] = [
    { label: tr("Assignee"), key: 'name', first: 'asc' },
    { label: tr("Open"), key: 'open', first: 'desc' },
    { label: tr("Overdue"), key: 'overdue', first: 'desc' },
    { label: tr("Oldest"), key: 'maxDays', first: 'desc' },
  ]
  return (
    <details className={box + ' !p-3 sm:!p-4'}>
      <summary className="font-semibold cursor-pointer px-1">
        {tr("Assignee workload & bottlenecks")}</summary>
      <p className="text-xs text-tw-text-secondary mt-1 px-1">
        {tr('Overdue = open letters with the same person for {days}+ days.', { days: limit })}</p>
      {rows.length ? (
        <div className="mt-3 space-y-1.5">
          <div className={`grid ${workloadColumns} gap-3 px-4 pl-5 text-xs font-semibold uppercase tracking-wide text-tw-text-secondary`}>
            {columns.map((h) => {
              const active = sort.key === h.key
              return (
                <button
                  key={h.key}
                  aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  className={`group flex items-center gap-1 text-left uppercase hover:text-tw-text ${active ? 'text-tw-primary-text' : ''}`}
                  onClick={() =>
                    setSort((s) =>
                      s.key === h.key ? { key: h.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: h.key, dir: h.first }
                    )
                  }
                >
                  <span className="truncate">{h.label}</span>
                  <span className={active ? '' : 'opacity-0 group-hover:opacity-50'}>
                    <Icon name={active && sort.dir === 'asc' ? 'chevronUp' : 'chevronDown'} className="w-3.5 h-3.5" />
                  </span>
                </button>
              )
            })}
          </div>
          {rows.map((h, i) => {
            const tone = h.overdue > 0 ? 'red' : h.maxDays >= Math.ceil(limit / 2) ? 'amber' : 'green'
            const accent = { red: 'border-l-red-500', amber: 'border-l-amber-400', green: 'border-l-emerald-500' }[tone]
            const badge = { red: 'bg-red-50 text-red-700', amber: 'bg-amber-50 text-amber-800', green: 'bg-emerald-50 text-emerald-700' }[tone]
            return (
              <div
                key={i}
                className={`grid ${workloadColumns} gap-3 items-center rounded-xl border border-tw-border border-l-4 ${accent} bg-tw-surface px-4 py-2 text-sm`}
              >
                <span className="font-semibold truncate" title={h.name}>{h.name}</span>
                <span>{h.open}</span>
                <span className={h.overdue ? 'font-semibold text-red-700' : 'text-tw-text-secondary'}>{h.overdue}</span>
                <span>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${badge}`}>{h.maxDays}d</span>
                </span>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-sm mt-3 px-1">{tr("No open assignments.")}</p>
      )}
    </details>
  )
}

export default function LetterManagement({ user, onUserUpdate }: { user: AuthUser; onUserUpdate: (value: Partial<AuthUser>) => void }) {
  const { t: tr, locale } = useLanguage()
  const duration = (days: number | undefined) => `${days ?? 0} ${tr(days === 1 ? 'day' : 'days')}`
  const [context, setContext] = useState<LetterContext | null>(null),
    [list, setList] = useState<LetterList | null>(null),
    [thread, setThread] = useState<Letter | null>(null)
  const [selected, setSelected] = useState(() => {
      const id = sessionStorage.getItem('taskwise_letter_open') || ''
      sessionStorage.removeItem('taskwise_letter_open')
      return id
    }),
    [q, setQ] = useState(''),
    [status, setStatus] = useState(''),
    [mine, setMine] = useState(false),
    [overdue, setOverdue] = useState(false),
    [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: '', dir: 'desc' }),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [page, setPage] = useState(0),
    [kind, setKind] = useState(''),
    [preview, setPreview] = useState<LetterFile | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const serial = useRef(0)
  const refresh = async (id = selected) => {
    const run = ++serial.current
    setBusy(true)
    setError('')
    try {
      const [c, l, t] = await Promise.all([
        letters.context(),
        letters.list(
          new URLSearchParams({
            q,
            status,
            mine: String(mine),
            overdue: String(overdue),
            sort: sort.key,
            dir: sort.dir,
            from,
            to,
            page: String(page),
          }).toString()
        ),
        id ? letters.get(id) : Promise.resolve(null),
      ])
      if (run === serial.current) {
        setContext(c)
        setList(l)
        setThread(t)
      }
    } catch (e) {
      if (run === serial.current) {
        setThread(null)
        setError((e as Error).message)
      }
    } finally {
      if (run === serial.current) setBusy(false)
    }
  }
  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 250)
    return () => {
      clearTimeout(timer)
      serial.current++
    }
  }, [selected, q, status, mine, overdue, sort, from, to, page])
  useEffect(() => {
    const open = (event: Event) => {
      setThread(null)
      setSelected((event as CustomEvent).detail)
      sessionStorage.removeItem('taskwise_letter_open')
    }
    window.addEventListener('taskwise:open-letter', open)
    return () => window.removeEventListener('taskwise:open-letter', open)
  }, [])
  useEffect(() => {
    if (
      !thread?.events?.some((e) =>
        e.attachments.some(
          (f) =>
            ['PENDING', 'PROCESSING'].includes(f.uploadState) ||
            ['PENDING', 'PROCESSING'].includes(f.previewState)
        )
      )
    )
      return
    const timer = setInterval(() => void refresh(), 7000)
    return () => clearInterval(timer)
  }, [thread?.id, thread?.events])
  const open = (id: string) => {
    setThread(null)
    setSelected(id)
  }
  const saved = async (id: string) => {
    setSelected(id)
    await refresh(id)
  }
  const download = async (f: LetterFile) => {
    try {
      const blob = await letters.file(f.id, 'original'),
        url = URL.createObjectURL(blob),
        a = document.createElement('a')
      a.href = url
      a.download = f.name
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const statusTabs = list ? [
    { key: 'all', label: tr("All"), value: list.metrics.open + list.metrics.closed, active: !status && !overdue, set: () => { setStatus(''); setOverdue(false) }, dot: '' },
    { key: 'open', label: tr("Open"), value: list.metrics.open, active: status === 'OPEN' && !overdue, set: () => { setStatus('OPEN'); setOverdue(false) }, dot: 'bg-blue-500' },
    { key: 'overdue', label: tr("Overdue"), value: list.metrics.overdue, active: overdue, set: () => { setStatus(''); setOverdue(true) }, dot: 'bg-red-500' },
    { key: 'closed', label: tr("Closed"), value: list.metrics.closed, active: status === 'CLOSED' && !overdue, set: () => { setStatus('CLOSED'); setOverdue(false) }, dot: 'bg-slate-400' },
  ] : []
  return (
    <div className={`w-full p-4 md:p-6 lg:p-8 space-y-6 mx-auto ${selected ? 'max-w-[1440px]' : 'max-w-7xl'}`} data-letter-workspace>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="section-label text-tw-primary-text mb-2 inline-flex items-center gap-1.5">
            <Icon name="letter" className="w-3.5 h-3.5" />{tr("Correspondence")}</p>
          <h1 className="page-title">
            {selected ? tr("Letter thread") : tr("Letter register")}
          </h1>
          <p className="text-sm text-tw-text-secondary mt-1">
            {context?.me.director
              ? tr("Your workspace’s correspondence, responsibility and response history.")
              : context?.me.logger
                ? tr("Log incoming correspondence and follow each inquiry.")
                : tr("Letters assigned to you, entered by you or shared with you.")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-start">
          <LanguageToggle user={user} onUserUpdate={onUserUpdate} />
          {selected && (
            <button className={secondary} onClick={() => open('')}>
              <Icon name="arrowLeft" className="w-4 h-4" />{tr("Register")}</button>
          )}
          <button
            className={secondary}
            disabled={busy}
            onClick={() => void refresh()}
          >
            <Icon name="refresh" className="w-4 h-4" />{tr("Refresh")}</button>
          {context?.me.logger && !selected && (
            <button className={button} onClick={() => setKind('NEW')}>
              <Icon name="plus" className="w-4 h-4" />{tr("Log letter")}</button>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="alert-error">
          {error}
        </p>
      )}
      {!context && busy && <p role="status">{tr("Loading correspondence…")}</p>}
      {context && !context.driveConnected && (
        <div className="alert-warning flex items-start gap-2"><Icon name="alert" className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {tr("Google Drive is not connected. Contact your administrator to connect Google Drive before uploading documents.")}</div>
      )}
      {!selected && list && (
        <>
          <section className={box + ' space-y-3 sm:space-y-4 !p-3 sm:!p-4'} aria-label={tr("Filters")}>
            {/* Phones: four equal status tiles — count first, label below; no sideways scrolling */}
            <div role="tablist" aria-label={tr("Letter status")} className="grid grid-cols-4 gap-1.5 sm:hidden">
              {statusTabs.map((c) => (
                <button
                  key={c.key}
                  role="tab"
                  aria-selected={c.active}
                  onClick={() => {
                    c.set()
                    setPage(0)
                  }}
                  className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-1 py-2 transition-all ${c.active ? 'border-tw-primary/40 bg-tw-primary/10 shadow-card' : 'border-tw-border bg-tw-surface-2'}`}
                >
                  <span className="flex items-center gap-1">
                    {c.dot && <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${c.dot}`} />}
                    <span className={`text-lg font-bold leading-none tabular-nums ${c.key === 'overdue' && c.value > 0 ? 'text-red-600' : c.active ? 'text-tw-primary-text' : 'text-tw-text'}`}>{c.value}</span>
                  </span>
                  <span className={`max-w-full text-center text-[10.5px] leading-tight break-words ${c.active ? 'font-semibold text-tw-text' : 'text-tw-text-secondary'}`}>{c.label}</span>
                </button>
              ))}
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
              <div role="tablist" className="seg hidden sm:inline-flex sm:w-auto">
                {statusTabs.map((c) => (
                  <button
                    key={c.key}
                    role="tab"
                    aria-selected={c.active}
                    onClick={() => {
                      c.set()
                      setPage(0)
                    }}
                    className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm whitespace-nowrap transition-all ${c.active ? 'bg-tw-surface text-tw-text font-semibold shadow-card' : 'text-tw-text-secondary hover:text-tw-text'}`}
                  >
                    {c.dot && <span className={`h-2 w-2 rounded-full ${c.dot}`} />}
                    {c.label}
                    <span className={`min-w-6 rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums ${c.key === 'overdue' && c.value > 0 ? 'bg-red-100 text-red-700' : c.active ? 'bg-tw-primary/10 text-tw-primary-text' : 'bg-tw-surface/80 text-tw-text-secondary'}`}>{c.value}</span>
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:ml-auto">
                {[
                  {
                    key: 'delay',
                    label: tr("Avg entry delay"),
                    value: `${list.metrics.averageEntryDays}d`,
                    hint: tr("Average days between receiving a letter and logging it"),
                    warn: list.metrics.averageEntryDays >= list.thresholds.entryDelayDays,
                    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z" />,
                  },
                  {
                    key: 'late',
                    label: tr("Late entries"),
                    value: String(list.metrics.lateEntries),
                    hint: tr('Letters logged {days}+ days after they were received', { days: list.thresholds.entryDelayDays }),
                    warn: list.metrics.lateEntries > 0,
                    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.3 3.9L2.4 17.5A2 2 0 004.1 20.5h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />,
                  },
                ].map((m) => (
                  <div
                    key={m.key}
                    title={m.hint}
                    className={`flex min-w-0 items-center gap-2.5 rounded-xl border px-3 py-2 sm:py-1.5 ${m.warn ? 'border-amber-200 bg-amber-50' : 'border-tw-border bg-tw-surface'}`}
                  >
                    <span className={`grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg ${m.warn ? 'bg-amber-100 text-amber-700' : 'bg-emerald-50 text-emerald-600'}`}>
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">{m.icon}</svg>
                    </span>
                    <span className="min-w-0 leading-tight">
                      <span className="block text-[11px] text-tw-text-secondary">{m.label}</span>
                      <span className={`block text-sm font-semibold tabular-nums ${m.warn ? 'text-amber-800' : 'text-tw-text'}`}>{m.value}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-col lg:flex-row gap-2">
              <input
                aria-label={tr("Search letters")}
                type="search"
                placeholder={tr("Search reference, sender or subject…")}
                className="input flex-1 min-w-0"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value)
                  setPage(0)
                }}
              />
              <div className="flex gap-2 items-center min-w-0">
                <DatePicker
                  ariaLabel={tr("Received from")}
                  placeholder={tr("From date")}
                  className="min-w-0 flex-1 lg:flex-none lg:w-40"
                  value={from}
                  maxDate={to || undefined}
                  onChange={(v) => {
                    setFrom(v)
                    setPage(0)
                  }}
                />
                <span className="text-tw-text-secondary text-sm">–</span>
                <DatePicker
                  ariaLabel={tr("Received to")}
                  placeholder={tr("To date")}
                  className="min-w-0 flex-1 lg:flex-none lg:w-40"
                  value={to}
                  minDate={from || undefined}
                  onChange={(v) => {
                    setTo(v)
                    setPage(0)
                  }}
                />
              </div>
              <button
                className={secondary + ' whitespace-nowrap'}
                aria-pressed={mine}
                onClick={() => {
                  setMine((v) => !v)
                  setPage(0)
                }}
              >
                {mine && <Icon name="check" className="w-4 h-4" />}{tr("Assigned to me")}
              </button>
              {(q || from || to || mine || status || overdue) && (
                <button
                  className="text-sm font-semibold text-tw-primary-text hover:underline whitespace-nowrap px-2"
                  onClick={() => {
                    setQ('')
                    setFrom('')
                    setTo('')
                    setMine(false)
                    setStatus('')
                    setOverdue(false)
                    setPage(0)
                  }}
                >
                  {tr("Clear filters")}
                </button>
              )}
            </div>
          </section>
          <section className={box + ' space-y-3 !p-3 sm:!p-4'} aria-label={tr("Letters")}>
            <div className={`hidden md:grid ${letterColumns} gap-3 px-4 pl-5 text-xs font-semibold uppercase tracking-wide text-tw-text-secondary`}>
              {[
                { label: tr("Reference"), key: 'reference', first: 'desc' },
                { label: tr("Subject"), key: 'subject', first: 'asc' },
                { label: tr("Sender"), key: 'sender', first: 'asc' },
                { label: tr("With"), key: 'with', first: 'asc' },
                { label: tr("Received"), key: 'received', first: 'desc' },
                { label: tr("Age"), key: 'age', first: 'desc' },
                { label: tr("Status"), key: 'status', first: 'asc' },
              ].map((h) => {
                const active = sort.key === h.key
                return (
                  <button
                    key={h.key}
                    aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className={`group flex items-center gap-1 text-left uppercase hover:text-tw-text ${active ? 'text-tw-primary-text' : ''}`}
                    onClick={() => {
                      setSort((s) =>
                        s.key === h.key
                          ? { key: h.key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
                          : { key: h.key, dir: h.first as 'asc' | 'desc' }
                      )
                      setPage(0)
                    }}
                  >
                    <span className="truncate">{h.label}</span>
                    <span className={active ? '' : 'opacity-0 group-hover:opacity-50'}>
                      <Icon name={active && sort.dir === 'asc' ? 'chevronUp' : 'chevronDown'} className="w-3.5 h-3.5" />
                    </span>
                  </button>
                )
              })}
            </div>
            <div className="space-y-1.5">
              {list.items.map((t) => {
                const closed = t.status === 'CLOSED',
                  limit = list.thresholds.assigneeDays,
                  tone: 'slate' | 'red' | 'amber' | 'green' = closed
                    ? 'slate'
                    : t.assigneeAgeDays >= limit
                      ? 'red'
                      : t.assigneeAgeDays >= Math.ceil(limit / 2)
                        ? 'amber'
                        : 'green',
                  accent = { slate: 'border-l-slate-300', red: 'border-l-red-500', amber: 'border-l-amber-400', green: 'border-l-emerald-500' }[tone],
                  badge = { slate: 'bg-slate-100 text-slate-500', red: 'bg-red-50 text-red-700', amber: 'bg-amber-50 text-amber-800', green: 'bg-emerald-50 text-emerald-700' }[tone],
                  late = t.entryDelayDays >= list.thresholds.entryDelayDays,
                  age = closed ? '—' : `${t.assigneeAgeDays}d`
                return (
                  <button
                    key={t.id}
                    onClick={() => open(t.id)}
                    className={`w-full text-left rounded-xl border border-tw-border border-l-4 ${accent} bg-tw-surface px-4 py-2.5 hover:shadow-panel hover:border-tw-border-strong transition-all`}
                  >
                    <div className={`hidden md:grid ${letterColumns} gap-3 items-center text-sm`}>
                      <span className="font-semibold text-tw-primary-text whitespace-nowrap">{t.reference}</span>
                      <span className="font-semibold truncate" title={t.subject}>{t.subject}</span>
                      <span className="text-tw-text-secondary truncate" title={t.sender}>{t.sender}</span>
                      <span className="truncate" title={t.assignedToName}>{t.assignedToName}</span>
                      <span className="whitespace-nowrap">
                        {shortDate(t.firstReceivedDate, locale)}
                        {late && (
                          <span
                            className="ml-1 inline-block h-2 w-2 rounded-full bg-amber-500 align-middle"
                            title={`${tr("Late entry")} · ${t.entryDelayDays}d`}
                          />
                        )}
                      </span>
                      <span>
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${badge}`}>{age}</span>
                      </span>
                      <span><Status closed={closed} /></span>
                    </div>
                    <div className="md:hidden">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm truncate">{t.subject}</span>
                        <span className={`shrink-0 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${badge}`}>{age}</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-tw-text-secondary mt-0.5 min-w-0">
                        <span className="font-semibold text-tw-primary-text tabular-nums shrink-0">{t.reference}</span>
                        <span className="truncate">· {t.sender} · {t.assignedToName}</span>
                      </div>
                    </div>
                  </button>
                )
              })}
              {!list.items.length && (
                <div className="text-center py-12">
                  <span className="icon-tile tile-blue w-14 h-14 rounded-2xl mx-auto mb-4"><Icon name="letter" className="w-6 h-6" /></span>
                  <p className="font-semibold">{tr("No letters in this view")}</p>
                  <p className="text-sm text-tw-text-secondary mt-1">
                    {context?.me.logger
                      ? tr("Log an incoming letter or change your filters.")
                      : tr("Assigned or shared letters will appear here.")}
                  </p>
                </div>
              )}
            </div>
            <div className="flex justify-between items-center pt-1">
              <button
                className={secondary}
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                {tr("Previous")}</button>
              <span className="text-sm text-tw-text-secondary">
                {list.total
                  ? tr('{from}–{to} of {total}', { from: page * list.pageSize + 1, to: Math.min(list.total, (page + 1) * list.pageSize), total: list.total })
                  : `0 ${tr("inquiries")}`}
              </span>
              <button
                className={secondary}
                disabled={(page + 1) * list.pageSize >= list.total}
                onClick={() => setPage((p) => p + 1)}
              >
                {tr("Next")}</button>
            </div>
          </section>
          {context?.me.director && (
            <Workload holders={list.metrics.holders} limit={list.thresholds.assigneeDays} />
          )}
        </>
      )}
      {selected && !thread && !error && <p role="status">{tr("Loading letter…")}</p>}
      {thread && context && (() => {
        const closed = thread.status === 'CLOSED',
          limit = context.assigneeDays,
          tone = closed ? 'slate' : thread.assigneeAgeDays >= limit ? 'red' : thread.assigneeAgeDays >= Math.ceil(limit / 2) ? 'amber' : 'green',
          badge = ({ slate: 'bg-slate-100 text-slate-600', red: 'bg-red-50 text-red-700', amber: 'bg-amber-50 text-amber-800', green: 'bg-emerald-50 text-emerald-700' } as Record<string, string>)[tone],
          lateEntry = thread.entryDelayDays >= context.entryDelayDays,
          documents = (thread.events || []).flatMap((e) => e.attachments.map((f) => ({ f, e })))
        const kinds: Record<string, { label: string; dot: string; icon: string }> = {
          INCOMING: { label: tr("Incoming letter"), dot: 'bg-blue-50 text-blue-600 ring-blue-100', icon: 'M12 4v16m0 0l-6-6m6 6l6-6' },
          OUTGOING: { label: tr("Outgoing reply"), dot: 'bg-emerald-50 text-emerald-600 ring-emerald-100', icon: 'M12 20V4m0 0l-6 6m6-6l6 6' },
          TRANSFER: { label: tr("Responsibility transferred"), dot: 'bg-violet-50 text-violet-600 ring-violet-100', icon: 'M7 7h11l-3-3m3 13H7l3 3' },
          NOTE: { label: tr("Internal note"), dot: 'bg-slate-100 text-slate-600 ring-slate-200', icon: 'M4 20h4L19 9l-4-4L4 16v4z' },
          SHARE: { label: tr("Viewing access shared"), dot: 'bg-amber-50 text-amber-600 ring-amber-100', icon: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zm10 3a3 3 0 100-6 3 3 0 000 6z' },
        }
        const fileRow = (f: LetterFile) => <LetterDocumentCard key={f.id} file={f}
          onPreview={() => setPreview(f)} onDownload={() => void download(f)}
          onRetry={thread.permissions?.canManage && (['FAILED', 'BLOCKED'].includes(f.uploadState) || f.previewState === 'FAILED')
            ? async () => { try { await letters.retry(f.id); await refresh() } catch (e) { setError((e as Error).message) } }
            : undefined} />
        return (
          <>
            <section className={box + ' !p-5 sm:!p-6'}>
              <div className="flex flex-col xl:flex-row xl:items-center gap-5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-tw-primary [overflow-wrap:anywhere]">{thread.reference}</span>
                    <Status closed={closed} />
                    <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                      {thread.channel === 'DIGITAL' ? tr("Digital") : tr("Physical")}
                    </span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight mt-3 [overflow-wrap:anywhere]">{thread.subject}</h2>
                  <p className="text-sm text-tw-text-secondary mt-2 [overflow-wrap:anywhere]">
                    {tr("From")} <span className="font-medium text-tw-text">{thread.sender}</span>
                    {thread.senderContact ? ' · ' + thread.senderContact : ''}
                    {thread.externalReference ? ` · ${tr("Sender’s reference:")} ${thread.externalReference}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3 xl:shrink-0">
                  {thread.permissions?.canReply && (
                    <button className={button} onClick={() => setKind('OUTGOING')}>
                      {tr("Record reply & close")}</button>
                  )}
                  {thread.permissions?.canReceive && (
                    <button className={secondary} onClick={() => setKind('INCOMING')}>
                      {closed ? tr("Incoming reply & reopen") : tr("Add incoming reply")}
                    </button>
                  )}
                </div>
              </div>
              {thread.permissions?.canManage && (
                <div className="mt-5 flex flex-wrap gap-2 border-t border-tw-border pt-4">
                  {!closed && (
                    <button className={secondary} onClick={() => setKind('TRANSFER')}>
                      {tr("Assign")}</button>
                  )}
                  <button className={secondary} onClick={() => setKind('NOTE')}>
                    {tr("Add note")}</button>
                  <button className={secondary} onClick={() => setKind('SHARE')}>
                    {tr("Share view")}</button>
                </div>
              )}
            </section>
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px] items-start">
              <section className={box + ' min-w-0 !p-5 sm:!p-6'} aria-label={tr("Correspondence timeline")}>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-6 border-b border-tw-border pb-4">
                  <h2 className="text-base font-bold">{tr("Correspondence timeline")}</h2>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-tw-text-secondary">{thread.events?.length || 0} {tr("entries")}</span>
                </div>
                <ol className="relative">
                  {thread.events?.map((event, i) => {
                    const k = kinds[event.kind] || kinds.NOTE,
                      last = i === (thread.events?.length || 0) - 1
                    return (
                      <li key={event.id} className="relative flex gap-3 sm:gap-4 pb-8 last:pb-0">
                        {!last && <span className="absolute left-[17px] top-10 bottom-0 w-px bg-tw-border" aria-hidden="true" />}
                        <span className={`relative z-10 grid h-9 w-9 shrink-0 place-items-center rounded-full ring-4 ${k.dot}`}>
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d={k.icon} />
                          </svg>
                        </span>
                        <div className="min-w-0 flex-1 pt-1">
                          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                            <h3 className="font-semibold text-base">
                              {k.label}
                              {event.kind === 'OUTGOING' && <span className="ml-2 text-xs font-medium text-emerald-700">{tr("Closed")}</span>}
                              <span className="ml-2 text-xs font-normal text-tw-text-secondary">#{event.sequence}</span>
                            </h3>
                            <time dateTime={event.createdAt} className="text-xs text-tw-text-secondary">{timestamp(event.createdAt, locale)}</time>
                          </div>
                          <p className="text-xs text-tw-text-secondary mt-0.5">
                            {tr('by {name}', { name: event.actorName })}
                          </p>
                          {(event.receivedDate || event.correspondenceDate || event.kind === 'TRANSFER' || event.kind === 'SHARE') && (
                            <div className="flex flex-wrap gap-1.5 mt-2 text-xs">
                              {event.receivedDate && (
                                <>
                                  <span className="rounded-md bg-slate-100 px-2 py-1">{tr("Received")} {shortDate(event.receivedDate, locale)}</span>
                                  <span className="rounded-md bg-slate-100 px-2 py-1 [overflow-wrap:anywhere]">{tr("From")} {event.correspondent}</span>
                                  <span className={`rounded-md px-2 py-1 ${(event.entryDelayDays || 0) >= context.entryDelayDays ? 'bg-amber-50 text-amber-800' : 'bg-slate-100'}`}>
                                    {tr("Entry delay")} {duration(event.entryDelayDays)}</span>
                                </>
                              )}
                              {event.correspondenceDate && (
                                <>
                                  <span className="rounded-md bg-slate-100 px-2 py-1">{tr("Sent")} {shortDate(event.correspondenceDate, locale)}</span>
                                  <span className="rounded-md bg-slate-100 px-2 py-1">{tr("To")} {event.correspondent}</span>
                                </>
                              )}
                              {event.kind === 'TRANSFER' && (
                                <>
                                  <span className="rounded-md bg-violet-50 text-violet-800 px-2 py-1 [overflow-wrap:anywhere] inline-flex items-center gap-1 flex-wrap">{event.fromAssigneeName} <Icon name="arrowRight" className="w-3 h-3" /> {event.toAssigneeName}</span>
                                  <span className="rounded-md bg-slate-100 px-2 py-1">{tr("Held")} {duration(event.holdingDays)}</span>
                                </>
                              )}
                              {event.kind === 'SHARE' && (
                                <span className="rounded-md bg-amber-50 text-amber-800 px-2 py-1">{tr("Shared with")} {event.toAssigneeName}</span>
                              )}
                            </div>
                          )}
                          {event.notes && (
                            <p className="mt-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm leading-6 whitespace-pre-wrap [overflow-wrap:anywhere]">{event.notes}</p>
                          )}
                          {event.attachments.length > 0 && (
                            <div className="mt-3 space-y-3">{event.attachments.map(fileRow)}</div>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ol>
              </section>
              <aside className="min-w-0 space-y-6 xl:sticky xl:top-6">
                <section className={box + ' !p-5 sm:!p-6'} aria-label={tr("Details")}>
                  <h2 className="text-base font-bold mb-4">{tr("Details")}</h2>
                  <dl className="divide-y divide-tw-border text-sm">
                    {[
                      [tr("Current assignee"), <span className="font-medium">{thread.assignedToName}</span>],
                      [closed ? tr("Closed") : tr("With assignee"), closed
                        ? <span>{timestamp(thread.closedAt!, locale)}</span>
                        : <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${badge}`}>{duration(thread.assigneeAgeDays)}</span>],
                      [tr("Received"), <span>{shortDate(thread.firstReceivedDate, locale)}</span>],
                      [tr("Entry delay"), <span className={lateEntry ? 'font-semibold text-amber-700' : ''}>{duration(thread.entryDelayDays)}</span>],
                      [tr("System logged"), <span>{timestamp(thread.createdAt, locale)}</span>],
                      [tr("Entered by"), <span>{thread.createdByName}</span>],
                    ].map(([label, value], i) => (
                      <div key={i} className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] items-start gap-4 py-3 leading-5">
                        <dt className="text-tw-text-secondary">{label}</dt>
                        <dd className="text-right min-w-0 font-medium [overflow-wrap:anywhere]">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
                <section className={box + ' min-w-0 !p-5 sm:!p-6'} aria-label={tr("Documents")}>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-base font-bold">{tr("Documents")}</h2>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{documents.length}</span>
                  </div>
                  {documents.length ? (
                    <div className="space-y-3">{documents.map(({ f }) => fileRow(f))}</div>
                  ) : (
                    <p className="text-sm text-tw-text-secondary">{tr("No documents attached.")}</p>
                  )}
                </section>
              </aside>
            </div>
          </>
        )
      })()}
      {kind && context && (
        <LetterForm
          kind={kind}
          context={context}
          thread={thread || undefined}
          onClose={() => setKind('')}
          onSaved={saved}
        />
      )}
      {preview && <Preview file={preview} onClose={() => setPreview(null)} />}
    </div>
  )
}

export function LetterSettingsPanel() {
  const { t: tr, locale } = useLanguage()
  const [settings, setSettings] = useState<DriveSettings | null>(null),
    [context, setContext] = useState<LetterContext | null>(null),
    [secret, setSecret] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('')
  const load = async () => {
    try {
      const [s, c] = await Promise.all([letters.settings(), letters.context()])
      setSettings(s)
      setContext(c)
    } catch (e) {
      setError((e as Error).message)
    }
  }
  useEffect(() => {
    void load()
  }, [])
  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await fn()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className={box + ' space-y-5'}>
      <div>
        <h2 className="text-lg font-bold">{tr("Letter management")}</h2>
        <p className="text-sm text-tw-text-secondary mt-1">
          {tr("Director controls for Letter Loggers, delay thresholds and private Google Drive storage.")}</p>
      </div>
      {error && (
        <p role="alert" className="text-red-700 text-sm">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-green-700 text-sm">
          {message}
        </p>
      )}
      {context && (
        <div>
          <h3 className="font-semibold mb-2">{tr("Letter Loggers")}</h3>
          <p className="text-sm text-tw-text-secondary mb-3">
            {tr("Only these staff and Directors can register new letters. The original enterer retains responsibility for adding incoming replies, even if their Logger permission is later removed.")}</p>
          <div className="max-h-72 overflow-y-auto space-y-1">
            {context.people
              .filter((p) => p.key.startsWith('personnel:'))
              .map((p) => (
                <label
                  key={p.key}
                  className="flex justify-between items-center gap-3 min-h-11 border-b border-tw-border text-sm"
                >
                  <span>{p.name}{p.assigner && <span className="block text-xs text-tw-text-secondary">Manages company letters · change in Roles</span>}</span>
                  <input
                    type="checkbox"
                    checked={!!p.logger}
                    disabled={busy || p.assigner}
                    aria-label={`Letter Logger: ${p.name}`}
                    onChange={(e) =>
                      void run(async () => {
                        await letters.logger(
                          p.key.split(':')[1],
                          e.target.checked
                        )
                        await load()
                        setMessage(tr("Logger permissions updated."))
                      })
                    }
                  />
                </label>
              ))}
          </div>
        </div>
      )}
      {settings && (
        <>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              void run(async () => {
                setSettings(
                  await letters.saveSettings({
                    ...settings,
                    clientSecret: secret,
                  })
                )
                setSecret('')
                setMessage(
                  tr("Settings saved. Connect Google Drive if its configuration changed.")
                )
              })
            }}
          >
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Flag entry delays after (calendar days)">
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={365}
                  required
                  value={settings.entryDelayDays}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      entryDelayDays: Number(e.target.value),
                    })
                  }
                />
              </Field>
              <Field label="Flag assignee aging after (calendar days)">
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={365}
                  required
                  value={settings.assigneeDays}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      assigneeDays: Number(e.target.value),
                    })
                  }
                />
              </Field>
            </div>
            {!settings.managed && (<>
            <h3 className="font-semibold pt-2">{tr("Google Drive connection")}</h3>
            <p className="text-sm text-tw-text-secondary">
              {tr("Use an organization-controlled Google account with access to the destination folder. Taskwise saves original documents there without making them public. Credentials are encrypted and never returned to the browser.")}</p>
            {!settings.encryptionReady && (
              <p className="text-sm text-amber-800">
                {tr("A server encryption key must be configured before saving Google credentials.")}</p>
            )}
            <Field label="Destination folder ID">
              <input
                className="input"
                value={settings.folderId}
                maxLength={200}
                placeholder={tr("The ID after /folders/ in the Drive folder URL")}
                onChange={(e) =>
                  setSettings({ ...settings, folderId: e.target.value })
                }
              />
            </Field>
            <Field label="Google OAuth client ID">
              <input
                className="input"
                value={settings.clientId}
                maxLength={300}
                autoComplete="off"
                onChange={(e) =>
                  setSettings({ ...settings, clientId: e.target.value })
                }
              />
            </Field>
            <Field
              label={`OAuth client secret${settings.hasClientSecret ? ' (saved; leave blank to keep)' : ''}`}
            >
              <input
                className="input"
                type="password"
                value={secret}
                maxLength={500}
                autoComplete="new-password"
                onChange={(e) => setSecret(e.target.value)}
              />
            </Field>
            <details className="text-sm rounded-xl bg-slate-50 p-3">
              <summary className="font-medium cursor-pointer">
                {tr("Google Cloud setup instructions")}</summary>
              <ol className="list-decimal pl-5 space-y-2 mt-3">
                <li>
                  {tr("Enable the Google Drive API in your Google Cloud project.")}</li>
                <li>
                  {tr("Configure the OAuth consent screen for your organization, then create a Web application OAuth client.")}</li>
                <li>
                  {tr("Add this authorized redirect URI:")}{' '}
                  <code className="block break-all bg-tw-surface border border-tw-border rounded-lg p-2 mt-1">
                    {settings.callbackUrl}
                  </code>
                </li>
                <li>
                  {tr("Enter its client ID and secret above, save, then connect with the account that can write to your folder.")}</li>
              </ol>
              <p className="mt-3">
                {tr("Access to a manually entered existing folder requires the Google Drive scope. Google's consent screen describes this access. Taskwise's upload worker uses only the configured folder; do not share that folder with people who should not see all its letters.")}</p>
            </details>
            </>)}
            <button className={button} disabled={busy}>
              {tr("Save letter settings")}</button>
          </form>
          {settings.managed && (
            <div className="border-t border-tw-border pt-4">
              <h3 className="font-semibold">{tr("Google Drive connection")}</h3>
              <p className="text-sm text-tw-text-secondary mt-1">
                {tr("Click Connect and sign in with your Google account. Taskwise creates a private \"Taskwise Letters\" folder in your Drive and can only access files it creates.")}</p>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 border-t border-tw-border pt-4">
            <span className="text-sm mr-2">
              {settings.connected
                ? <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-tw-success" />{tr("Drive connected")}</span>
                : <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full border border-tw-text-muted" />{tr("Drive not connected")}</span>}
            </span>
            <button
              className={secondary}
              disabled={
                busy ||
                (!settings.managed &&
                  (!settings.hasClientSecret || !settings.folderId))
              }
              onClick={() =>
                void run(async () => {
                  const r = await letters.connect()
                  window.location.assign(r.url)
                })
              }
            >
              {settings.connected ? tr("Reconnect Google") : tr("Connect Google Drive")}
            </button>
            {settings.connected && (
              <>
                <button
                  className={secondary}
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const r = await letters.test()
                      setMessage('Folder verified: ' + r.name)
                    })
                  }
                >
                  {tr("Test folder access")}</button>
                <button
                  className={secondary}
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await letters.disconnect()
                      await load()
                      setMessage(
                        tr("Drive disconnected. Existing documents are preserved.")
                      )
                    })
                  }
                >
                  {tr("Disconnect")}</button>
              </>
            )}
          </div>
        </>
      )}
    </section>
  )
}
