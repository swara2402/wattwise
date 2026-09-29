import { useMemo, useState } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { ChartTooltip } from './ChartTooltip'
import { kwh as fmtKwh, money } from '../../lib/format'

/**
 * Donut with a custom HTML legend — a canvas legend cannot be hovered,
 * clicked or made accessible, and users interact with these categories.
 */
export function DonutChart({ data, height = 220, valueKey = 'value', nameKey = 'name', currency = false, centerLabel }) {
  const [activeIndex, setActiveIndex] = useState(null)
  const total = useMemo(() => data.reduce((s, d) => s + (d[valueKey] || 0), 0), [data, valueKey])
  const active = activeIndex != null ? data[activeIndex] : null

  if (!data.length || total <= 0) return null

  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,200px)_1fr] sm:items-center">
      <div className="relative" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey={valueKey}
              nameKey={nameKey}
              innerRadius="62%"
              outerRadius="92%"
              paddingAngle={2}
              stroke="var(--surface)"
              strokeWidth={2}
              isAnimationActive={false}
              onMouseEnter={(_, index) => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(null)}
            >
              {data.map((entry, index) => (
                <Cell
                  key={entry[nameKey]}
                  fill={entry.color}
                  opacity={activeIndex == null || activeIndex === index ? 1 : 0.35}
                />
              ))}
            </Pie>
            <Tooltip
              content={
                <ChartTooltip
                  valueFormatter={(value) =>
                    currency ? `${money(value)}/mo` : `${fmtKwh(value, 1)}/mo`
                  }
                />
              }
            />
          </PieChart>
        </ResponsiveContainer>

        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="stat-value text-lg leading-none text-fg">
              {active ? (currency ? money(active[valueKey]) : fmtKwh(active[valueKey], 0)) : currency ? money(total) : fmtKwh(total, 0)}
            </p>
            <p className="mt-1 max-w-24 text-[0.68rem] leading-tight text-fg-subtle">
              {active ? active[nameKey] : (centerLabel ?? 'Total')}
            </p>
          </div>
        </div>
      </div>

      <ul className="space-y-1.5">
        {data.map((entry) => {
          const value = entry[valueKey] || 0
          const pct = total > 0 ? (value / total) * 100 : 0
          const isActive = active?.name === entry[nameKey]
          return (
            <li
              key={entry[nameKey]}
              onMouseEnter={() => setActiveIndex(data.indexOf(entry))}
              onMouseLeave={() => setActiveIndex(null)}
              className={`flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-[0.8rem] transition-colors ${
                isActive ? 'bg-surface-2' : ''
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="size-2.5 shrink-0 rounded-[4px]" style={{ background: entry.color }} />
                <span className="truncate text-fg-muted">{entry[nameKey]}</span>
              </span>
              <span className="flex shrink-0 items-baseline gap-2">
                <span className="stat-value text-fg">{currency ? money(value) : fmtKwh(value, 0)}</span>
                <span className="tnum w-9 text-right text-[0.72rem] text-fg-subtle">{pct.toFixed(0)}%</span>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
