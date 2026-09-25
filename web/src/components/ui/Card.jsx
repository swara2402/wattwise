import clsx from 'clsx'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'

export function Card({ as: Tag = 'section', className, interactive = false, glow = false, children, ...props }) {
  return (
    <Tag
      className={clsx('card', interactive && 'card-hover', glow && 'card-glow', className)}
      {...props}
    >
      {children}
    </Tag>
  )
}

export function CardHeader({ title, subtitle, icon: Icon, action, className, children }) {
  return (
    <header className={clsx('flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-[0.98rem] font-semibold">
          {Icon && (
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
              <Icon className="size-4" strokeWidth={2.2} aria-hidden="true" />
            </span>
          )}
          <span className="truncate">{title}</span>
        </h2>
        {subtitle && <p className="mt-1 text-[0.8rem] leading-relaxed text-fg-muted">{subtitle}</p>}
        {children}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </header>
  )
}

export function PageHeader({ eyebrow, title, subtitle, action, children }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-brand">{eyebrow}</div>
        )}
        <h1 className="text-[1.6rem] font-bold leading-tight tracking-tight sm:text-[1.9rem]">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-fg-muted">{subtitle}</p>}
        {children}
      </div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
    </div>
  )
}

const TONE_TEXT = {
  brand: 'text-brand',
  accent: 'text-accent',
  warn: 'text-warn',
  danger: 'text-danger',
  info: 'text-info',
  violet: 'text-violet',
  muted: 'text-fg-muted',
}

const TONE_SOFT = {
  brand: 'bg-brand-soft',
  accent: 'bg-accent-soft',
  warn: 'bg-warn-soft',
  danger: 'bg-danger-soft',
  info: 'bg-info-soft',
  violet: 'bg-violet-soft',
  muted: 'bg-surface-3',
}

export function StatCard({
  label,
  value,
  unit,
  sub,
  delta,
  deltaLabel,
  icon: Icon,
  tone = 'brand',
  loading = false,
  invertDelta = false,
  className,
  onClick,
  children,
}) {
  const Trend = delta == null ? Minus : delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus
  const good = delta == null ? null : invertDelta ? delta > 0 : delta < 0
  const Wrapper = onClick ? 'button' : 'div'

  return (
    <Card
      as={Wrapper}
      onClick={onClick}
      className={clsx('card-pad text-left', onClick && 'card-hover cursor-pointer', className)}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-fg-subtle">{label}</p>
        {Icon && (
          <span className={clsx('grid size-8 shrink-0 place-items-center rounded-xl', TONE_SOFT[tone], TONE_TEXT[tone])}>
            <Icon className="size-4" strokeWidth={2.2} aria-hidden="true" />
          </span>
        )}
      </div>

      {loading ? (
        <div className="mt-3 space-y-2">
          <div className="skeleton h-7 w-28" />
          <div className="skeleton h-3.5 w-36" />
        </div>
      ) : (
        <>
          <p className="mt-2.5 flex items-baseline gap-1.5">
            <span className="stat-value text-[1.6rem] leading-none text-fg">{value}</span>
            {unit && <span className="text-sm font-medium text-fg-muted">{unit}</span>}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.78rem]">
            {delta != null && (
              <span
                className={clsx(
                  'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold',
                  good === null
                    ? 'bg-surface-3 text-fg-muted'
                    : good
                      ? 'bg-brand-soft text-brand'
                      : 'bg-danger-soft text-danger',
                )}
              >
                <Trend className="size-3.5" strokeWidth={2.6} aria-hidden="true" />
                {`${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`}
              </span>
            )}
            {(sub || deltaLabel) && <span className="text-fg-muted">{sub || deltaLabel}</span>}
          </div>
          {children}
        </>
      )}
    </Card>
  )
}
