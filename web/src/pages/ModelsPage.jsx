import { useMemo, useState } from 'react'
import {
  BookOpen,
  Boxes,
  Braces,
  CheckCircle2,
  Cpu,
  Database,
  GitBranch,
  Info,
  Layers,
  Network,
  Timer,
  Workflow,
} from 'lucide-react'
import { Card, PageHeader } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Segmented } from '../components/ui/Field'
import { ErrorState, Skeleton } from '../components/ui/States'
import { ChartFrame } from '../components/charts/ChartFrame'
import { FeatureImportanceChart } from '../components/charts/FeatureImportanceChart'
import { useModelAnalytics, useModelInfo } from '../hooks/useEnergyData'
import { API_BASE } from '../lib/api'
import { FEATURE_DESCRIPTIONS, FEATURE_GROUPS, MODEL_FALLBACK, MODEL_STACK } from '../lib/constants'
import { num } from '../lib/format'

const METRIC_ORDER = ['MAE', 'RMSE', 'R2']

const PIPELINE = [
  {
    title: 'Ingest',
    icon: Database,
    tone: 'info',
    body: 'Household A+B+C.csv — 1,433 consecutive days, 2006-12-16 to 2010-11-26. Gaps forward-filled and clamped to the 0–120 kWh sanity band.',
  },
  {
    title: 'Engineer',
    icon: Braces,
    tone: 'brand',
    body: 'Each target date is expanded into 26 features: calendar position, seven lags, four rolling means, four rolling standard deviations and two exponentially weighted averages.',
  },
  {
    title: 'Train',
    icon: Workflow,
    tone: 'accent',
    body: 'Random Forest (300 trees), XGBoost and Isolation Forest are fitted on the first 80% of days. Chronological split — no shuffling, so no leakage from the future.',
  },
  {
    title: 'Validate',
    icon: CheckCircle2,
    tone: 'warn',
    body: 'The held-out final 20% (287 days) scores every candidate. MAE, RMSE and R² are reported per model, and the best regressor is promoted to production.',
  },
  {
    title: 'Serve',
    icon: Cpu,
    tone: 'violet',
    body: 'The winning pipeline plus its feature builder are pickled together, so inference reconstructs the same lags and rolling windows the model was trained on.',
  },
  {
    title: 'Monitor',
    icon: Network,
    tone: 'muted',
    body: 'Isolation Forest scores every day in the dataset. Days isolated in fewer splits are surfaced as incidents with severity and likely cause.',
  },
]

export function ModelsPage() {
  const info = useModelInfo()
  const analytics = useModelAnalytics()
  const [tab, setTab] = useState('models')

  const meta = { ...MODEL_FALLBACK, ...info.data }
  const model = analytics.data?.primary_model ?? analytics.data?.model ?? meta.model
  const metrics = {
    MAE: meta.test_mae_kwh ?? 4.0028,
    RMSE: meta.test_rmse_kwh ?? 5.5234,
    R2: meta.test_r2 ?? 0.4584,
  }

  const importance = useMemo(() => {
    const rows =
      analytics.data?.feature_importance ??
      analytics.data?.features ??
      analytics.data?.importance ??
      []
    return Array.isArray(rows) ? rows : []
  }, [analytics.data])

  const clusters = useMemo(
    () => (Array.isArray(analytics.data?.clusters) ? analytics.data.clusters : []),
    [analytics.data],
  )

  const loading = analytics.isLoading || info.isLoading
  const failed = !loading && info.status === 'error' && analytics.status === 'error'

  const featureCount = meta.features ?? FEATURE_GROUPS.reduce((s, g) => s + g.features.length, 0)

  const tabs = [
    { value: 'models', label: 'Model stack' },
    { value: 'features', label: 'Feature groups' },
    { value: 'pipeline', label: 'Pipeline' },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="ML lab"
        title="How the numbers are produced"
        subtitle="Every figure in this app comes out of the pipeline below. No black boxes, no invented accuracy percentages."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={info.status === 'success' ? 'brand' : 'muted'} icon={Cpu}>
              {info.status === 'success' ? 'Live from /model-info' : 'Using validated fallback'}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                info.refetch()
                analytics.refetch()
              }}
            >
              Refresh
            </Button>
          </div>
        }
      />

      {failed && <ErrorState error={analytics.error ?? info.error} onRetry={analytics.refetch} />}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Production model', value: model, sub: meta.model_type, icon: Cpu, tone: 'text-brand' },
          { label: 'Engineered features', value: num(featureCount, 0), sub: `${FEATURE_GROUPS.length} feature families`, icon: Layers, tone: 'text-accent' },
          { label: 'Training rows', value: num(analytics.data?.n_samples ?? 1433, 0), sub: '1,433 days · 2006–2010', icon: Database, tone: 'text-info' },
          { label: 'Mean daily usage', value: num(analytics.data?.mean_kwh ?? 26.03, 2), sub: 'kWh across the dataset', icon: Timer, tone: 'text-warn' },
        ].map((stat) => (
          <Card key={stat.label} className="card-pad">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-fg-subtle">{stat.label}</p>
            <p className="mt-2 flex items-center gap-2">
              <stat.icon className={`size-4 shrink-0 ${stat.tone}`} strokeWidth={2.2} aria-hidden="true" />
              <span className="stat-value truncate text-[1.15rem]">{stat.value}</span>
            </p>
            <p className="mt-1.5 truncate text-[0.75rem] text-fg-subtle">{stat.sub}</p>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented options={tabs} value={tab} onChange={setTab} size="sm" ariaLabel="Model lab sections" />
        <p className="font-mono text-[0.72rem] text-fg-subtle">{API_BASE}</p>
      </div>

      {tab === 'models' && (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {MODEL_STACK.map((entry) => (
              <Card key={entry.id} className="card-pad flex flex-col">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-[0.98rem] font-semibold">{entry.name}</h3>
                    <p className="mt-0.5 text-[0.75rem] text-fg-subtle">{entry.role}</p>
                  </div>
                  {entry.id === 'rf' && (
                    <Badge tone="brand" icon={CheckCircle2}>
                      production
                    </Badge>
                  )}
                </div>

                <p className="mt-2.5 text-[0.82rem] leading-relaxed text-fg-muted">{entry.blurb}</p>

                <dl className="mt-4 grid grid-cols-4 gap-2 border-t border-line pt-3.5">
                  {METRIC_ORDER.map((key) => {
                    const value = entry.metrics[key]
                    const isNumber = typeof value === 'number'
                    return (
                      <div key={key}>
                        <dt className="text-[0.65rem] uppercase tracking-wider text-fg-subtle">{key}</dt>
                        <dd
                          className={`stat-value mt-0.5 text-[0.85rem] ${
                            entry.id === 'rf' ? 'text-brand' : 'text-fg'
                          }`}
                        >
                          {isNumber ? num(value, key === 'R2' ? 4 : 4) : value}
                        </dd>
                      </div>
                    )
                  })}
                  <div>
                    <dt className="text-[0.65rem] uppercase tracking-wider text-fg-subtle">time</dt>
                    <dd className="stat-value mt-0.5 text-[0.85rem]">{entry.metrics.time}</dd>
                  </div>
                </dl>
              </Card>
            ))}
          </div>

          <Card className="card-pad">
            <h2 className="text-[0.98rem] font-semibold">Regression metrics, explained</h2>
            <p className="mt-1 text-[0.8rem] text-fg-muted">
              The held-out split is the final 20% of the timeline — 287 days the models never saw.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {[
                {
                  key: 'MAE',
                  label: 'Mean Absolute Error',
                  value: metrics.MAE,
                  unit: 'kWh / day',
                  body: 'On an average day the prediction is off by this much. The most honest number for “how wrong could tomorrow be”.',
                },
                {
                  key: 'RMSE',
                  label: 'Root Mean Square Error',
                  value: metrics.RMSE,
                  unit: 'kWh / day',
                  body: 'Same idea, but big misses hurt disproportionately. A higher RMSE than MAE means the tail is worse than the average.',
                },
                {
                  key: 'R2',
                  label: 'R² — variance explained',
                  value: metrics.R2,
                  unit: 'fraction of variance',
                  body: 'How much better than always guessing the historical mean. 0.46 is respectable for daily household kWh, which is stubbornly noisy.',
                },
              ].map((metric) => (
                <div key={metric.key} className="rounded-xl border border-line bg-surface-2 p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[0.82rem] font-semibold">{metric.label}</p>
                    <Badge tone="muted">{metric.key}</Badge>
                  </div>
                  <p className="stat-value mt-2 text-[1.6rem] leading-none text-brand">
                    {num(metric.value, 4)}
                    <span className="ml-1.5 text-[0.72rem] font-medium text-fg-subtle">{metric.unit}</span>
                  </p>
                  <p className="mt-2.5 text-[0.78rem] leading-relaxed text-fg-muted">{metric.body}</p>
                </div>
              ))}
            </div>
          </Card>

          {clusters.length > 0 && (
            <Card className="card-pad">
              <h2 className="text-[0.98rem] font-semibold">Usage clusters</h2>
              <p className="mt-1 text-[0.8rem] text-fg-muted">
                K-Means splits everyday consumption into operational modes. Households sit in the high-consumption
                cluster roughly {Math.round((clusters.find((c) => c.label?.toLowerCase?.().includes('high'))?.share ?? 0.42) * 100)}% of
                days.
              </p>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {clusters.map((cluster) => (
                  <li key={cluster.label ?? cluster.name} className="rounded-xl border border-line bg-surface-2 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[0.85rem] font-semibold">{cluster.label ?? cluster.name}</p>
                      <Badge tone="info">
                        {Math.round((cluster.share ?? cluster.fraction ?? 0) * 100)}% of days
                      </Badge>
                    </div>
                    <p className="stat-value mt-2 text-[1.1rem] text-fg">
                      {num(cluster.mean_kwh ?? cluster.centroid ?? 0, 2)} kWh
                    </p>
                    <p className="mt-1 text-[0.75rem] text-fg-subtle">
                      {cluster.size ?? '—'} days in this mode
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      {tab === 'features' && (
        <div className="space-y-4">
          <ChartFrame
            title="Feature importance"
            subtitle="Permutation-style importance from the trained ensembles. Lags and rolling means dominate — which is exactly why the API needs your full 30-day window."
            icon={Boxes}
            height={320}
            isEmpty={!loading && !importance.length}
            emptyTitle="Importance not available"
            emptyDescription="Start the backend to pull /model-analytics, or read the feature definitions below."
          >
            {loading ? <Skeleton className="h-full w-full" /> : <FeatureImportanceChart rows={importance} height={320} topN={12} />}
          </ChartFrame>

          <div className="grid gap-4 md:grid-cols-2">
            {FEATURE_GROUPS.map((group) => (
              <Card key={group.key} className="card-pad">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[0.92rem] font-semibold">{group.label}</h3>
                  <Badge tone="muted">{group.features.length} features</Badge>
                </div>
                <ul className="mt-3 space-y-2.5">
                  {group.features.map((feature) => (
                    <li key={feature} className="flex gap-2.5">
                      <code className="mt-px shrink-0 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[0.7rem] text-accent">
                        {feature}
                      </code>
                      <span className="text-[0.78rem] leading-relaxed text-fg-muted">
                        {FEATURE_DESCRIPTIONS[feature] ?? 'Engineered temporal feature.'}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>

          <Card className="card-pad flex items-start gap-3 bg-surface-2">
            <Info className="mt-0.5 size-4 shrink-0 text-info" strokeWidth={2.2} aria-hidden="true" />
            <p className="text-[0.8rem] leading-relaxed text-fg-muted">
              {featureCount} features × 1,433 rows is a deliberately small tabular problem. The model is not
              over-fitted to your household, which is why it generalises — but it also means a single very unusual
              week will move the forecast more than a well-behaved one.
            </p>
          </Card>
        </div>
      )}

      {tab === 'pipeline' && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {PIPELINE.map((step, index) => (
              <Card key={step.title} className="card-pad relative">
                <div className="flex items-center gap-2.5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-surface-2">
                    <step.icon className="size-4 text-fg-muted" strokeWidth={2.2} aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
                      Step {index + 1}
                    </p>
                    <h3 className="text-[0.92rem] font-semibold">{step.title}</h3>
                  </div>
                </div>
                <p className="mt-3 text-[0.8rem] leading-relaxed text-fg-muted">{step.body}</p>
              </Card>
            ))}
          </div>

          <Card className="card-pad">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-[0.98rem] font-semibold">
                <GitBranch className="size-4 text-brand" strokeWidth={2.2} aria-hidden="true" />
                API contract the UI depends on
              </h2>
              <Badge tone="muted" icon={BookOpen}>
                FastAPI · pydantic validated
              </Badge>
            </div>
            <div className="scrollbar-slim mt-4 overflow-x-auto">
              <pre className="min-w-max rounded-xl border border-line bg-surface-2 p-4 font-mono text-[0.72rem] leading-relaxed text-fg-muted">
{`GET  /health              → { status, model, model_type, features }
GET  /model-info          → { test_mae_kwh, test_rmse_kwh, test_r2, features }
GET  /model-analytics     → { primary_model, feature_importance, comparison, clusters }
GET  /historical-data     → { count, data: [{ date, energy_kwh }] }
GET  /anomalies           → { count, anomalies: [{ date, energy_kwh,
                                    rolling_mean_7, rolling_std_7,
                                    anomaly_score }] }
POST /predict             → { consumption: number[30], target_date: "YYYY-MM-DD" }
                        ← { predicted_kwh, model }
POST /predict-bill        → { predicted_kwh, tariff_per_kwh }
                        ← { estimated_bill, tariff_per_kwh, monthly_units }`}
              </pre>
            </div>
          </Card>

          <Card className="card-pad flex items-start gap-3">
            <BookOpen className="mt-0.5 size-4 shrink-0 text-accent" strokeWidth={2.2} aria-hidden="true" />
            <div className="text-[0.8rem] leading-relaxed text-fg-muted">
              <p className="font-semibold text-fg">Where to look next</p>
              <p className="mt-1">
                <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.72rem]">
                  WattWise-AI/src/api.py
                </code>{' '}
                defines the endpoints,{' '}
                <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.72rem]">
                  src/features.py
                </code>{' '}
                builds the 26 features and{' '}
                <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.72rem]">notebooks/</code>{' '}
                contains the training runs.
              </p>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
