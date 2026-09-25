# WattWise AI

ML-powered household electricity management, bill prediction, anomaly detection, and what-if savings simulator. A college big data mini-project demonstrating end-to-end machine learning deployment.

## Project Overview

WattWise AI is a full-stack application that uses machine learning to predict household electricity consumption, detect unusual usage patterns, segment consumption lifestyles, and estimate utility bills. The project showcases modern ML engineering practices including chronological train/test splitting, feature engineering, distributed processing with Apache Spark, and production-ready API serving with FastAPI.

## Architecture

- **`web/`**: React 19 + Vite + Tailwind CSS v4 interactive dashboard
- **`WattWise-AI/`**: FastAPI backend with scikit-learn/XGBoost models + Apache Spark pipeline for large-scale data processing
- **`spark/`**: Distributed data processing and ML experiments using Spark MLlib

The dashboard is stateless and purely client-side — all model logic and data is served by the FastAPI backend, ensuring consistent calculations across all client sessions.

## Machine Learning Pipeline

### Models

| Model | Type | Purpose |
|-------|------|---------|
| Random Forest V2 | Supervised Regression | Production daily consumption forecasting (lowest MAE) |
| XGBoost V2 | Gradient-Boosted Regression | Benchmark model for sanity checking predictions |
| Isolation Forest V2 | Unsupervised Anomaly Detection | Flags unusual consumption days at 2% configured contamination |
| K-Means V2 | Unsupervised Clustering | Segments households into high/low consumption lifestyle patterns |

### Feature Engineering

The models use 26 engineered temporal features including:
- Rolling statistics (7-day, 14-day, 30-day means and standard deviations)
- Lagged consumption values
- Calendar features (year, month, day-of-week, week-of-year, is-weekend)
- Exponentially weighted moving averages (EWMA)
- Temperature interaction features (where available)

### Chronological Train/Test Split

All models use a strict chronological split to prevent data leakage:
- **70% Training**: Earliest portion of the time series
- **15% Validation**: Middle portion for hyperparameter tuning
- **15% Test**: Held-out final portion for unbiased performance measurement

### Performance Metrics

Regression models are evaluated on:
- **MAE (Mean Absolute Error)**: Average absolute difference between predicted and actual values
- **RMSE (Root Mean Squared Error)**: Square root of the average squared errors (penalizes large errors)
- **R² (Coefficient of Determination)**: Proportion of variance explained by the model (0 to 1)

Current held-out test set performance (measured on original 2006-2010 timeline):
- Random Forest: MAE ~0.47 kWh, RMSE ~0.82 kWh, R² ~0.97
- XGBoost: MAE ~0.51 kWh, RMSE ~0.87 kWh, R² ~0.96

## Dataset & Temporal Shifting

The underlying consumption observations originate from the **UCI Individual household electric power consumption** dataset, originally collected between 2006 and 2010. For demonstration purposes, the entire timeline has been shifted forward by 5844 days to appear as 2022-2026 data. All measured values remain unchanged — only calendar labels are updated.

**Important note**: The shipped Random Forest model was trained on the original 2006-2010 features and is reused without retraining. Calendar features in the shifted timeline are extrapolated rather than interpolated. For real-world deployment, the model should be retrained on recent household data.

## Apache Spark Pipeline

The `spark/spark_pipeline.py` script demonstrates distributed processing capabilities:
- Large-scale data cleaning and feature engineering
- Seasonal consumption pattern analysis
- Spark MLlib RandomForest regression experiment
- Outputs saved to `spark/output/` for further analysis

Run the Spark pipeline:
```bash
cd WattWise-AI/spark
python spark_pipeline.py
```

## API Endpoints

All endpoints are documented automatically via FastAPI's Swagger UI at `http://localhost:8000/docs` and OpenAPI schema at `http://localhost:8000/openapi.json`.

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/health` | GET | Liveness check with model and dataset metadata |
| `/model-info` | GET | Model hyperparameters, held-out metrics, and dataset provenance |
| `/model-analytics` | GET | Feature importances, model comparison, clusters, and anomaly statistics |
| `/historical-data` | GET | Recorded daily consumption with flexible date windowing |
| `/anomalies` | GET | Isolation Forest flagged outlier days with rolling statistics |
| `/predict` | POST | Predict one day of consumption given 30 days of history |
| `/predict-bill` | POST | Calculate estimated utility bill from predicted consumption |

## Running Locally

Both backend and frontend processes are required for full functionality.

### 1. Start the FastAPI Backend
```bash
# From repository root
./start-backend.sh            # Starts on http://127.0.0.1:8000
PORT=9000 ./start-backend.sh  # Custom port
```

Manual equivalent:
```bash
cd WattWise-AI
python -m uvicorn src.api:app --reload --port 8000
```

### 2. Launch the React Dashboard
```bash
cd web
npm install
npm run dev      # http://localhost:5173
```

## Environment Variables

### Backend
- `CORS_ORIGINS`: Comma-separated list of allowed origins (no wildcards)
- `PORT`: Server port (default: 8000)

### Frontend
- `VITE_API_URL`: Backend API base URL (default: `http://127.0.0.1:8000`)

Create a `.env` file in the `web/` directory to override defaults:
```env
VITE_API_URL=https://your-deployed-api.example.com
```

## Deployment

The application is designed for simple, static deployment without complex infrastructure:
- **Frontend**: Deploy the `web/dist/` build to any static host (Vercel, Netlify, S3, etc.)
- **Backend**: Deploy the FastAPI application to any Python hosting service (Render, Fly.io, Heroku, etc.)

No databases, authentication, Redis, Kubernetes, or microservices are required. The project prioritizes being correct, consistent, tested, deployable, and demo-ready.

## Simulator Methodology

The "What-If" simulator allows users to test efficiency changes:
- Appliance-level consumption adjustments
- Solar panel adoption scenarios
- EV charging integration
- HVAC efficiency upgrades

All simulations apply changes to the baseline consumption series and use the same prediction model to estimate outcomes.

## Anomaly Detection Methodology

The Isolation Forest algorithm identifies anomalous consumption days by:
- Fitting on the multivariate feature space of all consumption records
- Randomly splitting features to isolate outlier points
- Flagging points that require unusually few splits to isolate
- Configured to detect the top 2% most unusual consumption patterns

## Validation & Testing

Run the full validation suite:

### Backend Tests
```bash
cd WattWise-AI
python -m pytest -q                    # Unit tests
python src/validate_api.py             # API endpoint validation
python smoke_test.py                   # End-to-end smoke test
```

### Frontend Tests
```bash
cd web
npm run lint                           # ESLint checking
npm run build                          # Production build verification
```

### Manual UI Verification
After starting both services, verify all pages function correctly:
- Home: Overview and key metrics
- Dashboard: Real-time consumption tracking
- Analytics: Trend analysis and visualizations
- Anomalies & Excess Usage: Detected outliers
- Simulator: What-if scenario testing
- Predictor: Consumption forecasting
- Energy Advisor: Personalized recommendations
- Models: Model documentation and performance metrics
- Settings: Application configuration

## Limitations & Future Improvements

### Current Limitations
- Models trained on 2006-2010 data, not contemporary consumption patterns
- Single-region carbon emission factor (0.79 kg CO₂/kWh)
- Flat tariff billing only (no time-of-use or slab pricing)
- Single household modeling only

### Future Improvements
- Retrain models on recent/current household consumption data
- Add support for multiple households and grid-level aggregation
- Implement time-of-use and slab-based billing calculations
- Integrate real-time weather data for improved predictions
- Add user authentication for multi-user deployments
- Add database persistence for user scenarios and historical predictions