import { useMemo, useState } from 'react'
import {
  BarChart3,
  CalendarRange,
  Download,
  FileSpreadsheet,
  Info,
  Upload,
  X,
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
import { useAnomalies, useHistorical } from '../hooks/useEnergyData'
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

export function AnalyticsPage() {
  const { tariff, settings, toast } = useApp()
  const [range, setRange] = useState(90)
  const [imported, setImported] = useState(null)
  const [importError, setImportError] = useState(null)
  const [importPreview, setImportPreview] = useState(null)

  const history = useHistorical(400)
  const anomalies = useAnomalies()

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

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Analytics"
        title="Consumption analytics"
        subtitle="Where the energy goes, when it spikes, and how the current window compares with the one before it."
        action={
          <>
            <Segmented options={RANGES} value={range} onChange={setRange} size="sm" ariaLabel="Select time range" />
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