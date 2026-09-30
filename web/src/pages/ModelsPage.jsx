import { useMemo, useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  LineChart,
  Line,
  ReferenceLine,
} from 'recharts'
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
  TriangleAlert,
  Workflow,
  BarChart3,
  PieChart as PieIcon,
  Activity,
  Flame,
  Zap,
  TrendingUp,
  ShieldAlert,
  FolderTree,
  Scale,
} from 'lucide-react'
import { Card, PageHeader } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Segmented } from '../components/ui/Field'
import { ErrorState, Skeleton } from '../components/ui/States'
import { ChartFrame } from '../components/charts/ChartFrame'
import { FeatureImportanceChart } from '../components/charts/FeatureImportanceChart'
import { useModelAnalytics, useModelInfo, usePipelineMetadata } from '../hooks/useEnergyData'
import { API_BASE } from '../lib/api'
import { FEATURE_DESCRIPTIONS, FEATURE_GROUPS, MODEL_FALLBACK } from '../lib/constants'
import { num } from '../lib/format'

// 1. All Models Definition with Explicit Values and Metrics for Each
const ALL_MODELS_DATA = [
  {
    id: 'rf',
    name: 'Random Forest V2',
    type: 'Supervised Regressor',
    role: 'Primary Production Forecasting Model',
    tone: 'brand',
    status: 'Deployed in Production',
    blurb: 'Ensemble of 400 decision trees trained over 26 engineered temporal features (lags, rolling means, volatility, EWM). Chronological 70/15/15 train-val-test split prevents data leakage.',
    fitTime: '0.42 s',
    metrics: [
      { label: 'MAE (Mean Error)', value: '4.003 kWh', sub: 'Primary KPI', tone: 'text-brand' },
      { label: 'RMSE', value: '5.523 kWh', sub: 'Penalty score', tone: 'text-fg' },
      { label: 'R² Score', value: '0.4584', sub: '45.8% variance', tone: 'text-brand' },
      { label: 'Trees / Estimators', value: '400 Trees', sub: 'Max depth 15', tone: 'text-fg-subtle' },
    ],
    graphType: 'forecast_comparison',
  },
  {
    id: 'xgb',
    name: 'XGBoost V2',
    type: 'Gradient-Boosted Regressor',
    role: 'Secondary Benchmark Regressor',
    tone: 'accent',
    status: 'Benchmark Model',
    blurb: 'Gradient-boosted decision tree algorithm evaluated on the same 26 feature matrix. Highly sensitive to recent trend changes, serving as a secondary verification baseline.',
    fitTime: '0.28 s',
    metrics: [
      { label: 'MAE (Mean Error)', value: '4.133 kWh', sub: '+0.13 vs RF', tone: 'text-accent' },
      { label: 'RMSE', value: '5.771 kWh', sub: 'Tail error', tone: 'text-fg' },
      { label: 'R² Score', value: '0.4089', sub: '40.9% variance', tone: 'text-accent' },
      { label: 'Boosting Rounds', value: '700 Trees', sub: 'Learning rate 0.05', tone: 'text-fg-subtle' },
    ],
    graphType: 'forecast_comparison',
  },
  {
    id: 'if',
    name: 'Isolation Forest V2',
    type: 'Unsupervised Anomaly Detector',
    role: 'Waste & High-Consumption Spike Detector',
    tone: 'warn',
    status: 'Active Anomaly Engine',
    blurb: 'Isolates abnormal energy consumption events by randomly partitioning feature space. Days requiring fewer splits to isolate are flagged as unusual consumption spikes or drop-offs.',
    fitTime: '0.12 s',
    metrics: [
      { label: 'Contamination Rate', value: '2.067%', sub: 'Configured 2.0%', tone: 'text-warn' },
      { label: 'Flagged Anomalies', value: '29 Days', sub: 'Out of 1,403 days', tone: 'text-warn' },
      { label: 'Normal Filter', value: '97.93%', sub: '1,374 clean days', tone: 'text-fg' },
      { label: 'Score Range', value: '-0.25 to 0.45', sub: 'Threshold < 0.0', tone: 'text-fg-subtle' },
    ],
    graphType: 'anomaly_scores',
  },
  {
    id: 'kmeans',
    name: 'K-Means Clustering V2',
    type: 'Unsupervised Segmentation',
    role: 'Household Usage Regime Classifier',
    tone: 'info',
    status: 'Active Segmentation Engine',
    blurb: 'Segments daily consumption into two distinct statistical clusters: Low Usage Baseline vs High Usage Peak mode. Used to contextualize daily household behavior.',
    fitTime: '0.08 s',
    metrics: [
      { label: 'Optimal Clusters (K)', value: 'K = 2 Modes', sub: 'Silhouette 0.361', tone: 'text-info' },
      { label: 'Lower Usage Mode', value: '18.08 kWh', sub: '649 days (46%)', tone: 'text-brand' },
      { label: 'Higher Usage Mode', value: '32.31 kWh', sub: '754 days (54%)', tone: 'text-accent' },
      { label: 'Total Scored Days', value: '1,403 Days', sub: '100% categorized', tone: 'text-fg-subtle' },
    ],
    graphType: 'cluster_distribution',
  },
  {
    id: 'pyspark',
    name: 'PySpark Big Data Pipeline',
    type: 'Distributed Big Data ML',
    role: 'Large-Scale Minute-Level Pipeline',
    tone: 'violet',
    status: 'Spark Benchmark Engine',
    blurb: 'Executes distributed resampling, interpolation, and feature generation across 2,075,259 raw 1-minute power readings. Scores continuous high-resolution time series.',
    fitTime: '44.48 s',
    metrics: [
      { label: 'Processed Records', value: '2,075,259', sub: 'Raw 1-min readings', tone: 'text-violet' },
      { label: 'Spark MAE', value: '0.347 kWh', sub: 'Minute-level resolution', tone: 'text-brand' },
      { label: 'Spark RMSE', value: '0.495 kWh', sub: 'High precision', tone: 'text-fg' },
      { label: 'Spark R² Score', value: '0.5988', sub: '59.9% variance', tone: 'text-violet' },
    ],
    graphType: 'spark_benchmark',
  },
]

const PIPELINE = [
  {
    title: '1. Ingest Raw Readings',
    icon: Database,
    tone: 'info',
    body: '2,075,259 raw 1-minute records aggregated into 1,433 daily kWh calendar rows with forward-filling for missing gaps.',
  },
  {
    title: '2. Feature Engineering',
    icon: Braces,
    tone: 'brand',
    body: 'Each date expanded into 26 temporal features: calendar indicators, 7 lags, 4 rolling means, 4 volatility std devs, and 2 EWMs.',
  },
  {
    title: '3. Chronological Split',
    icon: Workflow,
    tone: 'accent',
    body: 'Strict 70% Train (982 days), 15% Validation (210 days), and 15% Test (211 days) split prevents future data leakage.',
  },
  {
    title: '4. Multi-Model Training',
    icon: CheckCircle2,
    tone: 'warn',
    body: 'Random Forest, XGBoost, Isolation Forest, and K-Means fitted and cross-scored on held-out test data.',
  },
  {
    title: '5. Model Artifact Pickling',
    icon: Cpu,
    tone: 'violet',
    body: 'Winning Random Forest regressor pickled alongside feature preprocessors into binary joblib artifacts.',
  },
  {
    title: '6. FastAPI Serving',
    icon: Network,
    tone: 'muted',
    body: 'High-speed REST API endpoints (/predict, /predict-horizon, /predict-bill, /anomalies) serve live forecasts.',
  },
]

// Sample Anomaly Score Distribution Data for Isolation Forest Graph
const ISOLATION_FOREST_SAMPLE_DATA = [
  { day: 'Day 1', kwh: 22.4, score: 0.28, isAnomaly: false },
  { day: 'Day 2', kwh: 24.1, score: 0.32, isAnomaly: false },
  { day: 'Day 3', kwh: 21.8, score: 0.25, isAnomaly: false },
  { day: 'Day 4', kwh: 59.9, score: -0.22, isAnomaly: true },
  { day: 'Day 5', kwh: 26.5, score: 0.18, isAnomaly: false },
  { day: 'Day 6', kwh: 25.0, score: 0.22, isAnomaly: false },
  { day: 'Day 7', kwh: 4.5, score: -0.18, isAnomaly: true },
  { day: 'Day 8', kwh: 23.9, score: 0.30, isAnomaly: false },
  { day: 'Day 9', kwh: 27.2, score: 0.21, isAnomaly: false },
  { day: 'Day 10', kwh: 64.2, score: -0.25, isAnomaly: true },
  { day: 'Day 11', kwh: 20.8, score: 0.31, isAnomaly: false },
  { day: 'Day 12', kwh: 22.1, score: 0.29, isAnomaly: false },
]

export function ModelsPage() {
  const info = useModelInfo()
  const analytics = useModelAnalytics()
  const pipelineResource = usePipelineMetadata()
  const [tab, setTab] = useState('models')
  const [selectedModel, setSelectedModel] = useState('rf')

  const meta = { ...MODEL_FALLBACK, ...info.data }
  const model = analytics.data?.primary_model ?? analytics.data?.model ?? meta.model
  const metrics = {
    MAE: meta.test_mae_kwh ?? 4.0028,
    RMSE: meta.test_rmse_kwh ?? 5.5234,
    R2: meta.test_r2 ?? 0.4584,
  }

  const split = info.data?.split
  const dataset = info.data?.dataset

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

  // Comparative Regression Chart Data
  const regressorChartData = useMemo(() => {
    const rfMae = metrics.MAE
    const rfRmse = metrics.RMSE
    return [
      { name: 'Random Forest V2 (Primary)', MAE: rfMae, RMSE: rfRmse, R2: 45.8 },
      { name: 'XGBoost V2 (Benchmark)', MAE: 4.133, RMSE: 5.771, R2: 40.9 },
      { name: 'PySpark Distributed', MAE: 0.347, RMSE: 0.495, R2: 59.9 },
      { name: '7-Day Baseline', MAE: 6.820, RMSE: 8.910, R2: 12.0 },
    ]
  }, [metrics])

  // K-Means Cluster Visualizer Data
  const clusterChartData = useMemo(() => {
    if (!clusters.length) {
      return [
        { name: 'Lower Usage Mode (18.08 kWh)', value: 649, mean: 18.08, fill: '#10b981' },
        { name: 'Higher Usage Mode (32.31 kWh)', value: 754, mean: 32.31, fill: '#6366f1' },
      ]
    }
    const colors = ['#10b981', '#6366f1', '#f59e0b', '#ec4899']
    return clusters.map((c, i) => ({
      name: `${c.label || c.name || `Cluster ${i + 1}`} (${(c.mean_kwh || c.centroid || 0).toFixed(1)} kWh)`,
      value: c.size || 500,
      mean: Number((c.mean_kwh || c.centroid || 0).toFixed(2)),
      fill: colors[i % colors.length],
    }))
  }, [clusters])

  const featureCount = meta.features ?? FEATURE_GROUPS.reduce((s, g) => s + g.features.length, 0)

  const tabs = [
    { value: 'models', label: '🤖 All 5 Machine Learning Models' },
    { value: 'comparison', label: '📊 Model Performance Visualizer' },
    { value: 'features', label: '🧩 26 Engineered Features' },
    { value: 'pipeline', label: '⚙️ Pipeline Architecture' },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="ML Laboratory & Architecture"
        title="Machine Learning Models & Metrics"
        subtitle="Complete evaluation figures, metrics, and visual performance charts for all 5 algorithms powering WattWise."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={info.status === 'success' ? 'brand' : 'warn'} icon={Cpu}>
              {info.status === 'success' ? 'Live FastAPI Backend Connected' : 'Offline Snapshot'}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                info.refetch()
                analytics.refetch()
              }}
            >
              Refresh Metrics
            </Button>
          </div>
        }
      />

      {/* Top 4 KPI Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Deployed Model', value: model, sub: 'RandomForest (400 Trees)', icon: Cpu, tone: 'text-brand' },
          { label: 'Evaluated Models', value: '5 ML Models', sub: '2 Regressors · 2 Unsupervised · 1 Big Data', icon: Layers, tone: 'text-accent' },
          {
            label: 'Chronological Data Split',
            value: `${num(split?.training_rows ?? 982, 0)} Train / ${num(split?.test_rows ?? 211, 0)} Test`,
            sub: '70% Train · 15% Val · 15% Test',
            icon: Database,
            tone: 'text-info',
          },
          { label: 'Forecast Accuracy (MAE)', value: `±${num(metrics.MAE, 3)} kWh`, sub: `R² Variance Explained: ${(metrics.R2 * 100).toFixed(1)}%`, icon: Timer, tone: 'text-warn' },
        ].map((stat) => (
          <Card key={stat.label} className="card-pad">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-fg-subtle">{stat.label}</p>
            <p className="mt-2 flex items-center gap-2">
              <stat.icon className={`size-4 shrink-0 ${stat.tone}`} strokeWidth={2.2} aria-hidden="true" />
              <span className="stat-value truncate text-[1.1rem] font-bold">{stat.value}</span>
            </p>
            <p className="mt-1.5 truncate text-[0.75rem] text-fg-subtle">{stat.sub}</p>
          </Card>
        ))}
      </div>

      {/* Tab Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented options={tabs} value={tab} onChange={setTab} size="sm" ariaLabel="Model lab sections" />
        <span className="font-mono text-[0.72rem] text-fg-subtle">API: {API_BASE}</span>
      </div>

      {/* TAB 1: ALL 5 MACHINE LEARNING MODELS WITH EXPLICIT VALUES & GRAPHS */}
      {tab === 'models' && (
        <div className="space-y-6">
          <div className="grid gap-6">
            {ALL_MODELS_DATA.map((m) => (
              <Card key={m.id} className="card-pad border-line hover:border-brand/40 transition-colors">
                {/* Header & Status */}
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <h3 className="text-[1.05rem] font-bold text-fg">{m.name}</h3>
                      <Badge tone={m.id === 'rf' ? 'brand' : m.id === 'pyspark' ? 'info' : 'muted'}>
                        {m.type}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-[0.78rem] text-fg-subtle font-medium">{m.role}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={m.id === 'rf' ? 'brand' : 'muted'} icon={CheckCircle2}>
                      {m.status}
                    </Badge>
                    <span className="text-[0.72rem] font-mono text-fg-subtle">Fit Time: {m.fitTime}</span>
                  </div>
                </div>

                <p className="mt-3 text-[0.83rem] leading-relaxed text-fg-muted">{m.blurb}</p>

                {/* Explicit Metrics Row */}
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 bg-surface-2 p-3.5 rounded-xl border border-line">
                  {m.metrics.map((metric) => (
                    <div key={metric.label}>
                      <p className="text-[0.68rem] font-semibold uppercase tracking-wider text-fg-subtle">{metric.label}</p>
                      <p className={`stat-value mt-1 text-[1.15rem] font-bold ${metric.tone}`}>{metric.value}</p>
                      <p className="text-[0.72rem] text-fg-subtle mt-0.5">{metric.sub}</p>
                    </div>
                  ))}
                </div>

                {/* Model Specific Visual Graph Representation */}
                <div className="mt-4 pt-3 border-t border-line">
                  <p className="text-[0.78rem] font-semibold text-fg-muted mb-3 flex items-center gap-1.5">
                    <BarChart3 className="size-4 text-brand" />
                    Model Performance Visualization & Behavior Graph
                  </p>

                  {/* Graph 1: Random Forest & XGBoost Forecasting Comparison */}
                  {(m.id === 'rf' || m.id === 'xgb') && (
                    <div className="h-44 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={regressorChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                          <YAxis label={{ value: 'MAE (kWh)', angle: -90, position: 'insideLeft', style: { fill: 'var(--fg-muted)', fontSize: '10px' } }} tick={{ fontSize: 10 }} />
                          <RechartsTooltip contentStyle={{ backgroundColor: 'var(--surface-1)', borderColor: 'var(--border)', borderRadius: '8px' }} />
                          <Bar dataKey="MAE" name="MAE Error (Lower is Better)" fill={m.id === 'rf' ? '#10b981' : '#f59e0b'} radius={[4, 4, 0, 0]} />
                          <Bar dataKey="RMSE" name="RMSE Error" fill="#6366f1" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* Graph 2: Isolation Forest Anomaly Detection Score Chart */}
                  {m.id === 'if' && (
                    <div className="space-y-2">
                      <div className="h-44 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={ISOLATION_FOREST_SAMPLE_DATA} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                            <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                            <YAxis label={{ value: 'Daily kWh', angle: -90, position: 'insideLeft', style: { fill: 'var(--fg-muted)', fontSize: '10px' } }} tick={{ fontSize: 10 }} />
                            <RechartsTooltip />
                            <ReferenceLine y={45} label="Anomaly Threshold (>45 kWh)" stroke="#ef4444" strokeDasharray="3 3" />
                            <Bar dataKey="kwh" name="Daily kWh Consumption">
                              {ISOLATION_FOREST_SAMPLE_DATA.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.isAnomaly ? '#ef4444' : '#10b981'} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <p className="text-[0.72rem] text-fg-subtle text-center">
                        🔴 Red bars indicate days flagged by Isolation Forest (Anomaly Score &lt; 0.0) due to severe consumption spikes or uncharacteristic drops.
                      </p>
                    </div>
                  )}

                  {/* Graph 3: K-Means Usage Pattern Clustering Graph */}
                  {m.id === 'kmeans' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                      <div className="h-44 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={clusterChartData}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              outerRadius={65}
                              innerRadius={35}
                              paddingAngle={4}
                            >
                              {clusterChartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.fill} />
                              ))}
                            </Pie>
                            <RechartsTooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="space-y-2">
                        {clusterChartData.map((c) => (
                          <div key={c.name} className="flex items-center justify-between p-2.5 rounded-lg border border-line bg-surface-2 text-[0.8rem]">
                            <span className="font-semibold flex items-center gap-2">
                              <span className="size-2.5 rounded-full" style={{ backgroundColor: c.fill }} />
                              {c.name}
                            </span>
                            <span className="font-bold text-fg">{c.value} days</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Graph 4: PySpark Big Data Benchmark Comparison Graph */}
                  {m.id === 'pyspark' && (
                    <div className="h-44 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={[
                            { mode: 'PySpark Distributed (2M+ records)', MAE: 0.347, RMSE: 0.495, R2: 59.9 },
                            { mode: 'Single-Node Random Forest', MAE: 4.003, RMSE: 5.523, R2: 45.8 },
                            { mode: 'Single-Node XGBoost', MAE: 4.133, RMSE: 5.771, R2: 40.9 },
                          ]}
                          margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                          <XAxis dataKey="mode" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <RechartsTooltip />
                          <Bar dataKey="MAE" name="MAE Error (Lower is Better)" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="R2" name="Variance Explained R% (Higher is Better)" fill="#10b981" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: MODEL PERFORMANCE VISUAL COMPARISON */}
      {tab === 'comparison' && (
        <div className="space-y-6">
          <Card className="card-pad">
            <h2 className="text-[1rem] font-bold flex items-center gap-2 mb-2">
              <BarChart3 className="size-5 text-brand" />
              Side-by-Side Model Error Rate Comparison (MAE & RMSE)
            </h2>
            <p className="text-[0.8rem] text-fg-muted mb-4">
              Comparison of Mean Absolute Error (MAE) and Root Mean Squared Error (RMSE) across all evaluated forecasting models.
            </p>

            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={regressorChartData} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis label={{ value: 'Error (kWh)', angle: -90, position: 'insideLeft', style: { fill: 'var(--fg-muted)' } }} tick={{ fontSize: 11 }} />
                  <RechartsTooltip contentStyle={{ backgroundColor: 'var(--surface-1)', borderColor: 'var(--border)', borderRadius: '8px' }} />
                  <Bar dataKey="MAE" name="MAE (Lower is Better)" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="RMSE" name="RMSE (Penalty Error)" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 3: 26 ENGINEERED FEATURES */}
      {tab === 'features' && (
        <div className="space-y-4">
          <ChartFrame
            title="Feature Importance Ranking (Permutation Importance)"
            subtitle="The 26 engineered temporal features ranked by their impact on model prediction."
            icon={Boxes}
            height={340}
            isEmpty={!importance.length}
            emptyTitle="Importance data populating"
            emptyDescription="Feature importance is calculated directly from /model-analytics."
          >
            <FeatureImportanceChart rows={importance} height={340} topN={12} />
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
        </div>
      )}

      {/* TAB 4: PIPELINE ARCHITECTURE */}
      {tab === 'pipeline' && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {PIPELINE.map((step, index) => (
              <Card key={step.title} className="card-pad">
                <div className="flex items-center gap-2.5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-surface-2">
                    <step.icon className="size-4 text-brand" strokeWidth={2.2} />
                  </span>
                  <div>
                    <h3 className="text-[0.92rem] font-bold">{step.title}</h3>
                  </div>
                </div>
                <p className="mt-3 text-[0.8rem] leading-relaxed text-fg-muted">{step.body}</p>
              </Card>
            ))}
          </div>

          <Card className="card-pad">
            <h2 className="flex items-center gap-2 text-[0.98rem] font-semibold mb-3">
              <GitBranch className="size-4 text-brand" />
              FastAPI Endpoints Contract
            </h2>
            <pre className="min-w-max rounded-xl border border-line bg-surface-2 p-4 font-mono text-[0.72rem] leading-relaxed text-fg-muted overflow-x-auto">
{`GET  /health              → FastAPI health status & deployed model type
GET  /model-info          → Model hyperparameters, split details, MAE/RMSE metrics
GET  /model-analytics     → Feature importances, XGBoost comparison, K-Means clusters
GET  /anomalies           → Isolation Forest waste detection records with rolling statistics
POST /predict             → 30-day daily kWh input → Predicted next-day kWh + error bounds
POST /predict-horizon     → Multi-step daily forecast up to 30 days ahead
POST /predict-bill        → Electricity tariff multiplier + fixed charge → Cost projection`}
            </pre>
          </Card>
        </div>
      )}
    </div>
  )
}
