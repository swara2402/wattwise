"""Canonical feature engineering for the WattWise daily-consumption model.

This module is the **single source of truth** for the 26 features the
production Random Forest expects. Both the training pipeline
(``train_v2.py``) and the FastAPI prediction path (``api.py``) build their
rows through :func:`add_time_series_features`, so the training and serving
implementations cannot drift apart.

Feature contract (26 columns, in the order the model was fitted on)::

    calendar  : day, month, year, day_of_week, day_of_year,
                week_of_year, quarter, is_weekend, season
    lags      : lag_1, lag_2, lag_3, lag_7, lag_14, lag_21, lag_30
    rolling   : rolling_mean_{3,7,14,30}
    volatility: rolling_std_{3,7,14,30}
    ewm       : ewm_7, ewm_30

Every time-series column is computed on ``energy_kwh`` **shifted by one
position**, so the target day's own consumption is never part of its own
feature row. That is what makes the table causal.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

__all__ = [
    "CALENDAR_FEATURES",
    "LAG_PERIODS",
    "ROLLING_WINDOWS",
    "EWM_SPANS",
    "FEATURE_COLUMNS",
    "FEATURE_GROUPS",
    "SEASON_LABELS",
    "EXPECTED_FEATURE_COUNT",
    "CALENDAR_FEATURE_COLUMNS",
    "season_of",
    "add_calendar_features",
    "add_time_series_features",
    "build_target_features",
    "validate_feature_frame",
]

# ---------------------------------------------------------------------------
# The feature specification. Change nothing here without retraining the model.
# ---------------------------------------------------------------------------

CALENDAR_FEATURES = (
    "year",
    "month",
    "day",
    "day_of_week",
    "day_of_year",
    "week_of_year",
    "quarter",
    "is_weekend",
    "season",
)

LAG_PERIODS = (1, 2, 3, 7, 14, 21, 30)
ROLLING_WINDOWS = (3, 7, 14, 30)
EWM_SPANS = (7, 30)

#: pandas' ``ewm`` default (``adjust=True``) is what the model was fitted with.
EWM_ADJUST = True

#: pandas' ``rolling.std`` default — sample standard deviation (ddof=1).
ROLLING_DDOF = 1

SEASON_LABELS = {0: "winter", 1: "spring", 2: "summer", 3: "autumn"}

FEATURE_GROUPS: dict[str, tuple[str, ...]] = {
    "calendar": CALENDAR_FEATURES,
    "lags": tuple(f"lag_{p}" for p in LAG_PERIODS),
    "rolling": tuple(f"rolling_mean_{w}" for w in ROLLING_WINDOWS),
    "volatility": tuple(f"rolling_std_{w}" for w in ROLLING_WINDOWS),
    "ewm": tuple(f"ewm_{span}" for span in EWM_SPANS),
}

#: Authoritative order, matching ``model.feature_names_in_``.
FEATURE_COLUMNS: tuple[str, ...] = (
    "year",
    "month",
    "day",
    "day_of_week",
    "day_of_year",
    "week_of_year",
    "quarter",
    "is_weekend",
    "season",
    "lag_1",
    "lag_2",
    "lag_3",
    "lag_7",
    "lag_14",
    "lag_21",
    "lag_30",
    "rolling_mean_3",
    "rolling_mean_7",
    "rolling_mean_14",
    "rolling_mean_30",
    "rolling_std_3",
    "rolling_std_7",
    "rolling_std_14",
    "rolling_std_30",
    "ewm_7",
    "ewm_30",
)

EXPECTED_FEATURE_COUNT = 26

#: Calendar columns in model-input order (a prefix of ``FEATURE_COLUMNS``).
CALENDAR_FEATURE_COLUMNS = FEATURE_COLUMNS[: len(CALENDAR_FEATURES)]

assert len(FEATURE_COLUMNS) == EXPECTED_FEATURE_COUNT
assert CALENDAR_FEATURE_COLUMNS == CALENDAR_FEATURES
assert set(FEATURE_COLUMNS) == {c for group in FEATURE_GROUPS.values() for c in group}

#: The API request supplies exactly this many recent daily readings.
CONTEXT_WINDOW = 30

#: Largest tolerated distance, in days, between the last history record and the
#: target date. The dataset's own worst step is 5 days (4 missing days); a
#: larger distance means the caller supplied the wrong series, not that the
#: calendar happened to skip.
MAX_HISTORY_GAP_DAYS = 5


# ---------------------------------------------------------------------------
# Calendar helpers
# ---------------------------------------------------------------------------


def season_of(month: int) -> int:
    """Season bucket for a calendar month.

    Dec/Jan/Feb -> 0 (winter), Mar/Apr/May -> 1, Jun/Jul/Aug -> 2,
    Sep/Oct/Nov -> 3. Written as ``(month % 12) // 3`` because that is the
    exact expression the training pipeline used; kept in that form so the
    two paths cannot disagree.
    """
    return (int(month) % 12) // 3


def _calendar_frame(index: pd.DatetimeIndex) -> pd.DataFrame:
    iso_week = index.isocalendar().week.to_numpy()
    return pd.DataFrame(
        {
            "year": index.year,
            "month": index.month,
            "day": index.day,
            "day_of_week": index.dayofweek,
            "day_of_year": index.dayofyear,
            "week_of_year": iso_week,
            "quarter": index.quarter,
            "is_weekend": (index.dayofweek >= 5).astype(int),
            "season": (index.month % 12) // 3,
        },
        index=index,
    )


# ---------------------------------------------------------------------------
# The one implementation
# ---------------------------------------------------------------------------


def add_calendar_features(index: pd.DatetimeIndex) -> pd.DataFrame:
    """Calendar features for a ``DatetimeIndex``, in model-input order.

    Exposed separately so date-migration tooling can recompute the calendar
    columns of an existing dataset from the same code the model was trained
    with, instead of re-deriving them by hand.
    """
    if not isinstance(index, pd.DatetimeIndex):
        raise TypeError("index must be a DatetimeIndex")
    return _calendar_frame(index)[list(CALENDAR_FEATURE_COLUMNS)]


def add_time_series_features(
    energy: pd.Series,
    *,
    feature_columns: tuple[str, ...] = FEATURE_COLUMNS,
) -> pd.DataFrame:
    """Build the full feature table for a daily ``energy_kwh`` series.

    Parameters
    ----------
    energy:
        Series of daily consumption indexed by ``DatetimeIndex``. Index must
        be sorted ascending; the first 30 positions will be ``NaN`` because
        the longest lag is 30.
    feature_columns:
        Column order to return. Defaults to the model's training order.

    Returns
    -------
    ``DataFrame`` with the same index as ``energy`` and exactly
    ``len(feature_columns)`` columns.
    """
    if not isinstance(energy, pd.Series):
        raise TypeError("energy must be a pandas Series")
    if not isinstance(energy.index, pd.DatetimeIndex):
        raise TypeError("energy must be indexed by a DatetimeIndex")
    if energy.isna().all():
        raise ValueError("energy series is entirely empty")

    frame = _calendar_frame(energy.index)

    # Shift first: every time-series feature for row t uses rows < t only.
    lagged = energy.shift(1)

    for period in LAG_PERIODS:
        frame[f"lag_{period}"] = lagged.shift(period - 1)

    for window in ROLLING_WINDOWS:
        rolled = lagged.rolling(window)
        frame[f"rolling_mean_{window}"] = rolled.mean()
        frame[f"rolling_std_{window}"] = rolled.std(ddof=ROLLING_DDOF)

    for span in EWM_SPANS:
        frame[f"ewm_{span}"] = lagged.ewm(span=span, adjust=EWM_ADJUST).mean()

    missing = [c for c in feature_columns if c not in frame.columns]
    if missing:
        raise ValueError(f"unknown feature columns requested: {missing}")

    return frame[list(feature_columns)]


def validate_feature_frame(frame: pd.DataFrame, feature_columns: tuple[str, ...]) -> None:
    """Raise if ``frame`` is not a single, complete, finite feature row."""
    if list(frame.columns) != list(feature_columns):
        raise ValueError(
            "feature column order mismatch: "
            f"expected {list(feature_columns)}, got {list(frame.columns)}"
        )
    if len(frame) != 1:
        raise ValueError(f"expected exactly 1 feature row, got {len(frame)}")
    values = frame.to_numpy(dtype=float)
    if not np.isfinite(values).all():
        bad = [feature_columns[i] for i in np.unique(np.argwhere(~np.isfinite(values))[:, 1])]
        raise ValueError(f"non-finite feature values produced for: {bad}")


def build_target_features(
    history_energy: pd.Series,
    target: pd.Timestamp,
    *,
    feature_columns: tuple[str, ...] = FEATURE_COLUMNS,
) -> pd.DataFrame:
    """Build the feature row for a single ``target`` day.

    ``history_energy`` must be the daily consumption series covering every
    record **strictly before** ``target``. The target's own consumption is
    unknown at prediction time, so a placeholder row is appended purely to
    carry the target's calendar position; because every time-series feature
    is shifted by one, that placeholder value never reaches the output.

    The series is read **positionally**, not by calendar offset: ``lag_1`` is
    the previous *record*. This is not a shortcut, it is what the model was
    trained on. ``add_time_series_features`` runs over a frame that itself
    contains a handful of missing calendar days, and ``pandas``'s
    ``shift``/``rolling``/``ewm`` are all positional, so during training a
    lag that crossed a gap already referred to the previous record rather than
    the previous day. Calendar-reindexing at serving time would therefore
    *introduce* a mismatch, not remove one. Callers should pass the 30 records
    immediately preceding the target.
    """
    target = pd.Timestamp(target)
    history_energy = pd.Series(history_energy)

    if len(history_energy) == 0:
        raise ValueError("history series is empty")
    if not isinstance(history_energy.index, pd.DatetimeIndex):
        raise TypeError("history must be indexed by a DatetimeIndex")
    if not history_energy.index.is_monotonic_increasing:
        # Deliberately not sorted here. Re-ordering a caller's series would
        # silently produce features that differ from the training pipeline,
        # which is exactly the drift this module exists to prevent.
        raise ValueError("history series must be sorted ascending")
    if history_energy.index[-1] >= target:
        raise ValueError("history series must end strictly before the target date")
    if (target - history_energy.index[-1]).days > MAX_HISTORY_GAP_DAYS:
        # A long silence before the target is almost certainly a caller bug
        # (wrong series, wrong unit) rather than a real calendar gap. The
        # dataset's own worst step is 5 days, so anything beyond that is not
        # a window this model was ever trained to reconstruct.
        raise ValueError(
            f"history ends {history_energy.index[-1].date()} but the target is "
            f"{target.date()} — they are {(target - history_energy.index[-1]).days} days apart, "
            f"beyond the {MAX_HISTORY_GAP_DAYS}-day maximum"
        )
    # Check for gaps within the history itself
    if len(history_energy.index) > 1:
        gaps = history_energy.index[1:] - history_energy.index[:-1]
        for i, gap in enumerate(gaps):
            if gap.days > MAX_HISTORY_GAP_DAYS:
                prev_date = history_energy.index[i].date()
                curr_date = history_energy.index[i+1].date()
                raise ValueError(
                    f"calendar gap between consecutive history records: {prev_date} and {curr_date} are "
                    f"{gap.days} days apart, beyond the {MAX_HISTORY_GAP_DAYS}-day maximum"
                )

    placeholder = pd.Series(
        [np.nan], index=pd.DatetimeIndex([target]), name=history_energy.name or "energy_kwh"
    )
    combined = pd.concat([history_energy, placeholder]).sort_index()

    frame = add_time_series_features(combined, feature_columns=feature_columns)
    row = frame.tail(1)
    validate_feature_frame(row, feature_columns)
    return row