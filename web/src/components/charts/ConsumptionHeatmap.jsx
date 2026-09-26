import { useMemo } from 'react'
import { formatDate, kwh as fmtKwh } from '../../lib/format'

/**
 * Calendar-style heatmap of daily consumption.
 * A plain DOM grid (not a charting lib) so each day is a real,
 * focusable button that can be keyboard-navigated and announced.
 */
export function ConsumptionHeatmap({ data, onSelect, weeks = 26, className }) {
  const { columns, max, monthLabels } = useMemo(() => {
    const byDate = new Map(data.map((point) => [point.date, point.energy_kwh]))
    if (!byDate.size) return { columns: [], max: 0, monthLabels: [] }

    const sorted = [...byDate.keys()].sort()
    const last = new Date(`${sorted.at(-1)}T00:00:00`)
    const anchor = new Date(last)
    anchor.setDate(anchor.getDate() + (6 - anchor.getDay()))

    const first = new Date(`${sorted[0]}T00:00:00`)
    const gridStart = new Date(anchor)
    gridStart.setDate(gridStart.getDate() - (weeks * 7 - 1))

    const cols = []
    const months = []
    let lastMonth = null
    for (let w = 0; w < weeks; w += 1) {
      const col = []
      for (let d = 0; d < 7; d += 1) {
        const date = new Date(gridStart)
        date.setDate(gridStart.getDate() + w * 7 + d)
        const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
        const inRange = date >= first && date <= last
        col.push({ iso, value: byDate.get(iso), inRange })
        if (d === 0 && inRange) {
          const month = date.getMonth()
          if (month !== lastMonth) {
            months.push({ index: w, label: date.toLocaleDateString('en-IN', { month: 'short' }) })
            lastMonth = month
          }
        }
      }
      cols.push(col)
    }
    return { columns: cols, max: Math.max(...data.map((p) => p.energy_kwh), 1), monthLabels: months }
  }, [data, weeks])

  if (!columns.length) return null

  const intensity = (value) => {
    if (value == null) return { background: 'var(--surface-2)', opacity: 0.35 }
    const ratio = Math.min(1, value / max)
    return {
      background: 'var(--brand)',
      opacity: 0.18 + ratio * 0.82,
    }
  }

  return (
    <div className={className}>
      <div className="mb-1.5 flex pl-6 text-[0.65rem] font-semibold uppercase tracking-wider text-fg-subtle">
        {monthLabels.map((m) => (
          <span key={`${m.label}-${m.index}`} className="flex-1">
            {m.label}
          </span>
        ))}
      </div>

      <div className="flex gap-1.5">
        <div className="flex flex-col justify-between py-0.5 text-[0.6rem] font-semibold text-fg-subtle">
          {['Mon', '', 'Wed', '', 'Fri', '', 'Sun'].map((label, i) => (
            <span key={i} className="h-3 leading-3">
              {label}
            </span>
          ))}
        </div>

        <div className="flex flex-1 gap-[3px] overflow-hidden">
          {columns.map((column, w) => (
            <div key={w} className="flex flex-1 flex-col gap-[3px]">
              {column.map((cell) => (
                <button
                  key={cell.iso}
                  type="button"
                  disabled={!cell.inRange}
                  onClick={() => onSelect?.(cell)}
                  title={cell.inRange ? `${formatDate(cell.iso)} · ${fmtKwh(cell.value, 2)}` : undefined}
                  aria-label={cell.inRange ? `${formatDate(cell.iso)}: ${fmtKwh(cell.value, 2)}` : undefined}
                  className="aspect-square w-full rounded-[3px] transition-transform duration-150 enabled:hover:scale-125 enabled:hover:ring-1 enabled:hover:ring-fg/40"
                  style={intensity(cell.value)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-end gap-1.5 text-[0.68rem] text-fg-subtle">
        <span>Lower</span>
        {[0.15, 0.35, 0.55, 0.75, 0.95].map((o) => (
          <span key={o} className="size-2.5 rounded-[3px]" style={{ background: 'var(--brand)', opacity: o }} />
        ))}
        <span>Higher</span>
      </div>
    </div>
  )
}
