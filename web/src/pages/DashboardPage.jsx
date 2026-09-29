import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  ArrowRight,
  Coins,
  Flame,
  Gauge,
  LineChart as LineChartIcon,
  Sparkles,
  TrendingDown,
  TriangleAlert,
  Zap,
} from 'lucide-react'
import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { ChartTooltip } from '../components/charts/ChartTooltip'
import { Card, PageHeader, StatCard } from '../components/ui/Card'
import { Badge, DeltaBadge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Segmented } from '../components/ui/Field'
import { EmptyState, ErrorState, Skeleton, SkeletonStat } from '../components/ui/States'
import { ChartFrame } from '../components/charts/ChartFrame'
import { UsageAreaChart } from '../components/charts/UsageAreaChart'
import { WeekdayBars, DistributionChart, MonthBars } from '../components/charts/BarCharts'
import { DonutChart } from '../components/charts/DonutChart'
import { Sparkline } from '../components/charts/Sparkline'
import { ConsumptionHeatmap } from '../components/charts/ConsumptionHeatmap'
import { useApp } from '../context/AppContext'
import { useAnomalies, useHistorical } from '../hooks/useEnergyData'
import { enrichAnomalies, averageByWeekday, movingAverage, compareWindows, summariseWindow } from '../lib/energy'
import { formatDate, money, num, percent } from '../lib/format'

// Always use 30-day period - simplified for household users, no complex selections needed

const APPLIANCE_COLORS = ['var(--brand)', 'var(--accent)', 'var(--info)', 'var(--violet)', 'var(--warn)', 'var(--danger)']

function greeting() {
  const hour = new Date().getHours()
  if (hour < 5) return 'Still up'
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export function DashboardPage() {
  const { settings, simulation, tariff, health } = useApp()
  const range = 30 // Simplified to fixed 30-day view - no complex selection for users
  const history = useHistorical(Math.max(range * 2, 90))
  const anomalies = useAnomalies()

  const firstName = (settings.userName || 'there').split(' ')[0]
  const series = useMemo(() => history.data?.data ?? [], [history.data])
  const enriched = useMemo(() => enrichAnomalies(anomalies.data?.anomalies ?? []), [anomalies.data])

  const window = useMemo(() => {
    const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date))
    const current = sorted.slice(-range)
    const withBaseline = movingAverage(current, 7)
    return {
      rows: current.map((point, i) => ({ ...point, baseline: withBaseline[i]?.energy_kwh })),
      stats: summariseWindow(current),
      previous: compareWindows(sorted, range).previousStats,
    }
  }, [series])

  const change = window.previous.total
    ? ((window.stats.total - window.previous.total) / window.previous.total) * 100
    : null

  const billEstimate = window.stats.total * tariff + Number(settings.fixedCharges || 0)
  const previousBill = window.previous.total * tariff + Number(settings.fixedCharges || 0)
  const weekdayData = useMemo(() => averageByWeekday(window.rows), [window.rows])

  const applianceMix = useMemo(
    () =>
      simulation.rows
        .filter((row) => row.currentKwh > 0)
        .sort((a, b) => b.currentKwh - a.currentKwh)
        .slice(0, 6)
        .map((row, index) => ({
          name: row.name,
          value: Number(row.currentKwh.toFixed(1)),
          color: APPLIANCE_COLORS[index % APPLIANCE_COLORS.length],
        })),
    [simulation.rows],
  )

  const latest = window.rows.at(-1)
  const topAnomaly = enriched[0]
  const loading = history.isLoading && !history.data
  const failed = history.status === 'error' && !history.data

  // Distribution chart data for consumption histogram
  const distributionData = useMemo(() => {
    if (!window.rows.length) return []
    const values = window.rows.map(r => r.energy_kwh)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const bins = 8
    const binWidth = (max - min) / bins
    const binsArr = Array.from({ length: bins }, (_, i) => ({
      from: min + i * binWidth,
      to: min + (i + 1) * binWidth,
      count: 0,
      label: `${(min + i * binWidth).toFixed(0)}`
    }))
    values.forEach(v => {
      const binIndex = Math.min(Math.floor((v - min) / binWidth), bins - 1)
      binsArr[binIndex].count++
    })
    return binsArr
  }, [window.rows])

  const medianConsumption = useMemo(() => {
    if (!window.rows.length) return null
    const sorted = [...window.rows].sort((a, b) => a.energy_kwh - b.energy_kwh)
    const mid = Math.floor(sorted.length / 2)
    return sorted[mid].energy_kwh
  }, [window.rows])

  // Monthly consumption data for trend chart
  const monthlyData = useMemo(() => {
    if (!window.rows.length) return []
    const monthMap = new Map()
    window.rows.forEach(row => {
      const date = new Date(row.date)
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      const monthLabel = date.toLocaleDateString('en-US', { month: 'short' })
      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, { label: monthLabel, total: 0, count: 0 })
      }
      const current = monthMap.get(monthKey)
      current.total += row.energy_kwh
      current.count += 1
    })
    return Array.from(monthMap.values())
  }, [window.rows])

  // Cumulative energy data for running total line chart
  const cumulativeData = useMemo(() => {
    if (!window.rows.length) return []
    let runningTotal = 0
    return window.rows.map(row => {
      runningTotal += row.energy_kwh
      const date = new Date(row.date)
      return {
        date: `${date.getMonth() + 1}/${date.getDate()}`,
        cumulative: Number(runningTotal.toFixed(2)),
        daily: row.energy_kwh
      }
    })
  }, [window.rows])

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Your Home Energy"
        title={`${greeting()}, ${firstName}`}
        subtitle="Track your energy use, see your bills, and find ways to save money."
        action={
          <Button variant="outline" size="sm" onClick={history.refetch} loading={history.status === 'refreshing'}>
            Refresh
          </Button>
        }
      />

      {failed && (
        <ErrorState error={history.error} onRetry={history.refetch} />
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonStat key={i} />)
        ) : (
          <>
            <StatCard
              label="Today's Energy Used"
              value={latest ? num(latest.energy_kwh, 2) : '—'}
              unit="kWh"
              sub="Your latest reading (kilowatt-hours)"
              icon={Activity}
              tone="brand"
            >
              <Sparkline
                values={window.rows.slice(-14).map((p) => p.energy_kwh)}
                className="mt-2 h-8 w-full"
                width={200}
                height={32}
              />
            </StatCard>

            <StatCard
              label="This Month's Total"
              value={num(window.stats.total, 1)}
              unit="kWh"
              delta={change}
              sub="compared to last month"
              icon={Zap}
              tone="accent"
            />

            <StatCard
              label="Current Bill Estimate"
              value={money(billEstimate)}
              sub="Based on usage so far"
              delta={previousBill ? ((billEstimate - previousBill) / previousBill) * 100 : null}
              deltaLabel="vs last month"
              icon={Coins}
              tone="info"
            />

            <StatCard
              label="Highest Usage Day"
              value={window.stats.peak ? num(window.stats.peak.energy_kwh, 1) : '—'}
              unit="kWh"
              sub={window.stats.peak ? formatDate(window.stats.peak.date, { day: 'numeric', month: 'short' }) : '—'}
              icon={Flame}
              tone="warn"
            />
          </>
        )}
      </div>

      {simulation.savedCost > 1 && (
        <Link to="/simulator" className="block">
          <Card className="card-pad card-hover relative overflow-hidden border-brand/25 bg-gradient-to-r from-brand-soft via-surface to-surface">
            <div className="flex flex-wrap items-center gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand text-slate-950">
                <Sparkles className="size-5" strokeWidth={2.3} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">Your simulator plan is worth {money(simulation.savedCost)}/month</p>
                  <Badge tone="accent">{percent(simulation.reductionPct, 1)} less energy</Badge>
                </div>
                <p className="mt-1 text-[0.82rem] text-fg-muted">
                  That's {money(simulation.annualSavedCost)} a year in savings! Best change: {simulation.ranked[0]?.name ?? 'adjust your appliance use'}.
                </p>
              </div>
              <span className="flex items-center gap-1.5 text-sm font-semibold text-brand">
                Open plan <ArrowRight className="size-4" strokeWidth={2.4} aria-hidden="true" />
              </span>
            </div>
          </Card>
        </Link>
      )}

      {topAnomaly && (
        <Link to="/anomalies-excess" className="block">
          <Card className="card-pad card-hover flex flex-wrap items-center gap-4 border-danger/25 bg-danger-soft/40">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-danger/15 text-danger">
              <TriangleAlert className="size-5" strokeWidth={2.2} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">{topAnomaly.headline}</p>
                <Badge tone="danger">{topAnomaly.severity}</Badge>
              </div>
              <p className="mt-1 text-[0.82rem] text-fg-muted">
                {formatDate(topAnomaly.date)} · You spent {money(topAnomaly.wastedKwh * tariff)} more than usual on this day
              </p>
            </div>
            <span className="flex items-center gap-1.5 text-sm font-semibold text-danger">
              Learn more <ArrowRight className="size-4" strokeWidth={2.4} aria-hidden="true" />
            </span>
          </Card>
        </Link>
      )}

      <ChartFrame
        title="Your daily energy use"
        subtitle="See how much energy you use each day compared to your average. Red spikes mean you used more than usual."
        icon={LineChartIcon}
        height={300}
        isEmpty={!loading && !window.rows.length}
        emptyTitle="No energy data yet"
        emptyDescription="We're gathering your energy usage information - check back soon!"
        action={
          <DeltaBadge value={change} invert={false} className="normal-case" />
        }
      >
        {loading ? (
          <Skeleton className="h-full w-full" />
        ) : (
          <UsageAreaChart
            data={window.rows}
            anomalies={enriched}
            showBrush={range >= 30}
            height={300}
          />
        )}
      </ChartFrame>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartFrame
          title="Energy use by day of week"
          subtitle="See which days of the week you use the most energy."
          icon={Gauge}
          height={240}
        >
          <WeekdayBars data={weekdayData} height={240} />
        </ChartFrame>

        <ChartFrame
          title="What's using your energy"
          subtitle="Which appliances are using the most energy in your home."
          icon={Zap}
          height={240}
          action={
            <Link to="/simulator" className="text-[0.78rem] font-semibold text-brand hover:underline">
              Edit appliances
            </Link>
          }
        >
          <DonutChart data={applianceMix} height={200} />
        </ChartFrame>
      </div>

      {/* New charts added for enhanced visual appeal */}
      <div className="grid gap-4 xl:grid-cols-2">
        <ChartFrame
          title="How often you use energy"
          subtitle="See how consistent your energy usage is from day to day."
          icon={Activity}
          height={260}
        >
          <DistributionChart data={distributionData} height={220} median={medianConsumption} />
        </ChartFrame>

        <ChartFrame
          title="3-month energy calendar"
          subtitle="A calendar view - darker days mean you used more energy that day."
          icon={TrendingDown}
          height={260}
        >
          <div className="p-2">
            <ConsumptionHeatmap 
              data={window.rows} 
              weeks={13} 
              className="w-full"
              onSelect={(cell) => console.log('Selected date:', cell.iso)}
            />
          </div>
        </ChartFrame>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartFrame
           title="Monthly energy use"
           subtitle="Track your energy usage month by month to see if you're saving energy over time."
           icon={LineChartIcon}
           height={280}
         >
          <MonthBars data={monthlyData} height={240} />
        </ChartFrame>

        <ChartFrame
          title="Total energy used"
          subtitle="See your running total of energy usage to understand your overall consumption."
          icon={Activity}
          height={280}
        >
          <div style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={cumulativeData} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="var(--grid-line)" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis width={44} tickFormatter={(v) => v.toFixed(0)} />
                <Tooltip content={<ChartTooltip valueFormatter={(v) => `${v} kWh total`} />} />
                <Line type="monotone" dataKey="cumulative" stroke="var(--brand)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartFrame>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="card-pad xl:col-span-2">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[0.98rem] font-semibold">Recent days</h2>
              <p className="mt-1 text-[0.8rem] text-fg-muted">
                Latest {Math.min(range, 10)} recorded days with their distance from the 7-day baseline.
              </p>
            </div>
            <Badge tone="muted">{window.stats.average.toFixed(1)} kWh avg</Badge>
          </div>

          {window.rows.length ? (
            <ul className="divide-y divide-[var(--border)]">
              {window.rows
                .slice(-10)
                .reverse()
                .map((row) => {
                  const diff = row.energy_kwh - (row.baseline ?? row.energy_kwh)
                  const pct = row.baseline ? (diff / row.baseline) * 100 : 0
                  const flagged = enriched.find((a) => a.date === row.date)
                  return (
                    <li key={row.date} className="flex items-center gap-3 py-2.5">
                      <span className="w-24 shrink-0 text-[0.8rem] text-fg-muted">
                        {formatDate(row.date, { day: 'numeric', month: 'short' })}
                      </span>
                      <span className="stat-value w-16 shrink-0 text-[0.85rem]">{row.energy_kwh.toFixed(1)}</span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                        <span
                          className="block h-full rounded-full bg-brand"
                          style={{ width: `${Math.min(100, (row.energy_kwh / (window.stats.peak?.energy_kwh || 1)) * 100)}%` }}
                        />
                      </span>
                      <span className="w-20 shrink-0 text-right">
                        {flagged ? (
                          <Badge tone="danger">flagged</Badge>
                        ) : (
                          <span
                            className={`tnum text-[0.78rem] font-semibold ${pct > 8 ? 'text-warn' : 'text-fg-subtle'}`}
                          >
                            {pct > 0 ? '+' : ''}
                            {pct.toFixed(0)}%
                          </span>
                        )}
                      </span>
                    </li>
                  )
                })}
            </ul>
          ) : (
            <EmptyState
              icon={TrendingDown}
              title="Nothing recorded yet"
              description="Once the FastAPI backend serves a daily series, the last ten days appear here."
            />
          )}
        </Card>

        <Card className="card-pad">
          <h2 className="text-[0.98rem] font-semibold">Quick actions</h2>
          <p className="mt-1 text-[0.8rem] text-fg-muted">Shortcuts to the things people do most.</p>
          <div className="mt-4 space-y-2">
            <Link to="/predictor" className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2.5 transition-colors hover:border-brand/40 hover:bg-brand-soft">
              <span className="flex items-center gap-2.5 text-[0.85rem] font-semibold">
                <Sparkles className="size-4 text-brand" strokeWidth={2.2} aria-hidden="true" />
                Forecast tomorrow's bill
              </span>
              <ArrowRight className="size-4 text-fg-subtle" strokeWidth={2.2} aria-hidden="true" />
            </Link>
            <Link to="/simulator" className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2.5 transition-colors hover:border-brand/40 hover:bg-brand-soft">
              <span className="flex items-center gap-2.5 text-[0.85rem] font-semibold">
                <Zap className="size-4 text-accent" strokeWidth={2.2} aria-hidden="true" />
                Tune appliance hours
              </span>
              <ArrowRight className="size-4 text-fg-subtle" strokeWidth={2.2} aria-hidden="true" />
            </Link>
            <Link to="/advisor" className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2.5 transition-colors hover:border-brand/40 hover:bg-brand-soft">
              <span className="flex items-center justify-between gap-2.5 text-[0.85rem] font-semibold">
                <TriangleAlert className="size-4 text-warn" strokeWidth={2.2} aria-hidden="true" />
                Review {enriched.length} anomaly{enriched.length === 1 ? '' : 'ies'}
              </span>
              <ArrowRight className="size-4 text-fg-subtle" strokeWidth={2.2} aria-hidden="true" />
            </Link>
          </div>
          <div className="divider my-4" />
          <p className="text-[0.75rem] leading-relaxed text-fg-subtle">
            {health.online
              ? `Historical dataset via ${health.data?.model ?? 'Random Forest V2'} — refreshed automatically every 25 seconds.`
              : 'Backend offline: these tiles fall back to the last successful snapshot.'}
          </p>
        </Card>
      </div>
    </div>
  )
}