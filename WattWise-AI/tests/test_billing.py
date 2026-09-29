"""Flat-tariff billing: the shared contract, and the inputs it must refuse.

The expected values live in ``web/src/lib/billingCases.json`` so that the
JavaScript implementation in ``web/src/lib/energy.js`` is held to the same
numbers. If someone edits either side without the other, this fails.
"""

from __future__ import annotations

import pytest

from src.billing import (
    DEFAULT_BILLING_DAYS,
    MAX_BILLING_DAYS,
    BillInputError,
    compute_bill,
    round_half_up,
)


# ---------------------------------------------------------------------------
# Rounding parity
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "value,expected",
    [
        (590.625, 590.63),  # Python's round() would give 590.62
        (3178.125, 3178.13),
        (0.125, 0.13),
        (2.5, 2.5),
        (1.005, 1.01),
        (0.0, 0.0),
    ],
)
def test_rounding_is_half_up_not_bankers(value, expected):
    assert round_half_up(value, 2) == expected


def test_rounding_differs_from_python_builtin_where_it_matters():
    """Guards the reason this helper exists at all."""
    assert round(590.625, 2) == 590.62
    assert round_half_up(590.625, 2) == 590.63


def test_rounding_honours_the_requested_places():
    assert round_half_up(1.23456, 3) == 1.235
    assert round_half_up(1.23456, 1) == 1.2
    assert round_half_up(8.5, 4) == 8.5


# ---------------------------------------------------------------------------
# Shared fixture
# ---------------------------------------------------------------------------


def test_fixture_formula_matches_the_module(billing_cases):
    from src.billing import FORMULA

    assert billing_cases["formula"] == FORMULA
    assert billing_cases["rounding"] == "half-up"


def test_every_fixture_case_matches(billing_cases):
    for case in billing_cases["cases"]:
        result = compute_bill(
            case["daily_kwh"],
            case["tariff_per_kwh"],
            case["days"],
            case["fixed_charge_per_period"],
        )
        for key, expected in case["expected"].items():
            assert result[key] == pytest.approx(expected), (
                f"{case['name']}: {key} expected {expected}, got {result[key]}"
            )


def test_every_fixture_rejection_is_rejected(billing_cases):
    for case in billing_cases["rejections"]:
        with pytest.raises(BillInputError):
            compute_bill(
                case["daily_kwh"],
                case["tariff_per_kwh"],
                case["days"],
                case["fixed_charge_per_period"],
            )


def test_fixture_covers_the_tie_case(billing_cases):
    """A case that would fail under banker's rounding must stay in the file."""
    assert any("half-way" in case["name"] for case in billing_cases["cases"])


# ---------------------------------------------------------------------------
# Formula
# ---------------------------------------------------------------------------


def test_period_consumption_is_daily_times_days():
    result = compute_bill(10.0, 5.0, days=30)
    assert result["consumption_kwh"] == pytest.approx(300.0)
    assert result["energy_charge"] == pytest.approx(1500.0)
    assert result["estimated_bill"] == pytest.approx(1500.0)


def test_fixed_charge_is_added_once_not_per_day():
    without = compute_bill(10.0, 5.0, days=30, fixed_charge_per_period=0)
    with_charge = compute_bill(10.0, 5.0, days=30, fixed_charge_per_period=100)
    assert with_charge["estimated_bill"] - without["estimated_bill"] == pytest.approx(100.0)


def test_daily_and_period_quantities_are_distinguishable():
    """A daily rate must never be reported as a period total."""
    result = compute_bill(22.6419, 8.5, days=30)
    assert result["predicted_daily_kwh"] == pytest.approx(22.642)
    assert result["consumption_kwh"] == pytest.approx(679.257)
    assert result["consumption_kwh"] == pytest.approx(
        result["predicted_daily_kwh"] * 30, rel=1e-3
    )
    assert result["estimated_bill"] > result["energy_charge"] - 1e-9


def test_result_declares_a_flat_tariff_and_the_formula():
    result = compute_bill(10.0, 5.0)
    assert result["tariff_type"] == "flat"
    assert "days" in result["formula"]


def test_default_period_is_thirty_days():
    assert compute_bill(10.0, 5.0)["period_days"] == DEFAULT_BILLING_DAYS


def test_period_length_scales_the_bill_linearly():
    one = compute_bill(10.0, 5.0, days=1)["energy_charge"]
    thirty = compute_bill(10.0, 5.0, days=30)["energy_charge"]
    assert thirty == pytest.approx(one * 30, rel=1e-9)


# ---------------------------------------------------------------------------
# Rejections
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("bad", [0, -1, -0.5])
def test_rejects_non_positive_consumption(bad):
    with pytest.raises(BillInputError, match="predicted_kwh"):
        compute_bill(bad, 8.5)


@pytest.mark.parametrize("bad", [0, -1])
def test_rejects_non_positive_tariff(bad):
    with pytest.raises(BillInputError, match="tariff_per_kwh"):
        compute_bill(20.0, bad)


def test_rejects_negative_fixed_charge():
    with pytest.raises(BillInputError, match="fixed_charge"):
        compute_bill(20.0, 8.5, fixed_charge_per_period=-1)


@pytest.mark.parametrize("bad", [0, -1, MAX_BILLING_DAYS + 1, 10000])
def test_rejects_out_of_range_periods(bad):
    with pytest.raises(BillInputError, match="days"):
        compute_bill(20.0, 8.5, days=bad)


def test_rejects_non_integer_periods():
    with pytest.raises(BillInputError, match="days"):
        compute_bill(20.0, 8.5, days=30.5)


def test_boundary_period_lengths_are_accepted():
    for days in (1, MAX_BILLING_DAYS):
        assert compute_bill(20.0, 8.5, days=days)["period_days"] == days
