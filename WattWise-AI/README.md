# WattWise AI: Backend API, ML Pipelines & PySpark Analytics

This sub-directory contains the core Python analytics engine, PySpark pipelines, Scikit-Learn / XGBoost models, and FastAPI backend service for **WattWise AI**.

---

## Architecture Overview

```
WattWise-AI/
├── data/
│   ├── raw/                 # UCI raw dataset archive
│   └── processed/           # Processed daily CSVs and ML training tables
├── models/                  # Fitted estimators (.joblib)
│   ├── random_forest_v2.joblib
│   ├── xgboost_v2.joblib
│   ├── isolation_forest_v2.joblib
│   └── kmeans_v2.joblib
├── results/
│   ├── metrics/             # Model evaluation CSVs, feature importance, clusters
│   └── predictions/         # Anomaly flags
├── spark/                   # Distributed PySpark MLlib pipeline
│   └── spark_pipeline.py
├── src/                     # Core backend source files
│   ├── api.py               # FastAPI REST service & endpoint handlers
│   ├── billing.py           # Tariff calculation module
│   ├── features.py          # 26-feature engineering pipeline
│   ├── metadata.py          # Artifact loader & single source of truth
│   └── visualize_v2.py      # Plotting helpers
├── tests/                   # Pytest unit tests (157 tests)
├── train_v2.py              # ML model training and evaluation script
└── requirements.txt         # Python dependencies
```

---

## Data Pipeline & Feature Engineering

1. **Ingestion & Preprocessing**:
   - `data/raw/household_power_consumption.zip` contains 2,075,259 minute readings.
   - Interpolates missing values with a 60-minute limit.
   - Aggregates minute readings into 1,442 daily records ($\text{kWh} = \sum \text{kW} / 60$).

2. **26 Engineered Features**:
   - **Calendar (9)**: `year`, `month`, `day`, `day_of_week`, `day_of_year`, `week_of_year`, `quarter`, `season`, `is_weekend`
   - **Lags (7)**: `lag_1`, `lag_2`, `lag_3`, `lag_7`, `lag_14`, `lag_21`, `lag_30`
   - **Rolling Means (4)**: `rolling_mean_3`, `rolling_mean_7`, `rolling_mean_14`, `rolling_mean_30`
   - **Rolling Standard Deviations (4)**: `rolling_std_3`, `rolling_std_7`, `rolling_std_14`, `rolling_std_30`
   - **Exponential Averages (2)**: `ewm_7`, `ewm_30`

---

## ML Benchmarks

| Model | MAE (kWh/day) | RMSE (kWh/day) | $R^2$ Score | Status |
| :--- | :---: | :---: | :---: | :--- |
| **Naive Baseline** | 4.755 | 6.811 | 0.1764 | Benchmark |
| **Random Forest V2** | **4.003** | **5.523** | **0.4584** | **Production Deployed** |
| **XGBoost V2** | 4.133 | 5.771 | 0.4087 | Evaluated |
| **Spark MLlib RF** | 0.347 (hourly) | 0.495 (hourly) | 0.6001 | Distributed Pipeline |

---

## Execution Instructions

### Run Unit Tests
```bash
python -m pytest
```

### Train / Re-evaluate Models
```bash
python train_v2.py
```

### Launch FastAPI Server
```bash
uvicorn src.api:app --reload --port 8000
```
Interactive OpenAPI documentation available at `http://127.0.0.1:8000/docs`.

### Run Distributed PySpark Pipeline
```bash
python spark/spark_pipeline.py
```
