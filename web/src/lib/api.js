/**
 * Typed helpers around the WattWise FastAPI backend.
 * Every call is abortable, time-boxed, and normalises FastAPI error payloads
 * into human-readable messages the UI can show verbatim.
 */

export const API_BASE = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')

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

  historical: (limit = 60, signal) =>
    request(`/historical-data?limit=${limit}`, { signal }).then((d) => ({
      count: d?.count ?? 0,
      data: asArray(d?.data).map((row) => ({
        date: row.date,
        energy_kwh: Number(row.energy_kwh),
      })),
    })),

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

  predictBill: (predictedKwh, tariffPerKwh, signal) =>
    request('/predict-bill', {
      method: 'POST',
      body: { predicted_kwh: predictedKwh, tariff_per_kwh: tariffPerKwh },
      signal,
    }),
}
