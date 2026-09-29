import os
import gc
import time
import joblib
import numpy as np
import pandas as pd

from sklearn.ensemble import RandomForestRegressor, IsolationForest
from sklearn.model_selection import TimeSeriesSplit
from sklearn.metrics import (
    mean_absolute_error,
    mean_squared_error,
    r2_score,
    silhouette_score
)
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sklearn.inspection import permutation_importance

from xgboost import XGBRegressor

from src.features import FEATURE_COLUMNS, add_time_series_features


# ============================================================
# WATTWISE AI V2
# IMPROVED TIME-SERIES ML PIPELINE
# ============================================================

DATA_PATH = "data/raw/household_power_consumption.txt"

MODEL_PATH = "models"
PROCESSED_PATH = "data/processed"
RESULTS_PATH = "results"

os.makedirs(MODEL_PATH, exist_ok=True)
os.makedirs(PROCESSED_PATH, exist_ok=True)
os.makedirs("results/metrics", exist_ok=True)
os.makedirs("results/predictions", exist_ok=True)
os.makedirs("results/figures", exist_ok=True)


def step(number, title):
    print()
    print("=" * 75)
    print(f"[{number}] {title}")
    print("=" * 75)


# ============================================================
# 1. LOAD DATA
# ============================================================

step(1, "Loading UCI dataset")

if not os.path.exists(DATA_PATH):
    raise FileNotFoundError(
        f"Dataset not found:\n{DATA_PATH}"
    )

start = time.time()

df = pd.read_csv(
    DATA_PATH,
    sep=";",
    na_values="?",
    low_memory=False
)

print(f"Raw records: {len(df):,}")
print(f"Load time: {time.time() - start:.2f} seconds")


# ============================================================
# 2. CLEAN DATA
# ============================================================

step(2, "Cleaning data")

df["datetime"] = pd.to_datetime(
    df["Date"] + " " + df["Time"],
    dayfirst=True,
    errors="coerce"
)

df.drop(columns=["Date", "Time"], inplace=True)

numeric_cols = [
    "Global_active_power",
    "Global_reactive_power",
    "Voltage",
    "Global_intensity",
    "Sub_metering_1",
    "Sub_metering_2",
    "Sub_metering_3"
]

for col in numeric_cols:
    df[col] = pd.to_numeric(
        df[col],
        errors="coerce"
    )

print("\nMissing values:")

missing = df[numeric_cols].isna().sum()

print(missing)

# Track percentage of missing data
missing_total = missing.sum()
total_numeric = len(df) * len(numeric_cols)

print(
    f"\nOverall missing percentage: "
    f"{missing_total / total_numeric * 100:.2f}%"
)


# ============================================================
# 3. DAILY AGGREGATION
# ============================================================

step(3, "Creating daily electricity dataset")

df.set_index("datetime", inplace=True)

# Instead of blindly interpolating everything,
# interpolate short gaps only.

df[numeric_cols] = (
    df[numeric_cols]
    .interpolate(
        method="time",
        limit=60,
        limit_direction="both"
    )
)

daily = pd.DataFrame()

# kW readings are approximately one minute apart.
# Therefore:
#
# daily kWh = sum(kW) / 60

daily["energy_kwh"] = (
    df["Global_active_power"]
    .resample("D")
    .sum() / 60
)

daily["avg_voltage"] = (
    df["Voltage"]
    .resample("D")
    .mean()
)

daily["avg_intensity"] = (
    df["Global_intensity"]
    .resample("D")
    .mean()
)

daily["avg_reactive_power"] = (
    df["Global_reactive_power"]
    .resample("D")
    .mean()
)

daily["sub_metering_1"] = (
    df["Sub_metering_1"]
    .resample("D")
    .sum()
)

daily["sub_metering_2"] = (
    df["Sub_metering_2"]
    .resample("D")
    .sum()
)

daily["sub_metering_3"] = (
    df["Sub_metering_3"]
    .resample("D")
    .sum()
)

daily.dropna(inplace=True)

print(f"Daily records: {len(daily):,}")
print(
    f"Date range: "
    f"{daily.index.min()} → {daily.index.max()}"
)

daily.to_csv(
    f"{PROCESSED_PATH}/daily_consumption_v2.csv"
)

del df
gc.collect()


# ============================================================
# 4. FEATURE ENGINEERING
# ============================================================

step(4, "Creating advanced time-series features")

data = daily.copy()

# ------------------------------------------------------------
# Features come from src/features.py, which is the single
# implementation shared with the FastAPI serving path in
# src/api.py. Do not re-derive any of these columns here: a second
# copy of this arithmetic is how training and serving drift apart.
# ------------------------------------------------------------

feature_columns = list(FEATURE_COLUMNS)

data = pd.concat(
    [
        data.drop(columns=["energy_kwh"]),
        add_time_series_features(
            data["energy_kwh"],
            feature_columns=tuple(feature_columns)
        )
    ],
    axis=1
)


# IMPORTANT:
# Drop rows created by lag/rolling operations.

data.dropna(inplace=True)

print(
    f"Records after feature engineering: "
    f"{len(data):,}"
)


X = data[feature_columns]

y = data["energy_kwh"]


# ============================================================
# 6. CHRONOLOGICAL SPLIT
# ============================================================

step(5, "Creating chronological train/validation/test split")

n = len(data)

train_end = int(n * 0.70)
validation_end = int(n * 0.85)

X_train = X.iloc[:train_end]
y_train = y.iloc[:train_end]

X_val = X.iloc[
    train_end:validation_end
]

y_val = y.iloc[
    train_end:validation_end
]

X_test = X.iloc[
    validation_end:
]

y_test = y.iloc[
    validation_end:
]

print(f"Train: {len(X_train):,}")
print(f"Validation: {len(X_val):,}")
print(f"Test: {len(X_test):,}")

print(
    f"\nTrain period:\n"
    f"{X_train.index.min()} → "
    f"{X_train.index.max()}"
)

print(
    f"\nTest period:\n"
    f"{X_test.index.min()} → "
    f"{X_test.index.max()}"
)


# ============================================================
# 7. NAIVE BASELINE
# ============================================================

step(6, "Evaluating naive baseline")

# Predict today's consumption using yesterday's consumption.

baseline_predictions = X_test["lag_1"]

baseline_mae = mean_absolute_error(
    y_test,
    baseline_predictions
)

baseline_rmse = np.sqrt(
    mean_squared_error(
        y_test,
        baseline_predictions
    )
)

baseline_r2 = r2_score(
    y_test,
    baseline_predictions
)

print(
    f"Naive Baseline MAE: {baseline_mae:.4f}"
)

print(
    f"Naive Baseline RMSE: {baseline_rmse:.4f}"
)

print(
    f"Naive Baseline R²: {baseline_r2:.4f}"
)


# ============================================================
# 8. RANDOM FOREST
# ============================================================

step(7, "Training improved Random Forest")

start = time.time()

rf = RandomForestRegressor(
    n_estimators=400,
    max_depth=20,
    min_samples_leaf=2,
    max_features="sqrt",
    n_jobs=-1,
    random_state=42
)

rf.fit(
    X_train,
    y_train
)

rf_predictions = rf.predict(
    X_test
)

rf_mae = mean_absolute_error(
    y_test,
    rf_predictions
)

rf_rmse = np.sqrt(
    mean_squared_error(
        y_test,
        rf_predictions
    )
)

rf_r2 = r2_score(
    y_test,
    rf_predictions
)

rf_time = time.time() - start

print(f"MAE: {rf_mae:.4f}")
print(f"RMSE: {rf_rmse:.4f}")
print(f"R²: {rf_r2:.4f}")
print(f"Training time: {rf_time:.2f}s")

joblib.dump(
    rf,
    f"{MODEL_PATH}/random_forest_v2.joblib"
)


# ============================================================
# 9. XGBOOST
# ============================================================

step(8, "Training improved XGBoost")

start = time.time()

xgb = XGBRegressor(
    n_estimators=700,
    learning_rate=0.03,
    max_depth=6,
    min_child_weight=3,
    subsample=0.8,
    colsample_bytree=0.8,
    reg_alpha=0.05,
    reg_lambda=1.0,
    objective="reg:squarederror",
    n_jobs=-1,
    random_state=42
)

xgb.fit(
    X_train,
    y_train,
    eval_set=[
        (X_val, y_val)
    ],
    verbose=False
)

xgb_predictions = xgb.predict(
    X_test
)

xgb_mae = mean_absolute_error(
    y_test,
    xgb_predictions
)

xgb_rmse = np.sqrt(
    mean_squared_error(
        y_test,
        xgb_predictions
    )
)

xgb_r2 = r2_score(
    y_test,
    xgb_predictions
)

xgb_time = time.time() - start

print(f"MAE: {xgb_mae:.4f}")
print(f"RMSE: {xgb_rmse:.4f}")
print(f"R²: {xgb_r2:.4f}")
print(f"Training time: {xgb_time:.2f}s")

joblib.dump(
    xgb,
    f"{MODEL_PATH}/xgboost_v2.joblib"
)


# ============================================================
# 10. MODEL COMPARISON
# ============================================================

step(9, "Creating model comparison")

comparison = pd.DataFrame({

    "Model": [
        "Naive Baseline",
        "Random Forest V2",
        "XGBoost V2"
    ],

    "MAE": [
        baseline_mae,
        rf_mae,
        xgb_mae
    ],

    "RMSE": [
        baseline_rmse,
        rf_rmse,
        xgb_rmse
    ],

    "R2": [
        baseline_r2,
        rf_r2,
        xgb_r2
    ],

    "Training_Time": [
        0,
        rf_time,
        xgb_time
    ]
})

comparison.to_csv(
    "results/metrics/model_comparison_v2.csv",
    index=False
)

print()
print(comparison)


# ============================================================
# 11. FEATURE IMPORTANCE
# ============================================================

step(10, "Calculating feature importance")

importance = pd.DataFrame({

    "Feature": feature_columns,

    "RandomForest_Importance":
        rf.feature_importances_,

    "XGBoost_Importance":
        xgb.feature_importances_
})

importance.sort_values(
    "XGBoost_Importance",
    ascending=False,
    inplace=True
)

importance.to_csv(
    "results/metrics/feature_importance_v2.csv",
    index=False
)

print(
    importance.head(15).to_string(
        index=False
    )
)


# ============================================================
# 12. SAVE TEST PREDICTIONS
# ============================================================

step(11, "Saving predictions")

predictions = pd.DataFrame({

    "actual_kwh": y_test,

    "naive_prediction_kwh":
        baseline_predictions,

    "random_forest_kwh":
        rf_predictions,

    "xgboost_kwh":
        xgb_predictions

})

predictions.to_csv(
    "results/predictions/test_predictions_v2.csv"
)


# ============================================================
# 13. ISOLATION FOREST
# ============================================================

step(12, "Training Isolation Forest")

anomaly_features = data[
    [
        "energy_kwh",
        "rolling_mean_7",
        "rolling_std_7"
    ]
].copy()

isolation_forest = IsolationForest(

    n_estimators=300,

    contamination=0.02,

    random_state=42,

    n_jobs=-1
)

isolation_forest.fit(
    anomaly_features
)

data["anomaly_prediction"] = (
    isolation_forest.predict(
        anomaly_features
    )
)

data["anomaly_score"] = (
    isolation_forest.decision_function(
        anomaly_features
    )
)

anomalies = data[
    data["anomaly_prediction"] == -1
].copy()

print(
    f"Detected anomalies: "
    f"{len(anomalies):,}"
)

anomalies[
    [
        "energy_kwh",
        "rolling_mean_7",
        "rolling_std_7",
        "anomaly_score"
    ]
].to_csv(
    "results/predictions/anomalies_v2.csv"
)

joblib.dump(
    isolation_forest,
    f"{MODEL_PATH}/isolation_forest_v2.joblib"
)


# ============================================================
# 14. K-MEANS
# ============================================================

step(13, "Finding consumption clusters")

cluster_features = data[
    [
        "energy_kwh",
        "avg_voltage",
        "avg_intensity",
        "rolling_mean_7"
    ]
]

scaler = StandardScaler()

scaled = scaler.fit_transform(
    cluster_features
)

cluster_results = []

best_k = None
best_score = -1

for k in range(2, 7):

    model = KMeans(
        n_clusters=k,
        n_init=20,
        random_state=42
    )

    labels = model.fit_predict(
        scaled
    )

    score = silhouette_score(
        scaled,
        labels
    )

    cluster_results.append({
        "K": k,
        "Silhouette_Score": score
    })

    print(
        f"K={k}: "
        f"Silhouette={score:.4f}"
    )

    if score > best_score:

        best_score = score
        best_k = k


cluster_scores = pd.DataFrame(
    cluster_results
)

cluster_scores.to_csv(
    "results/metrics/cluster_scores_v2.csv",
    index=False
)

print(
    f"\nSelected K: {best_k}"
)

print(
    f"Silhouette Score: "
    f"{best_score:.4f}"
)

kmeans = KMeans(
    n_clusters=best_k,
    n_init=20,
    random_state=42
)

data["cluster"] = kmeans.fit_predict(
    scaled
)

cluster_summary = (
    data
    .groupby("cluster")
    .agg({
        "energy_kwh": [
            "count",
            "mean",
            "median",
            "min",
            "max"
        ]
    })
)

print("\nCluster Summary:")
print(cluster_summary)

cluster_summary.to_csv(
    "results/metrics/cluster_summary_v2.csv"
)

joblib.dump(
    scaler,
    f"{MODEL_PATH}/kmeans_scaler_v2.joblib"
)

joblib.dump(
    kmeans,
    f"{MODEL_PATH}/kmeans_v2.joblib"
)


# ============================================================
# 15. SAVE PROCESSED DATA
# ============================================================

step(14, "Saving final ML dataset")

data.to_csv(
    f"{PROCESSED_PATH}/ml_dataset_v2.csv"
)


# ============================================================
# 16. FINAL REPORT
# ============================================================

step(15, "WATTWISE AI V2 COMPLETE")

print("\nMODEL PERFORMANCE")
print("-" * 50)

print(
    f"Naive Baseline | "
    f"MAE={baseline_mae:.4f} | "
    f"RMSE={baseline_rmse:.4f} | "
    f"R²={baseline_r2:.4f}"
)

print(
    f"Random Forest  | "
    f"MAE={rf_mae:.4f} | "
    f"RMSE={rf_rmse:.4f} | "
    f"R²={rf_r2:.4f}"
)

print(
    f"XGBoost        | "
    f"MAE={xgb_mae:.4f} | "
    f"RMSE={xgb_rmse:.4f} | "
    f"R²={xgb_r2:.4f}"
)

print("\nANOMALIES")
print(
    f"Detected: {len(anomalies):,}"
)

print("\nCLUSTERING")
print(
    f"Best K: {best_k}"
)

print(
    f"Silhouette: {best_score:.4f}"
)

print("\nFILES CREATED:")
print("- models/random_forest_v2.joblib")
print("- models/xgboost_v2.joblib")
print("- models/isolation_forest_v2.joblib")
print("- models/kmeans_v2.joblib")
print("- results/metrics/model_comparison_v2.csv")
print("- results/metrics/feature_importance_v2.csv")
print("- results/metrics/cluster_scores_v2.csv")
print("- results/metrics/cluster_summary_v2.csv")
print("- results/predictions/test_predictions_v2.csv")
print("- results/predictions/anomalies_v2.csv")

print("\nPipeline finished successfully.")