import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useLanguage } from '../i18n/Language'
import { Icon, type IconName } from './ui/Icon'

export interface ConfirmOptions {
  /** English source text; translated with `vars` like every other string. */
  title: string
  message?: string
  confirmLabel: string
  /** `danger` for deletes/removals, `success` for approvals, `primary` otherwise. */
  tone?: 'danger' | 'success' | 'primary'
  vars?: Record<string, string | number>
}

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void }

const TONE_BUTTON = { danger: 'btn-danger', success: 'btn-success', primary: 'btn-primary' } as const
const TONE_ICON = {
  danger: { name: 'trash', className: 'bg-tw-danger/10 text-tw-danger' },
  success: { name: 'check', className: 'bg-tw-success/10 text-tw-success' },
  primary: { name: 'info', className: 'bg-tw-primary/10 text-tw-primary' },
} as const satisfies Record<string, { name: IconName; className: string }>

/**
 * In-app replacement for `window.confirm`.
 *
 *   const { confirm, dialog } = useConfirm()
 *   if (!(await confirm({ title: 'Delete this notice?', confirmLabel: 'Delete', tone: 'danger' }))) return
 *   …
 *   return <>{…}{dialog}</>
 *
 * The dialog is portalled to <body>, so `{dialog}` can be rendered anywhere in
 * the calling component (even inside a table cell). Text is translated here, so
 * call sites pass the English source strings.
 */
export function useConfirm(): { confirm: (options: ConfirmOptions) => Promise<boolean>; dialog: ReactNode } {
  const [pending, setPending] = useState<Pending | null>(null)

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>(resolve => setPending({ ...options, resolve })),
    [],
  )

  // Mirrors `pending` so settling and unmounting can resolve the promise without
  // side effects inside a state updater.
  const pendingRef = useRef<Pending | null>(null)
  useEffect(() => { pendingRef.current = pending }, [pending])

  const settle = useCallback((ok: boolean) => {
    pendingRef.current?.resolve(ok)
    pendingRef.current = null
    setPending(null)
  }, [])

  // An unmount mid-question counts as "no", so awaiting callers never hang.
  useEffect(() => () => pendingRef.current?.resolve(false), [])

  const dialog = pending ? <ConfirmDialog options={pending} onSettle={settle} /> : null
  return { confirm, dialog }
}

function ConfirmDialog({ options, onSettle }: { options: ConfirmOptions; onSettle: (ok: boolean) => void }) {
  const { t } = useLanguage()
  const titleId = useId()
  const messageId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const tone = options.tone ?? 'primary'

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    // Destructive questions default to the safe answer.
    ;(tone === 'danger' ? cancelRef : confirmRef).current?.focus()
    return () => previous?.focus?.()
  }, [tone])

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onSettle(false)
    }
    // Keep Tab inside the two buttons while the dialog is open.
    if (event.key === 'Tab') {
      const next = document.activeElement === cancelRef.current ? confirmRef.current : cancelRef.current
      event.preventDefault()
      next?.focus()
    }
  }

  return createPortal(
    <div className="modal-backdrop z-[10000]" onMouseDown={event => { if (event.target === event.currentTarget) onSettle(false) }}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={options.message ? messageId : undefined}
        className="modal-panel max-w-sm"
        onKeyDown={onKeyDown}
      >
        <div className="px-6 pt-6 pb-5 flex items-start gap-3.5">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${TONE_ICON[tone].className}`}>
            <Icon name={TONE_ICON[tone].name} className="w-5 h-5" />
          </span>
          <div className="min-w-0 pt-0.5">
            <h2 id={titleId} className="modal-title break-words">{t(options.title, options.vars)}</h2>
            {options.message && (
              <p id={messageId} className="mt-1.5 text-sm text-tw-text-secondary leading-relaxed break-words">
                {t(options.message, options.vars)}
              </p>
            )}
          </div>
        </div>
        <div className="modal-footer">
          <button ref={cancelRef} type="button" className="btn-secondary" onClick={() => onSettle(false)}>
            {t('Cancel')}
          </button>
          <button ref={confirmRef} type="button" className={TONE_BUTTON[tone]} onClick={() => onSettle(true)}>
            {t(options.confirmLabel)}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
