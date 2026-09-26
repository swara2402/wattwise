import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ChartTooltip, axisProps } from './ChartTooltip'
import { kwh as fmtKwh, money } from '../../lib/format'

/** Average consumption by weekday — the "weekend problem" detector. */
export function WeekdayBars({ data, height = 240, highlightIndex }) {
  const [active, setActive] = useState(null)
  const best = useMemo(
    () => data.reduce((b, d, i) => (d.average > (data[b]?.average ?? -1) ? i : b), 0),
    [data],
  )
  const target = highlightIndex ?? best
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 6, right: 6, left: -18, bottom: 0 }} onMouseLeave={() => setActive(null)}>
          <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="var(--grid-line)" />
          <XAxis dataKey="label" {...axisProps({ axisLine: false })} />
          <YAxis width={44} tickFormatter={(v) => v.toFixed(0)} domain={[0, 'auto']} {...axisProps()} />
          <Tooltip
            cursor={{ fill: 'var(--surface-2)' }}
            content={<ChartTooltip valueFormatter={(v) => `${fmtKwh(v, 2)} average`} />}
          />
          <Bar
            dataKey="average"
            name="Avg daily usage"
            radius={[6, 6, 0, 0]}
            isAnimationActive={false}
            onMouseEnter={(_, index) => setActive(index)}
          >
            {data.map((entry, index) => (
              <Cell
                key={entry.label}
                fill={index === target ? 'var(--accent)' : 'var(--brand)'}
                fillOpacity={active == null || active === index ? 1 : 0.45}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Histogram of daily consumption — shows spread and tail risk. */
export function DistributionChart({ data, height = 220, median }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 6, right: 6, left: -22, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="var(--grid-line)" />
          <XAxis dataKey="label" {...axisProps({ axisLine: false, interval: 0, fontSize: 10 })} />
          <YAxis width={40} {...axisProps()} />
          <Tooltip
            cursor={{ fill: 'var(--surface-2)' }}
            content={
              <ChartTooltip
                valueFormatter={(v) => `${v} day${v === 1 ? '' : 's'}`}
                titleFormatter={(_, payload) =>
                  `${payload?.[0]?.payload?.from?.toFixed(1)}–${payload?.[0]?.payload?.to?.toFixed(1)} kWh`
                }
              />
            }
          />
          <Bar dataKey="count" name="Days" radius={[4, 4, 0, 0]} fill="var(--violet)" isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
      {median != null && (
        <p className="mt-1 text-center text-[0.72rem] text-fg-subtle">
          Median day sits at <span className="stat-value text-fg-muted">{median.toFixed(1)} kWh</span>
        </p>
      )}
    </div>
  )
}

/**
 * Current vs proposed cost per appliance — the simulator's core visual.
 * Rendered as paired horizontal bars so long appliance names stay readable.
 */
export function SavingsComparisonChart({ rows, height, tariff = 0 }) {
  const data = useMemo(
    () =>
      rows.map((row) => ({
        name: row.name,
        Current: row.currentCost,
        Proposed: row.proposedCost,
        saved: row.savedCost,
      })),
    [rows],
  )
  const dynamicHeight = height ?? Math.max(220, data.length * 46)

  return (
    <div style={{ height: dynamicHeight }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }} barGap={4}>
          <CartesianGrid strokeDasharray="3 4" horizontal={false} stroke="var(--grid-line)" />
          <XAxis type="number" tickFormatter={(v) => `₹${v.toFixed(0)}`} {...axisProps({ axisLine: false })} />
          <YAxis
            type="category"
            dataKey="name"
            width={128}
            tick={{ fill: 'var(--fg-muted)', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: 'var(--surface-2)' }}
            content={<ChartTooltip valueFormatter={(v) => money(v)} />}
          />
          <Bar dataKey="Current" name="Current cost" fill="var(--surface-3)" radius={[0, 5, 5, 0]} isAnimationActive={false} />
          <Bar dataKey="Proposed" name="Proposed cost" radius={[0, 5, 5, 0]} isAnimationActive={false}>
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.saved > 0.5 ? 'var(--brand)' : 'var(--border-strong)'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {tariff > 0 && (
        <p className="mt-1 text-center text-[0.72rem] text-fg-subtle">
          Bars are rupee cost per month at {money(tariff, true)}/kWh
        </p>
      )}
    </div>
  )
}

/** Compact month-over-month totals. */
export function MonthBars({ data, height = 240, highlightIndex }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="var(--grid-line)" />
          <XAxis dataKey="label" {...axisProps({ axisLine: false })} />
          <YAxis width={46} tickFormatter={(v) => v.toFixed(0)} {...axisProps()} />
          <Tooltip
            cursor={{ fill: 'var(--surface-2)' }}
            content={
              <ChartTooltip
                valueFormatter={(v) => fmtKwh(v, 1)}
                titleFormatter={(_, payload) => payload?.[0]?.payload?.month ?? ''}
              />
            }
          />
          <Bar dataKey="total" name="Monthly usage" radius={[6, 6, 0, 0]} isAnimationActive={false}>
            {data.map((entry, index) => (
              <Cell key={entry.month} fill={index === highlightIndex ? 'var(--accent)' : 'var(--brand)'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
