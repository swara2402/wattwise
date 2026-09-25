"""The canonical feature module is the training/serving contract.

These tests pin the contract itself: the column set and order, agreement with
the stored engineered dataset, absence of target-day leakage, and the EWM
semantics that the model was fitted with.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from src.features import (
    CALENDAR_FEATURE_COLUMNS,
    CONTEXT_WINDOW,
    EXPECTED_FEATURE_COUNT,
    FEATURE_COLUMNS,
    FEATURE_GROUPS,
    add_calendar_features,
    add_time_series_features,
    build_target_features,
    season_of,
    validate_feature_frame,
)

# The stored aggregates were produced by an older pandas whose rolling and
# EWM accumulators differ in the last bits. This is the float-noise ceiling
# we accept, not a modelling tolerance.
FLOAT_NOISE = 1e-9


# ---------------------------------------------------------------------------
# Contract
# ---------------------------------------------------------------------------


def test_feature_count_is_twenty_six():
    assert EXPECTED_FEATURE_COUNT == 26
    assert len(FEATURE_COLUMNS) == 26


def test_groups_partition_the_feature_set_exactly():
    union = [name for group in FEATURE_GROUPS.values() for name in group]
    assert sorted(union) == sorted(FEATURE_COLUMNS)
    assert len(union) == len(set(union)), "a feature appears in two groups"


def test_calendar_features_are_the_leading_prefix():
    assert FEATURE_COLUMNS[: len(CALENDAR_FEATURE_COLUMNS)] == CALENDAR_FEATURE_COLUMNS


def test_order_matches_the_fitted_model():
    """The artifact is the authority; features.py must not reorder silently."""
    joblib_model = pytest.importorskip("joblib")
    from src import metadata as meta

    model = joblib_model.load(meta.RF_MODEL)
    assert list(model.feature_names_in_) == list(FEATURE_COLUMNS)


# ---------------------------------------------------------------------------
# Calendar
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "month,expected",
    [(12, 0), (1, 0), (2, 0), (3, 1), (5, 1), (6, 2), (8, 2), (9, 3), (11, 3)],
)
def test_season_buckets(month, expected):
    assert season_of(month) == expected


def test_all_twelve_months_map_into_four_buckets():
    assert {season_of(m) for m in range(1, 13)} == {0, 1, 2, 3}


def test_calendar_features_match_pandas_ground_truth():
    index = pd.date_range("2024-01-01", "2024-01-10", freq="D")
    frame = add_calendar_features(index)
    assert list(frame["day_of_week"]) == list(index.dayofweek)
    assert list(frame["is_weekend"]) == [int(d >= 5) for d in index.dayofweek]
    assert list(frame["quarter"]) == list(index.quarter)
    assert list(frame["day_of_year"]) == list(index.dayofyear)
    assert list(frame["week_of_year"]) == list(index.isocalendar().week)


def test_calendar_features_reject_non_datetime_index():
    with pytest.raises(TypeError):
        add_calendar_features(pd.Index([1, 2, 3]))


# ---------------------------------------------------------------------------
# Agreement with the stored training reference
# ---------------------------------------------------------------------------


def test_rebuilt_table_matches_stored_engineered_dataset(daily, ml_dataset):
    """Vectorised build vs the dataset the model was actually fitted on."""
    rebuilt = add_time_series_features(daily.set_index("datetime")["energy_kwh"])
    rebuilt = rebuilt.dropna().reset_index()

    assert len(rebuilt) == len(ml_dataset)
    assert list(rebuilt["datetime"]) == list(ml_dataset["datetime"])

    for column in FEATURE_COLUMNS:
        delta = np.abs(
            rebuilt[column].to_numpy(float) - ml_dataset[column].to_numpy(float)
        ).max()
        assert delta <= FLOAT_NOISE, f"{column} drifted by {delta:.3e}"


def test_first_thirty_rows_are_dropped_because_of_the_longest_lag(daily):
    frame = add_time_series_features(daily.set_index("datetime")["energy_kwh"])
    # EWM is defined from the first lag, but lag_30 needs 30 prior days, so
    # exactly the first 30 rows carry at least one gap and dropna removes them.
    assert frame.head(CONTEXT_WINDOW).isna().any(axis=1).all()
    assert frame.iloc[CONTEXT_WINDOW].notna().all(), "row 30 is the first complete row"
    assert frame.iloc[:CONTEXT_WINDOW]["lag_30"].isna().all()


# ---------------------------------------------------------------------------
# No target-day leakage
# ---------------------------------------------------------------------------


def test_features_never_use_the_target_days_own_consumption(daily):
    """Row t must depend only on rows before t, or the model leaks its answer."""
    energy = daily.set_index("datetime")["energy_kwh"].copy()
    baseline = add_time_series_features(energy).tail(1)

    tampered = energy.copy()
    tampered.iloc[-1] = tampered.iloc[-1] * 1000 + 7
    after = add_time_series_features(tampered).tail(1)

    pd.testing.assert_frame_equal(baseline, after)


def test_lag_one_is_the_previous_record(daily):
    energy = daily.set_index("datetime")["energy_kwh"]
    frame = add_time_series_features(energy)
    assert frame["lag_1"].iloc[100] == pytest.approx(energy.iloc[99])
    assert frame["lag_30"].iloc[100] == pytest.approx(energy.iloc[70])


def test_rolling_std_uses_sample_deviation(daily):
    """ddof=1 is pandas' default and what the model was fitted with."""
    energy = daily.set_index("datetime")["energy_kwh"]
    frame = add_time_series_features(energy)
    # rolling(30) on the once-shifted series at row 100 spans energy[70:100]
    window = energy.iloc[70:100]
    assert frame["rolling_std_30"].iloc[100] == pytest.approx(window.std(ddof=1))
    assert frame["rolling_std_30"].iloc[100] != pytest.approx(window.std(ddof=0))


def test_ewm_uses_adjust_true(daily):
    """adjust=False would silently change the model input distribution."""
    energy = daily.set_index("datetime")["energy_kwh"]
    frame = add_time_series_features(energy)
    adjusted = energy.shift(1).ewm(span=7, adjust=True).mean()
    recursive = energy.shift(1).ewm(span=7, adjust=False).mean()

    # Match the training formula at every position.
    for row in (CONTEXT_WINDOW, 40, 100, 500):
        assert frame["ewm_7"].iloc[row] == pytest.approx(adjusted.iloc[row])

    # The two settings converge as history accumulates, so divergence is only
    # observable early. Measured: 3.8e-3 at row 30, 3.6e-15 by row 200.
    assert abs(adjusted.iloc[30] - recursive.iloc[30]) > 1e-3
    assert frame["ewm_7"].iloc[30] == pytest.approx(adjusted.iloc[30])
    assert frame["ewm_7"].iloc[30] != pytest.approx(recursive.iloc[30], abs=1e-5)


# ---------------------------------------------------------------------------
# Single-row builder
# ---------------------------------------------------------------------------


def test_build_target_features_matches_the_vectorised_row(daily):
    """The serving path must equal the training path, row for row."""
    energy = daily.set_index("datetime")["energy_kwh"]
    target = energy.index[-1]
    table = add_time_series_features(energy)

    single = build_target_features(energy.iloc[:-1], target)

    assert list(single.columns) == list(FEATURE_COLUMNS)
    for column in FEATURE_COLUMNS:
        assert single[column].iloc[0] == pytest.approx(
            table[column].iloc[-1], abs=FLOAT_NOISE
        ), f"{column} differs between vectorised and single-row builders"


def test_build_target_features_rejects_history_reaching_the_target(daily):
    energy = daily.set_index("datetime")["energy_kwh"]
    with pytest.raises(ValueError, match="strictly before"):
        build_target_features(energy, energy.index[-1])


def test_build_target_features_rejects_empty_history():
    empty = pd.Series(dtype=float, index=pd.DatetimeIndex([]))
    with pytest.raises(ValueError, match="empty"):
        build_target_features(empty, pd.Timestamp("2024-01-01"))


def test_build_target_features_rejects_unsorted_history(daily):
    energy = daily.set_index("datetime")["energy_kwh"]
    with pytest.raises(ValueError, match="sorted"):
        build_target_features(energy.iloc[:-1].iloc[::-1], energy.index[-1])


def test_build_target_features_rejects_history_with_a_gap_before_target(daily):
    """A large gap before the target would break model assumptions."""
    energy = daily.set_index("datetime")["energy_kwh"]
    # Create a gap larger than MAX_HISTORY_GAP_DAYS (5 days) to trigger the error
    # Find an index that's more than 5 days before the last date
    last_date = energy.index[-1]
    # Find the first index that's at least 6 days before last_date
    gap_indices = energy.index[energy.index <= last_date - pd.Timedelta(days=6)]
    assert len(gap_indices) > 0, "Could not create large enough gap for test"
    gap = gap_indices[-1]
    with pytest.raises(ValueError, match="beyond the 5-day maximum"):
        build_target_features(energy.loc[:gap], energy.index[-1])


def test_add_time_series_features_rejects_wrong_index_type():
    with pytest.raises(TypeError):
        add_time_series_features(pd.Series([1.0, 2.0, 3.0]))


def test_add_time_series_features_rejects_unknown_column():
    energy = pd.Series(
        [1.0, 2.0, 3.0], index=pd.date_range("2024-01-01", periods=3, freq="D")
    )
    with pytest.raises(ValueError, match="unknown feature columns"):
        add_time_series_features(energy, feature_columns=("nope",))


# ---------------------------------------------------------------------------
# Validation helper
# ---------------------------------------------------------------------------


def test_validate_feature_frame_accepts_a_good_row():
    row = pd.DataFrame([[1.0] * len(FEATURE_COLUMNS)], columns=list(FEATURE_COLUMNS))
    validate_feature_frame(row, FEATURE_COLUMNS)


def test_validate_feature_frame_rejects_wrong_order():
    row = pd.DataFrame([[1.0] * len(FEATURE_COLUMNS)], columns=list(FEATURE_COLUMNS)[::-1])
    with pytest.raises(ValueError, match="order mismatch"):
        validate_feature_frame(row, FEATURE_COLUMNS)


def test_validate_feature_frame_rejects_non_finite():
    values = [1.0] * len(FEATURE_COLUMNS)
    values[FEATURE_COLUMNS.index("lag_1")] = np.nan
    row = pd.DataFrame([values], columns=list(FEATURE_COLUMNS))
    with pytest.raises(ValueError, match="non-finite"):
        validate_feature_frame(row, FEATURE_COLUMNS)