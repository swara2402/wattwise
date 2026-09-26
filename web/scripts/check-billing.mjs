#!/usr/bin/env node
/* eslint-env node */
/**
 * Verify the JavaScript billing mirror against the shared contract.
 *
 * `src/lib/billingCases.json` is the single source of truth for flat-tariff
 * arithmetic. `WattWise-AI/tests/test_billing.py` asserts the Python
 * implementation against it; this script asserts the JavaScript
 * implementation against the same file. Editing one side without the other
 * fails one of the two.
 *
 * Run from `web/`:
 *
 *   node scripts/check-billing.mjs
 *
 * No dependencies: `src/lib/billing.js` is a leaf module, so plain Node can
 * load it. Exit status is 0 when everything matches, 1 otherwise.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const webRoot = join(here, '..')

const { computeBill, roundHalfUp, BILLING_FORMULA } = await import(
  join(webRoot, 'src', 'lib', 'billing.js')
)

const GREEN = '[32m'
const RED = '[31m'
const DIM = '[2m'
const RESET = '[0m'

const fixtures = JSON.parse(readFileSync(join(webRoot, 'src', 'lib', 'billingCases.json'), 'utf8'))

let passed = 0
const failures = []

const check = (name, ok, detail = '') => {
  if (ok) {
    passed += 1
    console.log(`[${GREEN}  ok  ${RESET}] ${name}${detail ? ` ${DIM}${detail}${RESET}` : ''}`)
  } else {
    failures.push(name)
    console.log(`[${RED} FAIL ${RESET}] ${name}${detail ? ` ${detail}` : ''}`)
  }
}

console.log('WattWise billing contract — JavaScript side')
console.log('='.repeat(60))

/* ------------------------------------------------------------------ */
console.log('\nContract')

check('the fixture documents the same formula', fixtures.formula === BILLING_FORMULA)
check('the fixture pins half-up rounding', fixtures.rounding === 'half-up')

const JS_TO_PY = {
  periodDays: 'period_days',
  dailyKwh: 'predicted_daily_kwh',
  consumptionKwh: 'consumption_kwh',
  tariffPerKwh: 'tariff_per_kwh',
  energyCharge: 'energy_charge',
  fixedChargePerPeriod: 'fixed_charge_per_period',
  estimatedBill: 'estimated_bill',
}

/* ------------------------------------------------------------------ */
console.log('\nAccepted inputs')

for (const testCase of fixtures.cases) {
  const result = computeBill(
    testCase.daily_kwh,
    testCase.tariff_per_kwh,
    testCase.days,
    testCase.fixed_charge_per_period,
  )

  if (!result.ok) {
    check(testCase.name, false, result.error)
    continue
  }

  const mismatches = []
  for (const [jsKey, pyKey] of Object.entries(JS_TO_PY)) {
    const expected = testCase.expected[pyKey]
    if (result[jsKey] !== expected) {
      mismatches.push(`${jsKey}: expected ${expected}, got ${result[jsKey]}`)
    }
  }
  check(testCase.name, mismatches.length === 0, mismatches.join('; '))
}

/* ------------------------------------------------------------------ */
console.log('\nRejected inputs')

for (const testCase of fixtures.rejections) {
  const result = computeBill(
    testCase.daily_kwh,
    testCase.tariff_per_kwh,
    testCase.days,
    testCase.fixed_charge_per_period,
  )
  check(`rejects ${testCase.name}`, result.ok === false, result.ok ? 'was accepted' : result.error)
}

/* ------------------------------------------------------------------ */
console.log('\nRounding parity')

const roundingCases = [
  [590.625, 2, 590.63], // Python's round() would give 590.62
  [3178.125, 2, 3178.13],
  [0.125, 2, 0.13],
  [2.5, 2, 2.5],
  [1.005, 2, 1.01],
  [0, 2, 0],
  [1.23456, 3, 1.235],
  [8.5, 4, 8.5],
]

for (const [value, places, expected] of roundingCases) {
  const got = roundHalfUp(value, places)
  check(`roundHalfUp(${value}, ${places})`, got === expected, `expected ${expected}, got ${got}`)
}

check('handles negative values symmetrically', roundHalfUp(-590.625, 2) === -590.63)
check('handles non-finite input without throwing', roundHalfUp(Number.NaN, 2) === 0)

/* ------------------------------------------------------------------ */
console.log('\nFormula invariants')

const period = computeBill(10, 5, 30)
check('period consumption is daily x days', period.consumptionKwh === 300)
check('energy charge is consumption x tariff', period.energyCharge === 1500)
check('bill is energy charge plus standing charge', period.estimatedBill === 1500)

const withCharge = computeBill(10, 5, 30, 100)
check(
  'the standing charge is added once, not per day',
  withCharge.estimatedBill - period.estimatedBill === 100,
)

const week = computeBill(10, 5, 7)
check('a 7-day period costs 7/30 of a 30-day period', Math.abs(week.energyCharge - 350) < 1e-9)

const oneDay = computeBill(22.6419, 8.5, 1)
check('a one-day period reports one day of consumption', oneDay.consumptionKwh === 22.642)
check('a daily rate is never reported as a period total', oneDay.estimatedBill === 192.46)

/* ------------------------------------------------------------------ */
const total = passed + failures.length
console.log()
if (failures.length) {
  console.log(`${RED}${failures.length} of ${total} checks failed:${RESET}`)
  for (const name of failures) console.log(`  - ${name}`)
  process.exit(1)
}
console.log(`${GREEN}all ${total} checks passed${RESET}`)