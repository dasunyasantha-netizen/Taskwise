import React, { useEffect, useMemo, useState } from 'react'
import {
  ysoApi,
  YsoDashboard,
  YsoEntry,
  YsoTask,
  YsoObligation,
  YsoPerson,
  YsoMeeting,
} from '../services/ysoService'
import type { AuthUser } from '../types'
import DatePicker from './DatePicker'
import Select from './Select'
import { useLanguage, displayDate, languageOf, monthYear } from '../i18n/Language'
import { useRefreshListener } from '../hooks/useRefresh'
import { Icon, type IconName } from './ui/Icon'

const panel = 'card p-5'
const input =
  'input min-h-11 text-base sm:text-sm focus:ring-teal-500/20 focus:border-teal-500/60'
const primary =
  'btn min-h-11 text-white bg-gradient-to-b from-teal-500 to-teal-600 shadow-[0_4px_14px_-4px_rgba(13,148,136,0.7)] hover:brightness-110'
const secondary =
  'btn-secondary min-h-11'
const signed = (n: number) => (n > 0 ? `+${n}` : String(n))
const pretty = (value: string) => value.replace(/_/g, ' ').toLowerCase()
const when = (value: string, locale = 'en-GB') =>
  displayDate(value, languageOf(locale), true)
const pending = (entry: YsoEntry) =>
  !entry.supersededAt && ['SUBMITTED', 'PENDING'].includes(entry.status)
const addDays = (date: string, days: number) =>
  new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000)
    .toISOString()
    .slice(0, 10)
const weekEnd = (date: string) =>
  addDays(date, (7 - new Date(date + 'T00:00:00Z').getUTCDay()) % 7)
function weeklyProgress(dashboard: YsoDashboard, period: string) {
  const start = dashboard.people[0]?.startDate
  const expected: string[] = []
  if (start)
    for (
      let day = period + '-01';
      day.slice(0, 7) === period;
      day = addDays(day, 1)
    ) {
      if (
        new Date(day + 'T00:00:00Z').getUTCDay() === 0 &&
        addDays(day, -6) >= start
      )
        expected.push(day)
    }
  const covered = new Set(
    dashboard.entries
      .filter((e) => e.task === 9 && e.status === 'APPROVED' && !e.supersededAt)
      .map((e) => weekEnd(e.data.date))
  )
  return {
    expected: expected.length,
    covered: expected.filter((w) => covered.has(w)).length,
  }
}
function Status({ value }: { value: string }) {
  const { t: tr, locale } = useLanguage()
  return (
    <span
      className={`badge flex-shrink-0 capitalize ${value === 'APPROVED' ? 'badge-success' : value === 'REJECTED' ? 'badge-danger' : 'badge-warning'}`}
    >
      {tr(value === 'APPROVED_LEAVE' ? 'APPROVED LEAVE' : pretty(value))}
    </span>
  )
}
function Modal({
  title,
  children,
  onClose,
}: {
  title: string
  children: React.ReactNode
  onClose: () => void
}) {
  const { t: tr, locale } = useLanguage()
  const headingId = React.useId()
  const ref = React.useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('[data-system-picker]')) return
      if (e.key === 'Escape') onClose()
      if (e.key !== 'Tab') return
      const nodes = Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'
        ) ?? []
      )
      if (!nodes.length) return
      if (
        e.shiftKey &&
        (document.activeElement === nodes[0] ||
          document.activeElement === ref.current)
      ) {
        e.preventDefault()
        nodes[nodes.length - 1].focus()
      } else if (
        !e.shiftKey &&
        (document.activeElement === nodes[nodes.length - 1] ||
          document.activeElement === ref.current)
      ) {
        e.preventDefault()
        nodes[0].focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus()
    }
  }, [])
  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-3 bg-[#0b1220]/50 backdrop-blur-[3px] animate-fade-in"
      role="presentation"
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="modal-panel w-full max-w-2xl max-h-[92dvh] overflow-y-auto overscroll-contain px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6 rounded-b-none sm:rounded-3xl animate-slide-up sm:animate-pop-in"
      >
        <div className="flex justify-between items-start gap-3 mb-5">
          <h2 id={headingId} className="text-xl font-bold tracking-tight text-tw-text">
            {tr(title)}
          </h2>
          <button
            onClick={onClose}
            className="icon-btn border-tw-border"
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
// ─── Certificate scan upload (qualification tasks) ────────────────────────────
// Scans are sent once with the submission and stored only in the workspace's
// Google Drive; nothing is kept in the browser or on the TaskWise server.
const CERT_MAX_BYTES = 10 * 1024 * 1024
const CERT_TYPES = ['application/pdf', 'image/png', 'image/jpeg']
const fileSize = (bytes: number) =>
  bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`

function CertificateUpload({ file, onChange, disabled }: {
  file: File | null
  onChange: (file: File | null) => void
  disabled?: boolean
}) {
  const { t: tr } = useLanguage()
  const [problem, setProblem] = useState('')
  const [dragging, setDragging] = useState(false)
  const [preview, setPreview] = useState('')
  const pickRef = React.useRef<HTMLInputElement>(null)
  const cameraRef = React.useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!file || !file.type.startsWith('image/')) { setPreview(''); return }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])
  const accept = (candidate?: File | null) => {
    if (!candidate) return
    if (!CERT_TYPES.includes(candidate.type)) {
      setProblem(tr('Use a PDF, PNG or JPEG file.'))
      return
    }
    if (candidate.size > CERT_MAX_BYTES) {
      setProblem(tr('This file is {size}. The limit is 10 MB.', { size: fileSize(candidate.size) }))
      return
    }
    setProblem('')
    onChange(candidate)
  }
  return (
    <div>
      <span className="label">{tr('Scanned copy of certificate')} <span className="text-tw-danger">*</span></span>
      <input ref={pickRef} type="file" className="sr-only" tabIndex={-1} aria-hidden="true"
        accept="application/pdf,image/png,image/jpeg"
        onChange={(e) => { accept(e.target.files?.[0]); e.target.value = '' }} />
      <input ref={cameraRef} type="file" className="sr-only" tabIndex={-1} aria-hidden="true"
        accept="image/jpeg,image/png" capture="environment"
        onChange={(e) => { accept(e.target.files?.[0]); e.target.value = '' }} />
      {file ? (
        <div className="flex items-center gap-3 rounded-xl border border-teal-200 bg-teal-50 p-3">
          {preview
            ? <img src={preview} alt="" className="w-14 h-14 rounded-lg object-cover ring-1 ring-teal-200 flex-shrink-0" />
            : <span className="icon-tile tile-teal w-14 h-14 rounded-lg"><Icon name="file" className="w-6 h-6" /></span>}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-tw-text truncate">{file.name}</p>
            <p className="text-xs text-tw-text-secondary">{fileSize(file.size)} · {tr('Ready to upload')}</p>
          </div>
          <button type="button" className="btn-ghost btn-sm" disabled={disabled} onClick={() => pickRef.current?.click()}>
            {tr('Replace')}</button>
          <button type="button" className="icon-btn w-8 h-8 hover:text-tw-danger" disabled={disabled}
            aria-label={tr('Remove file')} onClick={() => onChange(null)}>
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); accept(e.dataTransfer.files?.[0]) }}
          className={`rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${dragging ? 'border-teal-500 bg-teal-50' : 'border-tw-border bg-tw-surface-2'}`}
        >
          <span className="icon-tile tile-teal w-11 h-11 rounded-xl mx-auto"><Icon name="upload" className="w-5 h-5" /></span>
          <p className="text-sm font-semibold text-tw-text mt-2.5">{tr('Upload a scan or photo of your certificate')}</p>
          <p className="text-xs text-tw-text-secondary mt-0.5">{tr('PDF, PNG or JPEG · up to 10 MB · drag a file here')}</p>
          <div className="flex flex-wrap justify-center gap-2 mt-3.5">
            <button type="button" className="btn-secondary btn-sm" disabled={disabled} onClick={() => pickRef.current?.click()}>
              <Icon name="file" className="w-3.5 h-3.5" />{tr('Choose file')}</button>
            <button type="button" className="btn-secondary btn-sm sm:hidden" disabled={disabled} onClick={() => cameraRef.current?.click()}>
              <Icon name="image" className="w-3.5 h-3.5" />{tr('Take photo')}</button>
          </div>
        </div>
      )}
      {problem && <p role="alert" className="text-xs text-tw-danger mt-1.5">{problem}</p>}
      <p className="text-xs text-tw-text-secondary mt-2 flex items-start gap-1.5">
        <Icon name="cloud" className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
        {tr("Saved to your organisation's Google Drive (the Letters folder). It is not stored on the TaskWise server.")}
      </p>
    </div>
  )
}

function EntryForm({
  task,
  dashboard,
  previous,
  onClose,
  onSave,
}: {
  task: YsoTask
  dashboard: YsoDashboard
  previous?: YsoEntry
  onClose: () => void
  onSave: () => Promise<void>
}) {
  const { t: tr, locale } = useLanguage()
  const [values, setValues] = useState<Record<string, any>>(() =>
    previous
      ? { ...previous.data }
      : Object.fromEntries(
          task.fields.map((f) => [
            f.key,
            f.type === 'checkbox'
              ? false
              : f.type === 'month'
                ? dashboard.today.slice(0, 7)
                : f.type === 'date'
                  ? dashboard.today
                  : (f.options?.[0] ?? ''),
          ])
        )
  )
  const [file, setFile] = useState<File | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const set = (key: string, value: any) =>
    setValues((old) => ({ ...old, [key]: value }))
  const advances = dashboard.entries.filter(
    (e) =>
      e.task === 10 &&
      e.data.phase === 'ADVANCE' &&
      e.status === 'APPROVED' &&
      !e.supersededAt
  )
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      for (const field of task.fields.filter(
        (f) =>
          task.id !== 10 ||
          (values.phase === 'SETTLEMENT'
            ? !['reference', 'date', 'dueDate'].includes(f.key)
            : !['advanceId', 'settlementDate'].includes(f.key))
      )) {
        if (
          ['date', 'month', 'select'].includes(field.type) &&
          !values[field.key]
        )
          throw new Error(`Choose ${field.label.toLowerCase()}.`)
      }
      let attachment
      if (task.id >= 12) {
        if (!dashboard.driveConnected)
          throw new Error(tr("Google Drive isn't connected yet. Ask your Director to connect it (Settings → Letter management)."))
        if (!file || file.size > CERT_MAX_BYTES || !CERT_TYPES.includes(file.type))
          throw new Error(tr('Add a scanned copy of your certificate (PDF, PNG or JPEG, up to 10 MB).'))
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result).split(',')[1])
          reader.onerror = () => reject(new Error('Cannot read certificate'))
          reader.readAsDataURL(file)
        })
        attachment = { name: file.name, base64 }
      }
      await ysoApi.submit({
        task: task.id,
        data: values,
        previousId: previous?.id,
        attachment,
      })
      await onSave()
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      title={tr(task.title)}
      onClose={onClose}
    >
      <div className="rounded-xl border border-teal-200 bg-teal-50 p-3.5 mb-5 flex items-start gap-2.5">
        <Icon name="info" className="w-4 h-4 text-teal-700 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-semibold text-teal-800">{tr("How points work")}</p>
          <p className="text-sm text-teal-900 mt-0.5 leading-relaxed">{tr(task.rule)}</p>
        </div>
      </div>
      {previous && (
        <p className="alert-warning mb-4">
          {tr("This creates a new submission version and timestamp. Existing approved points stay in place until the AD approves the correction. Keep the activity reference unchanged.")}</p>
      )}
      <form onSubmit={save} className="space-y-4">
        {task.fields
          .filter(
            (f) =>
              task.id !== 10 ||
              (values.phase === 'SETTLEMENT'
                ? !['reference', 'date', 'dueDate'].includes(f.key)
                : !['advanceId', 'settlementDate'].includes(f.key))
          )
          .map((f) => {
            let options = (f.options ?? []).map((value) => ({
              value,
              label: tr(value === 'APPROVED_LEAVE' ? 'APPROVED LEAVE' : value === 'ATTENDED' || value === 'ABSENT' || value === 'ADVANCE' || value === 'SETTLEMENT' ? value : pretty(value)),
            }))
            if (f.key === 'meetingId')
              options = dashboard.meetings
                .filter((m) => !m.cancelled && m.date <= dashboard.today)
                .map((m) => ({ value: m.id, label: `${m.date} · ${m.title}` }))
            if (f.key === 'advanceId')
              options = advances.map((a) => ({
                value: a.id,
                label: `${a.data.reference} · due ${a.data.dueDate}`,
              }))
            return (
              <label
                key={f.key}
                className="block text-sm font-medium text-tw-text"
              >
                {f.type !== 'checkbox' && (
                  <span className="label">{tr(f.label)}</span>
                )}
                {f.type === 'checkbox' ? (
                  <span className="flex items-center gap-2.5 rounded-xl border border-tw-border bg-tw-surface-2 px-3.5 py-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!values[f.key]}
                      onChange={(e) => set(f.key, e.target.checked)}
                      className="h-4 w-4"
                    />
                    {tr(f.label)}
                  </span>
                ) : f.type === 'select' ? (
                  <Select
                    ariaLabel={tr(f.label)}
                    className="[&>button]:min-h-11"
                    value={values[f.key] ?? ''}
                    onChange={(value) => set(f.key, value)}
                    options={options}
                    placeholder={tr("Choose…")}
                  />
                ) : f.type === 'date' || f.type === 'month' ? (
                  <DatePicker
                    ariaLabel={tr(f.label)}
                    className="[&>button]:min-h-11"
                    compact
                    mode={f.type}
                    value={values[f.key] ?? ''}
                    onChange={(value) => set(f.key, value)}
                    minDate={f.type === 'month' ? '2000-01-01' : undefined}
                    maxDate={
                      f.type === 'month'
                        ? '2099-12-31'
                        : f.key !== 'dueDate'
                          ? dashboard.today
                          : undefined
                    }
                  />
                ) : f.type === 'textarea' ? (
                  <textarea
                    className={input}
                    required
                    rows={5}
                    maxLength={10000}
                    value={values[f.key] ?? ''}
                    onChange={(e) => set(f.key, e.target.value)}
                  />
                ) : (
                  <input
                    className={input}
                    type={f.type}
                    required
                    min={f.min}
                    max={f.max}
                    maxLength={300}
                    step={f.type === 'number' ? 1 : undefined}
                    value={values[f.key] ?? ''}
                    onChange={(e) =>
                      set(
                        f.key,
                        f.type === 'number'
                          ? e.target.value === ''
                            ? ''
                            : Number(e.target.value)
                          : e.target.value
                      )
                    }
                  />
                )}
              </label>
            )
          })}
        {task.id >= 12 && task.id < 15 && (
          dashboard.driveConnected
            ? <CertificateUpload file={file} onChange={setFile} disabled={busy} />
            : <div className="alert-warning flex items-start gap-2">
                <Icon name="cloud" className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{tr("Google Drive isn't connected yet. Ask your Director to connect it (Settings → Letter management) so you can upload your certificate.")}</span>
              </div>
        )}
        <p className="text-xs text-tw-text-secondary flex items-start gap-1.5">
          <Icon name="clock" className="w-3.5 h-3.5 flex-shrink-0 mt-px" />{tr("Submission time is recorded by the server. Points remain zero until AD approval. Dates use Sri Lanka time.")}</p>
        {error && (
          <p role="alert" className="alert-error">
            {error}
          </p>
        )}
        <button className={primary + ' w-full sm:w-auto py-3 sm:py-2'} disabled={busy}>
          {busy
            ? task.id >= 12 ? tr("Uploading to Google Drive…") : tr("Submitting…")
            : previous
              ? tr("Submit revised entry")
              : tr("Submit for AD approval")}
        </button>
      </form>
    </Modal>
  )
}
function DecisionDialog({
  title,
  description,
  actionLabel,
  required = true,
  onSave,
  onClose,
}: {
  title: string
  description: string
  actionLabel: string
  required?: boolean
  onSave: (reason: string) => Promise<void>
  onClose: () => void
}) {
  const { t: tr, locale } = useLanguage()
  const [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  return (
    <Modal title={title} onClose={onClose}>
      <p className="text-sm text-slate-600 mb-4">{description}</p>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          try {
            await onSave(reason)
            onClose()
          } catch (e) {
            setError((e as Error).message)
          } finally {
            setBusy(false)
          }
        }}
      >
        <label className="block text-sm">
          {tr("Reason / feedback")}{required ? tr("(required)") : tr("(optional)")}
          <textarea
            className={input + ' mt-1'}
            value={reason}
            required={required}
            maxLength={2000}
            rows={3}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="text-rose-700">
            {error}
          </p>
        )}
        <button className={primary} disabled={busy}>
          {busy ? tr("Saving…") : actionLabel}
        </button>
      </form>
    </Modal>
  )
}
function AssessmentForm({
  person,
  period,
  dashboard,
  onClose,
  onSave,
}: {
  person: YsoPerson
  period: string
  dashboard: YsoDashboard
  onClose: () => void
  onSave: () => Promise<void>
}) {
  const { t: tr, locale } = useLanguage()
  const existing = dashboard.assessments.find(
    (a) => a.personnelId === person.id && a.period === period
  )
  const [scores, setScores] = useState<Record<string, number | ''>>(
    existing?.scores ??
      Object.fromEntries(dashboard.criteria.map((c) => [c.key, 0]))
  )
  const [rationale, setRationale] = useState(existing?.rationale ?? ''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  return (
    <Modal title={`Monthly evaluation · ${person.name}`} onClose={onClose}>
      <p className="text-sm text-slate-500 mb-4">
        {period} ·{' '}
        {existing ? tr("Revision of existing evaluation") : tr("New evaluation")}
      </p>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          try {
            await ysoApi.assess(person.id, { period, scores, rationale })
            await onSave()
            onClose()
          } catch (e) {
            setError((e as Error).message)
          } finally {
            setBusy(false)
          }
        }}
      >
        {dashboard.criteria.map((c) => (
          <label
            className="flex items-center justify-between gap-4 text-sm"
            key={c.key}
          >
            {tr('{label} (maximum {max})', { label: tr(c.label), max: c.max })}
            <input
              className={input + ' !w-24'}
              type="number"
              required
              min={0}
              max={c.max}
              step={1}
              value={scores[c.key]}
              onChange={(e) =>
                setScores({
                  ...scores,
                  [c.key]: e.target.value === '' ? '' : Number(e.target.value),
                })
              }
            />
          </label>
        ))}
        <p className="font-bold">
          {tr("Total:")}{' '}
          {Object.values(scores).reduce<number>((a, b) => a + Number(b), 0)} /
          25
        </p>
        <label className="block text-sm">
          {tr("Assessment rationale")}<textarea
            className={input + ' mt-1'}
            required
            maxLength={2000}
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            rows={3}
          />
        </label>
        {error && (
          <p className="text-rose-700" role="alert">
            {error}
          </p>
        )}
        <button disabled={busy} className={primary}>
          {tr("Save monthly evaluation")}</button>
      </form>
    </Modal>
  )
}
function MeetingForm({
  dashboard,
  onClose,
  onSave,
}: {
  dashboard: YsoDashboard
  onClose: () => void
  onSave: () => Promise<void>
}) {
  const { t: tr, locale } = useLanguage()
  const people = dashboard.people.filter(
    (p) => p.active && p.startDate && p.managerValid
  )
  const [values, setValues] = useState({
    title: '',
    date: dashboard.today,
    location: '',
    invitees: people.map((p) => p.id),
  })
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  return (
    <Modal title={tr("Schedule district officer meeting")} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          try {
            if (!values.date) throw new Error(tr("Choose a meeting date."))
            await ysoApi.meeting(values)
            await onSave()
            onClose()
          } catch (e) {
            setError((e as Error).message)
          } finally {
            setBusy(false)
          }
        }}
      >
        {(['title', 'date', 'location'] as const).map((key) => (
          <label className="block text-sm capitalize" key={key}>
            {key}
            {key === 'date' ? (
              <DatePicker
                compact
                ariaLabel={tr("Meeting date")}
                className="mt-1 [&>button]:min-h-11"
                value={values.date}
                minDate={dashboard.today}
                onChange={(date) => setValues({ ...values, date })}
              />
            ) : (
              <input
                className={input + ' mt-1'}
                required
                type="text"
                maxLength={key === 'title' ? 200 : 300}
                value={values[key]}
                onChange={(e) =>
                  setValues({ ...values, [key]: e.target.value })
                }
              />
            )}
          </label>
        ))}
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold mb-2">{tr("Invite YSOs")}</legend>
          {people.map((p) => (
            <label className="flex gap-2 items-center text-sm" key={p.id}>
              <input
                type="checkbox"
                checked={values.invitees.includes(p.id)}
                onChange={(e) =>
                  setValues({
                    ...values,
                    invitees: e.target.checked
                      ? [...values.invitees, p.id]
                      : values.invitees.filter((id) => id !== p.id),
                  })
                }
              />
              {p.name}
            </label>
          ))}
          {!people.length && (
            <p className="text-sm">{tr("Activate reporting for your YSOs first.")}</p>
          )}
        </fieldset>
        {error && (
          <p role="alert" className="text-rose-700">
            {error}
          </p>
        )}
        <button className={primary} disabled={busy || !values.invitees.length}>
          {tr("Schedule meeting")}</button>
      </form>
    </Modal>
  )
}
function Analytics({
  dashboard,
  people,
  period,
  adId,
}: {
  dashboard: YsoDashboard
  people: YsoPerson[]
  period: string
  adId?: string
}) {
  const { t: tr, locale } = useLanguage()
  const ids = people.map((p) => p.id),
    ledger = dashboard.ledger.filter(
      (l) => ids.includes(l.personnelId) && (!adId || l.adId === adId)
    )
  const selected = ledger.filter((l) => l.period === period),
    entries = dashboard.entries.filter(
      (e) =>
        ids.includes(e.personnelId) &&
        e.period === period &&
        !e.supersededAt &&
        (!adId || e.assignedAdId === adId)
    )
  const ranking = people
    .map((p) => ({
      ...p,
      total: selected
        .filter((l) => l.personnelId === p.id)
        .reduce((a, b) => a + b.points, 0),
    }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
  const months = Array.from({ length: 6 }, (_, i) => {
    const [y, m] = period.split('-').map(Number)
    return new Date(Date.UTC(y, m - 6 + i, 1)).toISOString().slice(0, 7)
  })
  const trend = months.map((p) =>
      ledger.filter((l) => l.period === p).reduce((a, b) => a + b.points, 0)
    ),
    min = Math.min(0, ...trend),
    max = Math.max(1, ...trend)
  const y = (v: number) => 140 - ((v - min) / (max - min)) * 115
  const slices = ['APPROVED', 'PENDING', 'REJECTED'].map((status, i) => ({
    status,
    value: entries.filter(
      (e) =>
        e.status === status ||
        (status === 'PENDING' && e.status === 'SUBMITTED')
    ).length,
    color: ['#0f766e', '#d97706', '#e11d48'][i],
  }))
  const count = slices.reduce((a, b) => a + b.value, 0)
  let angle = 0
  const gradient = slices
    .map((s) => {
      const begin = angle
      angle += count ? (s.value / count) * 360 : 0
      return `${s.color} ${begin}deg ${angle}deg`
    })
    .join(', ')
  return (
    <div className="space-y-5">
      <div className="grid lg:grid-cols-2 gap-5">
        <section className={panel}>
          <h3 className="font-semibold tracking-tight mb-5">{tr("Monthly score trend")}</h3>
          <svg
            viewBox="0 0 520 180"
            role="img"
            aria-label={`Monthly totals: ${months.map((m, i) => `${m}: ${trend[i]}`).join(', ')}`}
            className="w-full"
          >
            <line x1="25" x2="495" y1={y(0)} y2={y(0)} stroke="currentColor" className="text-tw-border-strong" />
            <polyline
              points={trend.map((v, i) => `${30 + i * 92},${y(v)}`).join(' ')}
              fill="none"
              stroke="currentColor"
              className="text-teal-600"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {trend.map((v, i) => (
              <g key={months[i]}>
                <circle cx={30 + i * 92} cy={y(v)} r="4.5" fill="currentColor" className="text-teal-600" stroke="rgb(var(--tw-surface))" strokeWidth="2" />
                <text
                  x={30 + i * 92}
                  y={y(v) - 9}
                  textAnchor="middle"
                  fontSize="12"
                  fontWeight="600"
                  className="fill-tw-text"
                >
                  {v}
                </text>
                <text x={30 + i * 92} y="170" textAnchor="middle" fontSize="11" className="fill-tw-text-secondary">
                  {months[i]}
                </text>
              </g>
            ))}
          </svg>
        </section>
        <section className={panel}>
          <h3 className="font-semibold tracking-tight mb-5">{tr("Submission engagement")}</h3>
          <div className="flex items-center gap-8 flex-wrap">
            <div
              role="img"
              aria-label={slices
                .map((s) => `${pretty(s.status)}: ${s.value}`)
                .join(', ')}
              className="w-32 h-32 rounded-full"
              style={{
                background: count ? `conic-gradient(${gradient})` : 'rgb(var(--tw-hover))',
                WebkitMask: 'radial-gradient(circle at center, transparent 54%, #000 55%)',
                mask: 'radial-gradient(circle at center, transparent 54%, #000 55%)',
              }}
            />
            <div className="space-y-3">
              {slices.map((s) => (
                <div className="flex items-center gap-2 text-sm" key={s.status}>
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ background: s.color }}
                  />
                  {pretty(s.status)} <strong>{s.value}</strong>
                </div>
              ))}
              {!count && (
                <p className="text-sm text-slate-500">
                  {tr("No submissions this month")}</p>
              )}
            </div>
          </div>
        </section>
      </div>
      <section className={panel}>
        <h3 className="font-semibold tracking-tight mb-4">{tr("Comparative YSO leaderboard")}</h3>
        <p className="text-xs text-slate-500 mb-4">
          {period} {tr("· Approved awards and confirmed deductions. Qualification awards appear only in their credited month.")}</p>
        {ranking.map((p, i) => (
          <div
            className="grid grid-cols-[1.5rem_1fr_4rem] items-center gap-3 mb-3"
            key={p.id}
          >
            <span className="text-sm text-slate-400">{i + 1}</span>
            <div>
              <div className="text-sm mb-1">{p.name}</div>
              <div className="h-2 bg-slate-100 rounded">
                <div
                  className={`h-2 rounded ${p.total < 0 ? 'bg-rose-500' : 'bg-teal-600'}`}
                  style={{
                    width: `${(Math.abs(p.total) / Math.max(1, ...ranking.map((r) => Math.abs(r.total)))) * 100}%`,
                  }}
                />
              </div>
            </div>
            <strong className="text-right text-sm">{signed(p.total)}</strong>
          </div>
        ))}
        {!ranking.length && (
          <p className="text-sm text-slate-500">{tr("No YSOs in this scope.")}</p>
        )}
      </section>
      <section className={panel}>
        <h3 className="font-semibold tracking-tight mb-4">{tr("Task-by-task points")}</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead>
              <tr>
                <th className="text-left p-2" rowSpan={2}>{tr("YSO")}</th>
                {groupTasks(dashboard.tasks).map((g) => (
                  <th className="p-2 text-center border-l border-tw-border whitespace-nowrap" colSpan={g.tasks.length} key={g.key}>
                    {tr(g.title)}
                  </th>
                ))}
                <th className="p-2 border-l border-tw-border" rowSpan={2}>{tr("Total")}</th>
              </tr>
              <tr>
                {groupTasks(dashboard.tasks).flatMap((g) => g.tasks.map((t, i) => (
                  <th className={`p-2 text-center ${i === 0 ? 'border-l border-tw-border' : ''}`} title={tr(t.title)} key={t.id}>
                    {i + 1}
                  </th>
                )))}
              </tr>
            </thead>
            <tbody>
              {ranking.map((p) => (
                <tr className="border-t" key={p.id}>
                  <th className="text-left p-2 whitespace-nowrap">{p.name}</th>
                  {groupTasks(dashboard.tasks).flatMap((g) => g.tasks).map((t) => (
                    <td className="p-2 text-center" key={t.id}>
                      {selected
                        .filter(
                          (l) => l.personnelId === p.id && l.task === t.id
                        )
                        .reduce((a, b) => a + b.points, 0)}
                    </td>
                  ))}
                  <td className="font-bold p-2">{p.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className={panel}>
        <h3 className="font-bold mb-1">{tr("AD evaluation distribution")}</h3>
        <p className="text-xs text-slate-500 mb-4">
          {tr("Compare criterion averages and the number evaluated. A missing evaluation is not a zero score.")}</p>
        <div className="overflow-x-auto">
          <table className="table-modern">
            <thead>
              <tr>
                <th className="p-2">{tr("Grading AD")}</th>
                <th className="p-2">{tr("Evaluated")}</th>
                {dashboard.criteria.map((c) => (
                  <th className="p-2" key={c.key}>
                    {tr(c.label)} / {c.max}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from(
                new Set(
                  dashboard.assessments
                    .filter(
                      (a) => a.period === period && ids.includes(a.personnelId)
                    )
                    .map((a) => a.adId)
                )
              ).map((ad) => {
                const assessments = dashboard.assessments.filter(
                  (a) =>
                    a.adId === ad &&
                    a.period === period &&
                    ids.includes(a.personnelId)
                )
                return (
                  <tr key={ad} className="border-t">
                    <td className="p-2">
                      {dashboard.ads.find((a) => a.id === ad)?.name ??
                        'Previous AD'}
                    </td>
                    <td className="p-2">{assessments.length}</td>
                    {dashboard.criteria.map((c) => (
                      <td className="p-2" key={c.key}>
                        {(
                          assessments.reduce(
                            (sum, a) => sum + a.scores[c.key],
                            0
                          ) / assessments.length
                        ).toFixed(1)}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

// ─── Task Hub layout helpers ──────────────────────────────────────────────────
// Tasks are grouped so the YSO scans a short, labelled list instead of a wall
// of identical cards. Unknown task ids fall into "Other tasks".
const TASK_GROUPS: Array<{ key: string; title: string; icon: IconName; ids: number[] }> = [
  { key: 'reporting', title: 'Monthly reporting', icon: 'calendar', ids: [2, 3, 4, 9] },
  { key: 'community', title: 'Community & programs', icon: 'users', ids: [1, 7, 8, 11] },
  { key: 'funds', title: 'Funds', icon: 'briefcase', ids: [5, 6, 10] },
  { key: 'qualifications', title: 'Qualifications', icon: 'award', ids: [12, 13, 14] },
  { key: 'evaluation', title: 'Evaluation', icon: 'star', ids: [15] },
]
const OTHER_GROUP = { key: 'other', title: 'Other tasks', icon: 'tasks' as IconName, ids: [] as number[] }
/** Groups with their tasks in display order (unknown task ids go to "Other tasks"). */
function groupTasks(tasks: YsoTask[]) {
  return [
    ...TASK_GROUPS.map((g) => ({ ...g, tasks: g.ids.map((id) => tasks.find((t) => t.id === id)).filter((t): t is YsoTask => !!t) })),
    { ...OTHER_GROUP, tasks: tasks.filter((t) => !TASK_GROUPS.some((g) => g.ids.includes(t.id))) },
  ].filter((g) => g.tasks.length > 0)
}
/** A task's category and its 1-based position inside that category (what users see). */
function taskPosition(id: number, tasks: YsoTask[]) {
  for (const g of groupTasks(tasks)) {
    const i = g.tasks.findIndex((t) => t.id === id)
    if (i >= 0) return { group: g, index: i + 1 }
  }
  return { group: OTHER_GROUP, index: 0 }
}

/** Number within its category (1, 2, 3…) — used in the grouped task list. */
function TaskNumber({ index, size = 'md' }: { index: number; size?: 'sm' | 'md' }) {
  return (
    <span className={`${size === 'sm' ? 'w-8 h-8 rounded-lg text-xs' : 'w-10 h-10 rounded-xl text-sm'} flex-shrink-0 inline-flex items-center justify-center font-bold tabular-nums bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-100`}>
      {index}
    </span>
  )
}

/** Category icon — used where tasks from different categories are mixed. */
function TaskBadge({ id, tasks }: { id: number; tasks: YsoTask[] }) {
  const { t: tr } = useLanguage()
  const { group } = taskPosition(id, tasks)
  return (
    <span title={tr(group.title)} className="w-8 h-8 rounded-lg flex-shrink-0 inline-flex items-center justify-center bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-100">
      <Icon name={group.icon} className="w-4 h-4" />
    </span>
  )
}

function PointsPill({ value }: { value: number }) {
  const cls = value > 0
    ? 'bg-emerald-50 text-emerald-700 ring-emerald-200/70'
    : value < 0
      ? 'bg-rose-50 text-rose-700 ring-rose-200/70'
      : 'bg-tw-surface-2 text-tw-text-secondary ring-tw-border'
  return (
    <span className={`inline-flex items-center justify-center min-w-[3.25rem] px-2 py-1 rounded-lg text-xs font-bold tabular-nums ring-1 ring-inset ${cls}`}>
      {signed(value)}
    </span>
  )
}

/** Side panel on desktop, bottom sheet on phones. */
function Sheet({ title, overline, lead, onClose, footer, children }: {
  title: React.ReactNode
  overline?: React.ReactNode
  lead?: React.ReactNode
  onClose: () => void
  footer?: React.ReactNode
  children: React.ReactNode
}) {
  const { t: tr } = useLanguage()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Let open pickers and dialogs stacked above handle Escape first
      if (e.key !== 'Escape' || document.querySelector('[data-system-picker], [role="dialog"][aria-modal="true"]')) return
      onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center sm:p-6">
      <div className="absolute inset-0 bg-[#0b1220]/50 backdrop-blur-[3px] animate-fade-in" onClick={onClose} />
      <section role="dialog" aria-label={typeof title === 'string' ? title : undefined}
        className="relative w-full sm:max-w-4xl max-h-[88dvh] sm:max-h-[min(86vh,760px)] flex flex-col bg-tw-surface border border-tw-border shadow-panel rounded-t-3xl sm:rounded-3xl animate-slide-up sm:animate-pop-in overflow-hidden">
        <div className="sm:hidden w-10 h-1 bg-tw-border-strong rounded-full mx-auto mt-3" />
        <header className="flex items-start gap-3 px-5 sm:px-6 pt-4 sm:pt-5 pb-4 border-b border-tw-border bg-gradient-to-br from-teal-50/70 via-tw-surface to-tw-surface">
          {lead}
          <div className="flex-1 min-w-0">
            {overline && <p className="section-label text-teal-600">{overline}</p>}
            <h2 className="text-lg font-bold tracking-tight text-tw-text leading-snug">{title}</h2>
          </div>
          <button onClick={onClose} className="icon-btn border-tw-border bg-tw-surface flex-shrink-0" aria-label={tr('Close dialog')} autoFocus>
            <Icon name="x" className="w-4 h-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 sm:px-6 py-5">{children}</div>
        {footer && (
          <footer className="px-5 sm:px-6 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4 border-t border-tw-border bg-tw-surface-2/70 flex sm:justify-end">
            <div className="w-full sm:w-auto sm:min-w-[260px]">{footer}</div>
          </footer>
        )}
      </section>
    </div>
  )
}

/** Card with a consistent header row; body content sits flush or padded. */
function SectionCard({ title, icon, meta, action, flush = false, children }: {
  title: React.ReactNode
  icon?: IconName
  meta?: React.ReactNode
  action?: React.ReactNode
  flush?: boolean
  children: React.ReactNode
}) {
  return (
    <section className="card overflow-hidden">
      <header className="flex items-center gap-2.5 px-4 sm:px-5 py-3 border-b border-tw-border bg-tw-surface-2/60">
        {icon && <span className="icon-tile tile-teal w-8 h-8 rounded-lg"><Icon name={icon} className="w-4 h-4" /></span>}
        <h2 className="flex-1 min-w-0 font-semibold text-sm text-tw-text truncate">{title}</h2>
        {meta && <span className="text-xs text-tw-text-secondary flex-shrink-0">{meta}</span>}
        {action}
      </header>
      <div className={flush ? '' : 'p-4 sm:p-5'}>{children}</div>
    </section>
  )
}

export default function YsoPerformancePage({ user, onUserUpdate }: { user: AuthUser; onUserUpdate: (value: Partial<AuthUser>) => void }) {
  const { t: tr, locale } = useLanguage()
  const [dashboard, setDashboard] = useState<YsoDashboard | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState(() =>
    new Date(Date.now() + 19800000).toISOString().slice(0, 7)
  )
  const [tab, setTab] = useState('monitor'),
    [selectedAd, setSelectedAd] = useState(''),
    [selectedPerson, setSelectedPerson] = useState(''),
    [selectedTask, setSelectedTask] = useState<number | null>(null)
  const [entryForm, setEntryForm] = useState<{
      task: YsoTask
      previous?: YsoEntry
    } | null>(null),
    [assessment, setAssessment] = useState<YsoPerson | null>(null),
    [meetingForm, setMeetingForm] = useState(false)
  const [decision, setDecision] = useState<{
    title: string
    description: string
    label: string
    required?: boolean
    save: (reason: string) => Promise<void>
  } | null>(null)
  const [notice, setNotice] = useState(''),
    [activation, setActivation] = useState<YsoPerson | null>(null),
    [activationDate, setActivationDate] = useState(''),
    [busy, setBusy] = useState(false)
  async function load() {
    const data = await ysoApi.dashboard()
    setDashboard(data)
    setError('')
    return data
  }
  useEffect(() => {
    let cancelled = false
    ysoApi
      .dashboard()
      .then((data) => {
        if (!cancelled) setDashboard(data)
      })
      .catch((e) => {
        if (!cancelled) setError(e.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user.actorId])
  useRefreshListener(() => refresh().catch((e) => setError(e.message)))
  const refresh = async () => {
    await load()
  }
  const mutate = async (
    operation: () => Promise<unknown>,
    message = 'Saved.'
  ) => {
    await operation()
    await refresh()
    setNotice(message)
  }
  const people = useMemo(
    () =>
      dashboard?.people.filter(
        (p) =>
          (!selectedAd ||
            p.adId === selectedAd ||
            (dashboard.role === 'DIRECTOR' &&
              dashboard.ledger.some(
                (l) =>
                  l.personnelId === p.id &&
                  l.adId === selectedAd &&
                  l.period === period
              ))) &&
          (!selectedPerson || p.id === selectedPerson)
      ) ?? [],
    [dashboard, selectedAd, selectedPerson, period]
  )
  if (loading)
    return (
      <div className={panel} role="status">
        {tr("Loading YSO performance…")}</div>
    )
  if (!dashboard)
    return (
      <div className={panel}>
        <p role="alert" className="text-rose-700">
          {error || tr("Unable to load YSO performance.")}
        </p>
        <button
          className={secondary + ' mt-4'}
          onClick={() => {
            setLoading(true)
            load()
              .catch((e) => setError(e.message))
              .finally(() => setLoading(false))
          }}
        >
          {tr("Retry")}</button>
      </div>
    )
  const d = dashboard,
    isYso = d.role === 'YSO',
    isAd = d.role === 'AD',
    ids = people.map((p) => p.id)
  const scopedEntries = d.entries.filter((e) => ids.includes(e.personnelId)),
    queue = scopedEntries.filter(pending)
  const monthEntries = scopedEntries.filter(
    (e) => e.period === period && !e.supersededAt
  )
  const ledger = d.ledger.filter(
    (l) =>
      ids.includes(l.personnelId) &&
      l.period === period &&
      (!selectedAd || d.role !== 'DIRECTOR' || l.adId === selectedAd)
  )
  const total = ledger.reduce((a, b) => a + b.points, 0),
    qualifications = ledger
      .filter((l) => l.task >= 12 && l.task <= 14)
      .reduce((a, b) => a + b.points, 0),
    evaluation = ledger
      .filter((l) => l.task === 15)
      .reduce((a, b) => a + b.points, 0)
  const deductions = ledger
    .filter((l) => l.task < 12)
    .reduce<Record<number, number>>((acc, l) => {
      acc[l.task] = (acc[l.task] ?? 0) + l.points
      return acc
    }, {})
  const obligationQueue = d.obligations.filter((o) =>
    ids.includes(o.personnelId)
  )
  const weekly = weeklyProgress(d, period)
  const meetingState = (m: YsoMeeting) => {
    if (m.cancelled) return tr('Cancelled — exempt')
    if (!isYso) return `${m.invitees.length} ${tr('invited')}`
    const entries = d.entries.filter(
      (e) => e.task === 2 && e.data.meetingId === m.id && !e.supersededAt
    )
    if (entries.some(pending)) return tr('Attendance awaiting AD approval')
    const approved = entries.find((e) => e.status === 'APPROVED')
    return approved
      ? tr(pretty(approved.data.attendance).toUpperCase() === 'APPROVED LEAVE' ? 'APPROVED LEAVE' : pretty(approved.data.attendance))
      : m.date.slice(0, 7) < d.today.slice(0, 7)
        ? tr('Absent — unmarked at month-end')
        : tr('Attendance not marked yet')
  }
  const personName = (id: string) =>
    d.people.find((p) => p.id === id)?.name ?? 'YSO'
  const review = (entry: YsoEntry, action: 'APPROVE' | 'REJECT' | 'REVOKE') =>
    setDecision({
      title: `${tr(pretty(action))} · ${tr(d.tasks.find((t) => t.id === entry.task)?.title ?? '')}`,
      description: `${personName(entry.personnelId)} · ${tr('submitted')} ${when(entry.submittedAt, locale)}. ${tr(action === 'APPROVE' ? 'The original submission time determines deadline points.' : action === 'REVOKE' ? 'This reverses the approved award and keeps the audit history.' : 'The YSO can correct and resubmit.')}`,
      label:
        action === 'APPROVE'
          ? 'Approve entry'
          : action === 'REJECT'
            ? 'Reject entry'
            : 'Revoke approval',
      required: action === 'REVOKE',
      save: (reason) =>
        mutate(
          () => ysoApi.review(entry.id, action, reason),
          `${d.tasks.find((t) => t.id === entry.task)?.title ?? 'Entry'} reviewed.`
        ),
    })
  const penalty = (o: YsoObligation, outcome: string) =>
    setDecision({
      title:
        outcome === 'DEDUCT'
          ? `Confirm ${o.points} point deduction`
          : 'Record exemption',
      description: `${personName(o.personnelId)} · ${tr(o.reason)}`,
      label: outcome === 'DEDUCT' ? 'Confirm deduction' : 'Save exemption',
      save: (reason) =>
        mutate(() =>
          ysoApi.penalty(o.personnelId, { key: o.key, outcome, reason })
        ),
    })
  const taskTitle = (id: number) => tr(d.tasks.find((t) => t.id === id)?.title ?? '')
  const entryList = (entries: YsoEntry[], canReview: boolean) => (
    <div className="space-y-3">
      {entries.length === 0 && (
        <p className="text-sm text-tw-text-secondary py-6 text-center">{tr("No entries to show.")}</p>
      )}
      {entries.map((e) => (
        <article className="rounded-2xl border border-tw-border bg-tw-surface p-4" key={e.id}>
          <div className="flex items-start gap-3">
            <TaskBadge id={e.task} tasks={d.tasks} />
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-sm text-tw-text">
                {!isYso && `${personName(e.personnelId)} · `}{taskTitle(e.task)}
              </h4>
              <p className="text-xs text-tw-text-secondary mt-0.5">
                {e.period} · {tr("Submitted")} {when(e.submittedAt, locale)}
                {e.supersededAt ? tr(' · Superseded version') : ''}
              </p>
            </div>
            <Status value={e.status} />
          </div>
          {Object.keys(e.data).length > 0 && (
            <dl className="grid sm:grid-cols-2 gap-x-5 gap-y-3 mt-3 pt-3 border-t border-tw-border text-sm">
              {Object.entries(e.data).map(([key, value]) => (
                <div key={key} className="min-w-0">
                  <dt className="text-xs text-tw-text-secondary">
                    {tr(d.tasks
                      .find((t) => t.id === e.task)
                      ?.fields.find((f) => f.key === key)?.label ?? key)}
                  </dt>
                  <dd className="mt-0.5 text-tw-text whitespace-pre-wrap break-words">
                    {typeof value === 'boolean'
                      ? value
                        ? tr('Yes')
                        : tr('No')
                      : key === 'meetingId'
                        ? (d.meetings.find((m) => m.id === value)?.title ?? value)
                        : key === 'advanceId'
                          ? (d.entries.find((a) => a.id === value)?.data
                              .reference ?? value)
                          : ['ATTENDED', 'ABSENT', 'APPROVED_LEAVE', 'ADVANCE', 'SETTLEMENT'].includes(String(value))
                            ? tr(String(value).replace('_', ' '))
                            : String(value)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {e.feedback && (
            <p className="mt-3 alert-warning flex items-start gap-2">
              <Icon name="message" className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span><span className="font-semibold">{tr("AD feedback:")}</span> {e.feedback}</span>
            </p>
          )}
          {(e.attachment || (canReview && (pending(e) || (e.status === 'APPROVED' && !e.supersededAt))) || (isYso && !e.supersededAt && ['REJECTED', 'APPROVED'].includes(e.status))) && (
            <div className="flex flex-wrap gap-2 mt-3">
              {e.attachment && (
                <button
                  className="btn-secondary btn-sm max-w-full"
                  title={e.attachment.name}
                  onClick={() =>
                    ysoApi
                      .certificate(e.attachment!)
                      .catch((error) => setError(error.message))
                  }
                >
                  <Icon name="cloud" className="w-3.5 h-3.5 text-teal-600 flex-shrink-0" />
                  <span className="truncate">{tr("Certificate")}{e.attachment.size ? ` · ${fileSize(e.attachment.size)}` : ''}</span>
                  <Icon name="download" className="w-3.5 h-3.5 flex-shrink-0" />
                </button>
              )}
              {canReview && pending(e) && (
                <>
                  <button className="btn-success btn-sm" onClick={() => review(e, 'APPROVE')}>
                    <Icon name="check" className="w-3.5 h-3.5" />{tr("Approve")}</button>
                  <button className="btn-outline-danger btn-sm" onClick={() => review(e, 'REJECT')}>
                    <Icon name="sendBack" className="w-3.5 h-3.5" />{tr("Reject")}</button>
                </>
              )}
              {canReview && e.status === 'APPROVED' && !e.supersededAt && (
                <button className="btn-secondary btn-sm" onClick={() => review(e, 'REVOKE')}>
                  <Icon name="undo" className="w-3.5 h-3.5" />{tr("Revoke approval")}</button>
              )}
              {isYso &&
                !e.supersededAt &&
                ['REJECTED', 'APPROVED'].includes(e.status) && (
                  <button
                    className="btn-secondary btn-sm"
                    onClick={() =>
                      setEntryForm({
                        task: d.tasks.find((t) => t.id === e.task)!,
                        previous: e,
                      })
                    }
                  >
                    <Icon name="edit" className="w-3.5 h-3.5" />
                    {e.status === 'REJECTED' ? tr("Resubmit") : tr("Correct entry")}
                  </button>
                )}
            </div>
          )}
        </article>
      ))}
    </div>
  )
  const monthLabel = monthYear(period, languageOf(locale))
  const monthMeetings = d.meetings.filter(
    (m) =>
      m.date.slice(0, 7) === period &&
      (!selectedAd || m.adId === selectedAd) &&
      (!selectedPerson || m.invitees.includes(selectedPerson))
  )
  const calendar = (
    <SectionCard
      title={tr("District meeting calendar")}
      icon="calendar"
      meta={monthMeetings.length ? `${monthMeetings.length}` : undefined}
      action={isAd ? (
        <button className="btn-secondary btn-sm" onClick={() => setMeetingForm(true)}>
          <Icon name="plus" className="w-3.5 h-3.5" />{tr("Schedule")}</button>
      ) : undefined}
      flush
    >
      {monthMeetings.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-tw-text-secondary">
          {tr("No meetings scheduled for this month.")}</p>
      ) : (
        <ul className="divide-y divide-tw-border">
          {monthMeetings.map((m) => {
            const date = new Date(m.date + 'T00:00:00Z')
            return (
              <li className="flex items-center gap-3 px-4 sm:px-5 py-3" key={m.id}>
                <div className={`w-11 flex-shrink-0 text-center rounded-xl border py-1 ${m.cancelled ? 'border-tw-border bg-tw-surface-2 opacity-60' : 'border-teal-200 bg-teal-50'}`}>
                  <div className="text-[10px] font-semibold uppercase text-teal-700 leading-tight">{date.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })}</div>
                  <div className="text-base font-bold leading-tight text-tw-text tabular-nums">{date.getUTCDate()}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold text-tw-text truncate ${m.cancelled ? 'line-through opacity-60' : ''}`}>{m.title}</p>
                  <p className="text-xs text-tw-text-secondary truncate inline-flex items-center gap-1 max-w-full">
                    <Icon name="target" className="w-3 h-3 flex-shrink-0" /><span className="truncate">{m.location}</span>
                  </p>
                  <p className="text-xs text-tw-text-secondary mt-0.5">{meetingState(m)}</p>
                </div>
                {isAd && m.adId === user.actorId && !m.cancelled && (
                  <button
                    className="btn-ghost btn-sm text-tw-danger hover:text-tw-danger flex-shrink-0"
                    onClick={() =>
                      setDecision({
                        title: tr("Cancel meeting"),
                        description:
                          tr("Attendance awards and related absence deductions will be reversed."),
                        label: tr("Cancel meeting"),
                        save: (reason) =>
                          mutate(() => ysoApi.cancelMeeting(m.id, reason)),
                      })
                    }
                  >
                    {tr("Cancel")}</button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </SectionCard>
  )
  const requirements = (
    <SectionCard title={tr("Requirements & penalty review")} icon="alert" meta={obligationQueue.length ? `${obligationQueue.length}` : undefined} flush>
      <p className="px-4 sm:px-5 pt-3 text-xs text-tw-text-secondary">
        {tr("Unmarked meeting invitations become absent after month-end. Missing reports, weeks and unsettled advances require an AD decision. A pending submission holds a new penalty for review.")}</p>
      {obligationQueue.length ? (
        <ul className="divide-y divide-tw-border mt-3">
          {obligationQueue.map((o) => {
            const decisionReason = d.decisions.find((x) => x.personnelId === o.personnelId && x.key === o.key)?.reason
            const stateLabel = o.blocked
              ? tr("Awaiting submission review")
              : o.outcome === 'EXEMPT'
                ? tr("Exempted by AD")
                : o.outcome === 'DEDUCT'
                  ? tr("Deduction confirmed")
                  : tr("Awaiting AD decision")
            return (
              <li className="px-4 sm:px-5 py-3" key={`${o.personnelId}/${o.key}`}>
                <div className="flex items-start gap-3">
                  <TaskBadge id={o.task} tasks={d.tasks} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-tw-text">
                        {!isYso && `${personName(o.personnelId)} · `}{taskTitle(o.task)}
                      </p>
                      <PointsPill value={o.points} />
                    </div>
                    <p className="text-sm text-tw-text-secondary mt-0.5">{tr(o.reason)}</p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      <span className={`badge ${o.outcome === 'EXEMPT' ? 'badge-success' : o.outcome === 'DEDUCT' ? 'badge-danger' : 'badge-warning'}`}>{stateLabel}</span>
                      <span className="text-xs text-tw-text-muted">{o.period}</span>
                    </div>
                    {decisionReason && <p className="text-xs text-tw-text-secondary mt-1.5">{decisionReason}</p>}
                    {isAd && !o.blocked && (
                      <div className="flex gap-2 mt-3">
                        <button className="btn-outline-danger btn-sm" onClick={() => penalty(o, 'DEDUCT')}>
                          {tr("Confirm deduction")}</button>
                        <button className="btn-secondary btn-sm" onClick={() => penalty(o, 'EXEMPT')}>
                          {tr("Exempt")}</button>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="px-5 pt-4 pb-6 text-center text-sm text-tw-text-secondary">
          {tr("No overdue requirements awaiting a decision.")}</p>
      )}
    </SectionCard>
  )
  // ── YSO task hub data ──
  const me = d.people[0]
  const canSubmit = !!(me?.startDate && me.managerValid)
  const statsFor = (taskId: number) => {
    const list = monthEntries.filter((e) => e.task === taskId)
    return {
      approved: list.filter((e) => e.status === 'APPROVED').length,
      waiting: list.filter(pending).length,
      rejected: list.filter((e) => e.status === 'REJECTED').length,
      points: ledger.filter((l) => l.task === taskId).reduce((a, b) => a + b.points, 0),
    }
  }
  const monthAssessment = d.assessments.find((a) => a.period === period)
  const evaluationTotal = monthAssessment ? Object.values(monthAssessment.scores).reduce((a, b) => a + Number(b || 0), 0) : null
  const groups = groupTasks(d.tasks)
  const statusPills = (task: YsoTask) => {
    if (task.id === 15)
      return evaluationTotal === null
        ? <span className="text-xs text-tw-text-muted">{tr("Not evaluated yet")}</span>
        : <span className="badge badge-success">{tr("Evaluated")} · {evaluationTotal} / 25</span>
    const s = statsFor(task.id)
    const pills = [
      task.id === 9 && weekly.expected > 0 && (
        <span key="w" className={`badge ${weekly.covered === weekly.expected ? 'badge-success' : 'badge-warning'}`}>
          {weekly.covered}/{weekly.expected} {tr("weeks")}
        </span>
      ),
      s.waiting > 0 && <span key="p" className="badge badge-warning">{s.waiting} {tr("pending")}</span>,
      s.approved > 0 && <span key="a" className="badge badge-success">{s.approved} {tr("approved")}</span>,
      s.rejected > 0 && <span key="r" className="badge badge-danger">{s.rejected} {tr("rejected")}</span>,
    ].filter(Boolean)
    return pills.length ? pills : <span className="text-xs text-tw-text-muted">{tr("No entries")}</span>
  }
  const openTaskDef = selectedTask ? d.tasks.find((t) => t.id === selectedTask) : undefined
  const recentMonthEntries = [...monthEntries].sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt))
  return (
    <div className="page space-y-5 pb-10 text-tw-text">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="icon-tile tile-teal w-11 h-11 hidden sm:inline-flex"><Icon name="sprout" className="w-5 h-5" /></span>
          <div className="min-w-0">
            <p className="section-label text-teal-600">
              {tr("Youth services ·")}{' '}
              {isYso ? tr("My performance") : isAd ? tr("AD workspace") : tr("Director overview")}
            </p>
            <h1 className="page-title">{isYso ? tr("YSO Task Hub") : tr("YSO Performance")}</h1>
            <p className="page-subtitle">
              {isYso
                ? tr("Record your work, follow approvals and understand your score.")
                : isAd
                  ? tr("Monitor your YSOs, review submissions and assess monthly performance.")
                  : tr("Read-only oversight of Provincial AD teams and grading. Historical points retain their original AD attribution.")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <DatePicker
            ariaLabel={tr("Reporting month")}
            mode="month"
            compact
            clearable={false}
            minDate="2000-01-01"
            maxDate="2099-12-31"
            className="min-w-0 flex-1 sm:flex-none sm:min-w-[170px] [&>button]:min-h-10 [&>button]:px-3"
            value={period}
            onChange={(value) =>
              /^20\d{2}-(0[1-9]|1[0-2])$/.test(value) && setPeriod(value)
            }
          />
        </div>
      </header>
      {error && (
        <div role="alert" className="alert-error">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="alert-success flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2"><Icon name="approve" className="w-4 h-4 flex-shrink-0" />{notice}</span>
          <button aria-label={tr("Dismiss notification")} onClick={() => setNotice('')}>
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>
      )}
      {!isYso && (
        <div className="card p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <span className="section-label inline-flex items-center gap-1.5"><Icon name="filter" className="w-3.5 h-3.5" />{tr("Filter")}</span>
          {d.role === 'DIRECTOR' && (
            <Select
              ariaLabel={tr("Provincial AD")}
              className="sm:w-56 [&>button]:min-h-10"
              value={selectedAd}
              onChange={(value) => {
                setSelectedAd(value)
                setSelectedPerson('')
              }}
              options={[
                { value: '', label: tr("All ADs") },
                ...d.ads.map((ad) => ({ value: ad.id, label: ad.name })),
              ]}
            />
          )}
          <Select
            ariaLabel={tr("YSO")}
            className="sm:w-56 [&>button]:min-h-10"
            value={selectedPerson}
            onChange={setSelectedPerson}
            options={[
              { value: '', label: tr("All YSOs") },
              ...d.people
                .filter((p) => !selectedAd || p.adId === selectedAd)
                .map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
        </div>
      )}

      {/* ── Score summary ────────────────────────────────────────────────── */}
      <section className="card overflow-hidden yso-score-summary" aria-label={tr("Official monthly score")}>
        <div className="grid grid-cols-3 md:grid-cols-[1.4fr_1fr_1fr_1fr] yso-score-grid">
          <div className="col-span-3 md:col-span-1 p-5 bg-gradient-to-br from-teal-50 to-tw-surface border-b md:border-b-0 md:border-r border-tw-border yso-score-total">
            <p className="text-xs font-medium text-teal-700 yso-score-heading"><span>{tr("Official monthly score")}</span><span className="yso-score-separator"> · </span><span className="yso-score-month">{monthLabel}</span></p>
            <p className={`text-4xl font-bold tracking-tight mt-1.5 tabular-nums yso-score-value ${total < 0 ? 'text-tw-danger' : 'text-tw-text'}`}>{signed(total)}</p>
            <p className="text-xs text-tw-text-secondary mt-1.5 yso-score-description">{tr("Approved submissions and confirmed penalties only.")}</p>
          </div>
          {[
            { label: tr("Operational points"), value: signed(total - qualifications - evaluation), icon: 'activity' as IconName },
            { label: tr("Qualification awards"), value: signed(qualifications), icon: 'award' as IconName },
            { label: tr("AD evaluation"), value: `${evaluation}${people.length === 1 ? ' / 25' : ''}`, icon: 'star' as IconName },
          ].map((s, i) => (
            <div key={s.label} className={`p-4 md:p-5 min-w-0 yso-score-metric ${i > 0 ? 'border-l border-tw-border' : ''}`}>
              <p className="text-[11px] sm:text-xs text-tw-text-secondary inline-flex items-center gap-1.5 yso-score-metric-label">
                <span className="contents yso-score-icon"><Icon name={s.icon} className="w-3.5 h-3.5 hidden sm:block flex-shrink-0" /></span>{s.label}
              </p>
              <p className="text-xl sm:text-2xl font-bold tracking-tight mt-1.5 tabular-nums yso-score-metric-value">{s.value}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 px-4 sm:px-5 py-2.5 border-t border-tw-border bg-tw-surface-2/60 yso-score-status">
          <span className={`badge ${queue.length ? 'badge-warning' : 'badge-gray'}`}>
            <Icon name="hourglass" className="w-3 h-3" />{queue.length} {tr(queue.length === 1 ? 'submission' : 'submissions')} {tr("awaiting AD review")}
          </span>
          {Object.values(deductions).some((v) => v < 0) && (
            <span className="badge badge-danger">
              {tr("Negative task balances:")} {signed(Object.values(deductions).filter((v) => v < 0).reduce((a, b) => a + b, 0))}
            </span>
          )}
        </div>
      </section>

      {isYso ? (
        <>
          {!canSubmit && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5 flex items-start gap-3.5">
              <span className="icon-tile tile-amber bg-tw-surface"><Icon name="lock" className="w-5 h-5" /></span>
              <div className="min-w-0">
                <p className="font-semibold text-amber-900">{tr("Reporting isn't active yet")}</p>
                <p className="text-sm text-amber-800 mt-0.5">
                  {me?.managerValid
                    ? `${tr("Your AD needs to activate reporting before you can submit.")} ${tr('Assigned AD:')} ${me.adName}.`
                    : tr("An active Level 3 Provincial AD must be assigned.")}
                </p>
                <p className="text-xs text-amber-700 mt-1.5">{tr("You can still open any task to see how its points work.")}</p>
              </div>
            </div>
          )}
          <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-5 items-start">
            {/* Task list, grouped */}
            <div className="space-y-5 min-w-0">
              {groups.map((g) => {
                const groupPoints = ledger.filter((l) => g.tasks.some((t) => t.id === l.task)).reduce((a, b) => a + b.points, 0)
                return (
                  <SectionCard key={g.key} title={tr(g.title)} icon={g.icon} meta={<PointsPill value={groupPoints} />} flush>
                    <ul className="divide-y divide-tw-border">
                      {g.tasks.map((task) => {
                        const s = statsFor(task.id)
                        return (
                          <li key={task.id}>
                            <button
                              onClick={() => setSelectedTask(task.id)}
                              className="w-full text-left flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3.5 hover:bg-tw-hover active:bg-tw-hover transition-colors group"
                            >
                              <TaskNumber index={taskPosition(task.id, d.tasks).index} />
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-sm text-tw-text truncate">{tr(task.title)}</p>
                                <p className="text-xs text-tw-text-secondary truncate mt-0.5">{tr(task.rule)}</p>
                                <div className="flex flex-wrap items-center gap-1.5 mt-2 sm:hidden">{statusPills(task)}</div>
                              </div>
                              <div className="hidden sm:flex flex-wrap justify-end items-center gap-1.5 max-w-[45%]">{statusPills(task)}</div>
                              <PointsPill value={task.id === 15 ? evaluation : s.points} />
                              <Icon name="chevronRight" className="w-4 h-4 text-tw-text-muted group-hover:text-tw-text group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </SectionCard>
                )
              })}
            </div>

            {/* Side column */}
            <aside className="space-y-5 min-w-0">
              <SectionCard title={tr("This month's submissions")} icon="inbox" meta={`${recentMonthEntries.length}`} flush>
                {recentMonthEntries.length === 0 ? (
                  <p className="px-5 py-8 text-center text-sm text-tw-text-secondary">{tr("Nothing submitted this month.")}</p>
                ) : (
                  <ul className="divide-y divide-tw-border">
                    {recentMonthEntries.slice(0, 8).map((e) => (
                      <li key={e.id}>
                        <button onClick={() => setSelectedTask(e.task)} className="w-full text-left flex items-center gap-3 px-4 sm:px-5 py-3 hover:bg-tw-hover transition-colors">
                          <TaskBadge id={e.task} tasks={d.tasks} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-tw-text truncate">{taskTitle(e.task)}</p>
                            <p className="text-xs text-tw-text-secondary">{when(e.submittedAt, locale)}</p>
                          </div>
                          <Status value={e.status} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>
              {calendar}
              {requirements}
            </aside>
          </div>
        </>
      ) : (
        <>
          <nav className="seg w-full sm:w-auto" aria-label={tr("YSO workspace tabs")}>
            {[
              { key: 'monitor', label: tr("Overview"), icon: 'grid' as IconName },
              ...(isAd ? [{ key: 'approvals', label: tr("Approvals"), icon: 'approve' as IconName }] : []),
              { key: 'analytics', label: tr("Analytics"), icon: 'analytics' as IconName },
            ].map((t) => (
              <button
                className={`seg-item flex-1 sm:flex-none min-h-10 px-4 inline-flex items-center justify-center gap-1.5 text-sm ${tab === t.key ? 'seg-item-active' : ''}`}
                aria-label={t.key === 'approvals' ? `Approvals (${queue.length} pending)` : t.label}
                aria-pressed={tab === t.key}
                key={t.key}
                onClick={() => setTab(t.key)}
              >
                <Icon name={t.icon} className="w-4 h-4 hidden sm:block" />
                {t.label}
                {t.key === 'approvals' && queue.length > 0 && (
                  <span aria-hidden="true" className="inline-flex min-w-[18px] h-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums bg-tw-danger text-white">
                    {queue.length > 99 ? '99+' : queue.length}
                  </span>
                )}
              </button>
            ))}
          </nav>
          {tab === 'monitor' && (
            <>
              {d.role === 'DIRECTOR' && !selectedAd && (
                <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {d.ads.map((adInfo) => {
                    const ad = adInfo.id
                    const team = d.people.filter((p) => p.adId === ad),
                      teamIds = team.map((p) => p.id),
                      teamScore = d.ledger
                        .filter((l) => l.period === period && l.adId === ad)
                        .reduce((a, b) => a + b.points, 0),
                      waiting = d.entries.filter(
                        (e) => teamIds.includes(e.personnelId) && pending(e)
                      )
                    const avg = teamScore / Math.max(1, new Set([...teamIds, ...d.ledger.filter((l) => l.period === period && l.adId === ad).map((l) => l.personnelId)]).size)
                    return (
                      <button
                        className="card card-hover p-0 text-left overflow-hidden group"
                        key={ad}
                        onClick={() => {
                          setSelectedAd(ad)
                          setTab('analytics')
                        }}
                      >
                        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-tw-border">
                          <span className="icon-tile tile-teal w-9 h-9"><Icon name="user" className="w-4 h-4" /></span>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm text-tw-text truncate">{adInfo.name}</p>
                            <p className="text-xs text-tw-text-secondary truncate">{adInfo.district}</p>
                          </div>
                          <Icon name="chevronRight" className="w-4 h-4 text-tw-text-muted group-hover:translate-x-0.5 transition-transform" />
                        </div>
                        <dl className="grid grid-cols-3 divide-x divide-tw-border">
                          {[
                            [tr("YSOs"), String(team.length)],
                            [tr("Avg score"), avg.toFixed(1)],
                            [tr("Pending"), String(waiting.length)],
                          ].map(([label, value]) => (
                            <div key={label} className="px-4 py-3">
                              <dt className="text-xs text-tw-text-secondary">{label}</dt>
                              <dd className="text-lg font-bold tabular-nums mt-0.5">{value}</dd>
                            </div>
                          ))}
                        </dl>
                        <p className="px-4 py-2.5 border-t border-tw-border bg-tw-surface-2/60 text-xs text-tw-text-secondary">
                          {waiting.length
                            ? tr('Oldest waiting {days} days', { days: Math.max(0, Math.floor((Date.now() - Math.min(...waiting.map((e) => Date.parse(e.submittedAt)))) / 86400000)) })
                            : tr("Queue clear")}
                        </p>
                      </button>
                    )
                  })}
                </div>
              )}
              <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-5 items-start">
                <SectionCard title={tr("YSO directory")} icon="users" meta={`${people.length}`} flush>
                  {!people.length ? (
                    <p className="px-5 py-8 text-center text-sm text-tw-text-secondary">{tr("No YSOs assigned to this team.")}</p>
                  ) : (
                    <ul className="divide-y divide-tw-border">
                      {people.map((p) => {
                        const pts = d.ledger.filter((l) => l.personnelId === p.id && l.period === period).reduce((a, b) => a + b.points, 0)
                        const waitingCount = d.entries.filter((e) => e.personnelId === p.id && pending(e)).length
                        return (
                          <li className="px-4 sm:px-5 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3" key={p.id}>
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <span className="w-9 h-9 rounded-full bg-gradient-to-br from-teal-500 to-emerald-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                                {p.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
                              </span>
                              <div className="min-w-0">
                                <p className="font-semibold text-sm text-tw-text truncate">
                                  {p.name}{!p.active && <span className="badge badge-gray ml-2">{tr("Inactive")}</span>}
                                </p>
                                <p className="text-xs text-tw-text-secondary truncate">
                                  {p.startDate ? `${tr('Reporting since')} ${p.startDate}` : tr("Reporting not activated")} · {p.adName ?? tr("AD not assigned")}
                                </p>
                                {!p.managerValid && (
                                  <p className="text-xs text-rose-600 mt-0.5">{tr("Active Provincial AD assignment required")}</p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap sm:justify-end">
                              <PointsPill value={pts} />
                              {waitingCount > 0 && <span className="badge badge-warning">{waitingCount} {tr("pending")}</span>}
                              <button className="btn-secondary btn-sm" onClick={() => { setSelectedPerson(p.id); setTab('analytics') }}>
                                {tr("View performance")}</button>
                              {isAd && !p.startDate && p.managerValid && p.active && (
                                <button
                                  className="btn btn-sm text-white bg-gradient-to-b from-teal-500 to-teal-600 hover:brightness-110"
                                  onClick={() => {
                                    setActivation(p)
                                    setActivationDate(d.today)
                                  }}
                                >
                                  {tr("Activate reporting")}</button>
                              )}
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </SectionCard>
                <aside className="space-y-5 min-w-0">
                  {calendar}
                </aside>
              </div>
              {requirements}
            </>
          )}
          {tab === 'approvals' && isAd && (
            <>
              <SectionCard title={tr("Pending submissions")} icon="hourglass" meta={`${queue.length}`}>
                <p className="text-xs text-tw-text-secondary mb-4">
                  {tr("All reporting months · Review the evidence before approving. Approval time does not change deadline points.")}</p>
                {entryList(queue, true)}
              </SectionCard>
              <SectionCard title={tr("Monthly performance evaluation")} icon="star">
                <div className="flex flex-wrap gap-2">
                  {people
                    .filter((p) => p.active && p.startDate)
                    .map((p) => {
                      const done = d.assessments.some((a) => a.personnelId === p.id && a.period === period)
                      return (
                        <button className={done ? 'btn-secondary btn-sm' : 'btn-primary btn-sm'} key={p.id} onClick={() => setAssessment(p)}>
                          <Icon name={done ? 'edit' : 'star'} className="w-3.5 h-3.5" />
                          {p.name} · {done ? tr("Revise") : tr("Evaluate")}
                        </button>
                      )
                    })}
                  {!people.some((p) => p.active && p.startDate) && (
                    <p className="text-sm text-tw-text-secondary">{tr("No YSOs with active reporting.")}</p>
                  )}
                </div>
              </SectionCard>
              <SectionCard title={<>{tr("Reviewed entries ·")} {monthLabel}</>} icon="approve">
                {entryList(
                  monthEntries.filter((e) => !pending(e)),
                  true
                )}
              </SectionCard>
              {calendar}
              {requirements}
            </>
          )}
          {tab === 'analytics' && (
            <Analytics
              dashboard={d}
              people={people}
              period={period}
              adId={d.role === 'DIRECTOR' ? selectedAd || undefined : undefined}
            />
          )}
        </>
      )}

      {/* ── Score history & audit trail ─────────────────────────────────── */}
      <details className="card overflow-hidden group">
        <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer flex items-center gap-2.5 px-4 sm:px-5 py-3.5 hover:bg-tw-hover transition-colors">
          <span className="icon-tile tile-gray w-8 h-8 rounded-lg"><Icon name="history" className="w-4 h-4" /></span>
          <span className="flex-1 font-semibold text-sm">{tr("Score history & audit trail")}</span>
          <Icon name="chevronDown" className="w-4 h-4 text-tw-text-secondary group-open:rotate-180 transition-transform" />
        </summary>
        <div className="border-t border-tw-border px-4 sm:px-5 py-4 grid lg:grid-cols-2 gap-6">
          <div className="min-w-0">
            <h4 className="section-label mb-1">{tr("Score changes")}</h4>
            <p className="text-xs text-tw-text-secondary mb-3">
              {tr('Awards and reversals for {month}; each adjustment preserves the original record.', { month: monthLabel })}</p>
            <ul className="max-h-80 overflow-auto divide-y divide-tw-border rounded-xl border border-tw-border">
              {ledger.map((l) => (
                <li key={l.id} className="flex items-start gap-3 px-3 py-2.5">
                  <PointsPill value={l.points} />
                  <div className="min-w-0 text-sm">
                    <p className="font-medium text-tw-text truncate">{taskTitle(l.task)} · {personName(l.personnelId)}</p>
                    <p className="text-xs text-tw-text-secondary">{when(l.createdAt, locale)} · {tr(l.reason)}</p>
                  </div>
                </li>
              ))}
              {!ledger.length && (
                <li className="px-3 py-6 text-center text-sm text-tw-text-secondary">{tr("No score changes for this month.")}</li>
              )}
            </ul>
          </div>
          <div className="min-w-0">
            <h4 className="section-label mb-3">{tr("Recent review events")}</h4>
            <ul className="max-h-80 overflow-auto divide-y divide-tw-border rounded-xl border border-tw-border">
              {d.events
                .filter((e) => e.personnelId && ids.includes(e.personnelId))
                .map((e) => (
                  <li className="px-3 py-2.5 text-xs" key={e.id}>
                    <p className="text-tw-text"><span className="font-semibold capitalize">{pretty(e.event)}</span> · {personName(e.personnelId!)}</p>
                    <p className="text-tw-text-secondary mt-0.5">
                      {when(e.createdAt, locale)}
                      {(e.data.feedback ?? e.data.rationale ?? e.data.reason ?? (e.data.submissionId ? `Entry ${e.data.submissionId}` : ''))
                        ? ` · ${e.data.feedback ?? e.data.rationale ?? e.data.reason ?? `Entry ${e.data.submissionId}`}`
                        : ''}
                    </p>
                  </li>
                ))}
              {!d.events.some((e) => e.personnelId && ids.includes(e.personnelId)) && (
                <li className="px-3 py-6 text-center text-sm text-tw-text-secondary">{tr("No review events yet.")}</li>
              )}
            </ul>
          </div>
        </div>
      </details>

      {/* ── Task detail (YSO) ───────────────────────────────────────────── */}
      {isYso && openTaskDef && (() => {
        const task = openTaskDef
        const s = statsFor(task.id)
        const history = scopedEntries
          .filter((e) => e.task === task.id)
          .sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt))
        return (
          <Sheet
            onClose={() => setSelectedTask(null)}
            lead={<TaskNumber index={taskPosition(task.id, d.tasks).index} />}
            overline={`${tr(taskPosition(task.id, d.tasks).group.title)} · ${taskPosition(task.id, d.tasks).index}`}
            title={tr(task.title)}
            footer={
              task.id === 15 ? (
                <p className="text-sm text-tw-text-secondary text-center py-1">{tr("Recorded by your AD — no submission needed.")}</p>
              ) : canSubmit && (task.id < 12 || d.driveConnected) ? (
                <button className="btn w-full py-3 text-white bg-gradient-to-b from-teal-500 to-teal-600 shadow-[0_4px_14px_-4px_rgba(13,148,136,0.7)] hover:brightness-110"
                  onClick={() => setEntryForm({ task })}>
                  <Icon name="plus" className="w-4 h-4" />{tr("Submit entry")}
                </button>
              ) : (
                <div className="space-y-2">
                  <button className="btn-secondary w-full py-3" disabled>
                    <Icon name="lock" className="w-4 h-4" />{tr("Submit entry")}
                  </button>
                  <p className="text-xs text-center text-tw-text-secondary">{canSubmit ? tr("Waiting for Google Drive to be connected.") : tr("Ask your AD to activate reporting to submit.")}</p>
                </div>
              )
            }
          >
            <div className="grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-5 md:gap-6">
              <div className="space-y-4 min-w-0">
            <h3 className="section-label">{tr("This month")} · {monthLabel}</h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                [tr("Points"), signed(task.id === 15 ? evaluation : s.points)],
                [tr("Approved"), String(s.approved)],
                [tr("Pending"), String(s.waiting)],
                [tr("Rejected"), String(s.rejected)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-tw-border bg-tw-surface-2 px-3 py-2.5">
                  <p className="text-[11px] text-tw-text-secondary">{label}</p>
                  <p className="text-lg font-bold tabular-nums">{value}</p>
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-teal-200 bg-teal-50 p-3.5 flex items-start gap-2.5">
              <Icon name="info" className="w-4 h-4 text-teal-700 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-teal-800">{tr("How points work")}</p>
                <p className="text-sm text-teal-900 mt-0.5 leading-relaxed">{tr(task.rule)}</p>
              </div>
            </div>
            {task.id >= 12 && task.id < 15 && (
              <div className={`rounded-xl border p-3.5 flex items-start gap-2.5 ${d.driveConnected ? 'border-tw-border bg-tw-surface-2' : 'border-amber-200 bg-amber-50'}`}>
                <Icon name="cloud" className={`w-4 h-4 flex-shrink-0 mt-0.5 ${d.driveConnected ? 'text-teal-600' : 'text-amber-700'}`} />
                <div>
                  <p className={`text-xs font-semibold ${d.driveConnected ? 'text-tw-text' : 'text-amber-900'}`}>{tr("Certificate scan required")}</p>
                  <p className={`text-sm mt-0.5 leading-relaxed ${d.driveConnected ? 'text-tw-text-secondary' : 'text-amber-800'}`}>
                    {d.driveConnected
                      ? tr("Attach a scan or photo of your certificate when you submit. It is saved in your organisation's Google Drive, not on the TaskWise server.")
                      : tr("Google Drive isn't connected yet. Ask your Director to connect it (Settings → Letter management) so you can upload your certificate.")}
                  </p>
                </div>
              </div>
            )}
            {task.id === 9 && weekly.expected > 0 && (
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-semibold text-tw-text-secondary">{tr("required weeks covered")}</span>
                  <span className="font-bold tabular-nums">{weekly.covered} / {weekly.expected}</span>
                </div>
                <div className="h-2 rounded-full bg-tw-hover overflow-hidden">
                  <div className={`h-full rounded-full ${weekly.covered === weekly.expected ? 'bg-tw-success' : 'bg-tw-warning'}`} style={{ width: `${Math.round((weekly.covered / weekly.expected) * 100)}%` }} />
                </div>
              </div>
            )}
              </div>
              <div className="min-w-0">
            {task.id === 15 ? (
              <div>
                <h3 className="section-label mb-2">{tr("Monthly AD evaluation")}</h3>
                {monthAssessment ? (
                  <div className="rounded-xl border border-tw-border divide-y divide-tw-border">
                    {d.criteria.map((c) => (
                      <div className="flex justify-between gap-3 px-3.5 py-2.5 text-sm" key={c.key}>
                        <span className="text-tw-text-secondary">{tr(c.label)}</span>
                        <span className="font-semibold tabular-nums">{monthAssessment.scores[c.key]} / {c.max}</span>
                      </div>
                    ))}
                    {monthAssessment.rationale && <p className="px-3.5 py-3 text-sm text-tw-text">{monthAssessment.rationale}</p>}
                  </div>
                ) : (
                  <p className="text-sm text-tw-text-secondary">{tr("Your AD has not recorded this month’s evaluation.")}</p>
                )}
              </div>
            ) : (
              <div>
                <h3 className="section-label mb-2">{tr("Your submissions for this task")}</h3>
                {entryList(history, false)}
              </div>
            )}
              </div>
            </div>
          </Sheet>
        )
      })()}
      {entryForm && (
        <EntryForm
          task={entryForm.task}
          previous={entryForm.previous}
          dashboard={d}
          onClose={() => setEntryForm(null)}
          onSave={async () => {
            await refresh()
            setNotice(
              tr("Submitted — pending AD approval. Official points are unchanged.")
            )
          }}
        />
      )}
      {decision && (
        <DecisionDialog
          title={decision.title}
          description={decision.description}
          actionLabel={decision.label}
          required={decision.required}
          onSave={decision.save}
          onClose={() => setDecision(null)}
        />
      )}
      {assessment && (
        <AssessmentForm
          person={assessment}
          period={period}
          dashboard={d}
          onClose={() => setAssessment(null)}
          onSave={refresh}
        />
      )}
      {meetingForm && (
        <MeetingForm
          dashboard={d}
          onClose={() => setMeetingForm(false)}
          onSave={refresh}
        />
      )}
      {activation && (
        <Modal
          title={`Activate reporting · ${activation.name}`}
          onClose={() => setActivation(null)}
        >
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault()
              setBusy(true)
              try {
                if (!activationDate)
                  throw new Error(tr("Choose a reporting start date."))
                await mutate(() =>
                  ysoApi.activate(activation.id, activationDate)
                )
                setActivation(null)
              } catch (e) {
                setError((e as Error).message)
              } finally {
                setBusy(false)
              }
            }}
          >
            <p className="text-sm text-slate-600">
              {tr("Choose when reporting obligations begin. This date is fixed once activated. Partial joining weeks are exempt.")}</p>
            <label className="block text-sm">
              {tr("Reporting start date")}<DatePicker
                compact
                ariaLabel={tr("Reporting start date")}
                className="mt-1 [&>button]:min-h-11"
                maxDate={d.today}
                value={activationDate}
                onChange={setActivationDate}
              />
            </label>
            <button className={primary} disabled={busy}>
              {tr("Activate reporting")}</button>
            {error && (
              <p role="alert" className="text-sm text-rose-700">
                {error}
              </p>
            )}
          </form>
        </Modal>
      )}
    </div>
  )
}
