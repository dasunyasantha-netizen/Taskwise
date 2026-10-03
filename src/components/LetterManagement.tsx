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
import type { AuthUser } from '../types'
import { LanguageToggle, useLanguage, displayDate } from '../i18n/Language'
const box = 'rounded-2xl border border-tw-border bg-white shadow-sm p-4 sm:p-5'
const button = 'btn-primary min-h-11'
const secondary = 'btn-secondary min-h-11'
const timestamp = (value: string, locale = 'en-GB') =>
  displayDate(value, locale === 'si-LK' ? 'si' : 'en', true)
const letterColumns =
  'grid-cols-[140px_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,0.8fr)_100px_64px_76px]'
const shortDate = (value: string, locale = 'en-GB') =>
  displayDate(value, locale === 'si-LK' ? 'si' : 'en')
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
    <div className="fixed inset-0 z-[100] bg-slate-950/50 p-3 flex items-center justify-center">
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        className="w-full max-w-2xl max-h-[90dvh] overflow-y-auto overscroll-contain rounded-2xl bg-white p-4 sm:p-6 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 mb-5">
          <h2 id={id} className="text-xl font-bold">
            {tr(title)}
          </h2>
          <button
            type="button"
            className={secondary}
            onClick={onClose}
            aria-label={tr("Close dialog")}
          >
            ✕
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
    personKey: '',
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
      TRANSFER: 'Transfer responsibility',
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
              {tr("A reference number is generated on save. You become the initial assignee and remain the recorded letter enterer.")}</div>
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
              {tr("This stays under")}{thread?.reference}{tr(". A closed thread reopens with its existing assignee.")}</p>
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
        {['TRANSFER', 'SHARE'].includes(kind) && (
          <Field label={kind === 'TRANSFER' ? tr("New assignee") : tr("Staff member")}>
            <Select
              ariaLabel={kind === 'TRANSFER' ? tr("New assignee") : tr("Staff member")}
              value={form.personKey}
              onChange={(v) => set('personKey', v)}
              options={context.people
                .filter(
                  (p) => kind !== 'TRANSFER' || p.key !== thread?.assignedTo
                )
                .map((p) => ({ value: p.key, label: p.name }))}
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
          {tr("Quick preview includes the first")}{file.previews.length} {tr("pages. Download the original for the complete document.")}</p>
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
        {tr("Overdue = open letters with the same person for")} {limit}+ {tr("days")}.</p>
      {rows.length ? (
        <div className="mt-3 space-y-1.5">
          <div className={`grid ${workloadColumns} gap-3 px-4 pl-5 text-xs font-semibold uppercase tracking-wide text-tw-text-secondary`}>
            {columns.map((h) => {
              const active = sort.key === h.key
              return (
                <button
                  key={h.key}
                  aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  className={`group flex items-center gap-1 text-left uppercase hover:text-tw-text ${active ? 'text-tw-primary' : ''}`}
                  onClick={() =>
                    setSort((s) =>
                      s.key === h.key ? { key: h.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: h.key, dir: h.first }
                    )
                  }
                >
                  <span className="truncate">{h.label}</span>
                  <span className={active ? '' : 'opacity-0 group-hover:opacity-50'}>
                    {active && sort.dir === 'asc' ? '▲' : '▼'}
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
                className={`grid ${workloadColumns} gap-3 items-center rounded-xl border border-tw-border border-l-4 ${accent} bg-white px-4 py-2 text-sm`}
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
  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-tw-primary mb-2">
            {tr("Correspondence")}</p>
          <h1 className="text-2xl font-bold">
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
              {tr("← Register")}</button>
          )}
          <button
            className={secondary}
            disabled={busy}
            onClick={() => void refresh()}
          >
            {tr("Refresh")}</button>
          {context?.me.logger && !selected && (
            <button className={button} onClick={() => setKind('NEW')}>
              {tr("+ Log letter")}</button>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="p-3 rounded-xl bg-red-50 text-red-700">
          {error}
        </p>
      )}
      {!context && busy && <p role="status">{tr("Loading correspondence…")}</p>}
      {context && !context.driveConnected && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
          {tr("Google Drive is not connected. Contact your administrator to connect Google Drive before uploading documents.")}</div>
      )}
      {!selected && list && (
        <>
          <div className="flex flex-wrap items-end gap-x-4 border-b border-tw-border">
            <div role="tablist" className="flex gap-1 -mb-px overflow-x-auto">
              {[
                { key: 'all', label: tr("All"), value: list.metrics.open + list.metrics.closed, active: !status && !overdue, set: () => { setStatus(''); setOverdue(false) }, alert: false },
                { key: 'open', label: tr("Open"), value: list.metrics.open, active: status === 'OPEN' && !overdue, set: () => { setStatus('OPEN'); setOverdue(false) }, alert: false },
                { key: 'overdue', label: tr("Overdue"), value: list.metrics.overdue, active: overdue, set: () => { setStatus(''); setOverdue(true) }, alert: list.metrics.overdue > 0 },
                { key: 'closed', label: tr("Closed"), value: list.metrics.closed, active: status === 'CLOSED' && !overdue, set: () => { setStatus('CLOSED'); setOverdue(false) }, alert: false },
              ].map((c) => (
                <button
                  key={c.key}
                  role="tab"
                  aria-selected={c.active}
                  onClick={() => {
                    c.set()
                    setPage(0)
                  }}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${c.active ? 'border-tw-primary text-tw-primary' : 'border-transparent text-tw-text-secondary hover:text-tw-text'}`}
                >
                  {c.label}
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${c.alert ? 'bg-red-50 text-red-700' : c.active ? 'bg-blue-50 text-tw-primary' : 'bg-slate-100 text-slate-600'}`}>{c.value}</span>
                </button>
              ))}
            </div>
            <span className="text-xs text-tw-text-secondary ml-auto pb-2.5">
              {tr("Avg entry delay")} <strong>{list.metrics.averageEntryDays}d</strong>
              {' · '}
              {list.metrics.lateEntries} {tr("late entries")}
            </span>
          </div>
          <div className={box + ' space-y-3 !p-3 sm:!p-4'}>
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
              <div className="flex gap-2 items-center">
                <DatePicker
                  ariaLabel={tr("Received from")}
                  placeholder={tr("From date")}
                  className="w-full lg:w-40"
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
                  className="w-full lg:w-40"
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
                {mine ? tr("✓ Assigned to me") : tr("Assigned to me")}
              </button>
            </div>
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
                    className={`group flex items-center gap-1 text-left uppercase hover:text-tw-text ${active ? 'text-tw-primary' : ''}`}
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
                      {active && sort.dir === 'asc' ? '▲' : '▼'}
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
                    className={`w-full text-left rounded-xl border border-tw-border border-l-4 ${accent} bg-white px-4 py-2 hover:shadow-md transition-shadow`}
                  >
                    <div className={`hidden md:grid ${letterColumns} gap-3 items-center text-sm`}>
                      <span className="font-mono text-xs font-semibold text-tw-primary truncate">{t.reference}</span>
                      <span className="font-semibold truncate" title={t.subject}>{t.subject}</span>
                      <span className="text-tw-text-secondary truncate" title={t.sender}>{t.sender}</span>
                      <span className="truncate" title={t.assignedToName}>{t.assignedToName}</span>
                      <span className="text-xs whitespace-nowrap">
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
                        <span className="font-mono text-tw-primary shrink-0">{t.reference}</span>
                        <span className="truncate">· {t.sender} · {t.assignedToName}</span>
                      </div>
                    </div>
                  </button>
                )
              })}
              {!list.items.length && (
                <div className="text-center py-12">
                  <p className="text-3xl mb-3">✉</p>
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
                  ? `${page * list.pageSize + 1}–${Math.min(list.total, (page + 1) * list.pageSize)} ${tr("of")} ${list.total}`
                  : `0 ${tr("inquiries")}`}
              </span>
              <button
                className={secondary}
                disabled={(page + 1) * list.pageSize >= list.total}
                onClick={() => setPage((p) => p + 1)}
              >
                {tr("Next")}</button>
            </div>
          </div>
          {context?.me.director && (
            <Workload holders={list.metrics.holders} limit={list.thresholds.assigneeDays} />
          )}
        </>
      )}
      {selected && !thread && !error && <p role="status">{tr("Loading letter…")}</p>}
      {thread && context && (
        <>
          <section className={box}>
            <div className="flex flex-wrap justify-between gap-2">
              <p className="font-mono text-sm text-tw-primary font-semibold">
                {thread.reference}
              </p>
              <Status closed={thread.status === 'CLOSED'} />
            </div>
            <h2 className="text-xl font-bold mt-3 break-words">
              {thread.subject}
            </h2>
            <p className="text-sm mt-2 break-words">
              {tr("From")}{thread.sender}
              {thread.senderContact ? ' · ' + thread.senderContact : ''}
            </p>
            {thread.externalReference && (
              <p className="text-xs mt-1">
                {tr("Sender’s reference:")}{thread.externalReference}
              </p>
            )}
            <dl className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-5 text-sm">
              {[
                [tr("Received"), shortDate(thread.firstReceivedDate, locale)],
                [tr("System logged"), timestamp(thread.createdAt, locale)],
                [tr("Entered by"), thread.createdByName],
                [tr("Current assignee"), thread.assignedToName],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-tw-text-secondary mb-1">
                    {tr(label)}
                  </dt>
                  <dd className="font-medium">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 flex flex-wrap gap-3 text-xs">
              <span>{tr("Entry delay:")} {thread.entryDelayDays}  {tr("calendar days")}</span>
              <span>
                {thread.status === 'OPEN'
                  ? `${tr('With current assignee:')} ${thread.assigneeAgeDays} ${tr('calendar days')}`
                  : `${tr('Closed')} ${timestamp(thread.closedAt!, locale)}`}
              </span>
            </div>
            <div className="flex flex-wrap gap-2 mt-5">
              {thread.permissions?.canReply && (
                <button className={button} onClick={() => setKind('OUTGOING')}>
                  {tr("Record reply & close")}</button>
              )}
              {thread.permissions?.canReceive && (
                <button
                  className={secondary}
                  onClick={() => setKind('INCOMING')}
                >
                  {thread.status === 'CLOSED'
                    ? tr("Incoming reply & reopen")
                    : tr("Add incoming reply")}
                </button>
              )}
              {thread.permissions?.canManage && (
                <>
                  {thread.status === 'OPEN' && (
                    <button
                      className={secondary}
                      onClick={() => setKind('TRANSFER')}
                    >
                      {tr("Reassign")}</button>
                  )}
                  <button className={secondary} onClick={() => setKind('NOTE')}>
                    {tr("Add note")}</button>
                  <button
                    className={secondary}
                    onClick={() => setKind('SHARE')}
                  >
                    {tr("Share view")}</button>
                </>
              )}
            </div>
          </section>
          <section>
            <h2 className="font-bold mb-4">{tr("Correspondence timeline")}</h2>
            <div className="space-y-4">
              {thread.events?.map((event) => (
                <article className={box} key={event.id}>
                  <div className="flex flex-wrap justify-between gap-2">
                    <h3 className="font-semibold">
                      {
                        (
                          {
                            INCOMING: tr("↓ Incoming letter"),
                            OUTGOING: tr("↑ Outgoing reply · closed"),
                            TRANSFER: tr("⇄ Responsibility transferred"),
                            NOTE: tr("Internal note"),
                            SHARE: tr("Viewing access shared"),
                          } as Record<string, string>
                        )[event.kind]
                      }{' '}
                      <span className="text-xs text-tw-text-secondary">
                        #{event.sequence}
                      </span>
                    </h3>
                    <p className="text-xs text-tw-text-secondary">
                      {timestamp(event.createdAt, locale)}
                    </p>
                  </div>
                  <p className="text-xs text-tw-text-secondary mt-1">
                    {tr("Logged by")}{event.actorName}
                  </p>
                  {event.receivedDate && (
                    <p className="text-sm mt-3">
                      {tr("Received")}{shortDate(event.receivedDate, locale)}  {tr("· from")}{' '}
                      {event.correspondent}  {tr("· entry delay")} {event.entryDelayDays}{' '}
                      {tr("days")}</p>
                  )}
                  {event.correspondenceDate && (
                    <p className="text-sm mt-3">
                      {tr("Sent")}{shortDate(event.correspondenceDate, locale)}  {tr("· to")}{' '}
                      {event.correspondent}
                    </p>
                  )}
                  {event.kind === 'TRANSFER' && (
                    <p className="text-sm mt-3">
                      {event.fromAssigneeName} → {event.toAssigneeName}  {tr("· held")}{' '}
                      {event.holdingDays} {tr("calendar days")}</p>
                  )}
                  {event.kind === 'SHARE' && (
                    <p className="text-sm mt-3">
                      {tr("Shared with")}{event.toAssigneeName}
                    </p>
                  )}
                  {event.notes && (
                    <p className="mt-3 text-sm whitespace-pre-wrap break-words">
                      {event.notes}
                    </p>
                  )}
                  {event.attachments.map((f) => (
                    <div
                      key={f.id}
                      className="mt-4 rounded-xl bg-slate-50 border border-tw-border p-3"
                    >
                      <p className="text-sm font-medium break-words">
                        {f.name}{' '}
                        <span className="text-xs text-tw-text-secondary">
                          ({Math.round(f.size / 1024)} {tr("KB)")}</span>
                      </p>
                      <p className="text-xs mt-1 text-tw-text-secondary">
                        {tr("Drive:")}{' '}
                        {
                          (
                            {
                              READY: tr("saved"),
                              BLOCKED: tr("awaiting setup"),
                              PENDING: tr("queued"),
                              PROCESSING: tr("uploading"),
                              FAILED: tr("needs attention"),
                            } as Record<string, string>
                          )[f.uploadState]
                        }{' '}
                        {tr("· Preview:")}{tr(f.previewState.toLowerCase())}
                      </p>
                      {f.uploadError && (
                        <p className="text-xs text-amber-800 mt-1">
                          {f.uploadError}
                        </p>
                      )}
                      {f.previewError && (
                        <p className="text-xs text-amber-800 mt-1">
                          {f.previewError}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2 mt-3">
                        {f.previewState === 'READY' && (
                          <button
                            className={secondary}
                            onClick={() => setPreview(f)}
                          >
                            {tr("Quick preview")}</button>
                        )}
                        <button
                          className={secondary}
                          onClick={() => void download(f)}
                        >
                          {tr("Download original")}</button>
                        {thread.permissions?.canManage &&
                          (['FAILED', 'BLOCKED'].includes(f.uploadState) ||
                            f.previewState === 'FAILED') && (
                            <button
                              className={secondary}
                              onClick={async () => {
                                try {
                                  await letters.retry(f.id)
                                  await refresh()
                                } catch (e) {
                                  setError((e as Error).message)
                                }
                              }}
                            >
                              {tr("Retry processing")}</button>
                          )}
                      </div>
                    </div>
                  ))}
                </article>
              ))}
            </div>
          </section>
        </>
      )}
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
                  <span>{p.name}</span>
                  <input
                    type="checkbox"
                    checked={!!p.logger}
                    disabled={busy}
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
                  <code className="block break-all bg-white p-2 mt-1">
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
                ? tr("● Drive connected")
                : tr("○ Drive not connected")}
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
