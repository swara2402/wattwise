import { useMemo } from 'react'
import {
  Area,
  AreaChart,
  Brush,
  CartesianGrid,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ChartTooltip, axisProps, useChartGradientId } from './ChartTooltip'
import { formatDate, kwh as fmtKwh } from '../../lib/format'

/**
 * The workhorse trend chart: daily kWh with an optional baseline band,
 * anomaly markers, average reference line and a brush for long ranges.
 */
export function UsageAreaChart({
  data,
  height,
  showBaseline = true,
  showAverage = true,
  showBrush = false,
  anomalies = [],
  onPointClick,
  valueName = 'Daily usage',
}) {
  const gradientId = useChartGradientId('usage')
  const anomalyDates = useMemo(() => new Set(anomalies.map((a) => a.date ?? a)), [anomalies])
  const longRange = data.length > 90

  const rows = useMemo(
    () =>
      data.map((point) => ({
        ...point,
        date: point.date,
        label: formatDate(point.date, { day: 'numeric', month: 'short' }),
        isAnomaly: anomalyDates.has(point.date),
      })),
    [data, anomalyDates],
  )

  const average = useMemo(
    () => (rows.length ? rows.reduce((s, r) => s + r.energy_kwh, 0) / rows.length : 0),
    [rows],
  )

  const renderDot = (key) => (props) => {
    const { cx, cy, payload, index } = props
    if (cx == null || cy == null) return null
    if (key === 'baseline') return null
    if (payload?.isAnomaly) {
      return (
        <g key={`anom-${index}`}>
          <circle cx={cx} cy={cy} r={7} fill="var(--danger)" fillOpacity={0.18} />
          <circle
            cx={cx}
            cy={cy}
            r={3.5}
            fill="var(--danger)"
            stroke="var(--surface)"
            strokeWidth={1.5}
            style={{ cursor: onPointClick ? 'pointer' : 'default' }}
          />
        </g>
      )
    }
    return (
      <circle
        key={`pt-${index}`}
        cx={cx}
        cy={cy}
        r={rows.length > 120 ? 0 : 2.4}
        fill="var(--brand)"
        stroke="var(--surface)"
        strokeWidth={1}
        style={{ cursor: onPointClick ? 'pointer' : 'default' }}
        onClick={onPointClick ? () => onPointClick(payload) : undefined}
      />
    )
  }

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 6, right: 10, left: -14, bottom: showBrush ? 0 : 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.34} />
              <stop offset="55%" stopColor="var(--brand)" stopOpacity={0.1} />
              <stop offset="100%" stopColor="var(--brand)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id={`${gradientId}-warn`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--warn)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="var(--warn)" stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="var(--grid-line)" />
          <XAxis
            dataKey="date"
            tickFormatter={(value) => (longRange ? formatDate(value, { month: 'short' }) : formatDate(value, { day: 'numeric', month: 'short' }))}
            minTickGap={28}
            {...axisProps()}
          />
          <YAxis
            width={46}
            tickFormatter={(value) => value.toFixed(0)}
            domain={[0, 'auto']}
            {...axisProps()}
          />
          <Tooltip
            cursor={{ stroke: 'var(--border-strong)', strokeDasharray: '4 4' }}
            content={
              <ChartTooltip
                valueFormatter={(value) => fmtKwh(value, 2)}
                showTotal={showBaseline}
                titleFormatter={(label, payload) => {
                  const point = payload?.[0]?.payload
                  const suffix = point?.isAnomaly ? '  ·  ⚠ anomaly' : ''
                  return `${formatDate(label)}${suffix}`
                }}
              />
            }
          />

          <Area
            type="monotone"
            dataKey="energy_kwh"
            name={valueName}
            stroke="var(--brand)"
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={renderDot('actual')}
            activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--surface)' }}
            isAnimationActive={false}
          />

          {showBaseline && (
            <Line
              type="monotone"
              dataKey="baseline"
              name="7-day baseline"
              stroke="var(--accent)"
              strokeWidth={1.8}
              strokeDasharray="5 4"
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />
          )}

          {showAverage && average > 0 && (
            <ReferenceLine
              y={average}
              stroke="var(--info)"
              strokeDasharray="2 4"
              label={{
                value: `avg ${average.toFixed(1)} kWh`,
                position: 'insideTopRight',
                fill: 'var(--info)',
                fontSize: 10,
              }}
            />
          )}

          {showBrush && (
            <Brush
              dataKey="date"
              height={26}
              travellerWidth={8}
              stroke="var(--border-strong)"
              fill="var(--surface-2)"
              tickFormatter={(value) => formatDate(value, { day: 'numeric', month: 'short' })}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
