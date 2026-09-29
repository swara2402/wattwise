/**
 * Flat-tariff billing arithmetic.
 *
 * This module has no imports on purpose: it is a leaf so that both the app
 * bundle and the dependency-free `scripts/check-billing.mjs` verifier can
 * load it.
 *
 * It is a deliberate mirror of `WattWise-AI/src/billing.py`. Both sides are
 * held to the same expected values by `billingCases.json`, which the Python
 * suite asserts against and the Node script asserts here, so the two
 * implementations cannot drift apart.
 *
 * The contract:
 *
 *   consumptionKwh = dailyKwh * days
 *   energyCharge   = consumptionKwh * tariffPerKwh
 *   estimatedBill  = energyCharge + fixedChargePerPeriod
 *
 * `fixedChargePerPeriod` is added once for the whole period, not once per
 * day. There is no time-of-use banding, no slab structure, no tax, and no
 * proration of a standing charge levied daily.
 */

export const DEFAULT_BILLING_DAYS = 30
export const MAX_BILLING_DAYS = 365

export const BILLING_FORMULA =
  'consumption_kwh = daily_kwh * days; ' +
  'energy_charge = consumption_kwh * tariff_per_kwh; ' +
  'estimated_bill = energy_charge + fixed_charge_per_period'

/**
 * Round half away from zero, matching Python's `Decimal(ROUND_HALF_UP)`.
 *
 * Not `Number.prototype.toFixed`: that returns a string, and the two do not
 * always agree on values with more than 15 significant digits. Not plain
 * `Math.round` either, because `1.005 * 100` is `100.49999999999999` in
 * binary floating point and would round down to `1` when the decimal intent
 * was `1.01`, so a small epsilon nudge is applied first.
 */
export function roundHalfUp(value, places = 2) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  const factor = 10 ** places
  const scaled = numeric * factor
  const magnitude = Math.abs(scaled)
  const corrected = scaled >= 0
    ? Math.round(magnitude + Number.EPSILON * magnitude)
    : -Math.round(magnitude + Number.EPSILON * magnitude)
  return corrected / factor
}

/**
 * Cost a flat per-unit tariff over a billing period.
 *
 * @param dailyKwh Consumption for ONE day, in kWh.
 * @param tariffPerKwh Flat unit rate in currency per kWh.
 * @param days Length of the billing period in days.
 * @param fixedChargePerPeriod Standing charge added once for the period.
 * @returns `{ ok: true, ... }` with every intermediate quantity, or
 *          `{ ok: false, error }` when an input is not physically sensible.
 */
export function computeBill(dailyKwh, tariffPerKwh, days = DEFAULT_BILLING_DAYS, fixedChargePerPeriod = 0) {
  const daily = Number(dailyKwh)
  const tariff = Number(tariffPerKwh)
  const periodDays = Number(days)
  const fixed = Number(fixedChargePerPeriod) || 0

  if (!Number.isFinite(daily) || daily <= 0) {
    return { ok: false, error: 'Predicted consumption must be greater than zero.' }
  }
  if (!Number.isFinite(tariff) || tariff <= 0) {
    return { ok: false, error: 'Tariff must be greater than zero.' }
  }
  if (!Number.isInteger(periodDays) || periodDays < 1 || periodDays > MAX_BILLING_DAYS) {
    return { ok: false, error: 'Billing period must be a whole number of days between 1 and 365.' }
  }
  if (!Number.isFinite(fixed) || fixed < 0) {
    return { ok: false, error: 'Standing charge cannot be negative.' }
  }

  const consumptionKwh = daily * periodDays
  const energyCharge = consumptionKwh * tariff

  return {
    ok: true,
    periodDays,
    dailyKwh: roundHalfUp(daily, 3),
    consumptionKwh: roundHalfUp(consumptionKwh, 3),
    tariffPerKwh: roundHalfUp(tariff, 4),
    energyCharge: roundHalfUp(energyCharge, 2),
    fixedChargePerPeriod: roundHalfUp(fixed, 2),
    estimatedBill: roundHalfUp(energyCharge + fixed, 2),
  }
}
