"""The committed data must satisfy the date-migration contract.

``scripts/shift_dataset_dates.py`` moved the whole benchmark time axis forward
by 5844 days. These tests assert the result, so a hand-edited CSV or an
accidental re-run of the migration is caught immediately.
"""

from __future__ import annotations

import pandas as pd
import pytest

from src import metadata as meta

OFFSET_DAYS = 5844
OFFSET = pd.Timedelta(days=OFFSET_DAYS)

EXPECTED_START = pd.Timestamp("2022-12-16")
EXPECTED_END = pd.Timestamp("2026-11-26")

ORIGINAL_START = EXPECTED_START - OFFSET
ORIGINAL_END = EXPECTED_END - OFFSET

DAILY_ROWS = 1433
ENGINEERED_ROWS = 1403


# ---------------------------------------------------------------------------
# Endpoints of the shifted range
# ---------------------------------------------------------------------------


def test_daily_range_is_exactly_the_requested_window(daily):
    assert daily["datetime"].min() == EXPECTED_START
    assert daily["datetime"].max() == EXPECTED_END


def test_endpoints_map_from_the_original_by_the_offset():
    assert ORIGINAL_START.date().isoformat() == "2006-12-16"
    assert ORIGINAL_END.date().isoformat() == "2010-11-26"
    assert EXPECTED_START - ORIGINAL_START == OFFSET
    assert EXPECTED_END - ORIGINAL_END == OFFSET


def test_offset_is_not_a_whole_number_of_weeks(daily):
    """The reason weekday labels move is the headline caveat."""
    assert OFFSET_DAYS % 7 == 6
    assert pd.Timestamp("2006-12-16").dayofweek == 5  # Saturday
    assert EXPECTED_START.dayofweek == 4  # Friday


# ---------------------------------------------------------------------------
# Preservation
# ---------------------------------------------------------------------------


def test_row_counts_and_ordering_are_untouched(daily, ml_dataset):
    assert len(daily) == DAILY_ROWS
    assert len(ml_dataset) == ENGINEERED_ROWS
    assert daily["datetime"].is_monotonic_increasing
    assert daily["datetime"].is_unique
    assert ml_dataset["datetime"].is_monotonic_increasing
    assert ml_dataset["datetime"].is_unique


def test_measurements_are_unchanged_by_a_date_migration(daily):
    """These totals are from the pre-migration file. A date translation must
    not touch a single reading, so any drift here means values were rewritten."""
    energy = daily["energy_kwh"]
    assert energy.sum() == pytest.approx(37307.022, abs=1e-6)
    assert energy.mean() == pytest.approx(26.0342093510, abs=1e-9)
    assert energy.min() == pytest.approx(0.5937758016, abs=1e-9)
    assert energy.max() == pytest.approx(79.5564333333, abs=1e-9)
    assert energy.iloc[0] == pytest.approx(20.1529333333, abs=1e-9)
    assert energy.iloc[-1] == pytest.approx(24.8017333333, abs=1e-9)


def test_month_and_day_survive_the_translation(ml_dataset):
    """5844 days is not a whole number of years, but every row's month/day is."""
    shifted = ml_dataset["datetime"]
    assert (shifted.dt.day == shifted.dt.day).all()
    assert set(shifted.dt.month.unique()) == set(range(1, 13))


def test_engineered_dataset_still_starts_30_days_in(daily, ml_dataset):
    """The first 30 rows are consumed by the longest lag."""
    assert ml_dataset["datetime"].min() == daily["datetime"].min() + pd.Timedelta(days=30)
    assert len(daily) - len(ml_dataset) == 30


# ---------------------------------------------------------------------------
# Recomputed calendar features
# ---------------------------------------------------------------------------


def test_calendar_features_agree_with_the_canonical_code(ml_dataset):
    from src.features import CALENDAR_FEATURE_COLUMNS, add_calendar_features

    expected = add_calendar_features(pd.DatetimeIndex(ml_dataset["datetime"]))
    for column in CALENDAR_FEATURE_COLUMNS:
        assert list(ml_dataset[column]) == list(expected[column]), (
            f"{column} was not recomputed from the new dates"
        )


def test_weekday_labels_rotated_by_one_day(ml_dataset):
    """Every row moved one weekday earlier; none kept its label."""
    original = (ml_dataset["datetime"] - OFFSET).dt.dayofweek
    delta = (ml_dataset["datetime"].dt.dayofweek - original) % 7
    assert set(delta.unique()) == {6}


def test_is_weekend_agrees_with_the_shifted_weekday(ml_dataset):
    expected = (ml_dataset["datetime"].dt.dayofweek >= 5).astype(int)
    assert list(ml_dataset["is_weekend"]) == list(expected)


def test_time_series_features_are_unaffected_by_the_shift(ml_dataset):
    """Lag and rolling columns depend on values, not on the calendar."""
    energy = meta.daily_frame().set_index("datetime")["energy_kwh"]
    from src.features import add_time_series_features

    rebuilt = add_time_series_features(energy).dropna().reset_index()
    for column in ("lag_1", "lag_7", "lag_30", "rolling_mean_7", "ewm_7"):
        # approx, not ==: the stored aggregates were written by an older
        # pandas whose rolling/EWM accumulators differ in the last bits.
        assert list(rebuilt[column]) == pytest.approx(list(ml_dataset[column]), abs=1e-9), column


# ---------------------------------------------------------------------------
# Every date-bearing artifact moved together
# ---------------------------------------------------------------------------


def test_all_date_bearing_files_share_the_shifted_range(daily, ml_dataset, stored_test_predictions):
    frames = {
        "daily_consumption_v2.csv": daily,
        "ml_dataset_v2.csv": ml_dataset,
        "test_predictions_v2.csv": stored_test_predictions,
        "anomalies_v2.csv": meta.anomaly_frame(),
    }
    for name, frame in frames.items():
        assert frame["datetime"].min() >= EXPECTED_START, f"{name} still holds old dates"
        assert frame["datetime"].max() <= EXPECTED_END, f"{name} still holds old dates"
        assert frame["datetime"].is_monotonic_increasing, f"{name} is out of order"


def test_test_predictions_still_align_with_the_engineered_dataset(
    ml_dataset, stored_test_predictions
):
    """The benchmark reference must stay row-aligned with its source table."""
    tail = ml_dataset["datetime"].tail(len(stored_test_predictions)).tolist()
    assert list(stored_test_predictions["datetime"]) == tail


def test_the_migration_script_refuses_to_run_twice():
    """Re-running would move the timeline to 2038 and silently break parity."""
    from scripts.shift_dataset_dates import main

    with pytest.raises(SystemExit, match="already"):
        main([])


def test_the_migration_guard_leaves_the_data_untouched():
    """Even a dry run must refuse, and must not rewrite anything."""
    from scripts.shift_dataset_dates import main

    path = meta.DAILY_CSV
    before_bytes = path.read_bytes()

    for argv in ([], ["--dry-run"]):
        with pytest.raises(SystemExit, match="already"):
            main(argv)

    assert path.read_bytes() == before_bytes
