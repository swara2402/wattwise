import { NavLink } from 'react-router-dom'
import clsx from 'clsx'
import { Bolt, RefreshCw, X } from 'lucide-react'
import { NAV_SECTIONS } from '../../navigation'
import { useApp } from '../../context/AppContext'
import { initialsOf } from '../../lib/format'
import { buttonClass } from '../ui/Button'

export function Sidebar({ onNavigate }) {
  const { settings, health } = useApp()
  const { online, status, refetch, data } = health

  return (
    <div className="flex h-full flex-col gap-1 bg-surface">
      <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-line px-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand text-slate-950 shadow-[0_6px_18px_-8px_var(--brand)]">
          <Bolt className="size-5" strokeWidth={2.6} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[0.95rem] font-bold leading-tight tracking-tight">WattWise</p>
          <p className="truncate text-[0.68rem] font-medium text-fg-subtle">Energy Intelligence</p>
        </div>
      </div>

      <nav className="scrollbar-slim flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Main navigation">
        {NAV_SECTIONS.map((section) => (
          <div key={section.id}>
            <p className="mb-1.5 px-2.5 text-[0.64rem] font-bold uppercase tracking-[0.14em] text-fg-subtle">
              {section.label}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === '/'}
                    onClick={onNavigate}
                    className={({ isActive }) => clsx('nav-item', isActive && 'nav-item-active')}
                  >
                    <item.icon className="size-4.5 shrink-0" strokeWidth={2} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.badge && (
                      <span className="badge badge-accent !px-1.5 !py-0 !text-[0.58rem]">{item.badge}</span>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 space-y-2 border-t border-line p-3">
        <button
          type="button"
          onClick={refetch}
          className={clsx(
            'flex w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition-colors',
            online ? 'border-brand/30 bg-brand-soft' : 'border-danger/30 bg-danger-soft',
          )}
          aria-live="polite"
        >
          <span className="relative grid size-6 shrink-0 place-items-center">
            <span
              className={clsx(
                'size-2 rounded-full',
                online ? 'bg-brand animate-pulse-soft' : 'bg-danger',
              )}
            />
            {status === 'refreshing' && (
              <RefreshCw className="absolute size-3.5 animate-spin text-fg-subtle" strokeWidth={2.4} aria-hidden="true" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[0.78rem] font-semibold leading-tight">
              {online ? 'Backend online' : status === 'refreshing' ? 'Reconnecting…' : 'Demo mode'}
            </span>
            <span className="block truncate text-[0.66rem] text-fg-subtle">
              {online ? `${data?.model ?? 'Random Forest V2'} · ${data?.features ?? 26} features` : 'Live data paused'}
            </span>
          </span>
        </button>

        <div className="flex items-center gap-2.5 rounded-xl border border-line bg-surface-2 px-2.5 py-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft text-[0.75rem] font-bold text-brand">
            {initialsOf(settings.userName)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[0.8rem] font-semibold leading-tight">{settings.userName}</span>
            <span className="block truncate text-[0.68rem] text-fg-subtle">{settings.householdName}</span>
          </span>
        </div>
      </div>
    </div>
  )
}

export function MobileNav({ open, onClose }) {
  return (
    <div
      className={clsx(
        'fixed inset-0 z-40 lg:hidden',
        open ? 'pointer-events-auto' : 'pointer-events-none',
      )}
      // `inert` keeps the off-canvas panel out of the tab order and the
      // accessibility tree while it is closed.
      inert={!open}
    >
      <div
        className={clsx(
          'absolute inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity duration-200',
          open ? 'opacity-100' : 'opacity-0',
        )}
        onClick={onClose}
      />
      <div
        className={clsx(
          'absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-line shadow-pop transition-transform duration-250 ease-out',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="absolute right-2 top-3.5 z-10">
          <button
            type="button"
            className={buttonClass({ variant: 'ghost', size: 'icon' })}
            onClick={onClose}
            aria-label="Close navigation"
          >
            <X className="size-4" strokeWidth={2.4} aria-hidden="true" />
          </button>
        </div>
        <Sidebar onNavigate={onClose} />
      </div>
    </div>
  )
}
