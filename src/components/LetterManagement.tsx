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
const box = 'rounded-2xl border border-tw-border bg-white shadow-sm p-4 sm:p-5'
const button = 'btn-primary min-h-11'
const secondary = 'btn-secondary min-h-11'
const timestamp = (value: string) =>
  new Date(value).toLocaleString('en-GB', {
    timeZone: 'Asia/Colombo',
    dateStyle: 'medium',
    timeStyle: 'short',
  })
const shortDate = (value: string) =>
  new Date(value + 'T00:00:00').toLocaleDateString('en-GB', {
    dateStyle: 'medium',
  })
function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block text-sm font-medium text-tw-text space-y-1.5">
      <span>{label}</span>
      {children}
    </label>
  )
}
function Status({ closed }: { closed: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${closed ? 'bg-slate-100 text-slate-600' : 'bg-blue-50 text-tw-primary'}`}
    >
      {closed ? 'Closed' : 'Open'}
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
            {title}
          </h2>
          <button
            type="button"
            className={secondary}
            onClick={onClose}
            aria-label="Close dialog"
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
              throw new Error('Choose the received date.')
            if (
              kind === 'OUTGOING' &&
              (!form.correspondenceDate || !selectedFiles.length)
            )
              throw new Error(
                'Choose the reply date and attach the outgoing letter.'
              )
            if (['TRANSFER', 'SHARE'].includes(kind) && !form.personKey)
              throw new Error('Choose a staff member.')
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
              A reference number is generated on save. You become the initial
              assignee and remain the recorded letter enterer.
            </div>
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
                  Possibly related correspondence
                </p>
                <p className="mb-2">
                  If this is a reply, open the existing thread instead of
                  creating another reference.
                </p>
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
                ariaLabel="Letter format"
                value={form.channel}
                onChange={(v) => set('channel', v)}
                options={[
                  { value: 'PHYSICAL', label: 'Physical letter' },
                  { value: 'DIGITAL', label: 'Digital correspondence' },
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
              ariaLabel="Received date"
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
              This stays under {thread?.reference}. A closed thread reopens with
              its existing assignee.
            </p>
          </>
        )}
        {kind === 'OUTGOING' && (
          <>
            <div className="rounded-xl bg-blue-50 p-3 text-sm">
              Record a reply that has already been sent. Saving closes the
              inquiry; Taskwise does not send email or post letters.
            </div>
            <Field label="Reply date">
              <DatePicker
                compact
                ariaLabel="Reply date"
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
          <Field label={kind === 'TRANSFER' ? 'New assignee' : 'Staff member'}>
            <Select
              ariaLabel={kind === 'TRANSFER' ? 'New assignee' : 'Staff member'}
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
              ? 'Important details'
              : kind === 'TRANSFER'
                ? 'Handover note'
                : 'Notes'
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
        {!['TRANSFER', 'SHARE'].includes(kind) && (
          <Field
            label={
              kind === 'OUTGOING'
                ? 'Copy of outgoing letter (required)'
                : 'Original documents'
            }
          >
            <input
              type="file"
              accept="application/pdf,image/png,image/jpeg"
              multiple
              required={kind === 'OUTGOING'}
              className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-3 file:text-tw-primary"
              onChange={(e) => setFiles(Array.from(e.target.files || []))}
            />
            <span className="block text-xs text-tw-text-secondary">
              PDF, PNG or JPG · up to 4 files · 4 MB each / 8 MB total.
              Originals are preserved; preview and Drive upload run in the
              background.
            </span>
          </Field>
        )}
        <p className="text-xs text-tw-text-secondary">
          The system logs the current time automatically. Dates and delay
          metrics use Sri Lanka time.
        </p>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button className={button} disabled={busy}>
            {busy
              ? 'Saving…'
              : kind === 'OUTGOING'
                ? 'Save reply & close'
                : kind === 'INCOMING' && thread?.status === 'CLOSED'
                  ? 'Save & reopen'
                  : kind === 'NEW'
                    ? 'Save incoming letter'
                    : 'Save action'}
          </button>
          <button
            type="button"
            className={secondary}
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
        </div>
      </form>
    </Dialog>
  )
}
function Preview({ file, onClose }: { file: LetterFile; onClose: () => void }) {
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
          Previous
        </button>
        <span className="text-sm">
          Page {page} / {file.pageCount || file.previews.length}
        </span>
        <button
          className={secondary}
          disabled={page >= file.previews.length}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>
      {(file.pageCount || 0) > file.previews.length && (
        <p className="text-sm mb-3">
          Quick preview includes the first {file.previews.length} pages.
          Download the original for the complete document.
        </p>
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
        <p role="status">Loading preview…</p>
      )}
    </Dialog>
  )
}

export default function LetterManagement() {
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
  }, [selected, q, status, mine, page])
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
            Correspondence
          </p>
          <h1 className="text-2xl font-bold">
            {selected ? 'Letter thread' : 'Letter register'}
          </h1>
          <p className="text-sm text-tw-text-secondary mt-1">
            {context?.me.director
              ? 'Your workspace’s correspondence, responsibility and response history.'
              : context?.me.logger
                ? 'Log incoming correspondence and follow each inquiry.'
                : 'Letters assigned to you, entered by you or shared with you.'}
          </p>
        </div>
        <div className="flex gap-2 items-start">
          {selected && (
            <button className={secondary} onClick={() => open('')}>
              ← Register
            </button>
          )}
          <button
            className={secondary}
            disabled={busy}
            onClick={() => void refresh()}
          >
            Refresh
          </button>
          {context?.me.logger && !selected && (
            <button className={button} onClick={() => setKind('NEW')}>
              + Log letter
            </button>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="p-3 rounded-xl bg-red-50 text-red-700">
          {error}
        </p>
      )}
      {!context && busy && <p role="status">Loading correspondence…</p>}
      {context && !context.driveConnected && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
          Google Drive is not connected. Documents are saved securely in
          Taskwise and queued until the Director connects Drive in Settings.
        </div>
      )}
      {!selected && list && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              ['Open inquiries', list.metrics.open],
              ['Closed inquiries', list.metrics.closed],
              ['Assignee bottlenecks', list.metrics.overdue],
              ['Average entry delay', `${list.metrics.averageEntryDays} days`],
            ].map(([label, value]) => (
              <div className={box} key={label}>
                <p className="text-xs text-tw-text-secondary">{label}</p>
                <p className="text-2xl font-bold mt-2">{value}</p>
              </div>
            ))}
          </div>
          <div className={box + ' space-y-4'}>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                aria-label="Search letters"
                type="search"
                placeholder="Search reference, sender or subject…"
                className="input flex-1 min-w-0"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value)
                  setPage(0)
                }}
              />
              <Select
                ariaLabel="Letter status"
                value={status}
                onChange={(v) => {
                  setStatus(v)
                  setPage(0)
                }}
                options={[
                  { value: '', label: 'All statuses' },
                  { value: 'OPEN', label: 'Open' },
                  { value: 'CLOSED', label: 'Closed' },
                ]}
                className="sm:w-40 [&>button]:min-h-11"
              />
              <button
                className={secondary}
                aria-pressed={mine}
                onClick={() => {
                  setMine((v) => !v)
                  setPage(0)
                }}
              >
                {mine ? '✓ Assigned to me' : 'Assigned to me'}
              </button>
            </div>
            <div className="flex justify-between text-xs text-tw-text-secondary">
              <span>{list.total} inquiries</span>
              <span>
                {list.metrics.lateEntries} receipts logged after{' '}
                {list.thresholds.entryDelayDays}+ days
              </span>
            </div>
            <div className="space-y-2">
              {list.items.map((t) => (
                <button
                  key={t.id}
                  onClick={() => open(t.id)}
                  className="w-full text-left rounded-xl border border-tw-border p-4 hover:bg-tw-hover transition-colors"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-mono font-semibold text-tw-primary">
                      {t.reference}
                    </span>
                    <Status closed={t.status === 'CLOSED'} />
                  </div>
                  <h2 className="font-semibold mt-2 break-words">
                    {t.subject}
                  </h2>
                  <p className="text-sm text-tw-text-secondary mt-1 break-words">
                    {t.sender}
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs mt-3">
                    <span>With {t.assignedToName}</span>
                    <span>Received {shortDate(t.firstReceivedDate)}</span>
                    <span
                      className={
                        t.entryDelayDays >= list.thresholds.entryDelayDays
                          ? 'text-amber-700 font-semibold'
                          : ''
                      }
                    >
                      Entry delay: {t.entryDelayDays} days
                    </span>
                    {t.status === 'OPEN' && (
                      <span
                        className={
                          t.assigneeAgeDays >= list.thresholds.assigneeDays
                            ? 'text-red-700 font-semibold'
                            : ''
                        }
                      >
                        With assignee: {t.assigneeAgeDays} days
                      </span>
                    )}
                  </div>
                </button>
              ))}
              {!list.items.length && (
                <div className="text-center py-12">
                  <p className="text-3xl mb-3">✉</p>
                  <p className="font-semibold">No letters in this view</p>
                  <p className="text-sm text-tw-text-secondary mt-1">
                    {context?.me.logger
                      ? 'Log an incoming letter or change your filters.'
                      : 'Assigned or shared letters will appear here.'}
                  </p>
                </div>
              )}
            </div>
            <div className="flex justify-between items-center">
              <button
                className={secondary}
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <span className="text-sm">
                Page {page + 1} of {Math.max(1, Math.ceil(list.total / 30))}
              </span>
              <button
                className={secondary}
                disabled={(page + 1) * 30 >= list.total}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
          {context?.me.director && (
            <details className={box}>
              <summary className="font-semibold cursor-pointer">
                Assignee workload & bottlenecks
              </summary>
              <p className="text-sm text-tw-text-secondary mt-2">
                Flagged after {list.thresholds.assigneeDays} calendar days with
                the current assignee. Closed inquiries stop aging.
              </p>
              <div className="mt-4 space-y-3">
                {list.metrics.holders.map((h, i) => (
                  <div
                    key={i}
                    className="flex flex-wrap justify-between gap-2 border-b border-tw-border pb-3 text-sm"
                  >
                    <strong>{h.name}</strong>
                    <span>
                      {h.open} open · {h.overdue} flagged · oldest {h.maxDays}{' '}
                      days
                    </span>
                  </div>
                ))}
                {!list.metrics.holders.length && <p>No open assignments.</p>}
              </div>
            </details>
          )}
        </>
      )}
      {selected && !thread && !error && <p role="status">Loading letter…</p>}
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
              From {thread.sender}
              {thread.senderContact ? ' · ' + thread.senderContact : ''}
            </p>
            {thread.externalReference && (
              <p className="text-xs mt-1">
                Sender’s reference: {thread.externalReference}
              </p>
            )}
            <dl className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-5 text-sm">
              {[
                ['Received', shortDate(thread.firstReceivedDate)],
                ['System logged', timestamp(thread.createdAt)],
                ['Entered by', thread.createdByName],
                ['Current assignee', thread.assignedToName],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-tw-text-secondary mb-1">
                    {label}
                  </dt>
                  <dd className="font-medium">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 flex flex-wrap gap-3 text-xs">
              <span>Entry delay: {thread.entryDelayDays} calendar days</span>
              <span>
                {thread.status === 'OPEN'
                  ? `With current assignee: ${thread.assigneeAgeDays} calendar days`
                  : `Closed ${timestamp(thread.closedAt!)}`}
              </span>
            </div>
            <div className="flex flex-wrap gap-2 mt-5">
              {thread.permissions?.canReply && (
                <button className={button} onClick={() => setKind('OUTGOING')}>
                  Record reply & close
                </button>
              )}
              {thread.permissions?.canReceive && (
                <button
                  className={secondary}
                  onClick={() => setKind('INCOMING')}
                >
                  {thread.status === 'CLOSED'
                    ? 'Incoming reply & reopen'
                    : 'Add incoming reply'}
                </button>
              )}
              {thread.permissions?.canManage && (
                <>
                  {thread.status === 'OPEN' && (
                    <button
                      className={secondary}
                      onClick={() => setKind('TRANSFER')}
                    >
                      Reassign
                    </button>
                  )}
                  <button className={secondary} onClick={() => setKind('NOTE')}>
                    Add note
                  </button>
                  <button
                    className={secondary}
                    onClick={() => setKind('SHARE')}
                  >
                    Share view
                  </button>
                </>
              )}
            </div>
          </section>
          <section>
            <h2 className="font-bold mb-4">Correspondence timeline</h2>
            <div className="space-y-4">
              {thread.events?.map((event) => (
                <article className={box} key={event.id}>
                  <div className="flex flex-wrap justify-between gap-2">
                    <h3 className="font-semibold">
                      {
                        (
                          {
                            INCOMING: '↓ Incoming letter',
                            OUTGOING: '↑ Outgoing reply · closed',
                            TRANSFER: '⇄ Responsibility transferred',
                            NOTE: 'Internal note',
                            SHARE: 'Viewing access shared',
                          } as Record<string, string>
                        )[event.kind]
                      }{' '}
                      <span className="text-xs text-tw-text-secondary">
                        #{event.sequence}
                      </span>
                    </h3>
                    <p className="text-xs text-tw-text-secondary">
                      {timestamp(event.createdAt)}
                    </p>
                  </div>
                  <p className="text-xs text-tw-text-secondary mt-1">
                    Logged by {event.actorName}
                  </p>
                  {event.receivedDate && (
                    <p className="text-sm mt-3">
                      Received {shortDate(event.receivedDate)} · from{' '}
                      {event.correspondent} · entry delay {event.entryDelayDays}{' '}
                      days
                    </p>
                  )}
                  {event.correspondenceDate && (
                    <p className="text-sm mt-3">
                      Sent {shortDate(event.correspondenceDate)} · to{' '}
                      {event.correspondent}
                    </p>
                  )}
                  {event.kind === 'TRANSFER' && (
                    <p className="text-sm mt-3">
                      {event.fromAssigneeName} → {event.toAssigneeName} · held{' '}
                      {event.holdingDays} calendar days
                    </p>
                  )}
                  {event.kind === 'SHARE' && (
                    <p className="text-sm mt-3">
                      Shared with {event.toAssigneeName}
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
                          ({Math.round(f.size / 1024)} KB)
                        </span>
                      </p>
                      <p className="text-xs mt-1 text-tw-text-secondary">
                        Drive:{' '}
                        {
                          (
                            {
                              READY: 'saved',
                              BLOCKED: 'awaiting setup',
                              PENDING: 'queued',
                              PROCESSING: 'uploading',
                              FAILED: 'needs attention',
                            } as Record<string, string>
                          )[f.uploadState]
                        }{' '}
                        · Preview: {f.previewState.toLowerCase()}
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
                            Quick preview
                          </button>
                        )}
                        <button
                          className={secondary}
                          onClick={() => void download(f)}
                        >
                          Download original
                        </button>
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
                              Retry processing
                            </button>
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
        <h2 className="text-lg font-bold">Letter management</h2>
        <p className="text-sm text-tw-text-secondary mt-1">
          Director controls for Letter Loggers, delay thresholds and private
          Google Drive storage.
        </p>
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
          <h3 className="font-semibold mb-2">Letter Loggers</h3>
          <p className="text-sm text-tw-text-secondary mb-3">
            Only these staff and Directors can register new letters. The
            original enterer retains responsibility for adding incoming replies,
            even if their Logger permission is later removed.
          </p>
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
                        setMessage('Logger permissions updated.')
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
                  'Settings saved. Connect Google Drive if its configuration changed.'
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
            <h3 className="font-semibold pt-2">Google Drive connection</h3>
            <p className="text-sm text-tw-text-secondary">
              Use an organization-controlled Google account with access to the
              destination folder. Taskwise saves original documents there
              without making them public. Credentials are encrypted and never
              returned to the browser.
            </p>
            {!settings.encryptionReady && (
              <p className="text-sm text-amber-800">
                A server encryption key must be configured before saving Google
                credentials.
              </p>
            )}
            <Field label="Destination folder ID">
              <input
                className="input"
                value={settings.folderId}
                maxLength={200}
                placeholder="The ID after /folders/ in the Drive folder URL"
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
                Google Cloud setup instructions
              </summary>
              <ol className="list-decimal pl-5 space-y-2 mt-3">
                <li>
                  Enable the Google Drive API in your Google Cloud project.
                </li>
                <li>
                  Configure the OAuth consent screen for your organization, then
                  create a Web application OAuth client.
                </li>
                <li>
                  Add this authorized redirect URI:{' '}
                  <code className="block break-all bg-white p-2 mt-1">
                    {settings.callbackUrl}
                  </code>
                </li>
                <li>
                  Enter its client ID and secret above, save, then connect with
                  the account that can write to your folder.
                </li>
              </ol>
              <p className="mt-3">
                Access to a manually entered existing folder requires the Google
                Drive scope. Google's consent screen describes this access.
                Taskwise's upload worker uses only the configured folder; do not
                share that folder with people who should not see all its
                letters.
              </p>
            </details>
            <button className={button} disabled={busy}>
              Save letter settings
            </button>
          </form>
          <div className="flex flex-wrap items-center gap-2 border-t border-tw-border pt-4">
            <span className="text-sm mr-2">
              {settings.connected
                ? '● Drive connected'
                : '○ Drive not connected'}
            </span>
            <button
              className={secondary}
              disabled={busy || !settings.hasClientSecret || !settings.folderId}
              onClick={() =>
                void run(async () => {
                  const r = await letters.connect()
                  window.location.assign(r.url)
                })
              }
            >
              {settings.connected ? 'Reconnect Google' : 'Connect Google Drive'}
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
                  Test folder access
                </button>
                <button
                  className={secondary}
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await letters.disconnect()
                      await load()
                      setMessage(
                        'Drive disconnected. Existing documents are preserved.'
                      )
                    })
                  }
                >
                  Disconnect
                </button>
              </>
            )}
          </div>
        </>
      )}
    </section>
  )
}
