"""Bill arithmetic for WattWise.

This module is the backend authority for how consumption turns into money.
The frontend has a mirror implementation in ``web/src/lib/energy.js``; the two
are kept honest by a shared fixture, ``web/src/lib/billingCases.json``, which
the pytest suite reads and asserts against.

The contract, in one place
--------------------------
For a flat per-unit tariff::

    consumption_kwh = daily_kwh * days
    energy_charge   = consumption_kwh * tariff_per_kwh
    estimated_bill  = energy_charge + fixed_charge_per_period

``fixed_charge_per_period`` is added **once per billing period**, not once
per day. A standing charge billed daily is a different product and is not
modelled here; callers that need it should multiply before calling.

There is no time-of-use banding, no slab/tier structure, no tax and no
standing-charge proration. The tariff is flat, and the UI says so.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from typing import Any

DEFAULT_BILLING_DAYS = 30
MAX_BILLING_DAYS = 365
DEFAULT_CURRENCY = "INR"

FORMULA = (
    "consumption_kwh = daily_kwh * days; "
    "energy_charge = consumption_kwh * tariff_per_kwh; "
    "estimated_bill = energy_charge + fixed_charge_per_period"
)


def round_half_up(value: float, places: int = 2) -> float:
    """Round half away from zero, matching JavaScript's ``Math.round``.

    Python's built-in :func:`round` uses banker's rounding, so ``round(590.625, 2)``
    is ``590.62`` while the JavaScript mirror computes ``590.63``. That single
    difference would make the two implementations disagree on every exact
    half-way value, so both sides round half-up explicitly instead.
    """
    quantum = Decimal(1).scaleb(-places)
    return float(Decimal(str(float(value))).quantize(quantum, rounding=ROUND_HALF_UP))



class BillInputError(ValueError):
    """Raised when billing inputs are not physically sensible."""


def compute_bill(
    daily_kwh: float,
    tariff_per_kwh: float,
    days: int = DEFAULT_BILLING_DAYS,
    fixed_charge_per_period: float = 0.0,
    currency: str = DEFAULT_CURRENCY,
) -> dict[str, Any]:
    """Cost a flat-tariff period.

    Parameters
    ----------
    daily_kwh:
        Predicted consumption for **one day**, in kWh.
    tariff_per_kwh:
        Flat unit rate in ``currency`` per kWh.
    days:
        Length of the billing period in days.
    fixed_charge_per_period:
        Any flat standing charge levied once for the whole period.
    """
    daily_kwh = float(daily_kwh)
    tariff_per_kwh = float(tariff_per_kwh)
    fixed_charge_per_period = float(fixed_charge_per_period)

    if daily_kwh <= 0:
        raise BillInputError("predicted_kwh must be greater than zero")
    if tariff_per_kwh <= 0:
        raise BillInputError("tariff_per_kwh must be greater than zero")
    if fixed_charge_per_period < 0:
        raise BillInputError("fixed_charge_per_period cannot be negative")
    if not isinstance(days, int) or days < 1 or days > MAX_BILLING_DAYS:
        raise BillInputError(f"days must be an integer between 1 and {MAX_BILLING_DAYS}")

    consumption_kwh = daily_kwh * days
    energy_charge = consumption_kwh * tariff_per_kwh
    total = energy_charge + fixed_charge_per_period

    return {
        "period_days": days,
        "predicted_daily_kwh": round_half_up(daily_kwh, 3),
        "consumption_kwh": round_half_up(consumption_kwh, 3),
        "tariff_per_kwh": round_half_up(tariff_per_kwh, 4),
        "energy_charge": round_half_up(energy_charge, 2),
        "fixed_charge_per_period": round_half_up(fixed_charge_per_period, 2),
        "estimated_bill": round_half_up(total, 2),
        "currency": currency,
        "tariff_type": "flat",
        "formula": FORMULA,
    }
