"""WattWise AI FastAPI service.

Design notes
------------
* Feature construction is delegated entirely to :mod:`src.features`, which is
  the same module the training pipeline uses. This module contains no feature
  arithmetic of its own, so serving and training cannot drift.
* Model, dataset and metric facts come from :mod:`src.metadata`, which reads
  the shipped artifacts. Nothing displayed to a client is hard-coded here.
* ``CORS_ORIGINS`` is read from the environment. A wildcard is rejected at
  startup because it is incompatible with credentialed requests and would
  make the API callable from any site.
"""

from __future__ import annotations

import os
from datetime import date
from typing import Any

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

try:  # package import: ``uvicorn src.api:app``
    from . import metadata as meta
    from .billing import DEFAULT_BILLING_DAYS, MAX_BILLING_DAYS, BillInputError, compute_bill
    from .features import (
        CONTEXT_WINDOW,
        FEATURE_COLUMNS,
        build_target_features,
    )
except ImportError:  # flat import: ``api:app`` with ``src`` on sys.path
    import metadata as meta  # type: ignore[no-redef]
    from billing import (  # type: ignore[no-redef]
        DEFAULT_BILLING_DAYS,
        MAX_BILLING_DAYS,
        BillInputError,
        compute_bill,
    )
    from features import (  # type: ignore[no-redef]
        CONTEXT_WINDOW,
        FEATURE_COLUMNS,
        build_target_features,
    )


# =========================================================
# APP
# =========================================================

app = FastAPI(
    title="WattWise AI API",
    description="ML-powered household electricity prediction API",
    version="2.0.0",
)

DEFAULT_CORS_ORIGINS = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:8000",
    "https://wattwise-ai.vercel.app",  # Legacy deployment URL
    "https://web-24f6gbeec-swara2402s-projects.vercel.app",  # Current deployment URL - update this to your actual Vercel URL
)


def _cors_origins() -> list[str]:
    """Explicit browser origins allowed to call this API.

    Comma-separated ``CORS_ORIGINS`` wins; otherwise the built-in list is
    used, which covers local Vite and the deployed Vercel frontend. A
    wildcard is rejected rather than silently accepted, because
    ``allow_credentials=True`` plus ``*`` is both a spec violation and a
    security hole.
    """
    raw = os.getenv("CORS_ORIGINS", "")
    configured = [item.strip().rstrip("/") for item in raw.split(",") if item.strip()]
    origins = configured or list(DEFAULT_CORS_ORIGINS)
    if "*" in origins:
        raise RuntimeError(
            "CORS_ORIGINS must list explicit origins; '*' cannot be combined "
            "with credentialed requests."
        )
    return origins


ALLOWED_ORIGINS = _cors_origins()

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


# =========================================================
# ARTIFACTS
# =========================================================

model = joblib.load(meta.RF_MODEL)

# The forest was fitted with n_jobs=-1. Serving a single row with every core
# costs more than it saves, and the threaded reduction makes the float
# summation order vary between calls, so repeated predictions of identical
# input can differ in the last bits. Pin it to one worker for reproducible
# responses.
model.n_jobs = 1

MODEL_FEATURES = list(model.feature_names_in_)

if MODEL_FEATURES != list(FEATURE_COLUMNS):
    raise RuntimeError(
        "Feature contract drift: src/features.FEATURE_COLUMNS does not match the "
        "fitted model's feature_names_in_.\n"
        f"  features.py: {list(FEATURE_COLUMNS)}\n"
        f"  model      : {MODEL_FEATURES}"
    )

#: Date/energy view of the demo series, cached for the life of the process.
DAILY = (
    meta.daily_frame()[["datetime", "energy_kwh"]]
    .sort_values("datetime")
    .reset_index(drop=True)
)
DAILY["energy_kwh"] = pd.to_numeric(DAILY["energy_kwh"], errors="coerce")
DAILY = DAILY.dropna(subset=["energy_kwh"]).reset_index(drop=True)

DATASET_START, DATASET_END = meta.dataset_range()


# =========================================================
# REQUEST MODELS
# =========================================================


class PredictionRequest(BaseModel):
    consumption: list[float] = Field(
        ...,
        min_length=CONTEXT_WINDOW,
        max_length=CONTEXT_WINDOW,
        description=(
            f"Exactly {CONTEXT_WINDOW} daily consumption values in kWh, oldest first. "
            "These are the most recent recorded days immediately preceding "
            "target_date; they replace the final 30 records of the demo history."
        ),
    )
    target_date: date = Field(
        ...,
        description="The single day to predict.",
    )


class BillRequest(BaseModel):
    predicted_kwh: float = Field(
        ...,
        gt=0,
        description="Predicted consumption for ONE day, in kWh.",
    )
    tariff_per_kwh: float = Field(
        ...,
        gt=0,
        description="Flat unit rate in currency per kWh. No time-of-use or slab banding.",
    )
    days: int = Field(
        DEFAULT_BILLING_DAYS,
        ge=1,
        le=MAX_BILLING_DAYS,
        description="Length of the billing period in days.",
    )
    fixed_charge_per_period: float = Field(
        0.0,
        ge=0,
        description="Flat standing charge added once for the whole period.",
    )


# =========================================================
# PREDICTION INTERNALS
# =========================================================


def _validate_target(target: pd.Timestamp) -> None:
    """Reject target dates the model was not built to serve."""
    if target < DATASET_START:
        raise ValueError(
            f"Target date {target.date().isoformat()} is before the start of the "
            f"supported dataset range ({DATASET_START.date().isoformat()} to "
            f"{DATASET_END.date().isoformat()})."
        )
    if target > DATASET_END:
        raise ValueError(
            f"Target date {target.date().isoformat()} is after the end of the "
            f"supported dataset range ({DATASET_START.date().isoformat()} to "
            f"{DATASET_END.date().isoformat()})."
        )


def _validate_values(values: np.ndarray) -> None:
    if len(values) != CONTEXT_WINDOW:
        raise ValueError(f"Exactly {CONTEXT_WINDOW} consumption values are required.")
    if not np.isfinite(values).all():
        raise ValueError("Consumption values must be finite numbers.")
    if (values < 0).any():
        raise ValueError("Consumption values cannot be negative.")


def _history_series(target: pd.Timestamp, values: np.ndarray) -> pd.Series:
    """Demo history up to ``target``, with the final window replaced.

    The caller's values are written onto the **last 30 records** before the
    target, positionally, rather than onto a synthetic run of 30 calendar
    days. The demo series has a handful of missing calendar days, so a
    calendar-based window can be shorter than 30 records and would change the
    exponentially-weighted moving average's bias correction relative to
    training. Overwriting by record position keeps the series length and
    alignment identical to what the model was fitted on.
    """
    prior = DAILY[DAILY["datetime"] < target]
    if len(prior) < CONTEXT_WINDOW:
        raise ValueError(
            f"Not enough history before {target.date().isoformat()}: "
            f"{len(prior)} recorded day(s) available, {CONTEXT_WINDOW} required."
        )

    window = prior.tail(CONTEXT_WINDOW).index
    energy = prior.set_index("datetime")["energy_kwh"].copy()
    energy.loc[prior.loc[window, "datetime"]] = values
    return energy.sort_index()


def create_prediction_features(consumption: list[float], target_date: date) -> pd.DataFrame:
    """Build the 26-column feature row for ``target_date``."""
    values = np.asarray(consumption, dtype=float)
    _validate_values(values)

    target = pd.Timestamp(target_date)
    _validate_target(target)

    energy = _history_series(target, values)
    row = build_target_features(energy, target, feature_columns=tuple(MODEL_FEATURES))
    row.index = ["features"]
    return row


def predict_consumption(consumption: list[float], target_date: date) -> float:
    """Predicted kWh for a single day, floored at zero."""
    features = create_prediction_features(consumption, target_date)
    return max(0.0, float(model.predict(features)[0]))


# =========================================================
# HEALTH
# =========================================================


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "healthy",
        "model": meta.model_metadata()["production_model"],
        "model_type": type(model).__name__,
        "feature_count": len(MODEL_FEATURES),
        "dataset_start": DATASET_START.date().isoformat(),
        "dataset_end": DATASET_END.date().isoformat(),
        "allowed_origins": ALLOWED_ORIGINS,
    }


# =========================================================
# METADATA
# =========================================================


@app.get("/model-info")
def model_info() -> dict[str, Any]:
    """Model, hyper-parameters, held-out metrics and dataset provenance."""
    return meta.model_metadata()


@app.get("/dataset-info")
def dataset_info() -> dict[str, Any]:
    """Just the parts the UI needs to bound dates and label the data."""
    payload = meta.model_metadata()
    return {
        "dataset": payload["dataset"],
        "feature_count": payload["feature_count"],
        "features": payload["features"],
        "metrics": payload["metrics"],
        "anomaly_detection": meta.anomaly_context(),
    }


# =========================================================
# MODEL ANALYTICS
# =========================================================

IMPORTANCE_CSV = meta.BASE_DIR / "results" / "metrics" / "feature_importance_v2.csv"
CLUSTER_SCORES_CSV = meta.BASE_DIR / "results" / "metrics" / "cluster_scores_v2.csv"


@app.get("/model-analytics")
def model_analytics() -> dict[str, Any]:
    """Benchmarks, feature importances, clusters and anomaly tallies."""
    try:
        comparison = meta.metrics()

        importances: list[dict[str, Any]] = []
        if IMPORTANCE_CSV.exists():
            frame = pd.read_csv(IMPORTANCE_CSV)
            frame.columns = [column.strip() for column in frame.columns]
            name_column = frame.columns[0]
            value_column = next(
                (column for column in frame.columns if "importance" in column.lower()),
                frame.columns[1],
            )
            for _, row in frame.iterrows():
                importances.append(
                    {
                        "feature": str(row[name_column]),
                        "importance": round(float(row[value_column]), 8),
                    }
                )
            importances.sort(key=lambda item: item["importance"], reverse=True)

        cluster_scores: list[dict[str, Any]] = []
        if CLUSTER_SCORES_CSV.exists():
            frame = pd.read_csv(CLUSTER_SCORES_CSV)
            frame.columns = [str(column).strip() for column in frame.columns]
            cluster_scores = frame.to_dict(orient="records")

        anomalies = meta.anomaly_context()

        return {
            "primary_model": meta.model_metadata()["production_model"],
            "feature_count": len(MODEL_FEATURES),
            "total_dataset_rows": len(DAILY),
            "model_comparison": comparison,
            "feature_importances": importances,
            "clusters": meta.cluster_summary(),
            "cluster_scores": cluster_scores,
            "anomaly_matrix": {
                "total_evaluations": anomalies["evaluated_rows"],
                "anomalies_detected": anomalies["flagged_rows"],
                "inliers_normal": anomalies["evaluated_rows"] - anomalies["flagged_rows"],
                "contamination_rate": anomalies["flagged_rate"],
                "configured_contamination": anomalies["contamination"],
            },
        }
    except Exception as exc:  # pragma: no cover - defensive
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# =========================================================
# PREDICT
# =========================================================


@app.post("/predict")
def predict(request: PredictionRequest) -> dict[str, Any]:
    """Predict one day of consumption.

    ``typical_error_kwh`` is the model's held-out mean absolute error, served
    rather than hard-coded so the UI can label its error band from the model
    itself.
    """
    try:
        prediction = predict_consumption(request.consumption, request.target_date)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - defensive
        raise HTTPException(status_code=500, detail=f"Prediction error: {exc}") from exc

    rf_metrics = meta.metrics()["Random Forest V2"]
    return {
        "predicted_kwh": round(prediction, 3),
        "target_date": request.target_date.isoformat(),
        "model": meta.model_metadata()["production_model"],
        "typical_error_kwh": round(rf_metrics["mae_kwh"], 3),
        "typical_error_source": "held-out test-set mean absolute error (kWh per day)",
    }


# =========================================================
# BILL
# =========================================================


@app.post("/predict-bill")
def predict_bill(request: BillRequest) -> dict[str, Any]:
    """Cost a flat-tariff period.

    ``predicted_kwh`` is a **daily** figure. It is multiplied by ``days`` to
    get period consumption, then rated. ``fixed_charge_per_period`` is added
    once for the period. The response labels every intermediate quantity so
    the UI cannot present a daily rate as a monthly total.
    """
    try:
        result = compute_bill(
            request.predicted_kwh,
            request.tariff_per_kwh,
            request.days,
            request.fixed_charge_per_period,
        )
    except BillInputError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        **result,
        "predicted_kwh": result["predicted_daily_kwh"],
        "billing_period": f"{result['period_days']}-day period",
        "assumptions": [
            "Flat per-unit tariff; no time-of-use or slab banding.",
            "fixed_charge_per_period is applied once per period, not per day.",
            "Excludes tax, duties and any standing charge levied daily.",
        ],
    }


# =========================================================
# HISTORICAL DATA & ANOMALIES
# =========================================================


@app.get("/historical-data")
def get_historical_data(
    limit: int = Query(30, ge=1, le=365),
    before: str | None = Query(
        None,
        description=(
            "Optional ISO date. When given, returns the `limit` records "
            "immediately preceding that date instead of the tail of the "
            "dataset. Lets the UI request a real historical window without "
            "hard-coding consumption values that can go stale."
        ),
    ),
) -> dict[str, Any]:
    """Recorded daily consumption, oldest first.

    Without ``before`` this returns the most recent ``limit`` days. With it,
    the window ends the day before the supplied date, which is exactly the
    context a prediction for that date needs.
    """
    try:
        frame = DAILY

        if before:
            try:
                cutoff = pd.Timestamp(before)
            except (ValueError, TypeError) as exc:
                raise HTTPException(
                    status_code=422,
                    detail=f"`before` must be an ISO date, got {before!r}",
                ) from exc
            if cutoff.tzinfo is not None:
                cutoff = cutoff.tz_localize(None)
            frame = frame[frame["datetime"] < cutoff]

        records = [
            {
                "date": row.datetime.strftime("%Y-%m-%d"),
                "energy_kwh": round(float(row.energy_kwh), 3),
            }
            for row in frame.tail(limit).itertuples(index=False)
        ]
        return {
            "count": len(records),
            "data": records,
            "dataset_start": DATASET_START.date().isoformat(),
            "dataset_end": DATASET_END.date().isoformat(),
            "total_rows": len(DAILY),
            "requested_before": before,
        }
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - defensive
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/anomalies")
def get_anomalies() -> dict[str, Any]:
    """Days the training run's isolation forest flagged."""
    frame = meta.anomaly_frame()
    if frame.empty:
        return {"count": 0, "anomalies": [], "evaluated_rows": 0, "flagged_rate": 0.0}

    try:
        records = [
            {
                "date": row.datetime.strftime("%Y-%m-%d"),
                "energy_kwh": round(float(row.energy_kwh), 3),
                "rolling_mean_7": round(float(row.rolling_mean_7), 3),
                "rolling_std_7": round(float(row.rolling_std_7), 3),
                # Nine places, not six: the weakest flagged score is about
                # -1.4e-07, and rounding that to six places yields -0.0, which
                # reads as "not an anomaly" and breaks the sign the isolation
                # forest's scores are defined by.
                "anomaly_score": round(float(row.anomaly_score), 9),
            }
            for row in frame.itertuples(index=False)
        ]
        context = meta.anomaly_context()
        return {
            "count": len(records),
            "anomalies": records,
            "evaluated_rows": context["evaluated_rows"],
            "flagged_rate": context["flagged_rate"],
            "configured_contamination": context["contamination"],
        }
    except Exception as exc:  # pragma: no cover - defensive
        raise HTTPException(status_code=500, detail=str(exc)) from exc