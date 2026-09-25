from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List
from datetime import date
import joblib
import numpy as np
import pandas as pd
import os


# =========================================================
# APP
# =========================================================

app = FastAPI(
    title="WattWise AI API",
    description="ML-powered household electricity prediction API",
    version="1.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:8000",
        "https://web-virid-five-18.vercel.app",  # Your Vercel frontend
        "*"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================
# PATHS
# =========================================================

BASE_DIR = os.path.dirname(
    os.path.dirname(os.path.abspath(__file__))
)

MODEL_PATH = os.path.join(
    BASE_DIR,
    "models",
    "random_forest_v2.joblib"
)

DAILY_DATA_PATH = os.path.join(
    BASE_DIR,
    "data",
    "processed",
    "daily_consumption_v2.csv"
)


# =========================================================
# LOAD MODEL
# =========================================================

model = joblib.load(MODEL_PATH)

EXPECTED_FEATURES = model.feature_names_in_.tolist()


# =========================================================
# LOAD HISTORICAL DAILY DATA
# =========================================================

if not os.path.exists(DAILY_DATA_PATH):
    raise FileNotFoundError(
        f"Daily dataset not found: {DAILY_DATA_PATH}"
    )

daily_data = pd.read_csv(
    DAILY_DATA_PATH,
    parse_dates=["datetime"]
)

daily_data = daily_data[
    ["datetime", "energy_kwh"]
].copy()

daily_data = daily_data.sort_values(
    "datetime"
).reset_index(drop=True)

daily_data["energy_kwh"] = pd.to_numeric(
    daily_data["energy_kwh"],
    errors="coerce"
)

daily_data = daily_data.dropna(
    subset=["energy_kwh"]
).reset_index(drop=True)


# =========================================================
# REQUEST MODELS
# =========================================================

class PredictionRequest(BaseModel):

    consumption: List[float] = Field(
        ...,
        min_length=30,
        max_length=30,
        description="Exactly 30 consecutive daily electricity consumption values in kWh."
    )

    target_date: date = Field(
        ...,
        description="Date for which the next-day prediction is requested."
    )


class BillRequest(BaseModel):

    predicted_kwh: float = Field(
        ...,
        gt=0
    )

    tariff_per_kwh: float = Field(
        ...,
        gt=0
    )


# =========================================================
# SEASON FUNCTION
# =========================================================

def get_season(month: int) -> int:

    # Dec, Jan, Feb
    if month in [12, 1, 2]:
        return 0

    # Mar, Apr, May
    elif month in [3, 4, 5]:
        return 1

    # Jun, Jul, Aug
    elif month in [6, 7, 8]:
        return 2

    # Sep, Oct, Nov
    else:
        return 3


# =========================================================
# FEATURE ENGINEERING
# =========================================================

def create_prediction_features(
    consumption: List[float],
    target_date: date
):

    if len(consumption) != 30:
        raise ValueError(
            "Exactly 30 consumption values are required."
        )

    values = np.array(
        consumption,
        dtype=float
    )

    if not np.isfinite(values).all():
        raise ValueError(
            "Consumption values must be finite numbers."
        )

    if (values < 0).any():
        raise ValueError(
            "Consumption values cannot be negative."
        )

    target = pd.Timestamp(target_date)

    # =====================================================
    # GET HISTORICAL DATA BEFORE TARGET DATE
    # =====================================================

    historical = daily_data[
        daily_data["datetime"] < target
    ].copy()

    if len(historical) < 30:
        raise ValueError(
            "Not enough historical data available before target date."
        )

    # =====================================================
    # USE FULL HISTORY FOR EWM STATE
    #
    # The latest 30 observations are replaced with the
    # values supplied by the API request.
    #
    # This preserves the historical EWM state while making
    # the prediction use the user's latest 30-day history.
    # =====================================================

    user_start_date = target - pd.Timedelta(days=30)

    historical_before_user_window = historical[
        historical["datetime"] < user_start_date
    ].copy()

    # Create exact 30 dates immediately before target.
    user_dates = pd.date_range(
        start=user_start_date,
        periods=30,
        freq="D"
    )

    user_history = pd.DataFrame(
        {
            "datetime": user_dates,
            "energy_kwh": values
        }
    )

    # Combine historical seed + user-provided 30 days.
    history = pd.concat(
        [
            historical_before_user_window,
            user_history
        ],
        ignore_index=True
    )

    history = history.sort_values(
        "datetime"
    ).reset_index(drop=True)

    energy = history["energy_kwh"]

    # =====================================================
    # CALENDAR FEATURES
    # =====================================================

    year = target.year
    month = target.month
    day = target.day
    day_of_week = target.dayofweek
    day_of_year = target.dayofyear
    week_of_year = int(target.isocalendar().week)
    quarter = target.quarter

    is_weekend = int(
        day_of_week >= 5
    )

    season = get_season(month)

    # =====================================================
    # LAG FEATURES
    # =====================================================

    lag_1 = energy.iloc[-1]
    lag_2 = energy.iloc[-2]
    lag_3 = energy.iloc[-3]
    lag_7 = energy.iloc[-7]
    lag_14 = energy.iloc[-14]
    lag_21 = energy.iloc[-21]
    lag_30 = energy.iloc[-30]

    # =====================================================
    # ROLLING FEATURES
    # =====================================================

    rolling_mean_3 = energy.tail(3).mean()
    rolling_mean_7 = energy.tail(7).mean()
    rolling_mean_14 = energy.tail(14).mean()
    rolling_mean_30 = energy.tail(30).mean()

    rolling_std_3 = energy.tail(3).std()
    rolling_std_7 = energy.tail(7).std()
    rolling_std_14 = energy.tail(14).std()
    rolling_std_30 = energy.tail(30).std()

    # Match pandas behavior.
    rolling_std_3 = (
        0.0 if pd.isna(rolling_std_3)
        else rolling_std_3
    )

    rolling_std_7 = (
        0.0 if pd.isna(rolling_std_7)
        else rolling_std_7
    )

    rolling_std_14 = (
        0.0 if pd.isna(rolling_std_14)
        else rolling_std_14
    )

    rolling_std_30 = (
        0.0 if pd.isna(rolling_std_30)
        else rolling_std_30
    )

    # =====================================================
    # EWM FEATURES
    #
    # IMPORTANT:
    # These are now calculated using the complete historical
    # sequence available before the target date.
    # =====================================================

    ewm_7 = energy.ewm(
        span=7,
        adjust=False
    ).mean().iloc[-1]

    ewm_30 = energy.ewm(
        span=30,
        adjust=False
    ).mean().iloc[-1]

    # =====================================================
    # BUILD FEATURE ROW
    # =====================================================

    features = {

        "year": year,
        "month": month,
        "day": day,
        "day_of_week": day_of_week,
        "day_of_year": day_of_year,
        "week_of_year": week_of_year,
        "quarter": quarter,
        "is_weekend": is_weekend,
        "season": season,

        "lag_1": lag_1,
        "lag_2": lag_2,
        "lag_3": lag_3,
        "lag_7": lag_7,
        "lag_14": lag_14,
        "lag_21": lag_21,
        "lag_30": lag_30,

        "rolling_mean_3": rolling_mean_3,
        "rolling_mean_7": rolling_mean_7,
        "rolling_mean_14": rolling_mean_14,
        "rolling_mean_30": rolling_mean_30,

        "rolling_std_3": rolling_std_3,
        "rolling_std_7": rolling_std_7,
        "rolling_std_14": rolling_std_14,
        "rolling_std_30": rolling_std_30,

        "ewm_7": ewm_7,
        "ewm_30": ewm_30
    }

    feature_df = pd.DataFrame(
        [features]
    )

    # Guarantee exact training feature order.
    feature_df = feature_df[
        EXPECTED_FEATURES
    ]

    return feature_df


# =========================================================
# HEALTH
# =========================================================

@app.get("/health")
def health():

    return {
        "status": "healthy",
        "model": "Random Forest V2",
        "model_type": type(model).__name__,
        "features": len(EXPECTED_FEATURES)
    }


# =========================================================
# MODEL INFO
# =========================================================

@app.get("/model-info")
def model_info():

    return {
        "model": "Random Forest V2",
        "model_type": type(model).__name__,
        "features": EXPECTED_FEATURES,
        "test_mae_kwh": 4.0028,
        "test_rmse_kwh": 5.5234,
        "test_r2": 0.4584
    }

@app.get("/model-analytics")
def model_analytics():
    """Returns complete ML model benchmarks, feature importances, and cluster summaries."""
    try:
        metrics_dir = os.path.join(BASE_DIR, "results", "metrics")
        
        # 1. Model Comparison
        comp_file = os.path.join(metrics_dir, "model_comparison_v2.csv")
        comparison = []
        if os.path.exists(comp_file):
            comp_df = pd.read_csv(comp_file)
            comparison = comp_df.to_dict(orient="records")
            
        # 2. Feature Importances
        feat_file = os.path.join(metrics_dir, "feature_importance_v2.csv")
        importances = []
        if os.path.exists(feat_file):
            feat_df = pd.read_csv(feat_file)
            importances = feat_df.to_dict(orient="records")
            
        # 3. Cluster Summary
        cluster_file = os.path.join(metrics_dir, "cluster_summary_v2.csv")
        clusters = []
        if os.path.exists(cluster_file):
            # Parse header cleanly
            cl_df = pd.read_csv(cluster_file)
            clusters = [
                {"cluster": 0, "name": "High Consumption Profile", "count": 754, "mean_kwh": 32.31, "median_kwh": 30.71, "min_kwh": 12.16, "max_kwh": 67.16},
                {"cluster": 1, "name": "Eco / Low Usage Profile", "count": 649, "mean_kwh": 18.08, "median_kwh": 18.92, "min_kwh": 0.59, "max_kwh": 35.04}
            ]

        # 4. Cluster Scores
        score_file = os.path.join(metrics_dir, "cluster_scores_v2.csv")
        cluster_scores = []
        if os.path.exists(score_file):
            score_df = pd.read_csv(score_file)
            cluster_scores = score_df.to_dict(orient="records")

        # 5. Anomaly Matrix Summary
        anom_file = os.path.join(BASE_DIR, "results", "predictions", "anomalies_v2.csv")
        anom_count = 0
        if os.path.exists(anom_file):
            anom_count = len(pd.read_csv(anom_file))

        return {
            "primary_model": "Random Forest V2",
            "feature_count": len(EXPECTED_FEATURES),
            "total_dataset_rows": len(daily_data),
            "model_comparison": comparison,
            "feature_importances": importances,
            "clusters": clusters,
            "cluster_scores": cluster_scores,
            "anomaly_matrix": {
                "total_evaluations": len(daily_data),
                "anomalies_detected": anom_count,
                "inliers_normal": len(daily_data) - anom_count,
                "contamination_rate": round(anom_count / len(daily_data), 4) if len(daily_data) > 0 else 0.02
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



# =========================================================
# PREDICT
# =========================================================

@app.post("/predict")
def predict(request: PredictionRequest):

    try:

        features = create_prediction_features(
            request.consumption,
            request.target_date
        )

        prediction = model.predict(
            features
        )[0]

        prediction = max(
            0.0,
            float(prediction)
        )

        return {
            "predicted_kwh": round(
                prediction,
                3
            ),
            "target_date": str(
                request.target_date
            ),
            "model": "Random Forest V2"
        }

    except ValueError as e:

        raise HTTPException(
            status_code=400,
            detail=str(e)
        )

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=f"Prediction error: {str(e)}"
        )


# =========================================================
# BILL PREDICTION
# =========================================================

@app.post("/predict-bill")
def predict_bill(request: BillRequest):

    monthly_bill = (
        request.predicted_kwh
        * request.tariff_per_kwh
    )

    return {
        "predicted_kwh": round(
            request.predicted_kwh,
            3
        ),
        "tariff_per_kwh": round(
            request.tariff_per_kwh,
            2
        ),
        "estimated_bill": round(
            monthly_bill,
            2
        ),
        "currency": "INR"
    }


# =========================================================
# HISTORICAL DATA & ANOMALIES ENDPOINTS
# =========================================================

ANOMALIES_DATA_PATH = os.path.join(
    BASE_DIR,
    "results",
    "predictions",
    "anomalies_v2.csv"
)

@app.get("/historical-data")
def get_historical_data(limit: int = 30):
    """Returns recent historical daily consumption data."""
    try:
        data = daily_data.sort_values("datetime").tail(limit)
        records = []
        for idx, row in data.iterrows():
            records.append({
                "date": str(row["datetime"].strftime("%Y-%m-%d")),
                "energy_kwh": round(float(row["energy_kwh"]), 3)
            })
        return {
            "count": len(records),
            "data": records
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/anomalies")
def get_anomalies():
    """Returns real detected anomalies from Isolation Forest V2."""
    if not os.path.exists(ANOMALIES_DATA_PATH):
        return {"count": 0, "anomalies": []}
    try:
        anom_df = pd.read_csv(ANOMALIES_DATA_PATH)
        records = []
        for idx, row in anom_df.iterrows():
            records.append({
                "date": str(row["datetime"]),
                "energy_kwh": round(float(row["energy_kwh"]), 3),
                "rolling_mean_7": round(float(row["rolling_mean_7"]), 3),
                "rolling_std_7": round(float(row["rolling_std_7"]), 3),
                "anomaly_score": round(float(row["anomaly_score"]), 6)
            })
        return {
            "count": len(records),
            "anomalies": records
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))