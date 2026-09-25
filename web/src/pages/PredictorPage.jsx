import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BrainCircuit, Dices, Info, Loader2, RefreshCw, Sparkles, Target, TriangleAlert } from 'lucide-react'
import { Card, PageHeader } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { NumberInput, TextInput } from '../components/ui/Field'
import { ErrorState } from '../components/ui/States'
import { UsageBarChart } from '../components/charts/PredictorChart'
import { useApp } from '../context/AppContext'
import { useHistorical, useModelInfo } from '../hooks/useEnergyData'
import { api } from '../lib/api'
import { predictionBand } from '../lib/energy'
import { PREDICTOR_PRESETS, STORAGE_KEYS } from '../lib/constants'
import { formatDate, kwh as fmtKwh, money, num, toISODate, addDays } from '../lib/format'
import { usePersistentState } from '../lib/storage'
import { useDebouncedValue } from '../hooks/useUi'

const DAY_COUNT = 30

const clampDay = (value) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return Math.min(200, parsed)
}

const round3 = (v) => Math.round(v * 1000) / 1000

export function PredictorPage() {
  const { tariff, fixedCharges, health, toast, settings } = useApp()
  const history = useHistorical(DAY_COUNT)
  const modelInfo = useModelInfo()

  const [values, setValues] = usePersistentState(STORAGE_KEYS.predictor, {
    days: [],
    targetDate: '',
    preset: 'benchmark',
  })
  const [tariffOverride, setTariffOverride] = useState(null)
  const [result, setResult] = useState(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState(null)
  const [runHistory, setRunHistory] = useState([])
  const [activeIndex, setActiveIndex] = useState(DAY_COUNT - 1)
  const [resolving, setResolving] = useState(false)
  const gridRef = useRef(null)

  // Derived rather than mirrored in state: changing the household tariff in
  // Settings immediately re-prices the forecast without an effect round-trip.
  const localTariff = tariffOverride ?? tariff
  const localFixed = Number(fixedCharges) || 0
  const billDays = Number(result?.billDays ?? settings.billingDays) || 30

  const days = values.days?.length === DAY_COUNT ? values.days : []
  const split = modelInfo.data?.split
  const testSplit = split?.boundaries?.test
  const testStartDate = testSplit?.start_date ?? null
  const datasetStart = modelInfo.data?.dataset?.start_date ?? null
  const datasetEnd = modelInfo.data?.dataset?.end_date ?? null
  const targetDate = values.targetDate || ''
  
  // Benchmark 30-day window from the held-out test split
  const BENCHMARK_30_DAY = testSplit?.values ?? Array(30).fill('')

  const debouncedValues = useDebouncedValue(days, 250)

  const invalidIndex = useMemo(
    () => days.findIndex((value) => value == null || !Number.isFinite(Number(value)) || Number(value) < 0),
    [days],
  )

  const stats = useMemo(() => {
    const valid = debouncedValues.filter((v) => Number.isFinite(Number(v)))
    if (!valid.length) return { average: 0, max: 0, min: 0, total: 0 }
    const numbers = valid.map(Number)
    return {
      average: numbers.reduce((s, v) => s + v, 0) / numbers.length,
      max: Math.max(...numbers),
      min: Math.min(...numbers),
      total: numbers.reduce((s, v) => s + v, 0),
    }
  }, [debouncedValues])

  const setDay = (index, value) => {
    setValues((prev) => {
      const next = [...(prev.days ?? BENCHMARK_30_DAY)]
      next[index] = value === '' ? '' : Number(value)
      return { ...prev, days: next }
    })
  }

  const setAllDays = (raw) => {
    const parsed = raw
      .split(/[\s,;]+/)
      .map((token) => Number(token))
      .filter((n) => Number.isFinite(n))
    if (parsed.length !== DAY_COUNT) {
      toast({
        title: 'Need exactly 30 values',
        description: `You pasted ${parsed.length}. Separate with commas, spaces or new lines.`,
        tone: 'warn',
      })
      return
    }
    setValues((prev) => ({ ...prev, days: parsed.map((v) => Number(v.toFixed(3))) }))
    toast({ title: '30 values applied', description: 'The grid now uses your pasted series.' })
  }

  /**
   * Resolve a declarative preset against the live API.
   *
   * `PREDICTOR_PRESETS` names a window rather than listing values, so the
   * numbers on screen are always the dataset's own. This is what keeps the
   * presets from drifting out of sync with the data and the split.
   */
  const resolvePreset = useCallback(
    async (preset) => {
      setResolving(true)
      setError(null)
      try {
        const before = preset.source === 'testSplit' ? testStartDate : null
        if (preset.source === 'testSplit' && !before) {
          throw new Error(
            'The held-out test window is unknown because /model-info has not loaded. Start the backend and retry.',
          )
        }
        const window = await api.historical(DAY_COUNT, before)
        const rows = window.data ?? []
        if (rows.length < DAY_COUNT) {
          throw new Error(
            `The backend returned ${rows.length} of the ${DAY_COUNT} days needed. Try "Latest recorded history".`,
          )
        }
        const scale = preset.scale ?? 1
        const days_ = rows.map((row) => round3(row.energy_kwh * scale))
        const target = toISODate(addDays(rows.at(-1).date, 1 + (preset.dateOffsetDays ?? 0)))
        setValues((prev) => ({ ...prev, days: days_, targetDate: target, preset: preset.id }))
        return true
      } catch (err) {
        setError(err.message)
        return false
      } finally {
        setResolving(false)
      }
    },
    [setValues, testStartDate],
  )

  // On first load there is no stored series, so populate the default window
  // from the API rather than showing 30 empty boxes.
  useEffect(() => {
    if (days.length === DAY_COUNT) return
    if (history.status === 'success' && testStartDate) {
      resolvePreset(PREDICTOR_PRESETS[0])
    }
    // Only re-run while we have no usable series.
  }, [days.length, history.status, testStartDate, resolvePreset])

  const randomise = () => {
    const next = days.map((value) =>
      Math.max(1, Number((Number(value || 25) + (Math.random() - 0.5) * 4).toFixed(3))),
    )
    setValues((prev) => ({ ...prev, days: next }))
    toast({ title: 'Series varied', description: 'Values jittered around your current profile.' })
  }

  const resetDays = () => {
    resolvePreset(PREDICTOR_PRESETS[0]).then((ok) => {
      if (ok) toast({ title: 'Held-out test window restored', tone: 'info' })
    })
  }

  const runPrediction = async () => {
    const payload = days.map((value) => Number(value))
    if (payload.length !== DAY_COUNT || payload.some((v) => !Number.isFinite(v) || v < 0)) {
      setError('All 30 days must be finite, non-negative numbers.')
      return
    }
    if (!targetDate) {
      setError('Pick a target date for the prediction.')
      return
    }
    if (!Number.isFinite(Number(localTariff)) || Number(localTariff) <= 0) {
      setError('Tariff must be greater than zero.')
      return
    }

    setRunning(true)
    setError(null)
    try {
      const prediction = await api.predict(payload, targetDate)
      const predictedKwh = Number(prediction.predicted_kwh)
      // The forecast is for one day, but a bill covers a period. The fixed
      // charge is added once per period, so it is passed through rather than
      // multiplied by the day count.
      const bill = await api.predictBill(predictedKwh, Number(localTariff), {
        days: billDays,
        fixedChargePerPeriod: localFixed,
      })
      const band = predictionBand(
        predictedKwh,
        modelInfo.data?.test_mae_kwh ?? 4.0028,
        modelInfo.data?.test_rmse_kwh ?? 5.5234,
      )
      const outcome = {
        predictedKwh,
        bill: bill.bill,
        periodKwh: bill.consumptionKwh,
        energyCharge: bill.energyCharge,
        fixedCharge: bill.fixedCharge,
        billDays: bill.days,
        targetDate,
        tariff: Number(localTariff),
        model: prediction.model ?? 'Random Forest V2',
        band,
        at: new Date().toISOString(),
        offline: false,
      }
      setResult(outcome)
      setRunHistory((prev) => [outcome, ...prev].slice(0, 4))
      toast({
        title: `Forecast ready — ${fmtKwh(predictedKwh, 2)}`,
        description: `Estimated ${money(outcome.bill)} for the ${bill.days}-day period.`,
      })
    } catch (err) {
      if (err?.offline || !health.online) {
        const predictedKwh = Number((stats.average * 0.95).toFixed(3))
        const periodKwh = Number((predictedKwh * billDays).toFixed(3))
        const outcome = {
          predictedKwh,
          bill: Number((periodKwh * Number(localTariff) + localFixed).toFixed(2)),
          periodKwh,
          energyCharge: Number((periodKwh * Number(localTariff)).toFixed(2)),
          fixedCharge: localFixed,
          billDays,
          targetDate,
          tariff: Number(localTariff),
          model: 'Local mean estimate',
          band: { label: 'no model band (offline)' },
          at: new Date().toISOString(),
          offline: true,
        }
        setResult(outcome)
        setError(
          'The ML backend is offline, so this is a local mean estimate (30-day average × 0.95) — not model output. Start the FastAPI service for a real forecast.',
        )
      } else {
        setError(err.message)
      }
    } finally {
      setRunning(false)
    }
  }

  const chartData = useMemo(
    () =>
      days.map((value, index) => ({
        label: `D${index + 1}`,
        day: Number(value) || 0,
        baseline: stats.average,
        highlight: index === activeIndex,
      })),
    [days, stats.average, activeIndex],
  )

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Forecasting"
        title="Bill Predictor"
        subtitle="Thirty days of real usage in, a Random Forest estimate out — with the model's own error bar attached."
        action={
          <Badge tone={health.online ? 'brand' : 'warn'} className="normal-case">
            <span className={`size-1.5 rounded-full ${health.online ? 'bg-brand' : 'bg-warn'}`} aria-hidden="true" />
            {health.online ? 'POST /predict connected' : 'Backend offline'}
          </Badge>
        }
      />

      {/* ── Result hero ─────────────────────────────── */}
      <Card className="card-pad relative overflow-hidden">
        <div
          className="pointer-events-none absolute -left-20 -top-24 size-72 rounded-full bg-brand/15 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-fg-subtle">
              Predicted day · {formatDate(result?.targetDate ?? targetDate)}
            </p>
            <p className="stat-value mt-2 text-[2.5rem] leading-none text-brand sm:text-[3rem]">
              {result ? fmtKwh(result.predictedKwh, 2).replace(' kWh', '') : '—'}
              <span className="ml-1.5 text-[1.1rem] font-medium text-fg-muted">kWh</span>
            </p>
            <p className="mt-3 text-[0.85rem] text-fg-muted">
              Priced over {num(billDays, 0)} days at{' '}
              {money(Number(localTariff), true)}/kWh
            </p>

            {result && (
              <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[0.8rem]">
                <div className="flex gap-1.5">
                  <dt className="text-fg-subtle">Energy</dt>
                  <dd className="stat-value text-fg">{money(result.energyCharge, true)}</dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="text-fg-subtle">Fixed</dt>
                  <dd className="stat-value text-fg">{money(result.fixedCharge, true)}</dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="text-fg-subtle">Total</dt>
                  <dd className="stat-value text-fg">{money(result.bill, true)}</dd>
                </div>
              </dl>
            )}

            {result?.band?.low != null && (
              <div className="mt-4 max-w-md">
                <div className="flex items-center justify-between text-[0.72rem] text-fg-subtle">
                  <span className="stat-value">{result.band.low.toFixed(2)} kWh</span>
                  <span className="font-semibold text-fg-muted">expected range</span>
                  <span className="stat-value">{result.band.high.toFixed(2)} kWh</span>
                </div>
                <div className="relative mt-1.5 h-2 rounded-full bg-surface-2">
                  <span className="absolute inset-y-0 left-[12%] right-[12%] rounded-full bg-brand/30" />
                  <span
                    className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-brand"
                    style={{ left: '50%' }}
                  />
                </div>
                <p className="mt-1.5 text-[0.72rem] text-fg-subtle">
                  {result.band.label} · {result.band.rmseLabel}
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-col items-start gap-3 rounded-2xl border border-line bg-surface-2 p-4 lg:items-end">
            <div className="flex items-center gap-2 text-[0.75rem] font-semibold text-fg-muted">
              <BrainCircuit className="size-4 text-brand" strokeWidth={2.2} aria-hidden="true" />
              {result?.model ?? 'Random Forest V2'}
            </div>
            <div className="grid grid-cols-2 gap-4 text-right">
              <div>
                <p className="text-[0.68rem] uppercase tracking-wider text-fg-subtle">30-day avg</p>
                <p className="stat-value mt-0.5 text-[0.95rem]">{stats.average.toFixed(2)} kWh</p>
              </div>
              <div>
                <p className="text-[0.68rem] uppercase tracking-wider text-fg-subtle">Your max</p>
                <p className="stat-value mt-0.5 text-[0.95rem]">{stats.max.toFixed(2)} kWh</p>
              </div>
            </div>
            {result && (
              <Badge tone={result.offline ? 'warn' : 'brand'} className="normal-case">
                {result.offline ? 'Local estimate' : `vs input avg ${(result.predictedKwh / stats.average - 1).toFixed(1)}%`}
              </Badge>
            )}
          </div>
        </div>
      </Card>

      {error && <ErrorState error={error} onRetry={health.refetch} compact />}

      {/* ── Inputs ──────────────────────────────────── */}
      <Card className="card-pad">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[0.98rem] font-semibold">Prediction parameters</h2>
            <p className="mt-1 text-[0.8rem] text-fg-muted">
              The model needs exactly 30 consecutive daily kWh values, the day you want to predict, and your
              tariff.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" icon={Dices} onClick={randomise}>
              Vary
            </Button>
            <Button variant="ghost" size="sm" icon={RefreshCw} onClick={resetDays}>
              Reset
            </Button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {PREDICTOR_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => resolvePreset(preset)}
              title={preset.hint}
              aria-pressed={values.preset === preset.id}
              disabled={resolving}
              className="chip"
            >
              {preset.name}
            </button>
          ))}
          {resolving && (
            <span className="inline-flex items-center gap-1.5 text-[0.72rem] text-fg-subtle">
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              Loading real values from the dataset…
            </span>
          )}
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <TextInput
            label="Target date"
            type="date"
            value={targetDate}
            onChange={(e) => setValues((prev) => ({ ...prev, targetDate: e.target.value }))}
            hint="The day you want a forecast for."
          />
          <NumberInput
            label="Tariff rate"
            unit="₹/kWh"
            min={0.5}
            max={50}
            step={0.25}
            value={localTariff}
            placeholder={String(tariff)}
            onChange={(e) => setTariffOverride(e.target.value === '' ? null : Number(e.target.value))}
            hint={`Household default is ${money(tariff, true)}/kWh.`}
          />
        </div>

        {/* 30-day grid */}
        <div className="mt-6" ref={gridRef}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[0.72rem] font-semibold uppercase tracking-wider text-fg-subtle">
              30 daily consumption values (kWh)
            </p>
            <p className="text-[0.72rem] text-fg-subtle">
              Tip: paste a comma or space separated list into any box to fill all 30.
            </p>
          </div>

          <div
            className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6"
            onPaste={(event) => {
              const text = event.clipboardData.getData('text')
              if (/[\s,;]/.test(text.trim()) && text.trim().split(/[\s,;]+/).length > 3) {
                event.preventDefault()
                setAllDays(text)
              }
            }}
          >
            {days.map((value, index) => {
              const invalid = value === '' || !Number.isFinite(Number(value)) || Number(value) < 0
              return (
                <div key={index}>
                  <label className="mb-1 block text-center text-[0.65rem] font-semibold text-fg-subtle" htmlFor={`day-${index}`}>
                    D{index + 1}
                  </label>
                  <input
                    id={`day-${index}`}
                    type="number"
                    min={0}
                    max={200}
                    step={0.1}
                    inputMode="decimal"
                    value={value ?? ''}
                    onFocus={() => setActiveIndex(index)}
                    onChange={(event) => setDay(index, event.target.value)}
                    onBlur={() => {
                      const parsed = clampDay(value)
                      if (parsed == null) setDay(index, 0)
                    }}
                    className={`input tnum px-2 py-1.5 text-center text-[0.8rem] ${
                      invalid ? 'input-invalid' : activeIndex === index ? 'border-brand' : ''
                    }`}
                    aria-label={`Day ${index + 1} consumption in kWh`}
                    aria-invalid={invalid || undefined}
                  />
                </div>
              )
            })}
          </div>

          {invalidIndex >= 0 && (
            <p className="mt-2.5 flex items-center gap-1.5 text-[0.78rem] font-medium text-danger">
              <TriangleAlert className="size-3.5" strokeWidth={2.3} aria-hidden="true" />
              Day {invalidIndex + 1} needs a non-negative number.
            </p>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            size="lg"
            icon={Sparkles}
            onClick={runPrediction}
            loading={running}
            disabled={invalidIndex >= 0}
          >
            {running ? 'Running the model…' : 'Calculate ML prediction'}
          </Button>
          <p className="text-[0.75rem] text-fg-subtle">
            Sends <code className="rounded bg-surface-2 px-1 py-0.5 font-mono">POST /predict</code> then{' '}
            <code className="rounded bg-surface-2 px-1 py-0.5 font-mono">POST /predict-bill</code>
          </p>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <Card className="card-pad">
          <h2 className="text-[0.98rem] font-semibold">Your 30-day input profile</h2>
          <p className="mt-1 text-[0.8rem] text-fg-muted">
            The dashed line is the 30-day mean the model is most sensitive to. Hover or tap a bar to focus a
            day in the grid.
          </p>
          <div className="mt-4 h-56">
            <UsageBarChart data={chartData} prediction={result?.predictedKwh} />
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="card-pad">
            <h2 className="text-[0.98rem] font-semibold">Typical test error</h2>
            <p className="mt-1 text-[0.8rem] text-fg-muted">
              {testSplit ? (
                <>
                  Measured once on the held-out test split ({formatDate(testSplit.start_date)} –{' '}
                  {formatDate(testSplit.end_date)}, {num(testSplit.rows, 0)} days). Regression has no “accuracy %”.
                </>
              ) : (
                'Measured on the held-out test split. Regression has no “accuracy %”.'
              )}
            </p>
            <dl className="mt-4 space-y-3">
              {[
                {
                  key: 'MAE',
                  label: 'Mean Absolute Error',
                  value: modelInfo.data?.test_mae_kwh ?? 4.0028,
                  unit: 'kWh',
                  hint: 'Typical error magnitude per day',
                },
                {
                  key: 'RMSE',
                  label: 'Root Mean Square Error',
                  value: modelInfo.data?.test_rmse_kwh ?? 5.5234,
                  unit: 'kWh',
                  hint: 'Penalises large misses harder',
                },
                {
                  key: 'R2',
                  label: 'R² — variance explained',
                  value: modelInfo.data?.test_r2 ?? 0.4584,
                  unit: '',
                  hint: 'Against a mean-only baseline',
                },
              ].map((metric) => (
                <div key={metric.key} className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <dt className="text-[0.82rem] font-semibold">{metric.label}</dt>
                    <p className="text-[0.72rem] text-fg-subtle">{metric.hint}</p>
                  </div>
                  <dd className="stat-value shrink-0 text-[1rem] text-brand">
                    {num(metric.value, metric.key === 'R2' ? 4 : 4)}
                    <span className="ml-1 text-[0.75rem] text-fg-subtle">{metric.unit}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card className="card-pad flex items-start gap-3 bg-surface-2">
            <Info className="mt-0.5 size-4 shrink-0 text-info" strokeWidth={2.2} aria-hidden="true" />
            <p className="text-[0.78rem] leading-relaxed text-fg-muted">
              {datasetStart && datasetEnd ? (
                <>
                  Target dates must sit inside the dataset window ({formatDate(datasetStart)} –{' '}
                  {formatDate(datasetEnd)}) because the model reconstructs lagged and rolling features from the
                  historical series before your 30-day window. Requests outside that range are rejected.
                </>
              ) : (
                'Target dates must sit inside the dataset window, because the model reconstructs lagged and rolling features from the historical series before your 30-day window.'
              )}
            </p>
          </Card>

          {runHistory.length > 0 && (
            <Card className="card-pad">
              <h2 className="text-[0.98rem] font-semibold">Recent runs</h2>
              <ul className="mt-3 space-y-2">
                {runHistory.map((run, index) => (
                  <li key={run.at} className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2.5">
                    <span className="grid size-7 place-items-center rounded-lg bg-brand-soft text-[0.7rem] font-bold text-brand">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.82rem] font-semibold">
                        {fmtKwh(run.predictedKwh, 2)} · {money(run.bill)}
                      </p>
                      <p className="text-[0.7rem] text-fg-subtle">
                        {formatDate(run.targetDate)} · {run.model}
                      </p>
                    </div>
                    <Badge tone={run.offline ? 'warn' : 'brand'}>
                      {run.offline ? 'offline' : 'live'}
                    </Badge>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="card-pad flex items-start gap-3">
            <Target className="mt-0.5 size-4 shrink-0 text-accent" strokeWidth={2.2} aria-hidden="true" />
            <div className="text-[0.78rem] leading-relaxed text-fg-muted">
              <p className="font-semibold text-fg">Household default</p>
              <p className="mt-0.5">
                {settings.householdName} is modelled at {money(Number(localTariff), true)}/kWh with{' '}
                {money(localFixed, true)} of fixed charges added once per{' '}
                {num(billDays, 0)}-day period. Change it in Settings and every page
                re-prices instantly.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}