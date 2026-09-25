import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import { X } from 'lucide-react'
import { useBodyScrollLock } from '../../hooks/useUi'
import { Button } from './Button'

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

function useDialogBehaviour(open, onClose, panelRef) {
  useBodyScrollLock(open)

  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const nodes = panelRef.current?.querySelectorAll(FOCUSABLE)
      if (!nodes?.length) return
      const list = Array.from(nodes)
      const first = list[0]
      const last = list[list.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    const raf = requestAnimationFrame(() => {
      const target = panelRef.current?.querySelector('[data-autofocus]') ?? panelRef.current
      target?.focus?.()
    })

    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      cancelAnimationFrame(raf)
      previouslyFocused?.focus?.()
    }
  }, [open, onClose, panelRef])
}

export function Modal({ open, onClose, title, description, icon: Icon, children, footer, size = 'md' }) {
  const panelRef = useRef(null)
  useDialogBehaviour(open, onClose, panelRef)
  if (!open) return null

  const width = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' }[size]

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-slate-950/60 p-0 backdrop-blur-sm animate-fade-in sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={clsx(
          'relative w-full rounded-t-2xl border border-line bg-surface shadow-pop outline-none animate-rise sm:rounded-2xl',
          width,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line p-5">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              {Icon && (
                <span className="grid size-7 place-items-center rounded-lg bg-brand-soft text-brand">
                  <Icon className="size-4" strokeWidth={2.2} aria-hidden="true" />
                </span>
              )}
              <span className="truncate">{title}</span>
            </h2>
            {description && <p className="mt-1 text-[0.82rem] leading-relaxed text-fg-muted">{description}</p>}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close dialog">
            <X className="size-4" strokeWidth={2.4} aria-hidden="true" />
          </Button>
        </div>

        <div className="scrollbar-slim max-h-[65vh] overflow-y-auto p-5">{children}</div>

        {footer && <div className="flex justify-end gap-2 border-t border-line p-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

export function Drawer({ open, onClose, title, subtitle, icon: Icon, children, footer }) {
  const panelRef = useRef(null)
  useDialogBehaviour(open, onClose, panelRef)
  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/55 backdrop-blur-sm animate-fade-in"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="flex h-full w-full max-w-md flex-col border-l border-line bg-surface shadow-pop outline-none animate-[slide-in-right_0.28s_cubic-bezier(0.22,1,0.36,1)_both]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-line p-5">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              {Icon && (
                <span className="grid size-7 place-items-center rounded-lg bg-brand-soft text-brand">
                  <Icon className="size-4" strokeWidth={2.2} aria-hidden="true" />
                </span>
              )}
              <span className="truncate">{title}</span>
            </h2>
            {subtitle && <p className="mt-1 text-[0.82rem] text-fg-muted">{subtitle}</p>}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close panel">
            <X className="size-4" strokeWidth={2.4} aria-hidden="true" />
          </Button>
        </div>

        <div className="scrollbar-slim flex-1 overflow-y-auto p-5">{children}</div>

        {footer && <div className="flex gap-2 border-t border-line p-4">{footer}</div>}
      </aside>
    </div>,
    document.body,
  )
}
