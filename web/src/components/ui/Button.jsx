import clsx from 'clsx'

const VARIANTS = {
  primary: 'btn-primary',
  accent: 'btn-accent',
  outline: 'btn-outline',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
}

const SIZES = {
  sm: 'btn-sm',
  md: '',
  lg: 'btn-lg',
  icon: 'btn-icon',
}

export function buttonClass({ variant = 'outline', size = 'md', block = false, className } = {}) {
  return clsx('btn', VARIANTS[variant], SIZES[size], block && 'btn-block', className)
}

export function Button({
  variant = 'outline',
  size = 'md',
  block = false,
  loading = false,
  disabled,
  className,
  children,
  icon: Icon,
  iconRight: IconRight,
  ...props
}) {
  return (
    <button
      type="button"
      className={buttonClass({ variant, size, block, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <span
          className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-current/30 border-t-current"
          aria-hidden="true"
        />
      ) : (
        Icon && <Icon className={size === 'icon' ? 'size-4' : 'size-4 shrink-0'} strokeWidth={2.2} aria-hidden="true" />
      )}
      {children}
      {IconRight && !loading && <IconRight className="size-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />}
    </button>
  )
}
