/**
 * Schema validation and migration for anything persisted to localStorage.
 *
 * localStorage is shared across deploys and survives code changes, so a stored
 * blob may predate a field rename, may be half-written, or may have been
 * edited by hand. Reading it straight into state is how an app ends up
 * rendering `NaN` as a price or crashing on a missing array method.
 *
 * Each reviver takes whatever was in storage and returns a value that is
 * guaranteed to match the current shape: unknown keys are dropped, missing
 * keys are filled from the current defaults, and entries that cannot be
 * repaired are discarded rather than propagated.
 */

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)

/** Coerce to a finite number, or fall back. */
export function num(value, fallback, { min = -Infinity, max = Infinity } = {}) {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return fallback
  if (parsed < min || parsed > max) return fallback
  return parsed
}

/** Coerce to a string, trimmed, or fall back. */
export function str(value, fallback, { maxLength = 500 } = {}) {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  if (!trimmed) return fallback
  return trimmed.slice(0, maxLength)
}

export function bool(value, fallback) {
  return typeof value === 'boolean' ? value : fallback
}

/**
 * Rebuild an object by walking `defaults` and pulling each key from `stored`.
 * Keys present in `stored` but not in `defaults` are dropped, so a removed
 * setting cannot linger and shadow a future one with the same name.
 */
export function pickDefaults(stored, defaults, coerce) {
  const source = isObject(stored) ? stored : {}
  const out = {}
  for (const [key, fallback] of Object.entries(defaults)) {
    const raw = source[key]
    if (raw === undefined) {
      out[key] = fallback
      continue
    }
    out[key] = coerce ? coerce(raw, fallback, key) : raw
  }
  return out
}

/**
 * Settings: flat scalar fields plus a nested notification object.
 * `tariffType` is recorded so a tariff change cannot silently reinterpret
 * historic bills that were priced under a different tariff structure.
 */
export function reviveSettings(stored, defaults) {
  const base = pickDefaults(stored, defaults, (raw, fallback, _key) => {
    if (typeof fallback === 'number') return num(raw, fallback)
    if (typeof fallback === 'boolean') return bool(raw, fallback)
    if (typeof fallback === 'string') return str(raw, fallback)
    return raw
  })

  const source = isObject(stored) ? stored : {}
  const notifications = isObject(source.notifications) ? source.notifications : {}
  base.notifications = {
    anomalies: bool(notifications.anomalies, defaults.notifications?.anomalies ?? true),
    weekly: bool(notifications.weekly, defaults.notifications?.weekly ?? true),
    bill: bool(notifications.bill, defaults.notifications?.bill ?? true),
  }
  return base
}

/** Appliance rows: a row missing an id, a type or a plausible wattage is unusable. */
export function reviveAppliances(stored, defaults) {
  if (!Array.isArray(stored)) return defaults
  const seen = new Set()
  const rows = []
  for (const [index, raw] of stored.entries()) {
    if (!isObject(raw)) continue
    const id = str(raw.id, `a-restored-${index}`, { maxLength: 64 })
    if (seen.has(id)) continue
    const powerWatts = num(raw.powerWatts, null, { min: 0.01, max: 100_000 })
    if (powerWatts === null) continue
    const type = str(raw.type, 'generic', { maxLength: 40 })
    seen.add(id)
    rows.push({
      id,
      name: str(raw.name, 'Unnamed device', { maxLength: 80 }),
      type,
      powerWatts,
      quantity: num(raw.quantity, 1, { min: 1, max: 1000 }),
      currentDailyHours: num(raw.currentDailyHours, 0, { min: 0, max: 24 }),
      proposedDailyHours: num(raw.proposedDailyHours, 0, { min: 0, max: 24 }),
      daysPerMonth: num(raw.daysPerMonth, 30, { min: 1, max: 31 }),
    })
  }
  return rows.length ? rows : defaults
}

/** Saved simulator scenarios. */
export function reviveScenarios(stored, defaults) {
  if (!Array.isArray(stored)) return defaults
  const seen = new Set()
  const rows = []
  for (const [index, raw] of stored.entries()) {
    if (!isObject(raw)) continue
    const id = str(raw.id, `s-restored-${index}`, { maxLength: 64 })
    if (seen.has(id)) continue
    const currentKwh = num(raw.currentKwh, null, { min: 0, max: 1e7 })
    if (currentKwh === null) continue
    seen.add(id)
    rows.push({
      id,
      name: str(raw.name, 'Untitled scenario', { maxLength: 80 }),
      createdAt: str(raw.createdAt, new Date(0).toISOString()),
      currentKwh,
      proposedKwh: num(raw.proposedKwh, currentKwh, { min: 0, max: 1e7 }),
      currentCost: num(raw.currentCost, 0, { min: 0, max: 1e9 }),
      proposedCost: num(raw.proposedCost, 0, { min: 0, max: 1e9 }),
      savedCost: num(raw.savedCost, 0, { min: 0, max: 1e9 }),
      reductionPct: num(raw.reductionPct, 0, { min: 0, max: 100 }),
    })
  }
  return rows
}

/** Predictor form state. */
export function revivePredictor(stored, defaults) {
  const base = pickDefaults(stored, defaults, (raw, fallback, _key) => {
    if (typeof fallback === 'number') return num(raw, fallback)
    if (typeof fallback === 'string') return str(raw, fallback)
    return raw
  })
  if (!Array.isArray(stored?.consumption)) {
    base.consumption = Array.isArray(defaults.consumption) ? [...defaults.consumption] : []
  } else {
    base.consumption = stored.consumption
      .map((v) => num(v, null, { min: 0, max: 100_000 }))
      .filter((v) => v !== null)
  }
  return base
}