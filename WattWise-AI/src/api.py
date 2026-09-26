"""WattWise AI FastAPI service.

Design notes
------------
- Feature construction is delegated entirely to ``src.features``, which is
  the same module the training pipeline uses. This keeps serving and training
  feature logic aligned.
- Model, dataset and metric facts come from ``src.metadata``, which reads
  shipped artifacts. Nothing displayed to a client is hard-coded here.
- ``CORS_ORIGINS`` is read from the environment. A wildcard is rejected at
  startup because it is incompatible with credentialed requests.
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

try:
    # Package import:
    # uvicorn src.api:app
    from . import metadata as meta
    from .billing import (
        DEFAULT_BILLING_DAYS,
        MAX_BILLING_DAYS,
        BillInputError,
        compute_bill,
    )
    from .features import (
        CONTEXT_WINDOW,
        FEATURE_COLUMNS,
        build_target_features,
    )
except ImportError:
    # Flat import:
    # api:app with src on sys.path
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
    "http://localhost:8000",
    "https://wattwise-ai.vercel.app",
    "https://web-24f6gbeec-swara2402s-projects.vercel.app",
    "https://web-jn56h2841-swara2402s-projects.vercel.app",
    "https://web-virid-five-18.vercel.app",
)


def _cors_origins() -> list[str]:
    """Return the explicit browser origins allowed to call this API."""
    raw = os.getenv("CORS_ORIGINS")

    if raw is not None and raw.strip():
        origins = [
            item.strip().rstrip("/")
            for item in raw.split(",")
            if item.strip()
        ]
    else:
        origins = [
            item.strip().rstrip("/")
            for item in DEFAULT_CORS_ORIGINS
            if item.strip()
        ]

    if "*" in origins:
        raise RuntimeError(
            "CORS_ORIGINS must list explicit origins; "
            "'*' cannot be combined with credentialed requests."
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

# The forest was fitted with n_jobs=-1.
# Use one worker for predictable single-row inference.
if hasattr(model, "n_jobs"):
    model.n_jobs = 1


MODEL_FEATURES = list(getattr(model, "feature_names_in_", []))

if not MODEL_FEATURES:
    raise RuntimeError(
        "The loaded model does not expose feature_names_in_. "
        "The trained model must contain feature names."
    )

if MODEL_FEATURES != list(FEATURE_COLUMNS):
    raise RuntimeError(
        "Feature contract drift: src/features.FEATURE_COLUMNS does not "
        "match the fitted model's feature_names_in_.\n"
        f"  features.py: {list(FEATURE_COLUMNS)}\n"
        f"  model      : {MODEL_FEATURES}"
    )


# Date/energy view of the demo series, cached for the life of the process.
DAILY = (
    meta.daily_frame()[["datetime", "energy_kwh"]]
    .sort_values("datetime")
    .reset_index(drop=True)
)

DAILY["energy_kwh"] = pd.to_numeric(
    DAILY["energy_kwh"],
    errors="coerce",
)

DAILY = DAILY.dropna(
    subset=["energy_kwh"]
).reset_index(drop=True)

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
            f"Exactly {CONTEXT_WINDOW} daily consumption values in kWh, "
            "oldest first. These are the most recent recorded days "
            "immediately preceding target_date."
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
        description="Predicted consumption for one day, in kWh.",
    )

    tariff_per_kwh: float = Field(
        ...,
        gt=0,
        description=(
            "Flat unit rate in currency per kWh. "
            "No time-of-use or slab banding."
        ),
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
        description=(
            "Flat standing charge added once for the whole period."
        ),
    )


# =========================================================
# PREDICTION INTERNALS
# =========================================================


def _validate_target(target: pd.Timestamp) -> None:
    """Reject target dates outside the supported dataset range."""
    if target < DATASET_START:
        raise ValueError(
            f"Target date {target.date().isoformat()} is before the "
            f"start of the supported dataset range "
            f"({DATASET_START.date().isoformat()} to "
            f"{DATASET_END.date().isoformat()})."
        )

    if target > DATASET_END:
        raise ValueError(
            f"Target date {target.date().isoformat()} is after the "
            f"end of the supported dataset range "
            f"({DATASET_START.date().isoformat()} to "
            f"{DATASET_END.date().isoformat()})."
        )


def _validate_values(values: np.ndarray) -> None:
    if len(values) != CONTEXT_WINDOW:
        raise ValueError(
            f"Exactly {CONTEXT_WINDOW} consumption values are required."
        )

    if not np.isfinite(values).all():
        raise ValueError(
            "Consumption values must be finite numbers."
        )

    if (values < 0).any():
        raise ValueError(
            "Consumption values cannot be negative."
        )


def _history_series(
    target: pd.Timestamp,
    values: np.ndarray,
) -> pd.Series:
    """Return demo history with the final context window replaced."""

    prior = DAILY[DAILY["datetime"] < target]

    if len(prior) < CONTEXT_WINDOW:
        raise ValueError(
            f"Not enough history before {target.date().isoformat()}: "
            f"{len(prior)} recorded day(s) available, "
            f"{CONTEXT_WINDOW} required."
        )

    window = prior.tail(CONTEXT_WINDOW)

    energy = (
        prior.set_index("datetime")["energy_kwh"]
        .copy()
    )

    energy.loc[window["datetime"].to_numpy()] = values

    return energy.sort_index()


def create_prediction_features(
    consumption: list[float],
    target_date: date,
) -> pd.DataFrame:
    """Build the feature row for target_date."""
    values = np.asarray(
        consumption,
        dtype=float,
    )

    _validate_values(values)

    target = pd.Timestamp(target_date)

    _validate_target(target)

    energy = _history_series(
        target,
        values,
    )

    row = build_target_features(
        energy,
        target,
        feature_columns=tuple(MODEL_FEATURES),
    )

    row.index = ["features"]

    return row


def predict_consumption(
    consumption: list[float],
    target_date: date,
) -> float:
    """Predict kWh for a single day, floored at zero."""
    features = create_prediction_features(
        consumption,
        target_date,
    )

    prediction = model.predict(features)[0]

    return max(
        0.0,
        float(prediction),
    )


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
    """Return model, hyperparameters, metrics and provenance."""
    return meta.model_metadata()


@app.get("/dataset-info")
def dataset_info() -> dict[str, Any]:
    """Return dataset information needed by the UI."""
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


IMPORTANCE_CSV = (
    meta.BASE_DIR
    / "results"
    / "metrics"
    / "feature_importance_v2.csv"
)

CLUSTER_SCORES_CSV = (
    meta.BASE_DIR
    / "results"
    / "metrics"
    / "cluster_scores_v2.csv"
)


@app.get("/model-analytics")
def model_analytics() -> dict[str, Any]:
    """Return benchmarks, feature importances, clusters and anomalies."""
    try:
        comparison = meta.metrics()

        importances: list[dict[str, Any]] = []

        if IMPORTANCE_CSV.exists():
            frame = pd.read_csv(IMPORTANCE_CSV)

            frame.columns = [
                str(column).strip()
                for column in frame.columns
            ]

            if len(frame.columns) >= 2:
                name_column = frame.columns[0]

                value_column = next(
                    (
                        column
                        for column in frame.columns
                        if "importance" in column.lower()
                    ),
                    frame.columns[1],
                )

                for _, row in frame.iterrows():
                    try:
                        importance = float(
                            row[value_column]
                        )
                    except (
                        TypeError,
                        ValueError,
                    ):
                        continue

                    importances.append(
                        {
                            "feature": str(
                                row[name_column]
                            ),
                            "importance": round(
                                importance,
                                8,
                            ),
                        }
                    )

                importances.sort(
                    key=lambda item: item["importance"],
                    reverse=True,
                )

        cluster_scores: list[dict[str, Any]] = []

        if CLUSTER_SCORES_CSV.exists():
            frame = pd.read_csv(
                CLUSTER_SCORES_CSV
            )

            frame.columns = [
                str(column).strip()
                for column in frame.columns
            ]

            raw_records = frame.to_dict(
                orient="records"
            )

            cluster_scores = [
                {
                    str(key): value
                    for key, value in record.items()
                }
                for record in raw_records
            ]

        anomalies = meta.anomaly_context()

        return {
            "primary_model": meta.model_metadata()[
                "production_model"
            ],
            "feature_count": len(MODEL_FEATURES),
            "total_dataset_rows": len(DAILY),
            "model_comparison": comparison,
            "feature_importances": importances,
            "clusters": meta.cluster_summary(),
            "cluster_scores": cluster_scores,
            "anomaly_matrix": {
                "total_evaluations": anomalies[
                    "evaluated_rows"
                ],
                "anomalies_detected": anomalies[
                    "flagged_rows"
                ],
                "inliers_normal": (
                    anomalies["evaluated_rows"]
                    - anomalies["flagged_rows"]
                ),
                "contamination_rate": anomalies[
                    "flagged_rate"
                ],
                "configured_contamination": anomalies[
                    "contamination"
                ],
            },
        }

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=str(exc),
        ) from exc


# =========================================================
# PREDICT
# =========================================================


@app.post("/predict")
def predict(
    request: PredictionRequest,
) -> dict[str, Any]:
    """Predict one day of electricity consumption."""

    try:
        prediction = predict_consumption(
            request.consumption,
            request.target_date,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Prediction error: {exc}",
        ) from exc

    metrics = meta.metrics()

    try:
        rf_metrics = metrics["Random Forest V2"]
        mae = float(rf_metrics["mae_kwh"])
    except (
        KeyError,
        TypeError,
        ValueError,
    ) as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "Random Forest V2 metrics are missing or "
                "malformed in metadata."
            ),
        ) from exc

    return {
        "predicted_kwh": round(
            prediction,
            3,
        ),
        "target_date": request.target_date.isoformat(),
        "model": meta.model_metadata()[
            "production_model"
        ],
        "typical_error_kwh": round(
            mae,
            3,
        ),
        "typical_error_source": (
            "held-out test-set mean absolute error "
            "(kWh per day)"
        ),
    }


# =========================================================
# BILL
# =========================================================


@app.post("/predict-bill")
def predict_bill(
    request: BillRequest,
) -> dict[str, Any]:
    """Calculate estimated cost for a flat-tariff period."""

    try:
        result = compute_bill(
            request.predicted_kwh,
            request.tariff_per_kwh,
            request.days,
            request.fixed_charge_per_period,
        )

    except BillInputError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    return {
        **result,
        "predicted_kwh": result[
            "predicted_daily_kwh"
        ],
        "billing_period": (
            f"{result['period_days']}-day period"
        ),
        "assumptions": [
            (
                "Flat per-unit tariff; no time-of-use "
                "or slab banding."
            ),
            (
                "fixed_charge_per_period is applied once "
                "per period, not per day."
            ),
            (
                "Excludes tax, duties and any standing "
                "charge levied daily."
            ),
        ],
    }


# =========================================================
# HISTORICAL DATA & ANOMALIES
# =========================================================


@app.get("/historical-data")
def get_historical_data(
    limit: int = Query(
        30,
        ge=1,
        le=365,
    ),
    before: str | None = Query(
        None,
        description=(
            "Optional ISO date. When given, returns the "
            "limit records immediately preceding that date."
        ),
    ),
) -> dict[str, Any]:
    """Return recorded daily consumption, oldest first."""

    try:
        frame = DAILY

        if before:
            try:
                cutoff = pd.Timestamp(before)
            except (
                ValueError,
                TypeError,
            ) as exc:
                raise HTTPException(
                    status_code=422,
                    detail=(
                        "`before` must be an ISO date, "
                        f"got {before!r}"
                    ),
                ) from exc

            if cutoff.tzinfo is not None:
                cutoff = cutoff.tz_localize(None)

            frame = frame[
                frame["datetime"] < cutoff
            ]

        records: list[dict[str, Any]] = []

        for _, row in frame.tail(limit).iterrows():
            timestamp = pd.Timestamp(row["datetime"])
            energy_kwh = float(row["energy_kwh"])

            records.append(
                {
                    "date": timestamp.strftime("%Y-%m-%d"),
                    "energy_kwh": round(energy_kwh, 3),
                }
            )

        return {
            "count": len(records),
            "data": records,
            "dataset_start": (
                DATASET_START.date().isoformat()
            ),
            "dataset_end": (
                DATASET_END.date().isoformat()
            ),
            "total_rows": len(DAILY),
            "requested_before": before,
        }

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=str(exc),
        ) from exc


@app.get("/anomalies")
def get_anomalies() -> dict[str, Any]:
    """Return days flagged by the training run's Isolation Forest."""

    frame = meta.anomaly_frame()

    if frame.empty:
        return {
            "count": 0,
            "anomalies": [],
            "evaluated_rows": 0,
            "flagged_rate": 0.0,
        }

    try:
        records: list[dict[str, Any]] = []

        for _, row in frame.iterrows():
            timestamp = pd.Timestamp(
                row["datetime"]
            )

            energy_kwh = float(
                row["energy_kwh"]
            )
            rolling_mean_7 = float(
                row["rolling_mean_7"]
            )
            rolling_std_7 = float(
                row["rolling_std_7"]
            )
            anomaly_score = float(
                row["anomaly_score"]
            )

            records.append(
                {
                    "date": timestamp.strftime(
                        "%Y-%m-%d"
                    ),
                    "energy_kwh": round(
                        energy_kwh,
                        3,
                    ),
                    "rolling_mean_7": round(
                        rolling_mean_7,
                        3,
                    ),
                    "rolling_std_7": round(
                        rolling_std_7,
                        3,
                    ),
                    "anomaly_score": round(
                        anomaly_score,
                        9,
                    ),
                }
            )

        context = meta.anomaly_context()

        return {
            "count": len(records),
            "anomalies": records,
            "evaluated_rows": context["evaluated_rows"],
            "flagged_rate": context["flagged_rate"],
            "configured_contamination": context["contamination"],
        }

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=str(exc),
        ) from exc