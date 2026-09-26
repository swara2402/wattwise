import { Link } from 'react-router-dom'
import { ArrowLeft, Command, Compass, Home, Search } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { NAV_SECTIONS } from '../navigation'

export function NotFoundPage() {
  const suggestions = NAV_SECTIONS.flatMap((section) => section.items).slice(0, 5)

  return (
    <div className="grid min-h-[70vh] place-items-center">
      <Card className="card-pad w-full max-w-xl text-center" glow>
        <p className="stat-value text-[3.5rem] leading-none text-brand">404</p>
        <h1 className="mt-2 text-[1.3rem] font-bold">That page does not exist</h1>
        <p className="mx-auto mt-2 max-w-sm text-[0.85rem] leading-relaxed text-fg-muted">
          The link may be from an older version of the dashboard. Everything still works — pick a destination below or
          press <kbd className="kbd">⌘</kbd> <kbd className="kbd">K</kbd> to search.
        </p>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <Link to="/">
            <Button variant="primary" icon={Home}>
              Back to home
            </Button>
          </Link>
          <Button variant="outline" icon={ArrowLeft} onClick={() => window.history.back()}>
            Go back
          </Button>
        </div>

        <div className="mt-7 border-t border-line pt-5">
          <p className="flex items-center justify-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-fg-subtle">
            <Compass className="size-3.5" strokeWidth={2.4} aria-hidden="true" />
            Popular destinations
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {suggestions.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className="flex items-center gap-2.5 rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-left transition-colors hover:border-brand/50 hover:bg-brand-soft/40"
                >
                  <item.icon className="size-4 shrink-0 text-brand" strokeWidth={2.2} aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block truncate text-[0.82rem] font-semibold">{item.label}</span>
                    <span className="block truncate text-[0.7rem] text-fg-subtle">{item.description}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <p className="mt-5 flex items-center justify-center gap-1.5 text-[0.72rem] text-fg-subtle">
            <Search className="size-3.5" strokeWidth={2.2} aria-hidden="true" />
            Tip: the command palette lists every page, plus shortcuts to the tools you use most.
            <Command className="size-3" strokeWidth={2.4} aria-hidden="true" />
          </p>
        </div>
      </Card>
    </div>
  )
}
