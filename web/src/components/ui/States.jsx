import clsx from 'clsx'
import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react'
import { Button } from './Button'

export function Skeleton({ className, ...props }) {
  return <div className={clsx('skeleton', className)} aria-hidden="true" {...props} />
}

export function SkeletonStat() {
  return (
    <div className="card card-pad">
      <div className="flex items-start justify-between gap-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="size-8 rounded-xl" />
      </div>
      <Skeleton className="mt-3 h-7 w-28" />
      <Skeleton className="mt-2.5 h-3.5 w-36" />
    </div>
  )
}

export function SkeletonCard({ className, lines = 3 }) {
  return (
    <div className={clsx('card card-pad space-y-3', className)}>
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-40 w-full" style={{ height: '10rem' }} />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-3 w-full" style={{ width: `${90 - i * 12}%` }} />
      ))}
    </div>
  )
}

export function EmptyState({ icon: Icon = Inbox, title, description, action, className }) {
  return (
    <div className={clsx('flex flex-col items-center gap-3 px-6 py-12 text-center', className)}>
      <span className="grid size-12 place-items-center rounded-2xl bg-surface-2 text-fg-subtle">
        <Icon className="size-6" strokeWidth={1.8} aria-hidden="true" />
      </span>
      <div>
        <p className="font-semibold">{title}</p>
        {description && <p className="mx-auto mt-1 max-w-sm text-[0.82rem] leading-relaxed text-fg-muted">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function ErrorState({ error, onRetry, className, compact = false }) {
  const message =
    typeof error === 'string'
      ? error
      : (error?.message ?? 'Something went wrong while talking to the WattWise backend.')
  return (
    <div
      className={clsx(
        'flex flex-col items-start gap-3 rounded-xl border border-danger/25 bg-danger-soft/60 text-left',
        compact ? 'p-3' : 'p-5',
        className,
      )}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" strokeWidth={2.3} aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-danger">Backend unavailable</p>
          <p className="mt-0.5 text-[0.8rem] leading-relaxed text-fg-muted">{message}</p>
        </div>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" icon={RefreshCw} onClick={onRetry} className="ml-7">
          Retry connection
        </Button>
      )}
    </div>
  )
}

export function LoadingBlock({ label = 'Loading…', className }) {
  return (
    <div className={clsx('flex items-center justify-center gap-2.5 py-10 text-sm text-fg-muted', className)}>
      <span className="size-4 animate-spin rounded-full border-2 border-line border-t-brand" aria-hidden="true" />
      {label}
    </div>
  )
}

/** Small inline note used to mark demo/fallback data. */
export function DemoNotice({ children, className }) {
  return (
    <p className={clsx('rounded-lg border border-warn/25 bg-warn-soft/60 px-3 py-2 text-[0.78rem] text-fg-muted', className)}>
      {children}
    </p>
  )
}
