import { useMemo } from 'react'
import { PageHeader } from '../components/ui/Card'
import { ErrorState, Skeleton } from '../components/ui/States'
import { ChartFrame } from '../components/charts/ChartFrame'
import { UsageAreaChart } from '../components/charts/UsageAreaChart'
import { MonthBars, WeekdayBars } from '../components/charts/BarCharts'
import { useHistorical } from '../hooks/useEnergyData'
import { averageByWeekday, monthBuckets, movingAverage } from '../lib/energy'

export function AnalyticsPage() {
  const history = useHistorical(365) // Always use 1 year of data - no user selection needed
  const source = useMemo(() => history.data?.data ?? [], [history.data])
  const sorted = useMemo(() => [...source].sort((a, b) => a.date.localeCompare(b.date)), [source])
  const visible = useMemo(() => sorted.slice(-365), [sorted]) // Always show last year's data
  const baseline = useMemo(() => movingAverage(visible, 7), [visible])
  const rows = useMemo(
    () => visible.map((point, i) => ({ ...point, baseline: baseline[i]?.energy_kwh })),
    [visible, baseline],
  )
  const weekdayData = useMemo(() => averageByWeekday(sorted), [sorted])
  const monthData = useMemo(() => monthBuckets(sorted), [sorted])

  const loading = history.isLoading && !history.data
  const failed = history.status === 'error' && !history.data

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Your Usage"
        title="Energy Usage History"
        subtitle="See how you've used energy over time to understand your habits better."
        action={null}
      />

      {failed && <ErrorState error={history.error} onRetry={history.refetch} />}
      {loading && <Skeleton className="h-full w-full" />}

      {!loading && !failed && (
        <>
          <ChartFrame
            title="Your energy use over time"
            subtitle="See your daily energy use throughout the year."
            height={320}
            isEmpty={!rows.length}
            emptyTitle="No data available yet"
            emptyDescription="Your energy data will appear here."
          >
            <UsageAreaChart
              data={rows}
              anomalies={[]}
              showBrush
              height={320}
              showAverage={false}
            />
          </ChartFrame>

          <div className="grid gap-4 xl:grid-cols-2">
            <ChartFrame
              title="Average use by day of week"
              subtitle="See which days of the week you use the most energy."
              height={240}
            >
              <WeekdayBars data={weekdayData} height={240} />
            </ChartFrame>

            <ChartFrame
              title="Monthly energy use"
              subtitle="Your total energy use each month."
              height={240}
            >
              <MonthBars data={monthData} height={240} />
            </ChartFrame>
          </div>
        </>
      )}
    </div>
  )
}