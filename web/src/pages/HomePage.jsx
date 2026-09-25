import { Link } from 'react-router-dom'
import { useMemo } from 'react'
import {
  ArrowRight,
  BrainCircuit,
  Gauge,
  LineChart,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TrendingDown,
  Wallet,
  Zap,
} from 'lucide-react'
import { Card, PageHeader } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { buttonClass } from '../components/ui/Button'
import { Skeleton } from '../components/ui/States'
import { UsageAreaChart } from '../components/charts/UsageAreaChart'
import { useApp } from '../context/AppContext'
import { useAnomalies, useHistorical, useModelInfo } from '../hooks/useEnergyData'
import { compareWindows, movingAverage, summariseWindow } from '../lib/energy'
import { money, num, signedPercent } from '../lib/format'

const FEATURES = [
  {
    to: '/simulator',
    icon: SlidersHorizontal,
    title: 'What-If Savings Simulator',
    tone: 'accent',
    description:
      'Drag any appliance duty cycle and watch monthly rupees, energy and CO₂ update instantly. Save plans and compare them side by side.',
  },
  {
    to: '/waste',
    icon: ShieldCheck,
    title: 'Waste & Anomaly Detection',
    tone: 'danger',
    description:
      'An Isolation Forest scores every historical day. Outliers come with a plain-English cause and a concrete fix.',
  },
  {
    to: '/predictor',
    icon: Wallet,
    title: 'Transparent Bill Forecasting',
    tone: 'brand',
    description:
      'Feed in 30 days of usage and get tomorrow’s kWh plus a ±MAE confidence band priced with your exact tariff.',
  },
  {
    to: '/advisor',
    icon: Sparkles,
    title: 'AI Energy Advisor',
    tone: 'violet',
    description:
      'Prioritised actions ranked by rupees saved. One click applies the change straight into your simulator profile.',
  },
  {
    to: '/analytics',
    icon: LineChart,
    title: 'Consumption Analytics',
    tone: 'info',
    description:
      'Weekday load profiles, monthly rollups, a distribution view and a calendar heatmap of every recorded day.',
  },
  {
    to: '/models',
    icon: BrainCircuit,
    title: 'Model Lab',
    tone: 'warn',
    description:
      'Feature importance, model benchmarks, cluster profiles and the anomaly matrix — the honest numbers behind every claim.',
  },
]

const STEPS = [
  {
    title: 'Profile the household',
    body: 'Log your appliances once. WattWise converts power ratings and duty cycles into a monthly energy and rupee model.',
  },
  {
    title: 'Catch the waste early',
    body: 'Anomalies surface days that broke the baseline — phantom base load, a forgotten geyser, a failing fridge seal.',
  },
  {
    title: 'Simulate, then commit',
    body: 'Test the fix, see the payback, save the plan and compare it against alternatives before you change anything.',
  },
]

export function HomePage() {
  const { tariff, settings, simulation, health } = useApp()
  const history = useHistorical(30)
  const anomalies = useAnomalies()
  const modelInfo = useModelInfo()

  const series = useMemo(() => history.data?.data ?? [], [history.data])
  const summary = useMemo(() => {
    const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date))
    const window = sorted.slice(-7)
    const baseline = movingAverage(sorted.slice(-30), 7)
    return {
      rows: sorted.slice(-30).map((point, i) => ({ ...point, baseline: baseline[i]?.energy_kwh })),
      last7: summariseWindow(window),
      change: compareWindows(sorted, 7),
    }
  }, [series])

  const model = modelInfo.data
  const projectedBill = summary.last7.total * tariff + Number(settings.fixedCharges || 0)
  const datasetAverage = series.length
    ? series.reduce((sum, point) => sum + point.energy_kwh, 0) / series.length
    : null

  return (
    <div className="space-y-14">
      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-3xl border border-line bg-surface">
        <div className="grid-bg absolute inset-0 opacity-70" aria-hidden="true" />
        <div
          className="absolute -right-24 -top-32 size-[28rem] rounded-full bg-brand/15 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="absolute -bottom-40 -left-24 size-[26rem] rounded-full bg-accent/10 blur-3xl"
          aria-hidden="true"
        />

        <div className="relative grid gap-8 p-6 sm:p-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:p-12">
          <div>
            <Badge tone="brand" icon={Zap}>
              Household energy intelligence
            </Badge>

            <h1 className="mt-5 text-[2.1rem] font-extrabold leading-[1.08] tracking-tight sm:text-[2.9rem]">
              Your electricity bill,
              <br />
              <span className="text-gradient">under control.</span>
            </h1>

            <p className="mt-4 max-w-xl text-[0.98rem] leading-relaxed text-fg-muted">
              WattWise runs a Random Forest over your daily consumption, an Isolation Forest over the same
              history to hunt waste, and a what-if simulator that prices every change in rupees — before you
              make it.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link to="/dashboard" className={buttonClass({ variant: 'primary', size: 'lg' })}>
                Open dashboard
                <ArrowRight className="size-4" strokeWidth={2.4} aria-hidden="true" />
              </Link>
              <Link to="/simulator" className={buttonClass({ variant: 'outline', size: 'lg' })}>
                <Gauge className="size-4" strokeWidth={2.2} aria-hidden="true" />
                Try the savings simulator
              </Link>
            </div>

            <dl className="mt-9 grid max-w-lg grid-cols-3 gap-4">
              {[
                { label: 'Test MAE', value: model ? `${model.test_mae_kwh.toFixed(2)} kWh` : '—' },
                { label: 'R² score', value: model ? model.test_r2.toFixed(4) : '—' },
                { label: 'Engineered features', value: model ? model.features.length ?? 26 : '—' },
              ].map((item) => (
                <div key={item.label}>
                  <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
                    {item.label}
                  </dt>
                  <dd className="stat-value mt-1 text-[1.05rem] text-fg">{item.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <Card className="card-pad border-line bg-bg-elevated/80 backdrop-blur-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
                  Last 30 recorded days
                </p>
                <p className="stat-value mt-1 text-[1.9rem] leading-none">
                  {history.isLoading ? '—' : `${num(summary.last7.total, 0)} kWh`}
                </p>
                <p className="mt-1 text-[0.78rem] text-fg-muted">total in the trailing 7-day window</p>
              </div>
              <Badge tone={health.online ? 'brand' : 'warn'} className="normal-case">
                <span
                  className={`size-1.5 rounded-full ${health.online ? 'bg-brand' : 'bg-warn'}`}
                  aria-hidden="true"
                />
                {health.online ? 'Live model data' : 'Snapshot data'}
              </Badge>
            </div>

            <div className="mt-4 h-44">
              {history.isLoading ? (
                <Skeleton className="h-full w-full" />
              ) : (
                <UsageAreaChart data={summary.rows} showAverage={false} height={176} />
              )}
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4">
              <div>
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
                  Projected bill
                </p>
                <p className="stat-value mt-1 text-[1.05rem]">{money(projectedBill)}</p>
              </div>
              <div>
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
                  Plan savings
                </p>
                <p className="stat-value mt-1 text-[1.05rem] text-brand">+{money(simulation.savedCost)}</p>
              </div>
              <div>
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
                  vs last week
                </p>
                <p
                  className={`stat-value mt-1 text-[1.05rem] ${
                    summary.change.changePct > 0 ? 'text-warn' : 'text-brand'
                  }`}
                >
                  {signedPercent(summary.change.changePct)}
                </p>
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* ── Capability grid ──────────────────────────────── */}
      <section>
        <PageHeader
          eyebrow="What you get"
          title="Six tools, one household model"
          subtitle="Each view shares the same tariff, the same appliance profile and the same 1,433-day history, so the numbers always reconcile."
        />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {FEATURES.map((feature) => (
            <Link key={feature.to} to={feature.to} className="block h-full">
              <Card className="card-pad card-hover h-full">
                <div className="flex items-start gap-3">
                  <span
                    className={`grid size-10 shrink-0 place-items-center rounded-xl ${
                      {
                        accent: 'bg-accent-soft text-accent',
                        danger: 'bg-danger-soft text-danger',
                        brand: 'bg-brand-soft text-brand',
                        violet: 'bg-violet-soft text-violet',
                        info: 'bg-info-soft text-info',
                        warn: 'bg-warn-soft text-warn',
                      }[feature.tone]
                    }`}
                  >
                    <feature.icon className="size-5" strokeWidth={2.1} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-[0.95rem] font-semibold leading-snug">{feature.title}</h3>
                    <p className="mt-1.5 text-[0.83rem] leading-relaxed text-fg-muted">{feature.description}</p>
                  </div>
                </div>
                <span className="mt-4 inline-flex items-center gap-1.5 text-[0.8rem] font-semibold text-brand">
                  Open <ArrowRight className="size-3.5" strokeWidth={2.4} aria-hidden="true" />
                </span>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────── */}
      <section className="grid gap-4 lg:grid-cols-3">
        {STEPS.map((step, index) => (
          <Card key={step.title} className="card-pad">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-xl bg-brand-soft text-[0.9rem] font-bold text-brand">
                {index + 1}
              </span>
              <h3 className="text-[0.95rem] font-semibold">{step.title}</h3>
            </div>
            <p className="mt-3 text-[0.85rem] leading-relaxed text-fg-muted">{step.body}</p>
          </Card>
        ))}
      </section>

      {/* ── Dataset facts ───────────────────────────────── */}
      <section className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card className="card-pad">
          <h2 className="text-[0.98rem] font-semibold">The dataset behind the models</h2>
          <p className="mt-1 text-[0.8rem] text-fg-muted">
            Real figures served by the FastAPI backend, not marketing numbers.
          </p>
          <dl className="mt-5 grid grid-cols-2 gap-5 sm:grid-cols-4">
            {[
              { label: 'Daily records', value: '1,433', hint: 'Dec 2006 – Nov 2010' },
              { label: 'Models trained', value: '4', hint: 'RF · XGB · IF · K-Means' },
              { label: 'Anomalies flagged', value: anomalies.data?.count ?? '—', hint: '~2% contamination' },
              {
                label: 'Avg daily use',
                value: datasetAverage ? `${num(datasetAverage, 1)} kWh` : '—',
                hint: 'Mean of the served series',
              },
            ].map((item) => (
              <div key={item.label}>
                <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
                  {item.label}
                </dt>
                <dd className="stat-value mt-1 text-[1.25rem]">{item.value}</dd>
                <p className="mt-0.5 text-[0.7rem] text-fg-subtle">{item.hint}</p>
              </div>
            ))}
          </dl>
        </Card>

        <Card className="card-pad bg-gradient-to-br from-brand-soft via-surface to-surface">
          <h2 className="text-[0.98rem] font-semibold">Start where it hurts most</h2>
          <p className="mt-1.5 text-[0.85rem] leading-relaxed text-fg-muted">
            Your profile currently models {num(simulation.currentKwh, 0)} kWh a month. The simulator already
            has {money(simulation.savedCost)} of monthly savings mapped out.
          </p>
          <div className="mt-5 flex flex-wrap gap-2.5">
            <Link to="/advisor" className={buttonClass({ variant: 'primary' })}>
              See advisor actions
            </Link>
            <Link to="/predictor" className={buttonClass({ variant: 'outline' })}>
              <TrendingDown className="size-4" strokeWidth={2.2} aria-hidden="true" />
              Forecast a bill
            </Link>
          </div>
        </Card>
      </section>
    </div>
  )
}
