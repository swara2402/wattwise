"""Single source of truth for model, dataset and metric metadata.

Everything the API and the UI display about *what model is running* and
*what data it learned from* is derived here, from the shipped artifacts, at
import time. Nothing is hard-coded in a route handler or in a React
component, so the frontend, the API and the tests cannot disagree.

Sources of truth
----------------
``data/processed/daily_consumption_v2.csv``
    the demo time series; defines the supported prediction date range.
``data/processed/ml_dataset_v2.csv``
    the engineered training table; defines row counts and the split sizes.
``results/metrics/model_comparison_v2.csv``
    held-out accuracy for each candidate model.
``models/*.joblib``
    the fitted estimators themselves; define the hyper-parameters.
"""

from __future__ import annotations

import functools
from pathlib import Path
from typing import Any

import joblib
import pandas as pd

BASE_DIR = Path(__file__).resolve().parent.parent

DAILY_CSV = BASE_DIR / "data" / "processed" / "daily_consumption_v2.csv"
ML_CSV = BASE_DIR / "data" / "processed" / "ml_dataset_v2.csv"
COMPARISON_CSV = BASE_DIR / "results" / "metrics" / "model_comparison_v2.csv"
CLUSTER_SUMMARY_CSV = BASE_DIR / "results" / "metrics" / "cluster_summary_v2.csv"

RF_MODEL = BASE_DIR / "models" / "random_forest_v2.joblib"
XGB_MODEL = BASE_DIR / "models" / "xgboost_v2.joblib"
ISO_MODEL = BASE_DIR / "models" / "isolation_forest_v2.joblib"

#: Chronological split fractions used by ``train_v2.py``.
TRAIN_FRACTION = 0.70
VALIDATION_FRACTION = 0.15
TEST_FRACTION = 0.15

DATASET_NAME = "UCI Individual household electric power consumption"
DATASET_SOURCE = "https://archive.ics.uci.edu/dataset/235/individual+household+electric+power+consumption"

#: Applied by ``scripts/shift_dataset_dates.py`` to move the demo time axis
#: into a recent window. The measurements are unchanged; only the calendar
#: position of each day was translated.
DATE_SHIFT_DAYS = 5844
DATE_SHIFT_NOTE = (
    f"The demo timeline is the original UCI series translated forward by "
    f"{DATE_SHIFT_DAYS} days so it reads as recent data. Row count, ordering "
    f"and every measured value are unchanged; the day-of-week labels rotate by "
    f"one day because {DATE_SHIFT_DAYS} is not a multiple of 7."
)

EXTRAPOLATION_NOTE = (
    "The underlying consumption observations originate from a historical "
    "benchmark dataset collected between 2006 and 2010. The shipped Random Forest "
    "was fitted on these original 2006-2010 feature values and is reused unchanged. "
    "On the shifted timeline the calendar features are re-derived, so year (2022-2026), "
    "day-of-week, week-of-year and is-weekend are extrapolated rather than interpolated. "
    "Held-out error below was measured on the original timeline. "
    "Future improvement: retrain using recent/current household consumption data. "
    "Carbon emissions calculation uses a grid emission factor of 0.79 kg CO₂/kWh, "
    "which is configurable in the app settings."
)


def _require(path: Path) -> Path:
    if not path.exists():
        raise FileNotFoundError(f"required artifact missing: {path}")
    return path


@functools.lru_cache(maxsize=1)
def daily_frame() -> pd.DataFrame:
    return pd.read_csv(_require(DAILY_CSV), parse_dates=["datetime"])


@functools.lru_cache(maxsize=1)
def ml_frame() -> pd.DataFrame:
    return pd.read_csv(_require(ML_CSV), parse_dates=["datetime"])


@functools.lru_cache(maxsize=1)
def comparison_frame() -> pd.DataFrame:
    frame = pd.read_csv(_require(COMPARISON_CSV))
    frame.columns = [column.strip() for column in frame.columns]
    return frame


@functools.lru_cache(maxsize=1)
def dataset_range() -> tuple[pd.Timestamp, pd.Timestamp]:
    frame = daily_frame()
    return frame["datetime"].min(), frame["datetime"].max()


@functools.lru_cache(maxsize=1)
def split_sizes() -> dict[str, int]:
    n = len(ml_frame())
    train_end = int(n * TRAIN_FRACTION)
    validation_end = int(n * (TRAIN_FRACTION + VALIDATION_FRACTION))
    return {
        "total_rows": n,
        "training_rows": train_end,
        "validation_rows": validation_end - train_end,
        "test_rows": n - validation_end,
    }


@functools.lru_cache(maxsize=1)
def split_boundaries() -> dict[str, str]:
    """Calendar boundaries of each chronological split.

    Published so the UI can ask for the real held-out window instead of
    hard-coding a list of consumption values that silently goes stale.
    """
    frame = ml_frame().sort_values("datetime")
    sizes = split_sizes()
    train_end = sizes["training_rows"]
    validation_end = train_end + sizes["validation_rows"]

    def span(start: int, stop: int) -> dict[str, str]:
        return {
            "start_date": frame["datetime"].iloc[start].date().isoformat(),
            "end_date": frame["datetime"].iloc[stop - 1].date().isoformat(),
            "rows": stop - start,
        }

    return {
        "training": span(0, train_end),
        "validation": span(train_end, validation_end),
        "test": span(validation_end, len(frame)),
    }


@functools.lru_cache(maxsize=1)
def _rf_params() -> dict[str, Any]:
    model = joblib.load(_require(RF_MODEL))
    return {
        "n_estimators": int(model.n_estimators),
        "max_depth": model.max_depth,
        "random_state": model.random_state,
        "n_features": int(model.n_features_in_),
        "feature_names": list(model.feature_names_in_),
    }


@functools.lru_cache(maxsize=1)
def _xgb_params() -> dict[str, Any]:
    model = joblib.load(_require(XGB_MODEL))
    params = model.get_params()
    return {
        "n_estimators": int(params.get("n_estimators", 0)),
        "max_depth": params.get("max_depth"),
        "learning_rate": params.get("learning_rate"),
    }


@functools.lru_cache(maxsize=1)
def _iso_params() -> dict[str, Any]:
    model = joblib.load(_require(ISO_MODEL))
    return {
        "n_estimators": int(model.n_estimators),
        "contamination": float(model.contamination),
    }


@functools.lru_cache(maxsize=1)
def metrics() -> dict[str, dict[str, float]]:
    """Held-out metrics per model, keyed by the label used in the UI."""
    frame = comparison_frame()
    out: dict[str, dict[str, float]] = {}
    for _, row in frame.iterrows():
        out[str(row["Model"])] = {
            "mae_kwh": float(row["MAE"]),
            "rmse_kwh": float(row["RMSE"]),
            "r2": float(row["R2"]),
            "training_seconds": float(row["Training_Time"]),
        }
    return out


@functools.lru_cache(maxsize=1)
def _companion_model_info() -> dict[str, Any]:
    """Best-effort description of the benchmark models.

    Only the Random Forest is served. The other artifacts exist so the UI can
    show what else was trained and how it scored, so a companion artifact that
    is missing, or that a newer library refuses to deserialise, must degrade to
    a note rather than take down ``/model-info``. The scikit-learn version is
    pinned in ``requirements.txt``; the XGBoost artifact was written by an
    older XGBoost and emits a compatibility warning on load.
    """
    info: dict[str, Any] = {}

    try:
        info["XGBoost V2"] = _xgb_params()
    except Exception as exc:  # pragma: no cover - depends on library version
        info["XGBoost V2"] = {
            "available": False,
            "reason": f"artifact could not be read: {type(exc).__name__}",
        }

    try:
        info["Isolation Forest"] = _iso_params()
    except Exception as exc:  # pragma: no cover - defensive
        info["Isolation Forest"] = {
            "available": False,
            "reason": f"artifact could not be read: {type(exc).__name__}",
        }

    return info


@functools.lru_cache(maxsize=1)
def model_metadata() -> dict[str, Any]:
    """The payload served by ``GET /model-info`` and rendered by the UI."""
    start, end = dataset_range()
    sizes = split_sizes()
    rf = _rf_params()
    return {
        "model_name": "Random Forest Regressor",
        "model_version": "v2",
        "model_type": "RandomForestRegressor",
        "production_model": "Random Forest V2",
        "library": "scikit-learn",
        "hyperparameters": {
            "n_estimators": rf["n_estimators"],
            "max_depth": rf["max_depth"],
            "random_state": rf["random_state"],
        },
        "feature_count": rf["n_features"],
        "features": rf["feature_names"],
        "trained_on_rows": sizes["total_rows"],
        "split": {
            "strategy": "chronological (no shuffling)",
            "training_rows": sizes["training_rows"],
            "validation_rows": sizes["validation_rows"],
            "test_rows": sizes["test_rows"],
            "fractions": {
                "train": TRAIN_FRACTION,
                "validation": VALIDATION_FRACTION,
                "test": TEST_FRACTION,
            },
            "boundaries": split_boundaries(),
        },
        "metrics": metrics(),
        "dataset": {
            "name": DATASET_NAME,
            "source_url": DATASET_SOURCE,
            "start_date": start.date().isoformat(),
            "end_date": end.date().isoformat(),
            "daily_rows": len(daily_frame()),
            "engineered_rows": sizes["total_rows"],
            "date_shift_days": DATE_SHIFT_DAYS,
            "date_shift_note": DATE_SHIFT_NOTE,
            "extrapolation_note": EXTRAPOLATION_NOTE,
        },
        "companion_models": _companion_model_info(),
    }


@functools.lru_cache(maxsize=1)
def cluster_summary() -> list[dict[str, Any]]:
    """Per-cluster consumption statistics, computed from the shipped labels.

    Recomputed from ``ml_dataset_v2.csv`` rather than read from
    ``cluster_summary_v2.csv`` so there is exactly one source. The generated
    summary file is kept in the repo as a training artifact and the test
    suite asserts the two agree.
    """
    frame = ml_frame()
    if "cluster" not in frame.columns:
        return []

    rows: list[dict[str, Any]] = []
    for label, group in frame.groupby("cluster", sort=True):
        values = group["energy_kwh"]
        rows.append(
            {
                "cluster_id": int(label),
                "label": f"Cluster {int(label)}",
                "days": int(values.size),
                "share_of_days": round(float(values.size) / len(frame), 4),
                "mean_kwh": round(float(values.mean()), 3),
                "median_kwh": round(float(values.median()), 3),
                "min_kwh": round(float(values.min()), 3),
                "max_kwh": round(float(values.max()), 3),
            }
        )

    if len(rows) == 2:
        high, low = sorted(rows, key=lambda row: row["mean_kwh"], reverse=True)
        high["behaviour"] = "higher_consumption"
        low["behaviour"] = "lower_consumption"
    return rows


@functools.lru_cache(maxsize=1)
def anomaly_frame() -> pd.DataFrame:
    """Days the training pipeline's isolation forest flagged as anomalous."""
    path = BASE_DIR / "results" / "predictions" / "anomalies_v2.csv"
    if not path.exists():
        return pd.DataFrame(columns=["datetime", "energy_kwh", "anomaly_score"])
    return pd.read_csv(path, parse_dates=["datetime"])


@functools.lru_cache(maxsize=1)
def anomaly_context() -> dict[str, Any]:
    """How the isolation forest flags a day, and how often it did.

    ``evaluated_rows`` is the number of engineered days that were actually
    scored (the first 30 days are consumed by the longest lag), not the size
    of the raw daily table, so the rate below is a true rate.
    """
    scored = len(ml_frame())
    anomalies = anomaly_frame()
    try:
        contamination = _iso_params()["contamination"]
    except Exception:  # pragma: no cover - defensive
        contamination = None
    return {
        "contamination": contamination,
        "evaluated_rows": scored,
        "flagged_rows": int(len(anomalies)),
        "flagged_rate": round(len(anomalies) / scored, 6) if scored else 0.0,
        "score_min": round(float(ml_frame()["anomaly_score"].min()), 6),
        "score_max": round(float(ml_frame()["anomaly_score"].max()), 6),
    }