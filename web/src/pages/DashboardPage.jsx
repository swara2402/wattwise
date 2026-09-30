import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  ArrowRight,
  Coins,
  Flame,
  Leaf,
  LineChart as LineChartIcon,
  RotateCw,
  Sparkles,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Zap,
  CheckCircle2,
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
import { EmptyState, ErrorState, Skeleton, SkeletonStat } from '../components/ui/States'
import { ChartFrame } from '../components/charts/ChartFrame'
import { UsageAreaChart } from '../components/charts/UsageAreaChart'
import { WeekdayBars } from '../components/charts/BarCharts'
import { DonutChart } from '../components/charts/DonutChart'
import { Sparkline } from '../components/charts/Sparkline'
import { useApp } from '../context/AppContext'
import { useAnomalies, useHistorical } from '../hooks/useEnergyData'
import { enrichAnomalies, averageByWeekday, movingAverage, compareWindows, summariseWindow } from '../lib/energy'
import { formatDate, money, num, percent } from '../lib/format'

const APPLIANCE_COLORS = ['var(--brand)', 'var(--accent)', 'var(--info)', 'var(--violet)', 'var(--warn)', 'var(--danger)']
const CO2_PER_KWH = 0.79 // kg CO2 per kWh

function greeting() {
  const hour = new Date().getHours()
  if (hour < 5) return 'Still up'
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function getUsageStatus(current, previous) {
  if (!previous || previous === 0) return null
  const pct = ((current - previous) / previous) * 100
  if (pct <= -10) return { tone: 'accent', label: 'Great — lower than usual', detail: `You're using ${Math.abs(pct).toFixed(0)}% less electricity than last month.` }
  if (pct <= 5) return { tone: 'brand', label: 'Usage looks stable & healthy', detail: 'Your electricity consumption is right on track with your usual pattern.' }
  if (pct <= 20) return { tone: 'warn', label: 'Slightly higher than usual', detail: `Usage is about ${pct.toFixed(0)}% above last month. Keep an eye on peak hours.` }
  return { tone: 'danger', label: 'Noticeable usage spike', detail: `Your usage is ${pct.toFixed(0)}% higher than last month. Check appliance activity.` }
}

export function DashboardPage() {
  const { settings, simulation, tariff, health } = useApp()
  const [chartRange, setChartRange] = useState(30)
  const history = useHistorical(Math.max(chartRange * 2, 90))
  const anomalies = useAnomalies()

  const firstName = (settings.userName || 'there').split(' ')[0]
  const series = useMemo(() => history.data?.data ?? [], [history.data])
  const enriched = useMemo(() => enrichAnomalies(anomalies.data?.anomalies ?? []), [anomalies.data])

  const window = useMemo(() => {
    const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date))
    const current = sorted.slice(-chartRange)
    const withBaseline = movingAverage(current, 7)
    return {
      rows: current.map((point, i) => ({ ...point, baseline: withBaseline[i]?.energy_kwh })),
      stats: summariseWindow(current),
      previous: compareWindows(sorted, chartRange).previousStats,
    }
  }, [series, chartRange])

  const change = window.previous.total
    ? ((window.stats.total - window.previous.total) / window.previous.total) * 100
    : null

  const billEstimate = window.stats.total * tariff + Number(settings.fixedCharges || 0)
  const previousBill = window.previous.total * tariff + Number(settings.fixedCharges || 0)
  const co2Estimate = window.stats.total * CO2_PER_KWH
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
  const usageStatus = getUsageStatus(window.stats.total, window.previous.total)

  return (
    <div className="space-y-8 lg:space-y-10">
      {/* Friendly Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand">
              <Zap className="size-3.5" /> WattWise Home Energy
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-fg sm:text-3xl">
            {greeting()}, {firstName} 👋
          </h1>
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-fg-muted">
            Here is your simple household electricity overview and predictions.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={history.refetch}
            loading={history.status === 'refreshing'}
            className="shadow-sm"
          >
            <RotateCw className="size-3.5" /> Refresh
          </Button>
        </div>
      </div>

      {failed && <ErrorState error={history.error} onRetry={history.refetch} />}

      {/* 4 Hero Metric Cards with Space to Breathe */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonStat key={i} />)
        ) : (
          <>
            <StatCard
              label="Latest Day Usage"
              value={latest ? num(latest.energy_kwh, 1) : '—'}
              unit="kWh"
              sub="Most recent day recorded"
              icon={Activity}
              tone="brand"
            >
              <Sparkline
                values={window.rows.slice(-14).map((p) => p.energy_kwh)}
                className="mt-3 h-7 w-full"
                width={200}
                height={28}
              />
            </StatCard>

            <StatCard
              label="This Month Total"
              value={num(window.stats.total, 1)}
              unit="kWh"
              delta={change}
              sub="compared to last month"
              icon={Zap}
              tone="accent"
            />

            <StatCard
              label="Expected Bill"
              value={money(billEstimate)}
              sub="Estimated based on usage so far"
              delta={previousBill ? ((billEstimate - previousBill) / previousBill) * 100 : null}
              deltaLabel="vs last month"
              icon={Coins}
              tone="info"
            />

            <StatCard
              label="Estimated CO₂"
              value={num(co2Estimate, 1)}
              unit="kg"
              sub="Environmental footprint"
              icon={Leaf}
              tone="muted"
            />
          </>
        )}
      </div>

      {/* Unified Key Highlight Banner (Uncluttered, simple insight callout) */}
      {!loading && (
        <Card className="card-pad border-brand/20 bg-gradient-to-r from-brand-soft/40 via-surface to-surface">
          {topAnomaly ? (
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3.5">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-warn/15 text-warn">
                  <TriangleAlert className="size-5" strokeWidth={2.2} />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-fg">Unusual electricity spike detected</h2>
                    <Badge tone="warn">{topAnomaly.severity}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-fg-muted">
                    On {formatDate(topAnomaly.date)}, you used {topAnomaly.observed?.toFixed(1)} kWh — higher than your normal baseline.
                  </p>
                </div>
              </div>
              <Link
                to="/anomalies-excess"
                className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-brand hover:underline"
              >
                Inspect spike <ArrowRight className="size-4" />
              </Link>
            </div>
          ) : simulation.savedCost > 1 ? (
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3.5">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
                  <Sparkles className="size-5" strokeWidth={2.2} />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-fg">Savings opportunity available!</h2>
                    <Badge tone="accent">Save up to {money(simulation.savedCost)}/mo</Badge>
                  </div>
                  <p className="mt-1 text-sm text-fg-muted">
                    Adjusting high-consumption appliances like {simulation.ranked[0]?.name ?? 'climate control'} could save {money(simulation.annualSavedCost)} yearly.
                  </p>
                </div>
              </div>
              <Link
                to="/simulator"
                className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-brand px-4 py-2 text-xs font-semibold text-white shadow-sm transition-transform hover:scale-[1.02]"
              >
                Open Savings Calculator <ArrowRight className="size-3.5" />
              </Link>
            </div>
          ) : usageStatus ? (
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
                  <CheckCircle2 className="size-5" strokeWidth={2.2} />
                </span>
                <div>
                  <h2 className="font-semibold text-fg">{usageStatus.label}</h2>
                  <p className="mt-0.5 text-sm text-fg-muted">{usageStatus.detail}</p>
                </div>
              </div>
              {window.stats.peak && (
                <div className="hidden text-right sm:block">
                  <span className="text-xs text-fg-subtle">Highest Day</span>
                  <p className="stat-value text-base">{num(window.stats.peak.energy_kwh, 1)} kWh</p>
                </div>
              )}
            </div>
          ) : null}
        </Card>
      )}

      {/* Primary Consumption Trend Chart */}
      <ChartFrame
        title="Your Daily Electricity Usage"
        subtitle="Track your daily consumption kWh. The smooth grey line displays your 7-day average baseline."
        icon={LineChartIcon}
        height={340}
        isEmpty={!loading && !window.rows.length}
        emptyTitle="No usage data recorded"
        emptyDescription="Usage history will appear once data is loaded."
        action={
          <div className="flex items-center gap-1.5 rounded-lg bg-surface-2 p-1">
            {[7, 30, 90].map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setChartRange(days)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                  chartRange === days
                    ? 'bg-surface text-brand shadow-sm'
                    : 'text-fg-muted hover:text-fg'
                }`}
              >
                {days}D
              </button>
            ))}
          </div>
        }
      >
        {loading ? (
          <Skeleton className="h-full w-full" />
        ) : (
          <UsageAreaChart
            data={window.rows}
            anomalies={enriched}
            showBrush={chartRange >= 30}
            height={340}
          />
        )}
      </ChartFrame>

      {/* Side-by-Side Appliance & Day Patterns */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartFrame
          title="Which days use the most power?"
          subtitle="Average daily electricity consumption broken down by day of the week."
          icon={TrendingUp}
          height={260}
        >
          <WeekdayBars data={weekdayData} height={260} />
        </ChartFrame>

        <ChartFrame
          title="Appliance Usage Breakdown"
          subtitle="Estimated allocation of monthly power consumption across major appliances."
          icon={Zap}
          height={260}
          action={
            <Link to="/simulator" className="text-xs font-semibold text-brand hover:underline">
              Adjust appliances →
            </Link>
          }
        >
          <DonutChart data={applianceMix} height={220} />
        </ChartFrame>
      </div>

      {/* Spaced Bottom Grid: Recent Activity & Quick Next Steps */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Recent Daily Records (7 cols) */}
        <Card className="card-pad lg:col-span-7">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-fg">Recent Daily Usage</h2>
              <p className="mt-0.5 text-xs text-fg-muted">
                Your last 8 recorded days with baseline comparison.
              </p>
            </div>
            <Badge tone="muted">{window.stats.average.toFixed(1)} kWh/day avg</Badge>
          </div>

          {window.rows.length ? (
            <ul className="divide-y divide-line">
              {window.rows
                .slice(-8)
                .reverse()
                .map((row) => {
                  const diff = row.energy_kwh - (row.baseline ?? row.energy_kwh)
                  const pct = row.baseline ? (diff / row.baseline) * 100 : 0
                  const flagged = enriched.find((a) => a.date === row.date)
                  return (
                    <li key={row.date} className="flex items-center gap-4 py-3">
                      <span className="w-24 shrink-0 text-xs font-medium text-fg-muted">
                        {formatDate(row.date, { day: 'numeric', month: 'short' })}
                      </span>
                      <span className="stat-value w-20 shrink-0 text-sm">{row.energy_kwh.toFixed(1)} kWh</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                        <div
                          className="h-full rounded-full bg-brand transition-all"
                          style={{ width: `${Math.min(100, (row.energy_kwh / (window.stats.peak?.energy_kwh || 1)) * 100)}%` }}
                        />
                      </div>
                      <span className="w-20 shrink-0 text-right">
                        {flagged ? (
                          <Badge tone="warn">Spike</Badge>
                        ) : (
                          <span className={`tnum text-xs font-semibold ${pct > 8 ? 'text-warn' : 'text-fg-subtle'}`}>
                            {pct > 0 ? '+' : ''}{pct.toFixed(0)}%
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
              title="No usage recorded"
              description="Recent usage history will appear here once loaded."
            />
          )}
        </Card>

        {/* Quick Action Tiles (5 cols) */}
        <Card className="card-pad flex flex-col justify-between lg:col-span-5">
          <div>
            <h2 className="text-base font-semibold text-fg">What would you like to do?</h2>
            <p className="mt-0.5 text-xs text-fg-muted">Quick access to WattWise tools.</p>

            <div className="mt-4 space-y-3">
              {[
                { to: '/predictor', label: '🔮 Forecast future bill & usage', desc: 'Predict next 30 days', bg: 'hover:bg-brand-soft/40' },
                { to: '/simulator', label: '💰 Calculate potential savings', desc: 'Simulate appliance changes', bg: 'hover:bg-accent-soft/40' },
                { to: '/advisor', label: '💡 Practical energy tips', desc: 'Actionable saving suggestions', bg: 'hover:bg-warn-soft/40' },
                { to: '/analytics', label: '📊 View full usage history', desc: 'Detailed charts & heatmaps', bg: 'hover:bg-info-soft/40' },
              ].map(({ to, label, desc, bg }) => (
                <Link
                  key={to}
                  to={to}
                  className={`flex items-center justify-between rounded-xl border border-line p-3.5 transition-all ${bg}`}
                >
                  <div>
                    <p className="text-xs font-semibold text-fg">{label}</p>
                    <p className="mt-0.5 text-[0.72rem] text-fg-muted">{desc}</p>
                  </div>
                  <ArrowRight className="size-4 shrink-0 text-fg-subtle" />
                </Link>
              ))}
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-line bg-surface-2 p-3.5 text-center">
            <p className="text-xs font-semibold text-fg">Have questions?</p>
            <p className="mt-0.5 text-[0.72rem] text-fg-muted">Press <kbd className="kbd">Ctrl</kbd> + <kbd className="kbd">K</kbd> anywhere to search tools instantly.</p>
          </div>
        </Card>
      </div>
    </div>
  )
}