import { createPortal } from 'react-dom'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../context/AppContext'

const TONE = {
  brand: { icon: CheckCircle2, className: 'text-brand', ring: 'ring-brand/25' },
  warn: { icon: AlertTriangle, className: 'text-warn', ring: 'ring-warn/25' },
  danger: { icon: XCircle, className: 'text-danger', ring: 'ring-danger/25' },
  info: { icon: Info, className: 'text-info', ring: 'ring-info/25' },
}

export function ToastViewport() {
  const { toasts, dismissToast } = useApp()
  if (!toasts.length) return null

  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:items-end"
      role="region"
      aria-label="Notifications"
    >
      <div aria-live="polite" className="contents">
        {toasts.map((toast) => {
          const tone = TONE[toast.tone] ?? TONE.info
          const Icon = tone.icon
          return (
            <div
              key={toast.id}
              className={clsx(
                'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-pop ring-1 animate-rise',
                tone.ring,
              )}
            >
              <Icon className={clsx('mt-0.5 size-4 shrink-0', tone.className)} strokeWidth={2.3} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-snug">{toast.title}</p>
                {toast.description && (
                  <p className="mt-0.5 text-[0.78rem] leading-relaxed text-fg-muted">{toast.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="rounded-md p-1 text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
                aria-label="Dismiss notification"
              >
                <X className="size-3.5" strokeWidth={2.4} aria-hidden="true" />
              </button>
            </div>
          )
        })}
      </div>
    </div>,
    document.body,
  )
}
