import clsx from 'clsx'
import { useId } from 'react'

export function Field({ label, hint, error, children, className, htmlFor, required }) {
  return (
    <div className={clsx('min-w-0', className)}>
      {label && (
        <label className="label" htmlFor={htmlFor}>
          {label}
          {required && <span className="ml-0.5 text-danger">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1.5 text-[0.75rem] font-medium text-danger">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-[0.75rem] text-fg-subtle">{hint}</p>
      ) : null}
    </div>
  )
}

export function TextInput({ label, hint, error, className, inputClassName, id: providedId, required, ...props }) {
  const generatedId = useId()
  const id = providedId ?? generatedId
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id} className={className} required={required}>
      <input
        id={id}
        className={clsx('input', error && 'input-invalid', inputClassName)}
        aria-invalid={error ? 'true' : undefined}
        required={required}
        {...props}
      />
    </Field>
  )
}

export function NumberInput({ label, hint, error, unit, className, id: providedId, ...props }) {
  const generatedId = useId()
  const id = providedId ?? generatedId
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id} className={className}>
      <div className="relative">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          className={clsx('input tnum pr-12', error && 'input-invalid')}
          aria-invalid={error ? 'true' : undefined}
          {...props}
        />
        {unit && (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[0.78rem] font-medium text-fg-subtle">
            {unit}
          </span>
        )}
      </div>
    </Field>
  )
}

export function SelectInput({ label, hint, error, options = [], className, id: providedId, children, ...props }) {
  const generatedId = useId()
  const id = providedId ?? generatedId
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id} className={className}>
      <select id={id} className={clsx('input', error && 'input-invalid')} {...props}>
        {children ??
          options.map((option) =>
            typeof option === 'string' ? (
              <option key={option} value={option}>
                {option}
              </option>
            ) : (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ),
          )}
      </select>
    </Field>
  )
}

export function TextArea({ label, hint, error, className, id: providedId, ...props }) {
  const generatedId = useId()
  const id = providedId ?? generatedId
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id} className={className}>
      <textarea id={id} className={clsx('input resize-y', error && 'input-invalid')} rows={3} {...props} />
    </Field>
  )
}

export function Toggle({ checked, onChange, label, description, id: providedId, disabled }) {
  const generatedId = useId()
  const id = providedId ?? generatedId
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <label htmlFor={id} className="block cursor-pointer text-sm font-semibold">
          {label}
        </label>
        {description && <p className="mt-0.5 text-[0.8rem] leading-relaxed text-fg-muted">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx(
          'relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors duration-200',
          checked ? 'border-transparent bg-brand' : 'border-line bg-surface-3',
          disabled && 'opacity-50',
        )}
      >
        <span
          className={clsx(
            'absolute top-0.5 size-4.5 rounded-full bg-white shadow transition-all duration-200',
            checked ? 'left-[1.4rem]' : 'left-0.5',
          )}
        />
      </button>
    </div>
  )
}

export function Segmented({ options, value, onChange, className, size = 'md', ariaLabel }) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={clsx(
        'inline-flex flex-wrap items-center gap-1 rounded-xl border border-line bg-surface-2 p-1',
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value
        const Icon = option.icon
        return (
          <button
            key={option.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={clsx(
              'inline-flex items-center gap-1.5 rounded-lg font-semibold transition-all duration-150',
              size === 'sm' ? 'px-2.5 py-1 text-[0.75rem]' : 'px-3 py-1.5 text-[0.82rem]',
              active
                ? 'bg-surface text-fg shadow-[0_1px_2px_rgb(0_0_0/0.12)]'
                : 'text-fg-muted hover:bg-surface-3 hover:text-fg',
            )}
          >
            {Icon && <Icon className="size-3.5" strokeWidth={2.2} aria-hidden="true" />}
            {option.label}
            {option.count != null && (
              <span className={clsx('tnum text-[0.7rem]', active ? 'text-brand' : 'text-fg-subtle')}>
                {option.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function RangeSlider({ value, min = 0, max = 24, step = 0.5, onChange, label, className, id: providedId, ...props }) {
  const generatedId = useId()
  const id = providedId ?? generatedId
  const fill = max === min ? 0 : ((value - min) / (max - min)) * 100
  return (
    <input
      id={id}
      type="range"
      className={clsx('slider', className)}
      style={{ '--fill': `${fill}%` }}
      min={min}
      max={max}
      step={step}
      value={value}
      aria-label={label}
      onChange={(event) => onChange(Number(event.target.value))}
      {...props}
    />
  )
}
