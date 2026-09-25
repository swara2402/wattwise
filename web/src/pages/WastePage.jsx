import { useMemo, useState } from 'react'
import {
  ArrowDownRight,
  ArrowUpRight,
  Coins,
  Download,
  Flame,
  Info,
  Lightbulb,
  Search,
  ShieldAlert,
  Sparkles,
  TriangleAlert,
} from 'lucide-react'
import { Card, PageHeader, StatCard } from '../components/ui/Card'
import { Badge, SeverityBadge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Segmented } from '../components/ui/Field'
import { EmptyState, ErrorState, Skeleton, SkeletonStat } from '../components/ui/States'
import { ChartFrame } from '../components/charts/ChartFrame'
import { UsageAreaChart } from '../components/charts/UsageAreaChart'
import { useApp } from '../context/AppContext'
import { useAnomalies, useHistorical } from '../hooks/useEnergyData'
import { SEVERITY_TONE, anomalySummary, enrichAnomalies, movingAverage } from '../lib/energy'
import { downloadText, toCsv } from '../lib/files'
import { formatDate, kwh as fmtKwh, money, num, signedPercent } from '../lib/format'

const SEVERITIES = [
  { value: 'ALL', label: 'All' },
  { value: 'CRITICAL', label: 'Critical' },
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW', label: 'Low' },
]

export function WastePage() {
  const { tariff, toast } = useApp()
  const anomalies = useAnomalies()
  const history = useHistorical(400)

  const [severity, setSeverity] = useState('ALL')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(null)

  const enriched = useMemo(() => enrichAnomalies(anomalies.data?.anomalies ?? []), [anomalies.data])
  const summary = useMemo(() => anomalySummary(enriched, tariff), [enriched, tariff])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return enriched.filter((a) => {
      if (severity !== 'ALL' && a.severity !== severity) return false
      if (!needle) return true
      return `${a.date} ${a.headline} ${a.category}`.toLowerCase().includes(needle)
    })
  }, [enriched, severity, query])

  const selected = useMemo(
    () => filtered.find((a) => a.id === selectedId) ?? filtered[0] ?? null,
    [filtered, selectedId],
  )

  const historyRows = useMemo(() => {
    const series = history.data?.data ?? []
    if (!series.length) return []
    const baseline = movingAverage(series, 7)
    return series.map((point, index) => ({ ...point, baseline: baseline[index].energy_kwh }))
  }, [history.data])

  const wasteShare = useMemo(() => {
    const total = historyRows.reduce((s, p) => s + p.energy_kwh, 0)
    if (!total) return 0
    return (summary.wastedKwh / total) * 100
  }, [summary.wastedKwh, historyRows])

  const severityOptions = useMemo(
    () =>
      SEVERITIES.map((option) => ({
        ...option,
        count: option.value === 'ALL' ? enriched.length : enriched.filter((a) => a.severity === option.value).length,
      })),
    [enriched],
  )

  const loading = anomalies.isLoading && !enriched.length
  const failed = anomalies.status === 'error' && !enriched.length

  const exportIncidents = () => {
    if (!filtered.length) {
      toast({ title: 'No incidents to export', tone: 'warn' })
      return
    }
    const csv = toCsv(
      ['date', 'severity', 'category', 'observed_kwh', 'baseline_kwh', 'deviation_kwh', 'deviation_pct', 'z_score', 'wasted_kwh', 'wasted_cost_inr'],
      filtered.map((a) => [
        a.date,
        a.severity,
        a.category,
        a.observed.toFixed(3),
        a.expected.toFixed(3),
        a.deviationKwh.toFixed(3),
        a.deviationPct.toFixed(2),
        a.zScore.toFixed(2),
        a.wastedKwh.toFixed(3),
        (a.wastedKwh * tariff).toFixed(2),
      ]),
    )
    downloadText(`wattwise_anomalies_${new Date().toISOString().slice(0, 10)}.csv`, csv)
    toast({ title: `${filtered.length} incidents exported`, description: 'Root causes and costs are included in the CSV.' })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Waste detection"
        title="Anomaly & waste report"
        subtitle="Isolation Forest scores every day against its own recent history. Anything odd gets a severity, a likely cause and a next step."
        action={
          <>
            <Segmented
              options={severityOptions}
              value={severity}
              onChange={setSeverity}
              size="sm"
              ariaLabel="Filter by severity"
            />
            <Button variant="outline" size="sm" icon={Download} onClick={exportIncidents} disabled={!filtered.length}>
              Export
            </Button>
          </>
        }
      />

      {failed && <ErrorState error={anomalies.error} onRetry={anomalies.refetch} />}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonStat key={i} />)
        ) : (
          <>
            <StatCard
              label="Incidents detected"
              value={num(summary.total, 0)}
              sub={`${summary.critical} critical · ${summary.high} high`}
              icon={ShieldAlert}
              tone="danger"
            />
            <StatCard
              label="Excess consumption"
              value={fmtKwh(summary.wastedKwh, 1)}
              sub={`${wasteShare.toFixed(1)}% of everything recorded`}
              icon={Flame}
              tone="warn"
            />
            <StatCard
              label="Money tied up in waste"
              value={money(summary.wastedCost)}
              sub={`at ${money(tariff, true)}/kWh`}
              icon={Coins}
              tone="accent"
            />
            <StatCard
              label="Most severe"
              value={summary.mostSevere ? summary.mostSevere.severity : 'None'}
              sub={summary.mostSevere ? formatDate(summary.mostSevere.date) : 'Nothing unusual detected'}
              icon={TriangleAlert}
              tone="violet"
            />
          </>
        )}
      </div>

      <ChartFrame
        title="Where the outliers sit on the timeline"
        subtitle="Actual daily kWh against the 7-day moving average. Red dots are days the model flagged."
        icon={TriangleAlert}
        height={300}
        isEmpty={!loading && !historyRows.length}
        emptyTitle="No timeline to compare"
        emptyDescription="Start the backend to load the daily series."
      >
        {loading ? <Skeleton className="h-full w-full" /> : <UsageAreaChart data={historyRows} height={300} showBrush anomalies={enriched} />}
      </ChartFrame>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.15fr]">
        {/* Incident list */}
        <Card className="card-pad flex flex-col">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[0.98rem] font-semibold">Detected incidents</h2>
              <p className="mt-1 text-[0.8rem] text-fg-muted">
                {filtered.length ? `Showing ${filtered.length} of ${enriched.length}` : 'No incidents match this filter'}
              </p>
            </div>
            <div className="relative w-full sm:w-56">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
                strokeWidth={2.2}
                aria-hidden="true"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter by date or cause…"
                aria-label="Search incidents"
                className="input pl-9"
              />
            </div>
          </div>

          <div className="scrollbar-slim mt-4 max-h-[30rem] space-y-2 overflow-y-auto pr-1">
            {loading &&
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}

            {!loading &&
              filtered.map((anomaly) => {
                const active = selected?.id === anomaly.id
                const up = anomaly.deviationKwh >= 0
                const Trend = up ? ArrowUpRight : ArrowDownRight
                return (
                  <button
                    key={anomaly.id}
                    type="button"
                    onClick={() => setSelectedId(anomaly.id)}
                    aria-pressed={active}
                    className={`block w-full rounded-xl border p-3 text-left transition-colors ${
                      active ? 'border-brand bg-brand-soft/50' : 'border-line bg-surface-2 hover:border-border-strong'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="stat-value text-[0.85rem]">{formatDate(anomaly.date)}</span>
                      <div className="flex items-center gap-1.5">
                        <Badge tone={SEVERITY_TONE[anomaly.severity]}>{anomaly.category}</Badge>
                        <SeverityBadge severity={anomaly.severity} />
                      </div>
                    </div>
                    <p className="mt-1.5 text-[0.82rem] font-medium leading-snug">{anomaly.headline}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-[0.75rem] text-fg-muted">
                      <Trend
                        className={`size-3.5 ${up ? 'text-danger' : 'text-brand'}`}
                        strokeWidth={2.4}
                        aria-hidden="true"
                      />
                      {signedPercent(anomaly.deviationPct)} vs baseline · {fmtKwh(anomaly.observed, 2)} used
                    </p>
                  </button>
                )
              })}

            {!loading && !filtered.length && (
              <EmptyState
                icon={ShieldAlert}
                title="Nothing flagged here"
                description="That is good news — either usage is steady or the filter is too narrow."
                action={
                  (severity !== 'ALL' || query) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSeverity('ALL')
                        setQuery('')
                      }}
                    >
                      Clear filters
                    </Button>
                  )
                }
              />
            )}
          </div>
        </Card>

        {/* Incident detail */}
        <div className="space-y-4">
          {selected ? (
            <>
              <Card className="card-pad">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-fg-subtle">
                      Incident detail
                    </p>
                    <h2 className="mt-1 text-[1.05rem] font-semibold">{formatDate(selected.date)}</h2>
                  </div>
                  <SeverityBadge severity={selected.severity} />
                </div>

                <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                  {[
                    { label: 'Observed', value: fmtKwh(selected.observed, 2) },
                    { label: '7-day baseline', value: fmtKwh(selected.expected, 2) },
                    { label: 'Deviation', value: `${selected.deviationKwh >= 0 ? '+' : ''}${num(selected.deviationKwh, 2)} kWh` },
                    { label: 'Deviation %', value: signedPercent(selected.deviationPct) },
                    { label: 'Z-score', value: `${num(selected.zScore, 2)}σ` },
                    { label: 'Isolation score', value: num(selected.score, 4) },
                  ].map((row) => (
                    <div key={row.label} className="rounded-xl border border-line bg-surface-2 px-3 py-2.5">
                      <dt className="text-[0.68rem] uppercase tracking-wider text-fg-subtle">{row.label}</dt>
                      <dd className="stat-value mt-0.5 text-[0.95rem]">{row.value}</dd>
                    </div>
                  ))}
                </dl>

                <div className="mt-4 rounded-xl border border-warn/25 bg-warn-soft/50 p-3.5">
                  <p className="flex items-center gap-2 text-[0.78rem] font-semibold text-warn">
                    <Lightbulb className="size-4" strokeWidth={2.2} aria-hidden="true" />
                    Likely cause
                  </p>
                  <p className="mt-1.5 text-[0.82rem] leading-relaxed text-fg-muted">{selected.cause}</p>
                </div>

                <div className="mt-3 rounded-xl border border-brand/25 bg-brand-soft/40 p-3.5">
                  <p className="flex items-center gap-2 text-[0.78rem] font-semibold text-brand">
                    <Sparkles className="size-4" strokeWidth={2.2} aria-hidden="true" />
                    What to do next
                  </p>
                  <p className="mt-1.5 text-[0.82rem] leading-relaxed text-fg-muted">{selected.action}</p>
                </div>
              </Card>

              <Card className="card-pad">
                <h2 className="text-[0.95rem] font-semibold">Cost of this incident</h2>
                <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-2">
                  <div>
                    <p className="stat-value text-[1.8rem] leading-none text-danger">
                      {money(selected.wastedKwh * tariff)}
                    </p>
                    <p className="mt-1 text-[0.75rem] text-fg-muted">
                      {fmtKwh(selected.wastedKwh, 1)} above baseline at {money(tariff, true)}/kWh
                    </p>
                  </div>
                  <div>
                    <p className="stat-value text-[1.2rem] leading-none text-fg-muted">
                      {money(selected.wastedKwh * tariff * 12)}
                    </p>
                    <p className="mt-1 text-[0.75rem] text-fg-subtle">if it happened every month</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    icon={Sparkles}
                    onClick={() =>
                      toast({
                        title: 'Simulator opened',
                        description: 'Trim the duty cycle for the appliance behind this spike.',
                      })
                    }
                  >
                    Fix it in the simulator
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)}>
                    Clear selection
                  </Button>
                </div>
              </Card>
            </>
          ) : (
            <Card className="card-pad">
              <EmptyState
                icon={Info}
                title="Select an incident"
                description="Pick a day from the list to see the full breakdown: deviation, z-score, likely cause and the money involved."
              />
            </Card>
          )}

          <Card className="card-pad">
            <h2 className="text-[0.95rem] font-semibold">How detection works</h2>
            <ol className="mt-3 space-y-2.5 text-[0.8rem] leading-relaxed text-fg-muted">
              <li className="flex gap-2.5">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand-soft text-[0.68rem] font-bold text-brand">
                  1
                </span>
                Each day is turned into 26 features — calendar position, lags, rolling means, rolling volatility and
                exponentially weighted averages.
              </li>
              <li className="flex gap-2.5">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand-soft text-[0.68rem] font-bold text-brand">
                  2
                </span>
                Isolation Forest measures how few random splits it takes to isolate that day. Weird days are isolated
                quickly, so they score closer to zero.
              </li>
              <li className="flex gap-2.5">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand-soft text-[0.68rem] font-bold text-brand">
                  3
                </span>
                Scores are combined with the 7-day deviation to grade severity, so a big spike on a quiet week and a
                small spike on a heavy week are judged differently.
              </li>
            </ol>
            <p className="mt-4 flex items-start gap-2 text-[0.75rem] leading-relaxed text-fg-subtle">
              <Info className="mt-0.5 size-3.5 shrink-0" strokeWidth={2.2} aria-hidden="true" />
              Anomaly detection finds unusual days, not faulty appliances. Always confirm against a bill or a
              sub-circuit meter before replacing hardware.
            </p>
          </Card>
        </div>
      </div>
    </div>
  )
}
