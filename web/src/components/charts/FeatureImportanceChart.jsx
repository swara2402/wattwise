import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartTooltip, axisProps } from './ChartTooltip'
import { percent } from '../../lib/format'

/**
 * Feature importance, Random Forest vs XGBoost, sorted descending.
 * Rendered horizontally because feature names are long.
 */
export function FeatureImportanceChart({ rows, height = 300, topN = 10 }) {
  const data = useMemo(
    () =>
      rows.slice(0, topN).map((row) => ({
        feature: row.feature,
        rf: (row.rf ?? 0) * 100,
        xgb: (row.xgb ?? 0) * 100,
      })),
    [rows, topN],
  )

  const dynamicHeight = height ?? Math.max(200, data.length * 30)

  if (!data.length) return null

  return (
    <div style={{ height: dynamicHeight }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 30, left: 8, bottom: 4 }} barGap={2}>
          <CartesianGrid strokeDasharray="3 4" horizontal={false} stroke="var(--grid-line)" />
          <XAxis type="number" tickFormatter={(v) => `${v.toFixed(0)}%`} {...axisProps({ axisLine: false })} />
          <YAxis
            type="category"
            dataKey="feature"
            width={116}
            tick={{ fill: 'var(--fg-muted)', fontSize: 11, fontFamily: 'var(--font-mono)' }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: 'var(--surface-2)' }}
            content={
              <ChartTooltip
                valueFormatter={(v) => percent(v, 2)}
                titleFormatter={(label) => `Feature: ${label}`}
              />
            }
          />
          <Bar dataKey="rf" name="Random Forest V2" fill="var(--brand)" radius={[0, 4, 4, 0]} isAnimationActive={false} />
          <Bar dataKey="xgb" name="XGBoost V2" fill="var(--accent)" radius={[0, 4, 4, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
