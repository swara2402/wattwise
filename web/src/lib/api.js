/**
 * Typed helpers around the WattWise FastAPI backend.
 * Every call is abortable, time-boxed, and normalises FastAPI error payloads
 * into human-readable messages the UI can show verbatim.
 */

/**
 * Resolve the backend origin.
 *
 * In a production build the backend URL must be supplied explicitly. Silently
 * falling back to localhost would make the deployed app appear broken in a way
 * that is very hard to debug from the UI, so we fail loudly at module load
 * instead. Development keeps the localhost default for convenience.
 */
function resolveApiBase() {
  const configured = import.meta.env.VITE_API_URL?.trim()
  if (configured) return configured.replace(/\/$/, '')
  if (import.meta.env.DEV) return 'http://127.0.0.1:8000'
  throw new Error(
    'VITE_API_URL is not set. Copy web/.env.example to web/.env.local and point it at your ' +
      'deployed FastAPI origin, e.g. https://wattwise-api.onrender.com',
  )
}

export const API_BASE = resolveApiBase()

export class ApiError extends Error {
  constructor(message, { status = 0, offline = false } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.offline = offline
  }
}

function extractDetail(payload, fallback) {
  const detail = payload?.detail
  if (!detail) return fallback
  if (Array.isArray(detail)) {
    return detail
      .map((d) => (typeof d === 'string' ? d : d?.msg || JSON.stringify(d)))
      .filter(Boolean)
      .join(', ') || fallback
  }
  return String(detail)
}

async function request(path, { method = 'GET', body, timeout = 12000, signal } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error('timeout')), timeout)
  const onAbort = () => controller.abort(signal?.reason)
  signal?.addEventListener('abort', onAbort)

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      // `body` is omitted entirely for GET/HEAD — passing an explicit undefined
      // body is rejected by some runtimes.
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    })

    const isJson = (response.headers.get('content-type') || '').includes('application/json')
    const payload = isJson ? await response.json().catch(() => null) : null

    if (!response.ok) {
      throw new ApiError(extractDetail(payload, `Request failed with status ${response.status}`), {
        status: response.status,
      })
    }
    return payload
  } catch (error) {
    if (error instanceof ApiError) throw error
    const aborted = error?.name === 'AbortError' || controller.signal.aborted
    if (aborted && !signal?.aborted) {
      throw new ApiError('The backend did not respond in time.', { offline: true })
    }
    if (signal?.aborted) throw error
    throw new ApiError(
      `Cannot reach the WattWise backend at ${API_BASE}. Start it with \`uvicorn src.api:app\`.`,
      { offline: true },
    )
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

const asArray = (rows) => (Array.isArray(rows) ? rows : [])

export const api = {
  baseUrl: API_BASE,

  health: (signal) => request('/health', { timeout: 4000, signal }),

  modelInfo: (signal) => request('/model-info', { signal }),

  modelAnalytics: (signal) => request('/model-analytics', { signal }),

  datasetInfo: (signal) => request('/dataset-info', { signal }),

  /**
   * Recorded daily consumption.
   *
   * Without `before` this returns the most recent `limit` days. With it, the
   * window ends the day before that date — which is the context a prediction
   * for that date needs. Presets use this so no consumption values are ever
   * hard-coded in the frontend.
   */
  historical: (limit = 60, before = null, signal) => {
    const query = new URLSearchParams({ limit: String(limit) })
    if (before) query.set('before', before)
    return request(`/historical-data?${query.toString()}`, { signal }).then((d) => ({
      count: d?.count ?? 0,
      data: asArray(d?.data).map((row) => ({
        date: row.date,
        energy_kwh: Number(row.energy_kwh),
      })),
      dataset_start: d?.dataset_start ?? null,
      dataset_end: d?.dataset_end ?? null,
    }))
  },

  anomalies: (signal) =>
    request('/anomalies', { signal }).then((d) => ({
      count: d?.count ?? 0,
      anomalies: asArray(d?.anomalies).map((row) => ({
        date: row.date,
        energy_kwh: Number(row.energy_kwh),
        rolling_mean_7: Number(row.rolling_mean_7),
        rolling_std_7: Number(row.rolling_std_7),
        anomaly_score: Number(row.anomaly_score),
      })),
    })),

  predict: (consumption, targetDate, signal) =>
    request('/predict', {
      method: 'POST',
      body: { consumption, target_date: targetDate },
      signal,
    }),

  /**
   * Price a forecast. `days` is the billing period length and the fixed
   * charge is added once per period, not per day. The backend is the
   * authority on the arithmetic; the response is normalised to the shape the
   * UI renders, and the deprecated `monthly_units` field is dropped.
   */
  predictBill: (predictedKwh, tariffPerKwh, { days = 30, fixedChargePerPeriod = 0 } = {}, signal) =>
    request('/predict-bill', {
      method: 'POST',
      body: {
        predicted_kwh: predictedKwh,
        tariff_per_kwh: tariffPerKwh,
        days,
        fixed_charge_per_period: fixedChargePerPeriod,
      },
      signal,
    }).then((d) => ({
      bill: Number(d?.estimated_bill),
      energyCharge: Number(d?.energy_charge),
      fixedCharge: Number(d?.fixed_charge),
      consumptionKwh: Number(d?.consumption_kwh),
      days: Number(d?.days),
      tariffPerKwh: Number(d?.tariff_per_kwh),
      period: d?.period ?? `${d?.days}-day`,
    })),
}
