import { Link, useLocation } from 'react-router-dom'
import { Bolt, Menu, Moon, RefreshCw, Search, Sun } from 'lucide-react'
import { ALL_NAV_ITEMS } from '../../navigation'
import { useApp } from '../../context/AppContext'
import { buttonClass } from '../ui/Button'
import { initialsOf } from '../../lib/format'

export function Topbar({ onOpenNav, onOpenPalette }) {
  const { theme, toggleTheme, settings, health, refetch } = useApp()
  const { pathname } = useLocation()
  const current =
    ALL_NAV_ITEMS.find((item) => (item.to === '/' ? pathname === '/' : pathname.startsWith(item.to))) ??
    ALL_NAV_ITEMS[0]

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur-xl">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
        <button
          type="button"
          className={buttonClass({ variant: 'ghost', size: 'icon' })}
          onClick={onOpenNav}
          aria-label="Open navigation"
        >
          <Menu className="size-5" strokeWidth={2.2} aria-hidden="true" />
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.95rem] font-semibold leading-tight">{current.label}</p>
          <p className="hidden truncate text-[0.72rem] text-fg-subtle sm:block">{current.description}</p>
        </div>

        <button
          type="button"
          onClick={onOpenPalette}
          className={buttonClass({ variant: 'outline' })}
          aria-label="Open command palette"
        >
          <Search className="size-4" strokeWidth={2.2} aria-hidden="true" />
          <span className="hidden sm:inline">Search or jump to…</span>
          <kbd className="hidden rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[0.65rem] text-fg-subtle md:inline">
            ⌘K
          </kbd>
        </button>

        <button
          type="button"
          className={buttonClass({ variant: 'ghost', size: 'icon' })}
          onClick={refetch}
          aria-label="Refresh backend data"
          title="Refresh data"
        >
          <RefreshCw
            className={`size-4 ${health.status === 'refreshing' ? 'animate-spin' : ''}`}
            strokeWidth={2.2}
            aria-hidden="true"
          />
        </button>

        <button
          type="button"
          className={buttonClass({ variant: 'ghost', size: 'icon' })}
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
        >
          {theme === 'dark' ? (
            <Sun className="size-4" strokeWidth={2.2} aria-hidden="true" />
          ) : (
            <Moon className="size-4" strokeWidth={2.2} aria-hidden="true" />
          )}
        </button>

        <Link
          to="/settings"
          className="grid size-9 shrink-0 place-items-center rounded-full border border-line bg-surface-2 text-[0.75rem] font-bold text-brand transition-colors hover:border-brand/40 hover:bg-brand-soft"
          aria-label={`Settings for ${settings.userName}`}
        >
          {initialsOf(settings.userName)}
        </Link>
      </div>
    </header>
  )
}

export function OfflineBanner() {
  const { health, refetch } = useApp()
  if (health.status !== 'error' && health.online) return null

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 border-b border-warn/25 bg-warn-soft px-4 py-2 text-[0.78rem] text-fg-muted">
      <Bolt className="size-4 shrink-0 text-warn" strokeWidth={2.4} aria-hidden="true" />
      <span>
        <strong className="font-semibold text-fg">Backend offline.</strong> Showing the last known snapshot —
        household plans and settings still work and are saved locally.
      </span>
      <button type="button" className="btn btn-outline btn-sm" onClick={refetch}>
        Retry
      </button>
    </div>
  )
}
