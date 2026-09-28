import { useMemo, useState } from 'react'
import {
  BarChart3,
  CalendarRange,
  Download,
  FileSpreadsheet,
  FlaskConical,
  Info,
  Upload,
  X,
  Zap,
} from 'lucide-react'
import { Card, PageHeader, StatCard } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Segmented } from '../components/ui/Field'
import { ErrorState, Skeleton, SkeletonStat } from '../components/ui/States'
import { ChartFrame } from '../components/charts/ChartFrame'
import { UsageAreaChart } from '../components/charts/UsageAreaChart'
import { DistributionChart, MonthBars, WeekdayBars } from '../components/charts/BarCharts'
import { ConsumptionHeatmap } from '../components/charts/ConsumptionHeatmap'
import { useApp } from '../context/AppContext'
import { useAnomalies, useDatasetStatistics, useHistorical } from '../hooks/useEnergyData'
import {
  averageByWeekday,
  enrichAnomalies,
  histogram,
  monthBuckets,
  movingAverage,
  compareWindows,
  summariseWindow,
} from '../lib/energy'
import { downloadText, parseCsv, pickFile, toCsv } from '../lib/files'
import { formatDate, kwh as fmtKwh, money, num, signedPercent } from '../lib/format'

const RANGES = [
  { value: 30, label: '30-day period' },
  { value: 90, label: '90-day period' },
  { value: 180, label: '6-month period' },
  { value: 365, label: '12-month period' },
]

const MAIN_TABS = [
  { value: 'charts', label: 'Consumption charts' },
  { value: 'stats', label: 'Statistical analysis' },
]

export function AnalyticsPage() {
  const { tariff, settings, toast } = useApp()
  const [range, setRange] = useState(90)
  const [mainTab, setMainTab] = useState('charts')
  const [imported, setImported] = useState(null)
  const [importError, setImportError] = useState(null)
  const [importPreview, setImportPreview] = useState(null)

  const history = useHistorical(400)
  const anomalies = useAnomalies()
  const statsResource = useDatasetStatistics()

  const source = useMemo(() => imported ?? history.data?.data ?? [], [imported, history.data])
  const sorted = useMemo(() => [...source].sort((a, b) => a.date.localeCompare(b.date)), [source])
  const visible = useMemo(() => sorted.slice(-range), [sorted, range])
  const baseline = useMemo(() => movingAverage(visible, 7), [visible])
  const rows = useMemo(
    () => visible.map((point, i) => ({ ...point, baseline: baseline[i]?.energy_kwh })),
    [visible, baseline],
  )

  const stats = useMemo(() => summariseWindow(visible), [visible])
  const comparison = useMemo(() => compareWindows(sorted, range), [sorted, range])
  const weekdayData = useMemo(() => averageByWeekday(sorted), [sorted])
  const monthData = useMemo(() => monthBuckets(sorted), [sorted])
  const distribution = useMemo(() => histogram(visible.map((p) => p.energy_kwh), 14), [visible])
  const median = useMemo(() => {
    if (!visible.length) return 0
    const values = [...visible].map((p) => p.energy_kwh).sort((a, b) => a - b)
    const mid = Math.floor(values.length / 2)
    return values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2
  }, [visible])

  const enriched = useMemo(() => enrichAnomalies(anomalies.data?.anomalies ?? []), [anomalies.data])
  const bestWeekday = weekdayData.reduce((best, d) => (d.average > (best?.average ?? -1) ? d : best), weekdayData[0])
  const worstMonth = monthData.reduce((worst, m) => (m.total > (worst?.total ?? -1) ? m : worst), monthData[0])

  const loading = history.isLoading && !history.data
  const failed = history.status === 'error' && !history.data

  const exportCsv = () => {
    if (!rows.length) {
      toast({ title: 'Nothing to export', description: 'Load a window of data first.', tone: 'warn' })
      return
    }
    const csv = toCsv(
      ['date', 'energy_kwh', 'baseline_kwh', 'deviation_pct', 'cost_inr', 'flagged'],
      rows.map((row) => {
        const deviation = row.baseline ? ((row.energy_kwh - row.baseline) / row.baseline) * 100 : 0
        return [
          row.date,
          row.energy_kwh.toFixed(3),
          (row.baseline ?? '').toFixed(3),
          deviation.toFixed(2),
          (row.energy_kwh * tariff).toFixed(2),
          enriched.some((a) => a.date === row.date) ? 'yes' : 'no',
        ]
      }),
    )
    downloadText(`wattwise_${rows[0].date}_to_${rows.at(-1).date}.csv`, csv)
    toast({ title: 'CSV exported', description: `${rows.length} days written with baseline and cost columns.` })
  }

  const importCsv = async () => {
    setImportError(null)
    const file = await pickFile()
    if (!file) return
    const text = await file.text()
    const matrix = parseCsv(text)
    if (matrix.length < 2) {
      setImportError('That file has no data rows.')
      return
    }
    const header = matrix[0].map((cell) => String(cell).toLowerCase().trim())
    const dateCol = header.findIndex((h) => h.includes('date'))
    const valueCol = header.findIndex((h) => h.includes('kwh') || h.includes('consumption') || h.includes('energy'))
    if (valueCol === -1) {
      setImportError('Need a column whose header contains “kwh”, “consumption” or “energy”.')
      return
    }

    const parsed = []
    const rejected = []
    for (const row of matrix.slice(1)) {
      const rawDate = dateCol >= 0 ? row[dateCol] : row[0]
      const rawValue = row[valueCol]
      const iso = normaliseDate(rawDate)
      const value = Number(rawValue)
      if (!iso || !Number.isFinite(value) || value < 0) {
        rejected.push(row.join(','))
        continue
      }
      parsed.push({ date: iso, energy_kwh: value })
    }

    if (parsed.length < 2) {
      setImportError('No usable rows. Dates should be YYYY-MM-DD and values plain numbers.')
      return
    }

    parsed.sort((a, b) => a.date.localeCompare(b.date))
    setImported(parsed)
    setImportPreview({ file: file.name, rows: parsed, rejected: rejected.length })
    toast({
      title: `Imported ${parsed.length} rows`,
      description: rejected.length ? `${rejected.length} row(s) skipped as invalid.` : 'Charts and KPIs now use your file.',
    })
  }

  const serverStats = statsResource.data

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Analytics"
        title="Consumption analytics"
        subtitle="Where the energy goes, when it spikes, and how the current window compares with the one before it."
        action={
          <>
            <Segmented options={MAIN_TABS} value={mainTab} onChange={setMainTab} size="sm" ariaLabel="Analytics section" />
            {mainTab === 'charts' && (
              <Segmented options={RANGES} value={range} onChange={setRange} size="sm" ariaLabel="Select time range" />
            )}
            <Button variant="outline" size="sm" icon={Download} onClick={exportCsv}>
              Export CSV
            </Button>
            <Button variant="outline" size="sm" icon={Upload} onClick={importCsv}>
              Import CSV
            </Button>
          </>
        }
      />

      {failed && <ErrorState error={history.error} onRetry={history.refetch} />}

      {imported && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-info/30 bg-info-soft px-4 py-3">
          <FileSpreadsheet className="size-4 shrink-0 text-info" strokeWidth={2.2} aria-hidden="true" />
          <p className="min-w-0 flex-1 text-[0.82rem] text-fg-muted">
            Showing <strong className="text-fg">{importPreview?.file}</strong> — {imported.length} rows imported.
            {importPreview?.rejected ? ` ${importPreview.rejected} invalid row(s) skipped.` : ''}
          </p>
          <Button variant="ghost" size="sm" icon={X} onClick={() => setImported(null)}>
            Back to live data
          </Button>
        </div>
      )}

      {importError && <ErrorState error={importError} compact />}

      {mainTab === 'stats' && <StatisticalAnalysisPanel data={serverStats} loading={statsResource.isLoading} error={statsResource.error} onRetry={statsResource.refetch} />}

      {mainTab === 'charts' && (<>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonStat key={i} />)
        ) : (
          <>
            <StatCard
              label={`Total · ${range} days`}
              value={num(stats.total, 0)}
              unit="kWh"
              delta={comparison.changePct}
              sub="vs previous window"
              icon={BarChart3}
              tone="brand"
            />
            <StatCard
              label="Average day"
              value={num(stats.average, 2)}
              unit="kWh"
              sub={`${money(stats.average * tariff, true)} per day`}
              icon={CalendarRange}
              tone="info"
            />
            <StatCard
              label="Cost of this window"
              value={money(stats.total * tariff + Number(settings.fixedCharges || 0) * (range / 30))}
              sub={`at ${money(tariff, true)}/kWh`}
              icon={BarChart3}
              tone="accent"
            />
            <StatCard
              label="Heaviest weekday"
              value={bestWeekday?.label ?? '—'}
              sub={bestWeekday ? `${num(bestWeekday.average, 2)} kWh average` : '—'}
              icon={CalendarRange}
              tone="warn"
            />
          </>
        )}
      </div>

      <ChartFrame
        title="Usage against the 7-day baseline"
        subtitle="Use the brush below the chart to zoom into any stretch of the timeline."
        icon={BarChart3}
        height={320}
        isEmpty={!loading && !rows.length}
        emptyTitle="No data in this window"
        emptyDescription="Try a longer range, or import your own CSV."
      >
        {loading ? (
          <Skeleton className="h-full w-full" />
        ) : (
          <UsageAreaChart
            data={rows}
            anomalies={enriched}
            showBrush
            height={320}
            showAverage={range <= 180}
          />
        )}
      </ChartFrame>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartFrame
          title="Weekday load profile"
          subtitle="Average kWh per weekday across everything loaded. Weekends usually run hotter."
          icon={CalendarRange}
          height={240}
          footer={`Heaviest day: ${bestWeekday?.label} at ${num(bestWeekday?.average ?? 0, 2)} kWh average. Lightest: ${
            weekdayData.reduce((b, d) => (d.average < (b?.average ?? Infinity) ? d : b), weekdayData[0])?.label ?? '—'
          }.`}
        >
          <WeekdayBars data={weekdayData} height={240} />
        </ChartFrame>

        <ChartFrame
          title="Daily distribution"
          subtitle="How the days spread. A long right tail means occasional big spikes."
          icon={BarChart3}
          height={240}
        >
          <DistributionChart data={distribution} height={214} median={median} />
        </ChartFrame>
      </div>

      <ChartFrame
        title="Consumption calendar"
        subtitle="Every recorded day as a tile. Darker means more energy. Click a day for its exact reading."
        icon={CalendarRange}
        height={190}
        isEmpty={!sorted.length}
      >
        <ConsumptionHeatmap
          data={sorted}
          onSelect={(cell) =>
            toast({
              title: `${fmtKwh(cell.value, 2)} on ${formatDate(cell.iso)}`,
              description: `That day cost about ${money(cell.value * tariff, true)} at your tariff.`,
            })
          }
        />
      </ChartFrame>

      {monthData.length > 2 && (
        <ChartFrame
          title="Monthly totals"
          subtitle={`Heaviest month: ${worstMonth?.label ?? '—'} at ${fmtKwh(worstMonth?.total ?? 0, 0)}.`}
          icon={BarChart3}
          height={240}
        >
          <MonthBars data={monthData} height={240} />
        </ChartFrame>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="card-pad">
          <h2 className="text-[0.95rem] font-semibold">Window summary</h2>
          <dl className="mt-3 space-y-2.5 text-[0.82rem]">
            {[
              { label: 'First day', value: formatDate(stats.start ?? new Date()) },
              { label: 'Last day', value: formatDate(stats.end ?? new Date()) },
              { label: 'Peak day', value: stats.peak ? `${fmtKwh(stats.peak.energy_kwh, 2)} · ${formatDate(stats.peak.date)}` : '—' },
              { label: 'Lightest day', value: stats.low ? `${fmtKwh(stats.low.energy_kwh, 2)} · ${formatDate(stats.low.date)}` : '—' },
              { label: 'Volatility (σ)', value: `${num(stats.stdDev, 2)} kWh` },
              { label: 'Median day', value: fmtKwh(median, 2) },
            ].map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-3">
                <dt className="text-fg-muted">{row.label}</dt>
                <dd className="stat-value text-right">{row.value}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card className="card-pad">
          <h2 className="text-[0.95rem] font-semibold">Period over period</h2>
          <dl className="mt-3 space-y-2.5 text-[0.82rem]">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-fg-muted">This window</dt>
              <dd className="stat-value">{fmtKwh(comparison.currentStats.total, 0)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-fg-muted">Previous window</dt>
              <dd className="stat-value text-fg-muted">{fmtKwh(comparison.previousStats.total, 0)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-fg-muted">Difference</dt>
              <dd
                className={`stat-value ${comparison.changePct > 0 ? 'text-danger' : 'text-brand'}`}
              >
                {signedPercent(comparison.changePct)}
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-[0.78rem] leading-relaxed text-fg-subtle">
            {comparison.changePct <= 0
              ? 'You are using less energy than the equivalent previous window — that is the goal.'
              : 'Usage is climbing. Open the simulator to model where the extra kilowatt-hours are coming from.'}
          </p>
        </Card>

        <Card className="card-pad flex flex-col">
          <h2 className="text-[0.95rem] font-semibold">Data management</h2>
          <p className="mt-1.5 text-[0.8rem] leading-relaxed text-fg-muted">
            Export the exact window you are looking at, or bring in a smart-meter CSV with{' '}
            <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.72rem]">date</code> and{' '}
            <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.72rem]">kwh</code> columns.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="primary" size="sm" icon={Download} onClick={exportCsv} disabled={!rows.length}>
              Export {rows.length} rows
            </Button>
            <Button variant="outline" size="sm" icon={Upload} onClick={importCsv}>
              Import CSV
            </Button>
          </div>
          <div className="mt-auto pt-4">
            <p className="flex items-start gap-2 text-[0.72rem] leading-relaxed text-fg-subtle">
              <Info className="mt-0.5 size-3.5 shrink-0" strokeWidth={2.2} aria-hidden="true" />
              Imported data lives in this browser tab only — nothing is uploaded to the backend.
            </p>
          </div>
        </Card>
      </div>
      </>)}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Statistical Analysis Panel
// ---------------------------------------------------------------------------

function StatisticalAnalysisPanel({ data, loading, error, onRetry }) {
  if (loading) return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-2xl" />)}
    </div>
  )
  if (error || !data) return <ErrorState error={error ?? 'Statistics not available. Is the backend running?'} onRetry={onRetry} />

  const s = data.summary
  const ww = data.weekday_vs_weekend
  const sub = data.submetering
  const corr = data.correlations

  const summaryRows = [
    { label: 'Mean', value: `${num(s.mean, 3)} kWh` },
    { label: 'Median', value: `${num(s.median, 3)} kWh` },
    { label: 'Std deviation (σ)', value: `${num(s.std, 3)} kWh` },
    { label: 'Variance', value: `${num(s.variance, 3)} kWh²` },
    { label: 'Skewness', value: num(s.skewness, 3) },
    { label: 'Kurtosis', value: num(s.kurtosis, 3) },
    { label: 'IQR (Q75 − Q25)', value: `${num(s.iqr, 3)} kWh` },
    { label: 'Min / Max', value: `${num(s.min, 2)} / ${num(s.max, 2)} kWh` },
    { label: 'Total days', value: num(s.count, 0) },
  ]

  const seasonOrder = ['Winter', 'Spring', 'Summer', 'Autumn']
  const seasonColour = { Winter: '#60a5fa', Spring: '#34d399', Summer: '#f97316', Autumn: '#a78bfa' }
  const dayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  const submeteringSlices = [
    { label: 'Kitchen', pct: sub?.sub_1_pct ?? 0, kwh: sub?.sub_1_kitchen_kwh ?? 0, colour: '#3b82f6' },
    { label: 'Laundry', pct: sub?.sub_2_pct ?? 0, kwh: sub?.sub_2_laundry_kwh ?? 0, colour: '#8b5cf6' },
    { label: 'HVAC / Water', pct: sub?.sub_3_pct ?? 0, kwh: sub?.sub_3_climate_water_kwh ?? 0, colour: '#f97316' },
    { label: 'Unmetered', pct: sub?.unmetered_pct ?? 0, kwh: sub?.unmetered_kwh ?? 0, colour: '#6b7280' },
  ]

  const corrKeys = corr ? Object.entries(corr).filter(([k]) => k !== 'energy_kwh') : []

  return (
    <div className="space-y-6">
      {/* Summary stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Mean daily kWh" value={num(s.mean, 2)} unit="kWh" icon={BarChart3} tone="brand" sub={`σ = ${num(s.std, 2)} kWh`} />
        <StatCard label="Median daily kWh" value={num(s.median, 2)} unit="kWh" icon={CalendarRange} tone="info" sub={`IQR: ${num(s.q25, 2)}–${num(s.q75, 2)}`} />
        <StatCard label="Weekend elevation" value={num((ww?.weekend_elevation_ratio ?? 1) * 100 - 100, 1)} unit="%" icon={Zap} tone="warn"
          sub={ww ? `Weekday avg ${num(ww.weekday.mean_kwh, 2)} vs Weekend ${num(ww.weekend.mean_kwh, 2)} kWh` : ''} />
        <StatCard label="Dataset skewness" value={num(s.skewness, 3)} icon={FlaskConical} tone="accent"
          sub={s.skewness > 0 ? 'Right-skewed: rare high-use days pull the mean up' : 'Left-skewed: few very low-use days'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Distribution summary table */}
        <Card className="card-pad">
          <h2 className="text-[0.95rem] font-semibold">Descriptive statistics</h2>
          <p className="mt-0.5 text-[0.77rem] text-fg-subtle">Computed from all {num(s.count, 0)} recorded days</p>
          <dl className="mt-3 divide-y divide-line">
            {summaryRows.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-3 py-1.5">
                <dt className="text-[0.8rem] text-fg-muted">{row.label}</dt>
                <dd className="stat-value text-right text-[0.85rem]">{row.value}</dd>
              </div>
            ))}
          </dl>
        </Card>

        {/* Weekday vs Weekend */}
        <Card className="card-pad">
          <h2 className="text-[0.95rem] font-semibold">Weekday vs Weekend</h2>
          <p className="mt-0.5 text-[0.77rem] text-fg-subtle">Weekend elevation ratio: {num(ww?.weekend_elevation_ratio ?? 1, 3)}×</p>
          <div className="mt-4 grid grid-cols-2 gap-4">
            {[{ label: 'Weekdays', key: 'weekday', colour: '#3b82f6' }, { label: 'Weekends', key: 'weekend', colour: '#8b5cf6' }].map(({ label, key, colour }) => {
              const d = ww?.[key]
              return (
                <div key={key} className="rounded-xl border border-line bg-surface-2 p-4">
                  <p className="text-[0.72rem] font-semibold uppercase tracking-wider" style={{ color: colour }}>{label}</p>
                  <p className="stat-value mt-2 text-[1.5rem]" style={{ color: colour }}>{num(d?.mean_kwh ?? 0, 2)}</p>
                  <p className="text-[0.72rem] text-fg-subtle">kWh / day (mean)</p>
                  <dl className="mt-3 space-y-1 text-[0.75rem]">
                    <div className="flex justify-between"><dt className="text-fg-muted">Median</dt><dd>{num(d?.median_kwh ?? 0, 2)} kWh</dd></div>
                    <div className="flex justify-between"><dt className="text-fg-muted">Std dev</dt><dd>{num(d?.std_kwh ?? 0, 2)} kWh</dd></div>
                    <div className="flex justify-between"><dt className="text-fg-muted">Days</dt><dd>{num(d?.count ?? 0, 0)}</dd></div>
                  </dl>
                </div>
              )
            })}
          </div>

          <div className="mt-4">
            <p className="text-[0.78rem] font-semibold mb-2">Day-of-week average (kWh)</p>
            <div className="flex items-end gap-1 h-20">
              {(data.day_of_week_breakdown ?? []).map((d) => {
                const maxMean = Math.max(...(data.day_of_week_breakdown ?? []).map(x => x.mean_kwh))
                const height = maxMean > 0 ? (d.mean_kwh / maxMean) * 100 : 0
                return (
                  <div key={d.day_index} className="flex flex-col items-center flex-1 gap-1">
                    <div className="w-full rounded-t" style={{ height: `${height}%`, minHeight: 2, backgroundColor: d.is_weekend ? '#8b5cf6' : '#3b82f6', opacity: 0.85 }} />
                    <span className="text-[0.6rem] text-fg-subtle">{dayOrder[d.day_index]}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Seasonal trends */}
        <Card className="card-pad">
          <h2 className="text-[0.95rem] font-semibold">Seasonal breakdown</h2>
          <p className="mt-0.5 text-[0.77rem] text-fg-subtle">Mean daily kWh per meteorological season</p>
          <ul className="mt-4 space-y-3">
            {(data.seasonal_trends ?? []).sort((a, b) => seasonOrder.indexOf(a.season_name) - seasonOrder.indexOf(b.season_name)).map((s) => {
              const allMeans = (data.seasonal_trends ?? []).map(x => x.mean_kwh)
              const max = Math.max(...allMeans)
              const pct = max > 0 ? (s.mean_kwh / max) * 100 : 0
              const colour = seasonColour[s.season_name] ?? '#6b7280'
              return (
                <li key={s.season_name}>
                  <div className="flex justify-between text-[0.8rem] mb-1">
                    <span className="font-medium">{s.season_name}</span>
                    <span className="text-fg-muted">{num(s.mean_kwh, 2)} kWh · {num(s.count, 0)} days</span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-surface-2">
                    <div className="h-2.5 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: colour }} />
                  </div>
                </li>
              )
            })}
          </ul>
        </Card>

        {/* Submetering */}
        <Card className="card-pad">
          <h2 className="text-[0.95rem] font-semibold">Sub-metering breakdown</h2>
          <p className="mt-0.5 text-[0.77rem] text-fg-subtle">Total kWh by metering circuit over the full dataset</p>
          <ul className="mt-4 space-y-3">
            {submeteringSlices.map((slice) => (
              <li key={slice.label}>
                <div className="flex justify-between text-[0.8rem] mb-1">
                  <span className="font-medium">{slice.label}</span>
                  <span className="text-fg-muted">{num(slice.pct, 1)}% · {num(slice.kwh, 0)} kWh</span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-surface-2">
                  <div className="h-2.5 rounded-full transition-all" style={{ width: `${slice.pct}%`, backgroundColor: slice.colour }} />
                </div>
              </li>
            ))}
          </ul>
          {sub && (
            <p className="mt-4 text-[0.75rem] text-fg-subtle">Total active energy: {num(sub.total_kwh, 0)} kWh</p>
          )}
        </Card>
      </div>

      {/* Correlation table */}
      {corrKeys.length > 0 && (
        <Card className="card-pad">
          <h2 className="text-[0.95rem] font-semibold">Pearson correlation with energy_kwh</h2>
          <p className="mt-0.5 mb-3 text-[0.77rem] text-fg-subtle">How strongly each variable co-moves with daily consumption</p>
          <div className="overflow-x-auto">
            <table className="w-full text-[0.8rem]">
              <thead>
                <tr className="border-b border-line">
                  <th className="pb-2 text-left text-fg-subtle font-medium">Variable</th>
                  <th className="pb-2 text-right text-fg-subtle font-medium">r</th>
                  <th className="pb-2 text-left text-fg-subtle font-medium pl-4">Strength</th>
                </tr>
              </thead>
              <tbody>
                {corrKeys.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).map(([key, val]) => {
                  const abs = Math.abs(val)
                  const label = abs >= 0.7 ? 'Strong' : abs >= 0.4 ? 'Moderate' : abs >= 0.2 ? 'Weak' : 'Negligible'
                  const colour = abs >= 0.7 ? 'text-brand' : abs >= 0.4 ? 'text-accent' : abs >= 0.2 ? 'text-warn' : 'text-fg-subtle'
                  return (
                    <tr key={key} className="border-b border-line/50 last:border-0">
                      <td className="py-2 font-mono text-[0.72rem] text-fg-muted">{key}</td>
                      <td className="py-2 text-right stat-value">{num(val, 4)}</td>
                      <td className={`py-2 pl-4 text-[0.75rem] font-medium ${colour}`}>{label}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}

function normaliseDate(value) {
  if (!value) return null
  const raw = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`
}