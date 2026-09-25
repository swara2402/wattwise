#!/usr/bin/env python3
"""Shift the benchmark time axis forward by a fixed number of days.

Why this exists
---------------
The public demo data set is the UCI *Individual household electric power
consumption* set (Dec 2006 - Nov 2010). A demo that ends in 2010 reads as
stale, so the entire time axis is translated forward by a constant
``OFFSET_DAYS`` so that:

    2006-12-16  ->  2022-12-16
    2010-11-26  ->  2026-11-26

What this script guarantees
---------------------------
* Row counts, row order and every non-date measurement are **bit-for-bit
  unchanged** (the values are the same household's measurements).
* Month and day-of-month are preserved for every row, because the offset is
  a whole number of years expressed in days and the source span contains no
  29 February ambiguity for these endpoints.
* Calendar features in ``ml_dataset_v2.csv`` are **recomputed** from the
  canonical calendar code rather than shifted, so they stay internally
  consistent with the new dates.

What this script does NOT do
----------------------------
* It does not retrain, refit or replace any model artifact. The shipped
  Random Forest was fitted on the original 2006-2010 feature values and is
  reused unchanged; see README for the documented extrapolation caveat.
* It does not change day-of-week labels to match. ``OFFSET_DAYS % 7 == 6``,
  so every row's weekday shifts by exactly one day and ``is_weekend`` flips
  wherever the shift crosses the weekend boundary. The weekday/weekend
  features are therefore genuinely re-derived, not relabelled.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.features import add_calendar_features  # noqa: E402

# ---------------------------------------------------------------------------
# The single constant that defines the whole migration.
# ---------------------------------------------------------------------------

OFFSET_DAYS = 5844

#: Used only as a guard so the script cannot be run twice.
SHIFTED_START = pd.Timestamp("2022-12-16")

DAILY_CSV = Path("data/processed/daily_consumption_v2.csv")
ML_CSV = Path("data/processed/ml_dataset_v2.csv")
ANOMALIES_CSV = Path("results/predictions/anomalies_v2.csv")
TEST_PREDICTIONS_CSV = Path("results/predictions/test_predictions_v2.csv")

OFFSET = pd.Timedelta(days=OFFSET_DAYS)


def _fail(message: str) -> None:
    raise SystemExit(f"[shift-dates] ERROR: {message}")


def _load(path: Path) -> pd.DataFrame:
    if not path.exists():
        _fail(f"missing input file: {path}")
    return pd.read_csv(path, parse_dates=["datetime"])


def _check_not_already_shifted(frames: dict[str, pd.DataFrame]) -> None:
    for name, frame in frames.items():
        if frame["datetime"].min() >= SHIFTED_START:
            _fail(
                f"{name} already starts at {frame['datetime'].min().date()} "
                f"(>= {SHIFTED_START.date()}). The migration has already been "
                f"applied; refusing to double-shift."
            )


def _check_row_counts(before: dict[str, int], frames: dict[str, pd.DataFrame]) -> None:
    for name, frame in frames.items():
        if len(frame) != before[name]:
            _fail(f"{name}: row count changed {before[name]} -> {len(frame)}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="report what would change without writing any file",
    )
    args = parser.parse_args(argv)

    root = Path(__file__).resolve().parent.parent

    daily = _load(root / DAILY_CSV)
    ml = _load(root / ML_CSV)
    anomalies = _load(root / ANOMALIES_CSV)
    test_preds = _load(root / TEST_PREDICTIONS_CSV)

    frames = {
        DAILY_CSV.name: daily,
        ML_CSV.name: ml,
        ANOMALIES_CSV.name: anomalies,
        TEST_PREDICTIONS_CSV.name: test_preds,
    }
    _check_not_already_shifted(frames)
    before_rows = {name: len(frame) for name, frame in frames.items()}
    originals = {name: frame.copy(deep=True) for name, frame in frames.items()}

    print(f"[shift-dates] offset = +{OFFSET_DAYS} days")
    for name, frame in frames.items():
        print(
            f"[shift-dates] {name:32s} {len(frame):>5d} rows  "
            f"{frame['datetime'].min().date()} -> {frame['datetime'].max().date()}"
        )

    # ---- shift the time axis -------------------------------------------------
    for frame in frames.values():
        frame["datetime"] = frame["datetime"] + OFFSET

    # ---- recompute calendar features in the engineered dataset ---------------
    calendar = add_calendar_features(pd.DatetimeIndex(ml["datetime"]))
    for column in calendar.columns:
        if column not in ml.columns:
            _fail(f"{ML_CSV.name} is missing expected column {column!r}")
        ml[column] = calendar[column].to_numpy()

    # ---- verify the invariants ----------------------------------------------
    errors: list[str] = []

    for name, frame in frames.items():
        if not frame["datetime"].is_monotonic_increasing:
            errors.append(f"{name}: datetime is no longer sorted ascending")
        if not frame["datetime"].is_unique:
            errors.append(f"{name}: datetime contains duplicates")
    _check_row_counts(before_rows, frames)

    # measurements must be untouched
    for column in daily.columns:
        if column == "datetime":
            continue
        if not daily[column].equals(originals[DAILY_CSV.name][column]):
            errors.append(f"{DAILY_CSV.name}: column {column!r} was modified")

    # month / day-of-month must survive the translation
    for name in (DAILY_CSV.name, ML_CSV.name):
        original = originals[name]["datetime"]
        shifted = frames[name]["datetime"]
        if not ((shifted.dt.month == original.dt.month).all()
                and (shifted.dt.day == original.dt.day).all()):
            errors.append(f"{name}: month/day-of-month was not preserved")

    # the engineered dataset must still agree with the canonical features
    rebuilt = add_calendar_features(pd.DatetimeIndex(ml["datetime"]))
    if not rebuilt.reset_index(drop=True).equals(
        ml[list(rebuilt.columns)].reset_index(drop=True)
    ):
        errors.append(f"{ML_CSV.name}: calendar columns disagree with canonical code")

    if errors:
        for error in errors:
            print(f"[shift-dates] FAIL {error}")
        return 1

    print()
    print(f"[shift-dates] new range: {daily['datetime'].min().date()} -> "
          f"{daily['datetime'].max().date()}")
    shifted_dow = set(
        ((ml["datetime"].dt.dayofweek
          - originals[ML_CSV.name]["datetime"].dt.dayofweek) % 7)
    )
    print(f"[shift-dates] weekday delta (mod 7): {sorted(shifted_dow)}")
    print("[shift-dates] rows and measurements preserved: OK")
    print("[shift-dates] calendar features recomputed via src/features.py: OK")

    if args.dry_run:
        print("[shift-dates] dry run - no files written")
        return 0

    for relative, frame in (
        (DAILY_CSV, daily),
        (ML_CSV, ml),
        (ANOMALIES_CSV, anomalies),
        (TEST_PREDICTIONS_CSV, test_preds),
    ):
        path = root / relative
        frame.to_csv(path, index=False)
        print(f"[shift-dates] wrote {relative}")

    print("[shift-dates] done. Model artifacts were NOT retrained or modified.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
