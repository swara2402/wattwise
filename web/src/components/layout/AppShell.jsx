import { useCallback, useEffect, useState, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar, MobileNav } from './Sidebar'
import { Topbar, OfflineBanner } from './Topbar'
import { CommandPalette } from '../CommandPalette'
import { ToastViewport } from '../ToastViewport'

export function AppShell() {
  const [navOpen, setNavOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => {
    setNavOpen(false)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [pathname])

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const openPalette = useCallback(() => setPaletteOpen(true), [])

  return (
    <div className="min-h-dvh bg-bg">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-slate-950"
      >
        Skip to content
      </a>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-line lg:block">
        <Sidebar />
      </aside>

      <MobileNav open={navOpen} onClose={() => setNavOpen(false)} />

      <div className="flex min-h-dvh flex-col lg:pl-64">
        <Topbar onOpenNav={() => setNavOpen(true)} onOpenPalette={openPalette} />
        <OfflineBanner />
        <main id="main" className="flex-1 px-4 py-6 sm:px-6 sm:py-8">
          <div className="mx-auto w-full max-w-[1400px]">
            <Outlet />
          </div>
        </main>
        <footer className="border-t border-line px-4 py-5 text-center text-[0.72rem] text-fg-subtle sm:px-6">
          WattWise AI · Random Forest V2 forecasting · Isolation Forest V2 anomaly detection ·{' '}
          <span className="text-fg-muted">All savings are estimates, not billing guarantees.</span>
        </footer>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <ToastViewport />
    </div>
  )
}