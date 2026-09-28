import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  Cpu,
  Database,
  FileSpreadsheet,
  GitBranch,
  Layers,
  LineChart,
  Network,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  TriangleAlert,
  Wallet,
  Workflow,
  Zap,
} from 'lucide-react'
import { Card, PageHeader } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { useModelInfo, usePipelineMetadata, useDatasetStatistics } from '../hooks/useEnergyData'
import { num, formatDate } from '../lib/format'

export function MethodologyPage() {
  const info = useModelInfo()
  const pipeline = usePipelineMetadata()
  const stats = useDatasetStatistics()

  const pipeData = pipeline.data
  const infoData = info.data
  const statsData = stats.data
  const modelMetrics = infoData?.metrics ?? {}
  const split = infoData?.split
  const rfMetrics = modelMetrics['Random Forest V2']
  const baselineMetrics = modelMetrics['Naive Baseline']
  const xgbMetrics = modelMetrics['XGBoost V2']
  const isoContamination = infoData?.companion_models?.['Isolation Forest']?.contamination

  const PIPELINE_STEPS = [
    {
      num: '01',
      title: 'Raw Data Ingestion & Profiling',
      icon: Database,
      badge: '2,075,259 Minute Records',
      tone: 'info',
      description:
        'Smart meter measurements collected at 1-minute intervals over 4 years from the UCI repository. Profiling identifies 25,979 missing numeric entries (1.25%), structural schema, and numerical ranges across 7 electrical variables.',
      details: [
        'Raw Size: ~126.8 MB (zipped: ~20.6 MB)',
        'Attributes: Global Active Power, Reactive Power, Voltage, Global Intensity, 3 Sub-metering circuits',
        'Missing Values: 25,979 rows marked with "?" symbols',
      ],
    },
    {
      num: '02',
      title: 'Distributed Data Cleaning & Preprocessing',
      icon: CheckCircle2,
      badge: 'Zero Null Values Remaining',
      tone: 'brand',
      description:
        'Cleaning handles missing data via time-based linear interpolation (clamped at a 60-minute limit). Data types are cast from strings to double-precision floats, and invalid negative readings are removed.',
      details: [
        'PySpark MLlib / Pandas linear interpolation',
        'Schema Validation & Timestamp indexing',
        'Cleaned Record Count: 2,049,280 valid minute readings',
      ],
    },
    {
      num: '03',
      title: 'Daily & Hourly Resampling & Aggregation',
      icon: BarChart3,
      badge: '1,433 Daily Records',
      tone: 'accent',
      description:
        'Minute-level active power (kW) is integrated over time to yield true daily energy consumption in kilowatt-hours (kWh): Daily kWh = ∑(Global_active_power / 60).',
      details: [
        'Resampled from 2.07M minute readings to 1,433 retained daily observations',
        'Sub-metering values converted from Wh to kWh',
        'Retains the available daily records across the 2006–2010 source period',
      ],
    },
    {
      num: '04',
      title: 'Statistical Exploratory Analysis',
      icon: LineChart,
      badge: 'Summary & Correlation Analysis',
      tone: 'warn',
      description:
        'Rigorously calculates mean, median, standard deviation, variance, skewness, kurtosis, percentiles (q25, q75, IQR), seasonal rollups, weekday vs weekend elevation ratios, and Pearson correlations with secondary electrical variables.',
      details: [
        `Mean Consumption: ${num(statsData?.summary?.mean ?? 26.03, 2)} kWh/day`,
        `Std Deviation: ${num(statsData?.summary?.std ?? 14.12, 2)} kWh/day`,
        `Weekend Ratio: ${num(statsData?.weekday_vs_weekend?.weekend_elevation_ratio ?? 1.12, 2)}× weekday average`,
      ],
    },
    {
      num: '05',
      title: 'Time-Series Feature Engineering',
      icon: Layers,
      badge: '26 Engineered Features',
      tone: 'violet',
      description:
        'Transforms the aggregated daily series into a supervised machine learning table using a 30-day context window. Features include calendar variables, lag features, rolling statistics, and exponentially weighted moving averages.',
      details: [
        'Calendar (9): Year, Month, Day, Day of Week, Day of Year, Week of Year, Quarter, Season, Is Weekend',
        'Lags (7): Lags 1, 2, 3, 7, 14, 21, 30 days',
        'Rolling Statistics (8): 3, 7, 14, 30-day Rolling Means & Standard Deviations',
        'Exponential Moving Averages (2): EWM-7 and EWM-30',
      ],
    },
    {
      num: '06',
      title: 'Chronological Train / Validation / Test Splitting',
      icon: Workflow,
      badge: '70% / 15% / 15% Split',
      tone: 'brand',
      description:
        'Strict chronological partitioning prevents temporal data leakage. Models are trained on the first 70% of historical days, hyperparameter-tuned on 15% validation, and scored once on the final 15% held-out test split.',
      details: [
        `Training Split: ${split?.training_rows?.toLocaleString() ?? '—'} rows (70%)`,
        `Validation Split: ${split?.validation_rows?.toLocaleString() ?? '—'} rows (15%)`,
        `Held-Out Test Split: ${split?.test_rows?.toLocaleString() ?? '—'} rows (15%) — zero future shuffling`,
      ],
    },
    {
      num: '07',
      title: 'Supervised ML Ensembling & Evaluation',
      icon: BrainCircuit,
      badge: rfMetrics ? 'Random Forest V2 (MAE = ' + rfMetrics.mae_kwh.toFixed(2) + ' kWh)' : 'Random Forest V2',
      tone: 'accent',
      description:
        'Trains a naive baseline, Random Forest and XGBoost regressors. Performance is evaluated with MAE, RMSE and R² on the chronological held-out test set. The production Random Forest is the model served by the FastAPI prediction endpoint.',
      details: [
        'Naive Baseline: MAE = ' + (baselineMetrics ? baselineMetrics.mae_kwh.toFixed(3) : '—') + ' kWh | RMSE = ' + (baselineMetrics ? baselineMetrics.rmse_kwh.toFixed(3) : '—') + ' kWh | R² = ' + (baselineMetrics ? baselineMetrics.r2.toFixed(3) : '—'),
        'Random Forest V2: MAE = ' + (rfMetrics ? rfMetrics.mae_kwh.toFixed(3) : '—') + ' kWh | RMSE = ' + (rfMetrics ? rfMetrics.rmse_kwh.toFixed(3) : '—') + ' kWh | R² = ' + (rfMetrics ? rfMetrics.r2.toFixed(3) : '—'),
        'XGBoost V2: MAE = ' + (xgbMetrics ? xgbMetrics.mae_kwh.toFixed(3) : '—') + ' kWh | RMSE = ' + (xgbMetrics ? xgbMetrics.rmse_kwh.toFixed(3) : '—') + ' kWh | R² = ' + (xgbMetrics ? xgbMetrics.r2.toFixed(3) : '—'),
        'PySpark MLlib RF: benchmark pending regeneration after the corrected causal Spark pipeline; do not quote the previous stored metrics.',
      ],
    },
    {
      num: '08',
      title: 'Unsupervised Outlier & Pattern Clustering',
      icon: Network,
      badge: 'Isolation Forest & K-Means',
      tone: 'danger',
      description:
        'An Isolation Forest scores every historical day to detect abnormal energy consumption events. K-Means clustering identifies baseline household consumption modes.',
      details: [
        'Isolation Forest: Configured contamination rate of ' + (isoContamination != null ? (isoContamination * 100).toFixed(1) : '—') + '%',
        'K-Means Clustering: 2 dominant modes (Lower vs Higher consumption)',
        'Root Cause Mapping: Outliers mapped to plain-English explanations & severity ratings',
      ],
    },
    {
      num: '09',
      title: 'Real-Time API & Iterative Roll-Forward Forecasting',
      icon: Cpu,
      badge: 'FastAPI Production Service',
      tone: 'brand',
      description:
        'FastAPI backend serves predictions, multi-day iterative horizon forecasts (roll-forward lag propagation with compounding MAE uncertainty bounds), bill estimations, and dataset analytics.',
      details: [
        'Single-day prediction via POST /predict',
        'Multi-day horizon forecast via POST /predict-horizon',
        'Priced tariff bill estimation via POST /predict-bill',
      ],
    },
  ]

  const VIVA_QA = [
    {
      q: 'Why use a chronological split instead of random k-fold cross-validation?',
      a: 'Random k-fold cross-validation introduces severe temporal data leakage in time-series data. In time-series forecasting, lag features and rolling averages at time t contain historical observations from t-1, t-7, etc. Shuffling data causes future information to leak into training folds, drastically inflating accuracy artificially. A strict chronological split (70% train / 15% val / 15% test) guarantees models are evaluated exclusively on unobserved future dates.',
    },
    {
      q: 'How does the multi-day horizon forecast work without a separate sequence model?',
      a: 'The system uses an iterative roll-forward forecasting method. To predict day N+1, the model takes the 30-day context window. For day N+2, the predicted value for day N+1 is appended to the context window as the newest lag value. This process iterates up to 30 days while propagating uncertainty bounds (+/- held-out test MAE), providing an honest single-model forecast without fake precision.',
    },
    {
      q: 'What is the role of PySpark vs Scikit-Learn / XGBoost in this architecture?',
      a: 'PySpark handles large-scale distributed preprocessing, resampling, and distributed hourly regression over millions of raw smart meter records. Scikit-Learn and XGBoost provide single-row API inference, feature importance extraction, and Isolation Forest anomaly scoring in the web service.',
    },
    {
      q: 'How does Isolation Forest perform anomaly detection on energy consumption?',
      a: 'Isolation Forest is an unsupervised tree-based algorithm. Rather than profiling normal points, it isolates anomalies by randomly selecting feature split boundaries. Anomalous days (extreme consumption spikes or dips) require fewer recursive partitions to isolate, resulting in shorter path lengths in isolation trees. Days with anomaly scores below zero are flagged as statistical outliers.',
    },
  ]

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Academic Architecture & Methodology"
        title="SMLBDA Project Pipeline & Design"
        subtitle="A complete, end-to-end breakdown of the Big Data analytics pipeline, statistical formulations, machine learning ensemble, and API architecture powering WattWise AI."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="brand" icon={Workflow}>
              SMLBDA Project Standard
            </Badge>
            <Link to="/models">
              <Button variant="outline" size="sm" icon={BrainCircuit}>
                Explore ML Lab
              </Button>
            </Link>
          </div>
        }
      />

      {/* ── Core Pipeline Overview Flowchart ── */}
      <Card className="card-pad border-brand/20 bg-gradient-to-br from-surface via-surface to-brand-soft/20">
        <h2 className="text-[1.1rem] font-bold text-fg flex items-center gap-2">
          <GitBranch className="size-5 text-brand" strokeWidth={2.2} />
          End-to-End Data Science Pipeline Flow
        </h2>
        <p className="mt-1 text-[0.85rem] text-fg-muted">
          From 2.07 million raw smart-meter readings to real-time machine learning predictions and actionable energy advice.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-5 text-center">
          {[
            { step: '1. Raw Ingestion', detail: '2.07M 1-min records' },
            { step: '2. Cleaning & Spark', detail: '0 missing, aggregated' },
            { step: '3. Feature Eng.', detail: '26 temporal features' },
            { step: '4. Model Ensemble', detail: 'RF, XGBoost, IsoForest' },
            { step: '5. Web & Advisor', detail: 'FastAPI + React UI' },
          ].map((box, idx) => (
            <div key={box.step} className="relative rounded-2xl border border-line bg-surface-2 p-3.5 shadow-sm">
              <div className="text-[0.7rem] font-bold uppercase tracking-wider text-brand">Stage {idx + 1}</div>
              <div className="mt-1 text-[0.88rem] font-semibold text-fg">{box.step}</div>
              <div className="mt-1 text-[0.75rem] text-fg-subtle">{box.detail}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* ── Comprehensive Phase-by-Phase Timeline ── */}
      <div className="space-y-4">
        <h2 className="text-[1.15rem] font-bold text-fg flex items-center gap-2">
          <Workflow className="size-5 text-accent" strokeWidth={2.2} />
          Detailed Methodology & Pipeline Stages
        </h2>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {PIPELINE_STEPS.map((step) => (
            <Card key={step.num} className="card-pad flex flex-col justify-between hover:border-brand/40 transition-colors">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold text-brand bg-brand-soft px-2 py-0.5 rounded-md">
                    {step.num}
                  </span>
                  <Badge tone={step.tone}>{step.badge}</Badge>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <step.icon className="size-4 text-fg-muted shrink-0" strokeWidth={2.2} />
                  <h3 className="text-[0.95rem] font-semibold text-fg">{step.title}</h3>
                </div>

                <p className="mt-2 text-[0.8rem] leading-relaxed text-fg-muted">{step.description}</p>
              </div>

              <ul className="mt-4 space-y-1.5 border-t border-line pt-3 text-[0.75rem] text-fg-subtle">
                {step.details.map((d, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="mt-1 size-1 rounded-full bg-brand shrink-0" />
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </div>

      {/* ── ML Benchmarking Matrix ── */}
      <Card className="card-pad">
        <h2 className="text-[1.1rem] font-bold text-fg flex items-center gap-2">
          <BrainCircuit className="size-5 text-brand" strokeWidth={2.2} />
          Empirical ML Model Performance Comparison
        </h2>
        <p className="mt-1 text-[0.82rem] text-fg-muted mb-4">
          All performance metrics are derived directly from empirical evaluation on held-out test data.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-[0.82rem]">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-fg-subtle font-medium">
                <th className="p-3">Model</th>
                <th className="p-3">Scope / Resolution</th>
                <th className="p-3">MAE</th>
                <th className="p-3">RMSE</th>
                <th className="p-3">R² Score</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              <tr className="hover:bg-surface-2/50">
                <td className="p-3 font-semibold text-fg">Naive Baseline</td>
                <td className="p-3 text-fg-muted">Daily kWh (Lag-1)</td>
                <td className="p-3 font-mono">{baselineMetrics ? baselineMetrics.mae_kwh.toFixed(3) + ' kWh' : '—'}</td>
                <td className="p-3 font-mono">{baselineMetrics ? baselineMetrics.rmse_kwh.toFixed(3) + ' kWh' : '—'}</td>
                <td className="p-3 font-mono">{baselineMetrics ? baselineMetrics.r2.toFixed(4) : '—'}</td>
                <td className="p-3"><Badge tone="muted">Benchmark</Badge></td>
              </tr>
              <tr className="bg-brand-soft/20 hover:bg-brand-soft/30">
                <td className="p-3 font-bold text-brand flex items-center gap-1.5">
                  Random Forest V2
                  <CheckCircle2 className="size-4 text-brand" strokeWidth={2.4} />
                </td>
                <td className="p-3 text-fg-muted">Daily kWh (26 features)</td>
                <td className="p-3 font-mono font-bold text-brand">{rfMetrics ? rfMetrics.mae_kwh.toFixed(3) + ' kWh' : '—'}</td>
                <td className="p-3 font-mono font-bold text-brand">{rfMetrics ? rfMetrics.rmse_kwh.toFixed(3) + ' kWh' : '—'}</td>
                <td className="p-3 font-mono font-bold text-brand">{rfMetrics ? rfMetrics.r2.toFixed(4) : '—'}</td>
                <td className="p-3"><Badge tone="brand">Production Served</Badge></td>
              </tr>
              <tr className="hover:bg-surface-2/50">
                <td className="p-3 font-semibold text-fg">XGBoost V2</td>
                <td className="p-3 text-fg-muted">Daily kWh (26 features)</td>
                <td className="p-3 font-mono">{xgbMetrics ? xgbMetrics.mae_kwh.toFixed(3) + ' kWh' : '—'}</td>
                <td className="p-3 font-mono">{xgbMetrics ? xgbMetrics.rmse_kwh.toFixed(3) + ' kWh' : '—'}</td>
                <td className="p-3 font-mono">{xgbMetrics ? xgbMetrics.r2.toFixed(4) : '—'}</td>
                <td className="p-3"><Badge tone="info">Evaluated</Badge></td>
              </tr>
              <tr className="hover:bg-surface-2/50">
                <td className="p-3 font-semibold text-fg">PySpark MLlib RandomForest</td>
                <td className="p-3 text-fg-muted">Hourly kWh (Distributed)</td>
                <td className="p-3 font-mono">—</td>
                <td className="p-3 font-mono">—</td>
                <td className="p-3 font-mono">—</td>
                <td className="p-3"><Badge tone="warn">Pending regeneration</Badge></td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Academic Viva QA Section ── */}
      <div className="space-y-4">
        <h2 className="text-[1.15rem] font-bold text-fg flex items-center gap-2">
          <BookOpen className="size-5 text-warn" strokeWidth={2.2} />
          Academic Viva & Defense Questions
        </h2>

        <div className="grid gap-4 md:grid-cols-2">
          {VIVA_QA.map((item, i) => (
            <Card key={i} className="card-pad space-y-2">
              <p className="text-[0.9rem] font-bold text-fg flex items-start gap-2">
                <span className="text-brand font-mono">Q{i + 1}.</span>
                {item.q}
              </p>
              <p className="text-[0.8rem] leading-relaxed text-fg-muted pl-6 border-l-2 border-brand/30">
                {item.a}
              </p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
