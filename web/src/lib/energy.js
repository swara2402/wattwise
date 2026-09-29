/**
 * Energy domain maths + derived selectors.
 * Every number the UI shows about consumption, cost, savings or anomalies
 * is produced here so the formulas stay auditable and unit-consistent.
 *
 * Billing arithmetic lives in `./billing` and is re-exported below, because it
 * mirrors `WattWise-AI/src/billing.py` and needs to stay importable without
 * the rest of the app graph so `scripts/check-billing.mjs` can verify it.
 */

import { toISODate, addDays } from './format'
import { DEFAULT_GRID_EMISSION_FACTOR } from './constants'

export {
  computeBill,
  roundHalfUp,
  DEFAULT_BILLING_DAYS,
  MAX_BILLING_DAYS,
  BILLING_FORMULA,
} from './billing'

export const HOURS_PER_MONTH = 30

/** kWh consumed by one appliance in a month. */
export function applianceMonthlyKwh(appliance, { proposed = false } = {}) {
  const hours = proposed ? appliance.proposedDailyHours : appliance.currentDailyHours
  const dailyKwh = (appliance.powerWatts * appliance.quantity * hours) / 1000
  return dailyKwh * appliance.daysPerMonth
}

/** kWh saved by moving one appliance from its current to its proposed hours. */
export function applianceSavingsKwh(appliance) {
  return Math.max(0, applianceMonthlyKwh(appliance) - applianceMonthlyKwh(appliance, { proposed: true }))
}

/**
 * Roll a household of appliances into current vs proposed totals.
 * `emissionFactor` is a configurable grid assumption in kg CO2 per kWh, not
 * a measured value; the UI labels it as such wherever it is displayed.
 */
export function simulateHousehold(appliances, tariffPerKwh, emissionFactor = DEFAULT_GRID_EMISSION_FACTOR) {
  const rows = appliances.map((appliance) => {
    const currentKwh = applianceMonthlyKwh(appliance)
    const proposedKwh = applianceMonthlyKwh(appliance, { proposed: true })
    const currentCost = currentKwh * tariffPerKwh
    const proposedCost = proposedKwh * tariffPerKwh
    return {
      ...appliance,
      currentKwh,
      proposedKwh,
      currentCost,
      proposedCost,
      savedKwh: currentKwh - proposedKwh,
      savedCost: currentCost - proposedCost,
    }
  })

  const currentKwh = rows.reduce((s, r) => s + r.currentKwh, 0)
  const proposedKwh = rows.reduce((s, r) => s + r.proposedKwh, 0)
  const currentCost = currentKwh * tariffPerKwh
  const proposedCost = proposedKwh * tariffPerKwh
  const savedCost = Math.max(0, currentCost - proposedCost)
  const savedKwh = Math.max(0, currentKwh - proposedKwh)
  const reductionPct = currentKwh > 0 ? Math.max(0, (savedKwh / currentKwh) * 100) : 0
  const factor = Number.isFinite(emissionFactor) ? emissionFactor : DEFAULT_GRID_EMISSION_FACTOR

  const ranked = [...rows].filter((r) => r.savedCost > 0.5).sort((a, b) => b.savedCost - a.savedCost)

  return {
    rows,
    ranked,
    currentKwh,
    proposedKwh,
    currentCost,
    proposedCost,
    savedCost,
    annualSavedCost: savedCost * 12,
    savedKwh,
    reductionPct,
    emissionFactor: factor,
    co2SavedKg: savedKwh * factor,
    currentCo2Kg: currentKwh * factor,
  }
}

export const mean = (values) => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0)

export const sum = (values) => values.reduce((s, v) => s + v, 0)

export function stdDev(values) {
  if (values.length < 2) return 0
  const m = mean(values)
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1))
}

export function percentChange(current, previous) {
  if (!previous) return 0
  return ((current - previous) / previous) * 100
}

/**
 * Summarise a chronological list of { date, energy_kwh } into the window
 * statistics the dashboard needs (current half vs previous half comparison).
 */
export function summariseWindow(series) {
  const values = series.map((p) => p.energy_kwh)
  const total = sum(values)
  const peak = series.reduce((best, p) => (p.energy_kwh > (best?.energy_kwh ?? -Infinity) ? p : best), null)
  const low = series.reduce((best, p) => (p.energy_kwh < (best?.energy_kwh ?? Infinity) ? p : best), null)
  return {
    count: values.length,
    total,
    average: mean(values),
    stdDev: stdDev(values),
    peak,
    low,
    start: series[0]?.date ?? null,
    end: series[series.length - 1]?.date ?? null,
  }
}

/** Compare the trailing `days` against the `days` before that. */
export function compareWindows(series, days) {
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date))
  const current = sorted.slice(-days)
  const previous = sorted.slice(-days * 2, -days)
  const currentStats = summariseWindow(current)
  const previousStats = summariseWindow(previous)
  return {
    current,
    previous,
    currentStats,
    previousStats,
    changePct: percentChange(currentStats.total, previousStats.total),
  }
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function averageByWeekday(series) {
  const buckets = WEEKDAYS.map((label) => ({ label, values: [] }))
  for (const point of series) {
    const day = new Date(`${point.date}T00:00:00`).getDay()
    buckets[day].values.push(point.energy_kwh)
  }
  return buckets.map((b) => ({
    label: b.label,
    average: b.values.length ? mean(b.values) : 0,
    total: sum(b.values),
    days: b.values.length,
  }))
}

export function monthBuckets(series) {
  const buckets = new Map()
  for (const point of series) {
    const key = point.date.slice(0, 7)
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push(point.energy_kwh)
  }
  return [...buckets.entries()]
    .map(([month, values]) => ({
      month,
      label: new Date(`${month}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
      total: sum(values),
      average: mean(values),
      days: values.length,
    }))
    .sort((a, b) => a.month.localeCompare(b.month))
}

/** Moving average — used to draw the "expected band" behind actuals. */
export function movingAverage(series, window = 7) {
  return series.map((point, index) => {
    const slice = series.slice(Math.max(0, index - window + 1), index + 1).map((p) => p.energy_kwh)
    return { date: point.date, energy_kwh: mean(slice) }
  })
}

export function histogram(values, binCount = 12) {
  if (!values.length) return []
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const width = span / binCount
  const bins = Array.from({ length: binCount }, (_, i) => ({
    label: `${(min + i * width).toFixed(0)}`,
    from: min + i * width,
    to: min + (i + 1) * width,
    count: 0,
  }))
  for (const v of values) {
    const idx = Math.min(binCount - 1, Math.floor((v - min) / width))
    bins[idx].count += 1
  }
  return bins
}

/* ------------------------------------------------------------------
   Anomaly enrichment — turns raw Isolation Forest output into an
   explained, severity-ranked incident the user can act on.
   ------------------------------------------------------------------ */

const SEVERITY_RANK = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }

export const SEVERITY_TONE = {
  CRITICAL: 'danger',
  HIGH: 'warn',
  MEDIUM: 'info',
  LOW: 'brand',
}

const CAUSE_LIBRARY = [
  { maxPct: 40, category: 'Base Load Drift', cause: 'Sustained standby or base-load creep above the rolling window.' },
  { maxPct: 120, category: 'Thermal Duty Cycle', cause: 'Cooling or heating equipment running longer than the recent baseline.' },
  { maxPct: 300, category: 'Multi-Appliance Surge', cause: 'Several heavy loads ran concurrently, pushing the day well past its 7-day average.' },
  { maxPct: Infinity, category: 'Extreme Outlier', cause: 'Consumption was far outside recent norms. Possible contributing factors could include an extended appliance cycle, an unattended load, or an unusual occupancy pattern. Verify against meter readings before drawing conclusions.' },
]

function classifySeverity(score, pct) {
  if (score > -0.03 || pct > 100) return 'CRITICAL'
  if (score > -0.015 || pct > 50) return 'HIGH'
  if (pct < -40) return 'LOW'
  return 'MEDIUM'
}

export function enrichAnomalies(rows = []) {
  return rows
    .map((row, index) => {
      const observed = row.energy_kwh
      const expected = row.rolling_mean_7
      const diff = observed - expected
      const pct = expected > 0 ? (diff / expected) * 100 : 0
      const severity = classifySeverity(row.anomaly_score, pct)
      const magnitude = Math.abs(pct)
      const bucket =
        (CAUSE_LIBRARY.find((c) => magnitude <= c.maxPct) ?? CAUSE_LIBRARY.at(-1)) || CAUSE_LIBRARY[0]
      const zScore = row.rolling_std_7 > 0 ? diff / row.rolling_std_7 : 0

      return {
        id: `${row.date}-${index}`,
        date: row.date,
        observed,
        expected,
        deviationKwh: diff,
        deviationPct: pct,
        score: row.anomaly_score,
        zScore,
        severity,
        category: pct < 0 ? 'Low Usage / Absence' : bucket.category,
        headline:
          pct >= 0
            ? `Consumption ran ${magnitude.toFixed(0)}% above the 7-day baseline`
            : `Consumption fell ${magnitude.toFixed(0)}% below the 7-day baseline`,
        cause:
          pct >= 0
            ? `${observed.toFixed(1)} kWh against a 7-day moving average of ${expected.toFixed(1)} kWh (${diff >= 0 ? '+' : ''}${diff.toFixed(1)} kWh, ${zScore >= 0 ? '+' : ''}${zScore.toFixed(1)}σ). Possible cause: ${bucket.cause}`
            : `${observed.toFixed(1)} kWh against a 7-day moving average of ${expected.toFixed(1)} kWh. Possible explanation: Extended vacancy, a power interruption or a thermostat shut-down are common scenarios.`,
        action:
          pct >= 0
            ? 'Open the sub-circuit for the day, identify the highest-wattage device, and re-run this window with a shorter duty cycle.'
            : 'Confirm the meter read and check that always-on loads (fridge, router, geyser pilot) are behaving normally.',
        excessKwh: Math.max(0, diff),
      }
    })
    .sort((a, b) => {
      const rank = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
      if (rank !== 0) return rank
      return Math.abs(b.deviationPct) - Math.abs(a.deviationPct)
    })
}

export function anomalySummary(anomalies = [], tariff = 0) {
  const bySeverity = (level) => anomalies.filter((a) => a.severity === level).length
  const excessKwh = sum(anomalies.map((a) => a.excessKwh))
  return {
    total: anomalies.length,
    critical: bySeverity('CRITICAL'),
    high: bySeverity('HIGH'),
    medium: bySeverity('MEDIUM'),
    low: bySeverity('LOW'),
    excessKwh,
    excessCost: excessKwh * tariff,
    mostSevere: anomalies[0] ?? null,
  }
}

/** Typical test error band from the model's held-out MAE. */
export function predictionBand(predictedKwh, mae, rmse) {
  const low = Math.max(0, predictedKwh - mae)
  const high = predictedKwh + mae
  return {
    low,
    high,
    mae,
    rmse,
    lowBill: null,
    width: high - low,
    label: `±${mae.toFixed(2)} kWh (test MAE)`,
    rmseLabel: `±${rmse.toFixed(2)} kWh RMSE`,
  }
}

export const nextDayIso = (lastDate) => toISODate(addDays(lastDate, 1))

/* ------------------------------------------------------------------
   Advisor — recommendations are priced with the *user's* tariff so the
   numbers stay truthful when the tariff changes.
   ------------------------------------------------------------------ */

export function priceRecommendations(recommendations, tariff) {
  return recommendations
    .map((rec) => {
      const kwh = rec.monthlySavingsKwh
      return { ...rec, monthlySavings: kwh * tariff, annualSavings: kwh * tariff * 12 }
    })
    .sort((a, b) => b.monthlySavings - a.monthlySavings)
}

export const IMPACT_SCORE = { High: 3, Medium: 2, Low: 1 }
export const DIFFICULTY_SCORE = { 'Very Easy': 1, Easy: 2, Medium: 3, Hard: 4 }