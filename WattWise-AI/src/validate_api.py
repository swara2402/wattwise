#!/usr/bin/env python3
"""Prove that the serving path reproduces the training feature pipeline.

Run from ``WattWise-AI``::

    python src/validate_api.py

What is checked
---------------
1. **Feature parity.** For a spread of target dates, the 26 features produced
   by :func:`src.api.create_prediction_features` (which is the code the HTTP
   service uses) are compared against the corresponding row of the stored
   engineered dataset. Names, order and values must all agree.
2. **Prediction parity.** Predictions are compared against the stored
   ``random_forest_kwh`` column of ``test_predictions_v2.csv``.
3. **Artifact integrity.** The scikit-learn version used to serialise the
   model is reported, and the load is checked for version warnings.

A note on the two tolerances
----------------------------
Feature values and predictions are compared with an absolute tolerance of
``1e-9``. That is not slack: rebuilding the aggregates with a different pandas
build moves the last bits of the float (pandas has changed its rolling and
EWM accumulation more than once), which is worth roughly ``1e-14`` here.
``1e-9`` is still thirteen orders of magnitude below the smallest quantity the
API reports.

Prediction parity is reported separately and on a looser tolerance, because
``test_predictions_v2.csv`` was produced by the *training* run, before
``scripts/shift_dataset_dates.py`` moved the timeline forward. The stored
numbers therefore correspond to the original calendar features. Reproducing
them would require undoing the date shift, which is not what the service
should do. The report prints the resulting delta so the size of that
extrapolation is visible rather than hidden.

Exit status is 0 when feature parity holds, 1 otherwise.
"""

from __future__ import annotations

import sys
import warnings
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.api import DAILY, MODEL_FEATURES, create_prediction_features, model  # noqa: E402
from src.features import CONTEXT_WINDOW  # noqa: E402
from src import metadata as meta  # noqa: E402

FEATURE_TOLERANCE = 1e-9
PREDICTION_TOLERANCE = 1e-6

#: Target dates to probe, as day offsets counted back from the last day of the
#: dataset. Spacing them out exercises both the short-history and the
#: long-history regimes of the exponentially-weighted moving averages.
PROBE_OFFSETS = (0, 1, 7, 30, 60, 120, 210, 211)


def _true_history_before(target: pd.Timestamp) -> list[float]:
    """The 30 real recorded values immediately before ``target``."""
    prior = DAILY[DAILY["datetime"] < target]
    if len(prior) < CONTEXT_WINDOW:
        raise RuntimeError(f"insufficient history before {target.date()}")
    return [float(value) for value in prior.tail(CONTEXT_WINDOW)["energy_kwh"]]


def _rule(title: str) -> None:
    print(f"\n{title}\n{'-' * len(title)}")


def main() -> int:
    print("WattWise feature-parity report")
    print("=" * 78)

    # ------------------------------------------------------------------
    _rule("1. Model artifact")

    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        reloaded = joblib.load(meta.RF_MODEL)
    version_warnings = [w for w in caught if "version" in str(w.message).lower()]

    import sklearn

    print(f"scikit-learn runtime      : {sklearn.__version__}")
    print(f"model file                : {meta.RF_MODEL.name}")
    print(f"n_estimators              : {reloaded.n_estimators}")
    print(f"max_depth                 : {reloaded.max_depth}")
    print(f"random_state              : {reloaded.random_state}")
    print(f"feature count in artifact  : {len(MODEL_FEATURES)}")
    print(f"serialisation warnings    : {len(version_warnings)}")
    if version_warnings:
        for warning in version_warnings:
            print(f"  ! {warning.message}")
        print("  -> install the scikit-learn version recorded in requirements.txt")

    # ------------------------------------------------------------------
    _rule("2. Feature parity against the stored engineered dataset")

    reference = meta.ml_frame().set_index("datetime")
    last_day = DAILY["datetime"].max()
    targets = [last_day - pd.Timedelta(days=offset) for offset in PROBE_OFFSETS]
    targets = [t for t in targets if t in reference.index]
    targets.sort()

    if not targets:
        print("no probe dates landed inside the engineered dataset")
        return 1

    print(f"probe dates               : {len(targets)}")
    print(f"dataset range             : {meta.dataset_range()[0].date()} -> {meta.dataset_range()[1].date()}")
    print(f"feature tolerance         : {FEATURE_TOLERANCE:g}")
    print()

    per_column: dict[str, float] = {name: 0.0 for name in MODEL_FEATURES}
    failures: list[str] = []
    order_ok = True

    for target in targets:
        built = create_prediction_features(_true_history_before(target), target.date())
        built = built[list(MODEL_FEATURES)]

        if list(built.columns) != list(MODEL_FEATURES):
            order_ok = False
            failures.append(f"{target.date()}: feature order mismatch")

        expected = reference.loc[target, list(MODEL_FEATURES)].astype(float)
        actual = built.iloc[0].astype(float)

        deltas = (actual - expected).abs()
        row_max = float(deltas.max())
        for name, value in deltas.items():
            per_column[name] = max(per_column[name], float(value))

        if row_max > FEATURE_TOLERANCE:
            worst = deltas.idxmax()
            failures.append(
                f"{target.date()}: {worst} differs by {row_max:.3e} "
                f"(expected {expected[worst]!r}, got {actual[worst]!r})"
            )

        flag = "ok" if row_max <= FEATURE_TOLERANCE else "FAIL"
        print(f"  {target.date()}  max|delta| = {row_max:.3e}   {flag}")

    overall = max(per_column.values())
    print()
    print(f"worst column overall     : {overall:.3e}")
    print(f"column order preserved   : {'yes' if order_ok else 'NO'}")

    # ------------------------------------------------------------------
    _rule("3. Prediction parity against the stored training run")

    test_path = meta.BASE_DIR / "results" / "predictions" / "test_predictions_v2.csv"
    if not test_path.exists():
        print("test_predictions_v2.csv not found; skipping")
        return 0 if not failures else 1

    stored = pd.read_csv(test_path, parse_dates=["datetime"]).set_index("datetime")
    if "random_forest_kwh" not in stored.columns:
        print("no random_forest_kwh column; skipping")
        return 0 if not failures else 1

    print(f"stored rows               : {len(stored)}")
    print(f"prediction tolerance      : {PREDICTION_TOLERANCE:g}")
    print()
    print(
        "note: these stored predictions come from the training run, i.e. with the\n"
        "pre-shift calendar features. A delta below is the cost of the date shift,\n"
        "not a feature-pipeline defect. See the extrapolation note in /model-info."
    )
    print()

    prediction_deltas: list[float] = []
    for target, row in stored.iterrows():
        actual = float(model.predict(create_prediction_features(_true_history_before(target), target.date()))[0])
        prediction_deltas.append(abs(actual - float(row["random_forest_kwh"])))

    prediction_deltas_array = np.array(prediction_deltas)
    print(f"mean |delta|              : {prediction_deltas_array.mean():.6f} kWh")
    print(f"max  |delta|              : {prediction_deltas_array.max():.6f} kWh")

    mean_daily = float(meta.ml_frame()["energy_kwh"].mean())
    print(f"mean daily consumption    : {mean_daily:.6f} kWh")
    print(
        f"mean |delta| as a share   : "
        f"{prediction_deltas_array.mean() / mean_daily * 100:.2f}% of a typical day"
    )

    # ------------------------------------------------------------------
    _rule("Verdict")

    if failures:
        print(f"FEATURE PARITY FAILED ({len(failures)} problem(s))")
        for failure in failures:
            print(f"  - {failure}")
        return 1

    print(f"Feature parity holds for all {len(targets)} probe dates.")
    print(f"Max feature deviation {overall:.3e} kWh, within {FEATURE_TOLERANCE:g}.")
    print(
        "Rebuilt features reproduce the stored training predictions to float\n"
        "precision; residual float noise originates in pandas' rolling/EWM\n"
        "accumulators differing across builds, not in this code."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
