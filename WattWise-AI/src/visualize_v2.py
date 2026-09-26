import os
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

# =========================================================
# PATHS
# =========================================================

BASE_DIR = os.path.dirname(
    os.path.dirname(os.path.abspath(__file__))
)

PREDICTIONS = os.path.join(
    BASE_DIR,
    "results",
    "predictions",
    "test_predictions_v2.csv"
)

FEATURE_IMPORTANCE = os.path.join(
    BASE_DIR,
    "results",
    "metrics",
    "feature_importance_v2.csv"
)

ANOMALIES = os.path.join(
    BASE_DIR,
    "results",
    "predictions",
    "anomalies_v2.csv"
)

CLUSTER_SUMMARY = os.path.join(
    BASE_DIR,
    "results",
    "metrics",
    "cluster_summary_v2.csv"
)

OUTPUT_DIR = os.path.join(
    BASE_DIR,
    "results",
    "figures"
)

os.makedirs(OUTPUT_DIR, exist_ok=True)


# =========================================================
# 1. ACTUAL VS RANDOM FOREST PREDICTION
# =========================================================

df = pd.read_csv(PREDICTIONS)

df["datetime"] = pd.to_datetime(df["datetime"])

plt.figure(figsize=(14, 6))

plt.plot(
    df["datetime"],
    df["actual_kwh"],
    label="Actual Consumption",
    linewidth=2
)

plt.plot(
    df["datetime"],
    df["random_forest_kwh"],
    label="Random Forest Prediction",
    linewidth=2
)

plt.xlabel("Date")
plt.ylabel("Daily Consumption (kWh)")
plt.title("Actual vs Random Forest Predicted Electricity Consumption")

plt.legend()
plt.grid(alpha=0.3)
plt.tight_layout()

plt.savefig(
    os.path.join(
        OUTPUT_DIR,
        "actual_vs_predicted_v2.png"
    ),
    dpi=300
)

plt.close()


# =========================================================
# 2. PREDICTION ERROR DISTRIBUTION
# =========================================================

df["prediction_error"] = (
    df["actual_kwh"]
    - df["random_forest_kwh"]
)

plt.figure(figsize=(10, 6))

sns.histplot(
    df["prediction_error"],
    bins=30,
    kde=True
)

plt.axvline(
    0,
    linestyle="--",
    linewidth=2
)

plt.xlabel("Prediction Error (kWh)")
plt.ylabel("Frequency")

plt.title(
    "Random Forest Prediction Error Distribution"
)

plt.grid(alpha=0.3)
plt.tight_layout()

plt.savefig(
    os.path.join(
        OUTPUT_DIR,
        "prediction_error_distribution_v2.png"
    ),
    dpi=300
)

plt.close()


# =========================================================
# 3. RANDOM FOREST FEATURE IMPORTANCE
# =========================================================

fi = pd.read_csv(FEATURE_IMPORTANCE)

print("\nFeature importance columns:")
print(fi.columns.tolist())

# Find the RF importance column automatically
rf_column = [
    col for col in fi.columns
    if "RandomForest" in col
]

if not rf_column:
    raise ValueError(
        "Random Forest importance column not found."
    )

rf_column = rf_column[0]

fi = fi.sort_values(
    rf_column,
    ascending=True
).tail(15)

plt.figure(figsize=(10, 7))

plt.barh(
    fi["Feature"],
    fi[rf_column]
)

plt.xlabel("Importance")
plt.ylabel("Feature")

plt.title(
    "Top 15 Random Forest Feature Importances"
)

plt.tight_layout()

plt.savefig(
    os.path.join(
        OUTPUT_DIR,
        "feature_importance_v2.png"
    ),
    dpi=300
)

plt.close()


# =========================================================
# 4. ANOMALY DETECTION
# =========================================================

# Load COMPLETE daily consumption dataset
daily = pd.read_csv(
    os.path.join(
        BASE_DIR,
        "data",
        "processed",
        "daily_consumption_v2.csv"
    )
)

daily["datetime"] = pd.to_datetime(
    daily["datetime"]
)

# Load anomaly results
anomaly = pd.read_csv(ANOMALIES)

anomaly["datetime"] = pd.to_datetime(
    anomaly["datetime"]
)

print("\nAnomaly columns:")
print(anomaly.columns.tolist())

# ---------------------------------------------------------
# Get the 29 most anomalous observations
# Lower anomaly score = more anomalous
# ---------------------------------------------------------

ANOMALY_COUNT = 29

anomaly_points = anomaly.nsmallest(
    ANOMALY_COUNT,
    "anomaly_score"
)

# ---------------------------------------------------------
# Match anomaly dates with the COMPLETE daily dataset
# ---------------------------------------------------------

anomaly_dates = set(
    anomaly_points["datetime"]
)

daily_anomalies = daily[
    daily["datetime"].isin(anomaly_dates)
].copy()

# ---------------------------------------------------------
# Plot COMPLETE daily consumption
# ---------------------------------------------------------

plt.figure(figsize=(14, 6))

plt.plot(
    daily["datetime"],
    daily["energy_kwh"],
    linewidth=1.3,
    label="Daily Consumption"
)

# ---------------------------------------------------------
# Overlay anomaly points
# ---------------------------------------------------------

plt.scatter(
    daily_anomalies["datetime"],
    daily_anomalies["energy_kwh"],
    s=60,
    label="Detected Anomaly",
    zorder=5
)

plt.xlabel("Date")
plt.ylabel("Daily Consumption (kWh)")

plt.title(
    "Unusual Electricity Consumption Detection"
)

plt.legend()
plt.grid(alpha=0.3)
plt.tight_layout()

plt.savefig(
    os.path.join(
        OUTPUT_DIR,
        "anomaly_detection_v2.png"
    ),
    dpi=300
)

plt.close()

print(
    f"\nTotal anomaly points plotted: "
    f"{len(daily_anomalies)}"
)
# =========================================================
# 5. CONSUMPTION CLUSTERS
# =========================================================

cluster = pd.read_csv(CLUSTER_SUMMARY)

print("\nCluster data:")
print(cluster.to_string(index=False))

# The CSV contains a multi-level summary structure.
# Relevant columns:
# Unnamed: 0 -> cluster ID
# energy_kwh.1 -> mean consumption

# Select actual cluster rows
cluster = cluster[
    cluster["Unnamed: 0"].astype(str).str.match(r"^\d+$")
].copy()

# Convert values to numeric
cluster["Cluster"] = pd.to_numeric(
    cluster["Unnamed: 0"]
)

cluster["Mean_kWh"] = pd.to_numeric(
    cluster["energy_kwh.1"]
)

plt.figure(figsize=(9, 6))

plt.bar(
    cluster["Cluster"].astype(str),
    cluster["Mean_kWh"]
)

plt.xlabel("Consumption Cluster")
plt.ylabel("Mean Daily Consumption (kWh)")

plt.title(
    "Electricity Consumption Pattern Clusters"
)

plt.grid(
    axis="y",
    alpha=0.3
)

plt.tight_layout()

plt.savefig(
    os.path.join(
        OUTPUT_DIR,
        "consumption_clusters_v2.png"
    ),
    dpi=300
)

plt.close()


# =========================================================
# COMPLETE
# =========================================================

print("\n========================================")
print("VISUALIZATION COMPLETE")
print("========================================")

print("\nGenerated files:")

for file in sorted(os.listdir(OUTPUT_DIR)):

    if file.endswith(".png"):
        print(" -", file)

print("\nSaved to:")
print(OUTPUT_DIR)