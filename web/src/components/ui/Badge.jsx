import clsx from 'clsx'

const TONES = {
  brand: 'badge-brand',
  accent: 'badge-accent',
  warn: 'badge-warn',
  danger: 'badge-danger',
  info: 'badge-info',
  violet: 'badge-violet',
  muted: 'badge-muted',
}

export function Badge({ tone = 'muted', className, children, icon: Icon, ...props }) {
  return (
    <span className={clsx('badge', TONES[tone], className)} {...props}>
      {Icon && <Icon className="size-3" strokeWidth={2.6} aria-hidden="true" />}
      {children}
    </span>
  )
}

export function SeverityBadge({ severity, className }) {
  const tone = { CRITICAL: 'danger', HIGH: 'warn', MEDIUM: 'info', LOW: 'brand' }[severity] ?? 'muted'
  return (
    <Badge tone={tone} className={className}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {severity}
    </Badge>
  )
}

export function DeltaBadge({ value, suffix = '%', invert = false, className }) {
  if (value == null || !Number.isFinite(value)) return null
  const good = invert ? value > 0 : value < 0
  const tone = Math.abs(value) < 0.05 ? 'muted' : good ? 'brand' : 'danger'
  return (
    <Badge tone={tone} className={className}>
      {value > 0 ? '▲' : value < 0 ? '▼' : '■'} {Math.abs(value).toFixed(1)}
      {suffix}
    </Badge>
  )
}
