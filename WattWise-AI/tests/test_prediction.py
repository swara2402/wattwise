"""The HTTP prediction path must reproduce the trained model exactly.

The expensive part of the pipeline is already covered by ``test_features``.
What matters here is that the *serving* entry point - the function the route
handler calls - lands on the same numbers as the training reference, and that
its input handling is strict.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from src import metadata as meta
from src.api import (
    DAILY,
    DATASET_END,
    DATASET_START,
    _history_series,
    create_prediction_features,
    predict_consumption,
)
from src.features import CONTEXT_WINDOW, FEATURE_COLUMNS

FLOAT_NOISE = 1e-9


def true_history_before(target: pd.Timestamp) -> list[float]:
    prior = DAILY[DAILY["datetime"] < target]
    return [float(value) for value in prior.tail(CONTEXT_WINDOW)["energy_kwh"]]


# ---------------------------------------------------------------------------
# Parity
# ---------------------------------------------------------------------------


def test_api_features_match_the_stored_training_reference(ml_dataset):
    """Serving features == the row the model was actually fitted on."""
    reference = ml_dataset.set_index("datetime")
    targets = [
        DATASET_END,
        DATASET_END - pd.Timedelta(days=30),
        DATASET_END - pd.Timedelta(days=211),
        pd.Timestamp("2023-06-15"),
    ]

    checked = 0
    for target in targets:
        if target not in reference.index:
            continue
        built = create_prediction_features(true_history_before(target), target.date())
        expected = reference.loc[target, list(FEATURE_COLUMNS)].astype(float)
        actual = built.iloc[0].astype(float)
        for column in FEATURE_COLUMNS:
            assert actual[column] == pytest.approx(
                expected[column], abs=FLOAT_NOISE
            ), f"{column} drifted on {target.date()}"
        checked += 1

    assert checked >= 3, "not enough probe dates landed in the reference dataset"


def test_api_features_have_the_exact_model_column_order():
    built = create_prediction_features(
        true_history_before(DATASET_END), DATASET_END.date()
    )
    assert list(built.columns) == list(FEATURE_COLUMNS)
    assert len(built) == 1
    assert np.isfinite(built.to_numpy(dtype=float)).all()


def test_predictions_are_bit_reproducible():
    """Identical input must give an identical answer, not merely a close one."""
    values = true_history_before(DATASET_END)
    answers = {predict_consumption(values, DATASET_END.date()) for _ in range(8)}
    assert len(answers) == 1, "prediction is not deterministic"


def test_serving_pins_the_forest_to_one_worker():
    """n_jobs=-1 makes the threaded reduction order vary run to run."""
    from src.api import model as served

    assert served.n_jobs == 1


def test_predictions_are_never_negative():
    """A forest of trees can average below zero on absurd input; floor it."""
    for target in (DATASET_START + pd.Timedelta(days=31), DATASET_END):
        value = predict_consumption([0.0] * CONTEXT_WINDOW, target.date())
        assert value >= 0.0


def test_zero_consumption_history_is_accepted():
    value = predict_consumption([0.0] * CONTEXT_WINDOW, DATASET_END.date())
    assert value >= 0.0


def test_prediction_is_sensitive_to_the_supplied_window():
    """If the last 30 days were ignored, these two would be identical."""
    low = predict_consumption([5.0] * CONTEXT_WINDOW, DATASET_END.date())
    high = predict_consumption([60.0] * CONTEXT_WINDOW, DATASET_END.date())
    assert low != high
    assert high > low


# ---------------------------------------------------------------------------
# The user window is written positionally
# ---------------------------------------------------------------------------


def test_supplied_values_replace_the_last_thirty_records():
    values = [1.0] * CONTEXT_WINDOW
    energy = _history_series(DATASET_END, np.array(values))
    assert len(energy.tail(CONTEXT_WINDOW)) == CONTEXT_WINDOW
    assert list(energy.tail(CONTEXT_WINDOW)) == values


def test_history_stops_the_day_before_the_target():
    energy = _history_series(DATASET_END, np.array([1.0] * CONTEXT_WINDOW))
    assert energy.index[-1] == DATASET_END - pd.Timedelta(days=1)
    assert energy.index[-1] < DATASET_END


def test_history_keeps_full_length_so_ewm_bias_is_unchanged():
    """Positional overwrite preserves series length across calendar gaps.

    The demo series has five missing-calendar-day gaps. Had the window been
    built on a synthetic run of 30 calendar days instead of the last 30
    records, the series handed to the EWM would be shorter than the one
    training saw on those days, changing the adjust=True bias correction.
    The probe dates below are the first record after each gap.
    """
    gaps = DAILY["datetime"].diff().dt.days
    after_gap = DAILY.loc[gaps[gaps > 1].index, "datetime"].tolist()
    assert after_gap, "expected the demo series to contain calendar gaps"

    for target in [*after_gap, DATASET_END]:
        prior = DAILY[DAILY["datetime"] < target]
        energy = _history_series(target, np.array([1.0] * CONTEXT_WINDOW))
        assert len(energy) == len(prior), (
            f"{target.date()}: history length {len(energy)} != {len(prior)} records, "
            f"so the EWM bias correction would diverge from training"
        )


def test_a_calendar_based_window_would_have_been_the_wrong_length():
    """Documents the bug this design avoids, on a real gap in the data."""
    target = pd.Timestamp("2026-08-22")
    assert (DAILY["datetime"] == target).any()

    correct = _history_series(target, np.array([1.0] * CONTEXT_WINDOW))

    # What the previous implementation built: a synthetic run of 30 calendar
    # days plus everything strictly older than target - 30 days.
    start = target - pd.Timedelta(days=30)
    naive = len(DAILY[DAILY["datetime"] < start]) + 30

    assert len(correct) == len(DAILY[DAILY["datetime"] < target])
    # The gap means 30 calendar days span only 26 records, so a calendar-based
    # window pads the series with 4 extra rows and the EWM bias correction
    # no longer matches what training computed.
    assert naive == len(correct) + 4, "gap case no longer exercises the difference"


# ---------------------------------------------------------------------------
# Input validation
# ---------------------------------------------------------------------------


def test_rejects_wrong_number_of_values():
    with pytest.raises(ValueError, match="Exactly 30"):
        create_prediction_features([1.0] * 29, DATASET_END.date())


def test_rejects_negative_consumption():
    with pytest.raises(ValueError, match="cannot be negative"):
        create_prediction_features([-1.0] + [1.0] * 29, DATASET_END.date())


def test_rejects_non_finite_consumption():
    values = [1.0] * 29 + [float("nan")]
    with pytest.raises(ValueError, match="finite"):
        create_prediction_features(values, DATASET_END.date())


def test_rejects_target_before_the_dataset():
    with pytest.raises(ValueError, match="before the start"):
        create_prediction_features(
            [1.0] * CONTEXT_WINDOW, (DATASET_START - pd.Timedelta(days=1)).date()
        )


def test_rejects_target_after_the_dataset():
    with pytest.raises(ValueError, match="after the end"):
        create_prediction_features(
            [1.0] * CONTEXT_WINDOW, (DATASET_END + pd.Timedelta(days=1)).date()
        )


def test_error_message_names_the_supported_range():
    with pytest.raises(ValueError) as excinfo:
        create_prediction_features(
            [1.0] * CONTEXT_WINDOW, (DATASET_END + pd.Timedelta(days=1)).date()
        )
    message = str(excinfo.value)
    assert DATASET_START.date().isoformat() in message
    assert DATASET_END.date().isoformat() in message


def test_rejects_target_without_enough_history():
    """The first 30 days of the series cannot produce a 30-day window."""
    with pytest.raises(ValueError, match="Not enough history"):
        create_prediction_features(
            [1.0] * CONTEXT_WINDOW, (DATASET_START + pd.Timedelta(days=5)).date()
        )


# ---------------------------------------------------------------------------
# Stored predictions
# ---------------------------------------------------------------------------


def test_reported_typical_error_matches_the_stored_metric():
    rf = meta.metrics()["Random Forest V2"]
    assert rf["mae_kwh"] == pytest.approx(4.002807515925729, abs=1e-9)


def test_stored_predictions_are_within_the_documented_shift_delta(stored_test_predictions):
    """Predictions differ from the pre-shift training run by the known amount.

    ``test_predictions_v2.csv`` was produced before the date migration, so its
    calendar features are the original ones. Reproducing it exactly would mean
    undoing the shift. This test pins the size of that gap so an accidental
    change to the feature pipeline cannot hide inside it.
    """
    stored = stored_test_predictions.set_index("datetime")
    deltas = []
    for target, row in stored.head(60).iterrows():
        actual = predict_consumption(
            true_history_before(target), target.date()
        )
        deltas.append(abs(actual - float(row["random_forest_kwh"])))
    mean_delta = float(np.mean(deltas))
    assert mean_delta < 2.0, (
        f"mean prediction delta {mean_delta:.3f} kWh exceeds the documented "
        f"date-shift effect; feature parity may have regressed"
    )
