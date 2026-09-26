#!/usr/bin/env python3
"""Regenerate the shared flat-tariff billing fixture.

The fixture lives inside the frontend source tree
(``web/src/lib/billingCases.json``) because Vite can import JSON at build
time, and it is the same file ``WattWise-AI/tests/test_billing.py`` asserts
against. One file, two implementations, no drift.

Usage::

    python -m src.billing_contract > ../web/src/lib/billingCases.json
"""

from __future__ import annotations

import json
import sys

from .billing import DEFAULT_BILLING_DAYS, FORMULA, BillInputError, compute_bill

CASES: list[dict] = [
    {
        "name": "single day, no fixed charge",
        "daily_kwh": 22.6419,
        "tariff_per_kwh": 8.5,
        "days": 1,
        "fixed_charge_per_period": 0,
    },
    {
        "name": f"default {DEFAULT_BILLING_DAYS} day period",
        "daily_kwh": 22.6419,
        "tariff_per_kwh": 8.5,
        "days": DEFAULT_BILLING_DAYS,
        "fixed_charge_per_period": 0,
    },
    {
        "name": "30 day period with standing charge",
        "daily_kwh": 22.6419,
        "tariff_per_kwh": 8.5,
        "days": 30,
        "fixed_charge_per_period": 150,
    },
    {
        "name": "7 day week with standing charge",
        "daily_kwh": 12.5,
        "tariff_per_kwh": 6.75,
        "days": 7,
        "fixed_charge_per_period": 40.5,
    },
    {
        "name": "full year period",
        "daily_kwh": 18.078309,
        "tariff_per_kwh": 9.25,
        "days": 365,
        "fixed_charge_per_period": 1200,
    },
    {
        "name": "zero fixed charge on a 90 day period",
        "daily_kwh": 32.30514,
        "tariff_per_kwh": 7.2,
        "days": 90,
        "fixed_charge_per_period": 0,
    },
    {
        "name": "high precision unit rate",
        "daily_kwh": 0.593776,
        "tariff_per_kwh": 11.1234,
        "days": 30,
        "fixed_charge_per_period": 0,
    },
    {
        "name": "exact half-way tie, exercises rounding parity",
        "daily_kwh": 12.5,
        "tariff_per_kwh": 8.475,
        "days": 30,
        "fixed_charge_per_period": 0,
    },
]

REJECTIONS: list[dict] = [
    {"name": "zero consumption", "daily_kwh": 0, "tariff_per_kwh": 8.5, "days": 30, "fixed_charge_per_period": 0},
    {"name": "negative consumption", "daily_kwh": -5, "tariff_per_kwh": 8.5, "days": 30, "fixed_charge_per_period": 0},
    {"name": "zero tariff", "daily_kwh": 20, "tariff_per_kwh": 0, "days": 30, "fixed_charge_per_period": 0},
    {"name": "negative tariff", "daily_kwh": 20, "tariff_per_kwh": -1, "days": 30, "fixed_charge_per_period": 0},
    {"name": "negative fixed charge", "daily_kwh": 20, "tariff_per_kwh": 8.5, "days": 30, "fixed_charge_per_period": -10},
    {"name": "zero days", "daily_kwh": 20, "tariff_per_kwh": 8.5, "days": 0, "fixed_charge_per_period": 0},
    {"name": "too many days", "daily_kwh": 20, "tariff_per_kwh": 8.5, "days": 400, "fixed_charge_per_period": 0},
]

OUTPUT_KEYS = (
    "period_days",
    "predicted_daily_kwh",
    "consumption_kwh",
    "tariff_per_kwh",
    "energy_charge",
    "fixed_charge_per_period",
    "estimated_bill",
)


def build() -> dict:
    cases = []
    for case in CASES:
        result = compute_bill(
            case["daily_kwh"],
            case["tariff_per_kwh"],
            case["days"],
            case["fixed_charge_per_period"],
        )
        cases.append(
            {
                **{k: case[k] for k in ("name", "daily_kwh", "tariff_per_kwh", "days", "fixed_charge_per_period")},
                "expected": {key: result[key] for key in OUTPUT_KEYS},
            }
        )

    for rejection in REJECTIONS:
        try:
            compute_bill(
                rejection["daily_kwh"],
                rejection["tariff_per_kwh"],
                rejection["days"],
                rejection["fixed_charge_per_period"],
            )
        except BillInputError:
            continue
        raise SystemExit(f"rejection case no longer rejected: {rejection['name']}")

    return {
        "$comment": (
            "Shared billing contract. Read by WattWise-AI/tests/test_billing.py and "
            "imported by web/src/lib/energy.js consumers, so the Python and JavaScript "
            "flat-tariff implementations cannot drift apart. Both sides round half-up: "
            "Python via Decimal ROUND_HALF_UP, JavaScript via Math.round(x*100)/100. "
            "Regenerate with: python -m src.billing_contract > ../web/src/lib/billingCases.json"
        ),
        "formula": FORMULA,
        "rounding": "half-up",
        "cases": cases,
        "rejections": REJECTIONS,
    }


if __name__ == "__main__":
    json.dump(build(), sys.stdout, indent=2)
    sys.stdout.write("\n")
