import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ChartTooltip, axisProps, useChartGradientId } from './ChartTooltip'
import { kwh as fmtKwh } from '../../lib/format'

/**
 * The predictor's input series: 30 daily bars, a mean reference line and
 * (when a prediction exists) a shaded expected range around it.
 */
export function UsageBarChart({ data, prediction, mae = 4.0028 }) {
  const gradientId = useChartGradientId('pred')

  const max = useMemo(
    () => Math.max(...data.map((d) => d.day), prediction ?? 0) * 1.15,
    [data, prediction],
  )

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.95} />
            <stop offset="100%" stopColor="var(--brand)" stopOpacity={0.35} />
          </linearGradient>
        </defs>

        <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="var(--grid-line)" />
        <XAxis dataKey="label" interval={2} {...axisProps({ axisLine: false, fontSize: 10 })} />
        <YAxis width={44} domain={[0, max]} tickFormatter={(v) => v.toFixed(0)} {...axisProps()} />

        <Tooltip
          cursor={{ fill: 'var(--surface-2)' }}
          content={
            <ChartTooltip
              valueFormatter={(value, entry) =>
                entry?.dataKey === 'average'
                  ? `${fmtKwh(value, 2)} (mean)`
                  : fmtKwh(value, 3)
              }
            />
          }
        />

        <Bar dataKey="average" name="30-day mean" fill="var(--border-strong)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        <Bar dataKey="day" name="Daily input" fill={`url(#${gradientId})`} radius={[4, 4, 0, 0]} isAnimationActive={false} />

        {prediction != null && (
          <>
            <ReferenceArea
              y1={Math.max(0, prediction - mae)}
              y2={prediction + mae}
              fill="var(--accent)"
              fillOpacity={0.14}
              stroke="none"
              label={{ value: 'model range', position: 'insideTopRight', fill: 'var(--accent)', fontSize: 10 }}
            />
            <ReferenceLine
              y={prediction}
              stroke="var(--accent)"
              strokeWidth={2}
              strokeDasharray="6 4"
              label={{
                value: `predict ${prediction.toFixed(2)} kWh`,
                position: 'top',
                fill: 'var(--accent)',
                fontSize: 10,
              }}
            />
          </>
        )}
      </BarChart>
    </ResponsiveContainer>
  )
}
