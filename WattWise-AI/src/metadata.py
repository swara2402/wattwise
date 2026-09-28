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


@functools.lru_cache(maxsize=1)
def dataset_statistics() -> dict[str, Any]:
    """Rigorous statistical analysis computed directly from daily_frame()."""
    df = daily_frame().copy()
    energy = df["energy_kwh"]

    q25 = float(energy.quantile(0.25))
    q75 = float(energy.quantile(0.75))

    stats_summary = {
        "mean": round(float(energy.mean()), 3),
        "median": round(float(energy.median()), 3),
        "std": round(float(energy.std()), 3),
        "variance": round(float(energy.var()), 3),
        "min": round(float(energy.min()), 3),
        "max": round(float(energy.max()), 3),
        "q25": round(q25, 3),
        "q75": round(q75, 3),
        "iqr": round(q75 - q25, 3),
        "skewness": round(float(energy.skew()), 3),
        "kurtosis": round(float(energy.kurtosis()), 3),
        "count": len(energy),
    }

    df["dt"] = pd.to_datetime(df["datetime"])
    df["day_of_week"] = df["dt"].dt.dayofweek
    df["is_weekend"] = df["day_of_week"].isin([5, 6])
    df["month"] = df["dt"].dt.month
    df["season"] = (df["month"] % 12) // 3

    weekdays = df[~df["is_weekend"]]["energy_kwh"]
    weekends = df[df["is_weekend"]]["energy_kwh"]

    weekday_vs_weekend = {
        "weekday": {
            "count": len(weekdays),
            "mean_kwh": round(float(weekdays.mean()), 3),
            "median_kwh": round(float(weekdays.median()), 3),
            "std_kwh": round(float(weekdays.std()), 3),
        },
        "weekend": {
            "count": len(weekends),
            "mean_kwh": round(float(weekends.mean()), 3),
            "median_kwh": round(float(weekends.median()), 3),
            "std_kwh": round(float(weekends.std()), 3),
        },
        "weekend_elevation_ratio": round(float(weekends.mean() / weekdays.mean()), 3) if len(weekdays) > 0 else 1.0,
    }

    day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    dow_breakdown = []
    for dow in range(7):
        sub = df[df["day_of_week"] == dow]["energy_kwh"]
        dow_breakdown.append({
            "day_index": dow,
            "day_name": day_names[dow],
            "is_weekend": dow >= 5,
            "count": len(sub),
            "mean_kwh": round(float(sub.mean()), 3) if len(sub) > 0 else 0.0,
            "median_kwh": round(float(sub.median()), 3) if len(sub) > 0 else 0.0,
            "std_kwh": round(float(sub.std()), 3) if len(sub) > 0 else 0.0,
        })

    month_names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    monthly_trends = []
    for m in range(1, 13):
        sub = df[df["month"] == m]["energy_kwh"]
        if len(sub) > 0:
            monthly_trends.append({
                "month_index": m,
                "month_name": month_names[m - 1],
                "count": len(sub),
                "mean_kwh": round(float(sub.mean()), 3),
                "median_kwh": round(float(sub.median()), 3),
            })

    season_names = {0: "Winter", 1: "Spring", 2: "Summer", 3: "Autumn"}
    seasonal_trends = []
    for s_code, s_name in season_names.items():
        sub = df[df["season"] == s_code]["energy_kwh"]
        if len(sub) > 0:
            seasonal_trends.append({
                "season_code": s_code,
                "season_name": s_name,
                "count": len(sub),
                "mean_kwh": round(float(sub.mean()), 3),
                "median_kwh": round(float(sub.median()), 3),
            })

    # Submetering totals & breakdown (converting watt-hours per day to kWh)
    sub1_kwh = df["sub_metering_1"].sum() / 1000.0 if "sub_metering_1" in df.columns else 0.0
    sub2_kwh = df["sub_metering_2"].sum() / 1000.0 if "sub_metering_2" in df.columns else 0.0
    sub3_kwh = df["sub_metering_3"].sum() / 1000.0 if "sub_metering_3" in df.columns else 0.0
    total_active_kwh = df["energy_kwh"].sum()
    metered_kwh = sub1_kwh + sub2_kwh + sub3_kwh
    unmetered_kwh = max(0.0, total_active_kwh - metered_kwh)

    submetering_summary = {
        "sub_1_kitchen_kwh": round(float(sub1_kwh), 2),
        "sub_2_laundry_kwh": round(float(sub2_kwh), 2),
        "sub_3_climate_water_kwh": round(float(sub3_kwh), 2),
        "unmetered_kwh": round(float(unmetered_kwh), 2),
        "total_kwh": round(float(total_active_kwh), 2),
        "sub_1_pct": round(float(sub1_kwh / total_active_kwh * 100), 2) if total_active_kwh > 0 else 0,
        "sub_2_pct": round(float(sub2_kwh / total_active_kwh * 100), 2) if total_active_kwh > 0 else 0,
        "sub_3_pct": round(float(sub3_kwh / total_active_kwh * 100), 2) if total_active_kwh > 0 else 0,
        "unmetered_pct": round(float(unmetered_kwh / total_active_kwh * 100), 2) if total_active_kwh > 0 else 0,
    }

    num_cols = ["energy_kwh", "avg_voltage", "avg_intensity", "avg_reactive_power", "sub_metering_1", "sub_metering_2", "sub_metering_3"]
    avail_cols = [c for c in num_cols if c in df.columns]
    corr_matrix = df[avail_cols].corr()["energy_kwh"].to_dict()
    correlations = {k: round(float(v), 4) for k, v in corr_matrix.items()}

    return {
        "summary": stats_summary,
        "weekday_vs_weekend": weekday_vs_weekend,
        "day_of_week_breakdown": dow_breakdown,
        "monthly_trends": monthly_trends,
        "seasonal_trends": seasonal_trends,
        "submetering": submetering_summary,
        "correlations": correlations,
    }


@functools.lru_cache(maxsize=1)
def pipeline_metadata() -> dict[str, Any]:
    """Big Data pipeline steps and record tracking."""
    return {
        "raw_dataset": {
            "name": "UCI Individual Household Power Consumption",
            "raw_records": 2075259,
            "raw_missing_values": 25979,
            "raw_missing_pct": 1.25,
            "sampling_rate": "1-minute resolution",
            "period": "2006-12-16 to 2010-11-26 (shifted 5844 days for recent alignment)",
        },
        "data_cleaning": {
            "missing_value_method": "Time-based linear interpolation (limit=60 mins)",
            "post_cleaning_missing_values": 0,
            "dropped_invalid_rows": 0,
        },
        "daily_aggregation": {
            "method": "Resampled to daily resolution (sum(Global_active_power)/60 for daily kWh)",
            "processed_daily_records": len(daily_frame()),
        },
        "feature_engineering": {
            "total_engineered_features": 26,
            "context_window_days": 30,
            "records_after_lag_drop": len(ml_frame()),
            "feature_categories": {
                "calendar": 9,
                "lags": 7,
                "rolling_means": 4,
                "rolling_stds": 4,
                "ewm": 2,
            },
        },
        "train_val_test_split": {
            "strategy": "Chronological (no random shuffling to prevent temporal data leakage)",
            "split_sizes": split_sizes(),
            "boundaries": split_boundaries(),
        },
    }