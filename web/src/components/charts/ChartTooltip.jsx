import { useId } from 'react'

const AXIS = {
  stroke: 'var(--border)',
  tick: { fill: 'var(--fg-subtle)', fontSize: 11, fontFamily: 'var(--font-mono)' },
  tickLine: false,
  axisLine: { stroke: 'var(--border)' },
}

export const axisProps = (extra = {}) => ({ ...AXIS, ...extra })

/**
 * Shared Recharts tooltip. Renders a glass card with a title row and
 * one line per series so every chart in the app looks identical.
 */
export function ChartTooltip({
  active,
  payload,
  label,
  titleFormatter,
  valueFormatter = (v) => v,
  labelSuffix,
  showTotal = false,
}) {
  if (!active || !payload?.length) return null

  const rows = payload.filter((entry) => entry.value != null)
  if (!rows.length) return null
  const total = rows.reduce((s, r) => s + (Number(r.value) || 0), 0)

  return (
    <div className="surface-glass pointer-events-none min-w-40 rounded-xl border border-line px-3 py-2 shadow-pop">
      <p className="mb-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-fg-subtle">
        {titleFormatter ? titleFormatter(label, payload) : label}
        {labelSuffix}
      </p>
      <ul className="space-y-0.5">
        {rows.map((entry) => (
          <li key={entry.dataKey ?? entry.name} className="flex items-center justify-between gap-4 text-[0.78rem]">
            <span className="flex items-center gap-1.5 text-fg-muted">
              <span
                className="size-2 shrink-0 rounded-[3px]"
                style={{ background: entry.color || entry.payload?.color || 'var(--brand)' }}
              />
              {entry.name}
            </span>
            <span className="stat-value text-fg">{valueFormatter(entry.value, entry)}</span>
          </li>
        ))}
      </ul>
      {showTotal && rows.length > 1 && (
        <p className="mt-1.5 border-t border-line pt-1.5 text-[0.75rem] text-fg-muted">
          Total <span className="stat-value text-fg">{valueFormatter(total)}</span>
        </p>
      )}
    </div>
  )
}

export function useChartGradientId(prefix = 'grad') {
  return `${prefix}-${useId().replace(/:/g, '')}`
}
