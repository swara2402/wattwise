import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BarChart2, Calendar, TrendingUp } from 'lucide-react'
import { PageHeader } from '../components/ui/Card'
import { ErrorState, Skeleton } from '../components/ui/States'
import { ChartFrame } from '../components/charts/ChartFrame'
import { UsageAreaChart } from '../components/charts/UsageAreaChart'
import { MonthBars, WeekdayBars } from '../components/charts/BarCharts'
import { useHistorical } from '../hooks/useEnergyData'
import { averageByWeekday, monthBuckets, movingAverage } from '../lib/energy'

export function AnalyticsPage() {
  const history = useHistorical(365)
  const source = useMemo(() => history.data?.data ?? [], [history.data])
  const sorted = useMemo(() => [...source].sort((a, b) => a.date.localeCompare(b.date)), [source])
  const visible = useMemo(() => sorted.slice(-365), [sorted])
  const baseline = useMemo(() => movingAverage(visible, 7), [visible])
  const rows = useMemo(
    () => visible.map((point, i) => ({ ...point, baseline: baseline[i]?.energy_kwh })),
    [visible, baseline],
  )
  const weekdayData = useMemo(() => averageByWeekday(sorted), [sorted])
  const monthData = useMemo(() => monthBuckets(sorted), [sorted])

  const totalKwh = useMemo(() => visible.reduce((s, r) => s + r.energy_kwh, 0), [visible])
  const avgKwh = visible.length ? totalKwh / visible.length : 0
  const maxKwh = visible.length ? Math.max(...visible.map((r) => r.energy_kwh)) : 0

  const loading = history.isLoading && !history.data
  const failed = history.status === 'error' && !history.data

  return (
    <div className="space-y-8 lg:space-y-10">
      <PageHeader
        eyebrow="Track & Understand"
        title="My Usage History"
        subtitle="See how your electricity use changes over time. Spot trends, find your highest days, and understand your habits."
      />

      {failed && <ErrorState error={history.error} onRetry={history.refetch} />}
      {loading && <Skeleton className="h-64 w-full" />}

      {!loading && !failed && (
        <div className="space-y-8 lg:space-y-10">
          {/* Summary stats */}
          <div className="grid gap-6 sm:grid-cols-3">
            {[
              { label: 'Total usage (last year)', value: `${totalKwh.toFixed(0)} kWh`, icon: BarChart2, color: 'text-brand', bg: 'bg-brand-soft' },
              { label: 'Daily average', value: `${avgKwh.toFixed(1)} kWh/day`, icon: TrendingUp, color: 'text-accent', bg: 'bg-accent-soft' },
              { label: 'Highest single day', value: `${maxKwh.toFixed(1)} kWh`, icon: Calendar, color: 'text-warn', bg: 'bg-warn-soft' },
            ].map(({ label, value, icon: Icon, color, bg }) => (
              <div key={label} className="card card-pad flex items-center gap-4">
                <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${bg}`}>
                  <Icon className={`size-5 ${color}`} strokeWidth={2} aria-hidden="true" />
                </span>
                <div>
                  <p className="text-[0.72rem] font-semibold uppercase tracking-wider text-fg-subtle">{label}</p>
                  <p className="stat-value mt-0.5 text-[1.1rem]">{value}</p>
                </div>
              </div>
            ))}
          </div>

          <ChartFrame
            title="Your electricity use over time"
            subtitle="Each bar shows one day's usage. The grey line is your 7-day rolling average — it smooths out the spikes."
            height={320}
            isEmpty={!rows.length}
            emptyTitle="No data yet"
            emptyDescription="Your usage history will appear here."
          >
            <UsageAreaChart
              data={rows}
              anomalies={[]}
              showBrush
              height={320}
              showAverage={false}
            />
          </ChartFrame>

          <div className="grid gap-6 xl:grid-cols-2">
            <ChartFrame
              title="Which days do you use the most electricity?"
              subtitle="Average usage for each day of the week — useful for spotting weekly patterns."
              height={260}
            >
              <WeekdayBars data={weekdayData} height={260} />
            </ChartFrame>

            <ChartFrame
              title="Monthly electricity use"
              subtitle="Your total electricity consumption each month."
              height={260}
            >
              <MonthBars data={monthData} height={260} />
            </ChartFrame>
          </div>

          {/* Tip card */}
          <div className="card card-pad border-brand/20 bg-brand-soft/30">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-fg">💡 Want to reduce your usage?</p>
                <p className="mt-1 text-[0.85rem] text-fg-muted">
                  Use the Savings Calculator to see what happens when you change your appliance habits.
                </p>
              </div>
              <Link
                to="/simulator"
                className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-[0.85rem] font-semibold text-white hover:bg-brand-strong transition-colors"
              >
                Try it <ArrowRight className="size-4" strokeWidth={2.2} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}