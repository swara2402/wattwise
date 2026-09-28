# WattWise AI: AI-Powered Household Electricity Analytics, Anomaly Detection & Forecasting Platform

A comprehensive Big Data Analytics and Machine Learning system for household electricity consumption prediction, anomaly detection, statistical profiling, and what-if energy optimization. Built for scalable data processing, empirical model benchmarking, and academic presentation (SMLBDA).

---

## 1. Project Overview

**WattWise AI** transforms large-scale, minute-level smart meter records into an intelligent energy management and prediction platform. The system processes **2,075,259 raw measurements** from the UCI Individual Household Electric Power Consumption benchmark dataset through a structured data pipeline. It leverages **Apache PySpark** for distributed preprocessing and **Scikit-Learn / XGBoost** for machine learning regression, anomaly detection, and cluster analysis.

The system communicates:
> *"An AI-powered Big Data Analytics platform for household electricity consumption prediction, anomaly detection, usage analysis, and energy optimization."*

---

## 2. Problem Statement

Modern households lack transparent, data-driven tools to anticipate electricity costs, identify abnormal consumption spikes, and quantify the monetary impact of behavioral or appliance changes. Raw smart meter logs are massive (millions of minute-level records) and noisy, requiring distributed data pipelines to clean, aggregate, engineer temporal features, and extract actionable insights.

### Key Challenges Addressed
1. **High-Frequency Noisy Data**: Processing 2.07M minute-level smart meter records with missing values.
2. **Temporal Leakage in ML**: Preventing data leakage in time-series forecasting through strict chronological splitting.
3. **Transparent Costing**: Translating kWh forecasts into monetary currency based on custom household flat tariff.
4. **Statistical Outlier Detection**: Distinguishing true statistical consumption anomalies from regular peak usage.

---

## 3. Objectives

* **Distributed Big Data Preprocessing**: Clean, impute, and aggregate 2.07M 1-minute smart meter readings into daily and hourly energy consumption series using PySpark & Pandas.
* **Feature Engineering**: Construct 26 temporal, lag, rolling window, and exponential moving average (EWM) features.
* **Statistical Analysis**: Compute descriptive statistics (mean, median, std dev, variance, skewness, kurtosis, percentiles), seasonal trends, weekday vs. weekend elevation ratios, and Pearson correlations.
* **Machine Learning Ensembling**: Train and compare Naive Baseline, Random Forest V2, XGBoost V2, and PySpark MLlib regressors on chronological held-out test splits.
* **Anomaly & Excess Usage Detection**: Deploy an Isolation Forest to score historical days and provide root-cause explanations.
* **Interactive What-If Simulation**: Model appliance-level power ratings and duty cycles to project monthly rupee and CO₂ savings.
* **Production API & Web Application**: Expose a RESTful FastAPI backend and a responsive Vite + React analytics application.

---

## 4. Key Features

* **Interactive Dashboard**: High-level household KPIs, 30-day consumption trends, peak day highlights, and instant tariff projections.
* **Statistical Analytics Engine**: Full descriptive statistics, day-of-week load profiles, monthly/seasonal breakdowns, sub-metering circuit analysis, and Pearson correlation matrices.
* **Model Lab (ML Evaluation)**: Live benchmark comparison table (MAE, RMSE, R²), permutation feature importance, K-Means consumption clusters, and chronological split boundaries.
* **Consumption & Cost Predictor**:
  * **Single-Day Forecast**: Predicts next-day kWh with held-out MAE error bounds priced at custom tariffs.
  * **Iterative Multi-Day Horizon Forecast**: Roll-forward lag propagation for up to 30 days ahead with compounding uncertainty bounds.
* **Anomaly & Excess Detection**: Isolation Forest incident log with severity flags (Critical, High, Medium, Low), Z-scores, percentage deviations, and possible root causes.
* **What-If Energy Simulator**: Appliance duty cycle sliders, annual cost savings calculation, CO₂ reduction estimates, and side-by-side scenario comparison.
* **Contextual AI Energy Advisor**: Prioritized energy-saving actions ranked by potential monetary savings.
* **Academic Methodology & Viva Guide**: Interactive stage-by-stage pipeline breakdown and key viva questions for academic project defense.

---

## 5. System Architecture

```
[ UCI Smart Meter Dataset ] (2,075,259 Minute Records)
             │
             ▼
[ Big Data Processing & Preprocessing ]
 ├── Apache PySpark (Distributed hourly aggregation)
 └── Python / Pandas (Daily aggregation & linear interpolation)
             │
             ▼
[ Feature Engineering Engine (26 Features) ]
 ├── Calendar Variables (Year, Month, Day, Season, Is_Weekend)
 ├── Lag Variables (Lags 1, 2, 3, 7, 14, 21, 30)
 ├── Rolling Statistics (3, 7, 14, 30-day Rolling Mean & Std)
 └── Exponential Moving Averages (EWM-7, EWM-30)
             │
             ▼
[ Machine Learning & Analytics Pipeline ]
 ├── Regressors: Naive Baseline | Random Forest V2 | XGBoost V2 | Spark MLlib RF
 ├── Anomaly Detection: Isolation Forest (Contamination = 2%)
 └── Clustering: K-Means (2 Household Usage Modes)
             │
             ▼
[ FastAPI Backend Engine ] (Uvicorn REST API)
 ├── GET /health, /model-info, /dataset-statistics, /pipeline-metadata
 ├── GET /historical-data, /anomalies, /model-analytics
 └── POST /predict, /predict-horizon, /predict-bill
             │
             ▼
[ React Analytics Frontend ] (Vite + Tailwind CSS + Recharts)
```

---

## 6. Big Data & Data Pipeline

The dataset processing pipeline transforms raw high-frequency observations into structured training artifacts:

$\text{Raw Dataset (2,075,259 rows)} \xrightarrow{\text{Time interpolation}} \text{Cleaned minute readings} \xrightarrow{\text{Daily aggregation}} \text{Daily Series (1,433 rows)} \xrightarrow{\text{30-day feature warmup}} \text{ML Table (1,403 rows)}$

### Pipeline Record Tracking
| Stage | Description | Record Count | Missing Values / Loss |
| :--- | :--- | :---: | :---: |
| **Raw Ingestion** | 1-minute smart meter readings (2006–2010) | 2,075,259 | 25,979 (1.25% missing `?`) |
| **Data Cleaning** | Time-based linear interpolation (limit=60m) | 2,049,280 valid minute readings | Missing numeric entries resolved within the interpolation limit |
| **Daily Aggregation** | Sum of minute kW / 60 $\rightarrow$ Daily kWh | 1,433 | 0 missing |
| **Feature Engineering** | 26 lag/rolling features (30-day context window) | 1,403 | 30 initial lag warmup rows dropped |
| **Train Split (70%)** | Chronological training set | 982 | 0 rows |
| **Validation Split (15%)**| Chronological validation set | 210 | 0 rows |
| **Held-Out Test Split (15%)**| Out-of-sample test evaluation set | 211 | 0 rows |

---

## 7. Dataset Identification

* **Dataset Name**: UCI Individual Household Electric Power Consumption
* **Source**: UCI Machine Learning Repository
* **Total Size**: 126.8 MB uncompressed (20.6 MB zipped)
* **Sampling Rate**: 1-minute intervals over 47 months (Dec 2006 – Nov 2010)
* **Attributes**:
  1. `Date` & `Time`: Timestamp of measurement.
  2. `Global_active_power`: Household minute-averaged active power (in kW).
  3. `Global_reactive_power`: Household minute-averaged reactive power (in kW).
  4. `Voltage`: Minute-averaged voltage (in Volts).
  5. `Global_intensity`: Minute-averaged current intensity (in Amperes).
  6. `Sub_metering_1`: Active energy for kitchen appliances (in Wh).
  7. `Sub_metering_2`: Active energy for laundry & refrigeration (in Wh).
  8. `Sub_metering_3`: Active energy for electric water-heater & climate control (in Wh).

---

## 8. Statistical Analysis

Rigorous statistical metrics computed across the processed 1,442-day consumption series:

### Summary Statistics
* **Mean Consumption**: $26.03\text{ kWh/day}$
* **Median Consumption**: $24.78\text{ kWh/day}$
* **Standard Deviation ($\sigma$)**: $14.12\text{ kWh/day}$
* **Variance ($\sigma^2$)**: $199.38\text{ kWh}^2$
* **Interquartile Range (IQR)**: $16.42\text{ kWh/day}$ (Q25: $15.11$, Q75: $31.53$)
* **Skewness**: $+0.842$ (Right-skewed, heavy usage tails)
* **Kurtosis**: $+0.615$ (Leptokurtic distribution)

### Load Profiles & Trends
* **Weekday vs. Weekend**: Weekend consumption is **$1.12\times$ higher** than weekday averages ($27.95\text{ kWh}$ vs $25.02\text{ kWh}$).
* **Seasonal Peak**: Winter records highest daily average ($32.40\text{ kWh/day}$), followed by Autumn ($25.80\text{ kWh}$), Spring ($24.10\text{ kWh}$), and Summer ($21.80\text{ kWh}$).
* **Sub-Metering Allocation**:
  * Kitchen (`Sub_1`): ~7.2% of total energy
  * Laundry / Fridge (`Sub_2`): ~7.8% of total energy
  * Climate / Hot Water (`Sub_3`): ~38.4% of total energy
  * Unmetered Active Energy: ~46.6% (lighting, wall outlets, electronics)
* **Pearson Correlations with Energy (kWh)**:
  * Global Intensity: $+0.984$ (Strong positive)
  * Reactive Power: $+0.412$ (Moderate positive)
  * Average Voltage: $-0.215$ (Slight negative)

---

## 9. Machine Learning Pipeline & Evaluation

Models are trained on 70% of chronological data, validated on the next 15%, and evaluated on the final 15% held-out test split (211 unseen engineered days).

### Model Performance Comparison Table
| Model | Type | MAE (kWh/day) | RMSE (kWh/day) | $R^2$ Score | Training Time | Deployed Role |
| :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| **Naive Baseline** | Persistent (Lag-1) | 4.755 | 6.811 | 0.1764 | < 0.01s | Benchmark |
| **Random Forest V2** | Ensembled Regressor | **4.003** | **5.523** | **0.4584** | 0.74s | **Production Served** |
| **XGBoost V2** | Gradient Boosting | 4.133 | 5.771 | 0.4087 | 1.55s | Candidate Benchmark |
| **PySpark MLlib RF**| Distributed Hourly | 0.347 (hourly) | 0.495 (hourly) | 0.6001 | 5.54s | Spark Pipeline |

*Note: All performance metrics are calculated strictly on unobserved held-out test data.*

### Top Engineered Feature Importance (Random Forest V2)
1. `ewm_7`: Exponentially weighted 7-day average (12.11%)
2. `rolling_mean_3`: 3-day moving average (9.81%)
3. `rolling_mean_7`: 7-day moving average (9.53%)
4. `lag_1`: Previous day's energy consumption (7.91%)
5. `rolling_mean_14`: 14-day moving average (6.99%)

---

## 10. Time-Series Prediction Workflow

### 1-Day Single Prediction
The model accepts 30 days of recent consumption context $[c_{t-29}, \dots, c_t]$ and the target date $T$, constructs the 26-feature vector, and predicts $c_{T}$ floored at zero.

### Iterative Multi-Day Horizon Forecast
For multi-day forecasts (up to 30 days ahead):
1. Day $1$ prediction $\hat{c}_{t+1}$ is computed from context $[c_{t-29}, \dots, c_t]$.
2. $\hat{c}_{t+1}$ is appended to the context window as the newest lag value.
3. Day $2$ prediction $\hat{c}_{t+2}$ is computed from updated context $[c_{t-28}, \dots, c_t, \hat{c}_{t+1}]$.
4. Iterates for $N$ steps while accumulating uncertainty bounds: $\text{Lower} = \max(0, \hat{c} - \text{MAE})$, $\text{Upper} = \hat{c} + \text{MAE}$.

---

## 11. Anomaly & Excess Detection

* **Algorithm**: Isolation Forest (`contamination = 0.02`, `n_estimators = 300`)
* **Scoring Mechanism**: Measures tree partition depth required to isolate each day.
* **Severity Grading**:
  * **Critical**: Anomaly score $< -0.15$ AND $> 50\%$ deviation over 7-day baseline.
  * **High**: Anomaly score $< -0.10$ AND $> 30\%$ deviation over 7-day baseline.
  * **Medium**: Anomaly score $< -0.05$ OR $> 20\%$ deviation over baseline.
  * **Low**: Statistical outlier with minor deviation.
* **Explanations**: Maps anomalies to probable causes (e.g., HVAC continuous run, laundry overload, unmetered peak load) without making unverified claims.

---

## 12. What-If Simulator & Bill Forecasting

* **Appliance Simulator**: Adjust appliance power ratings (Watts), quantities, daily operating hours, and days per month.
* **Formula**:
  $$\text{Monthly kWh} = \frac{\text{Power (W)} \times \text{Quantity} \times \text{Hours/day} \times \text{Days/month}}{1000}$$
* **Bill Prediction**:
  $$\text{Total Bill} = (\text{Predicted Daily kWh} \times \text{Days} \times \text{Tariff}) + \text{Fixed Charge}$$

---

## 13. Technology Stack

* **Frontend**: React 18, Vite 8, Recharts, Lucide Icons, Vanilla CSS Design System.
* **Backend Service**: Python 3.11, FastAPI, Pydantic v2, Uvicorn, Joblib.
* **Machine Learning & Data Science**: Scikit-Learn, XGBoost, Pandas, NumPy, Apache PySpark MLlib.
* **Testing & Tools**: Pytest, Pytest-Cov, Oxlint, Git.

---

## 14. API Architecture & Endpoints

| Endpoint | Method | Description |
| :--- | :---: | :--- |
| `/health` | `GET` | Service status, model metadata, feature count, dataset bounds |
| `/model-info` | `GET` | Production model hyperparameters, metrics, split boundaries |
| `/dataset-info` | `GET` | Dataset range, daily row count, isolation forest context |
| `/dataset-statistics` | `GET` | Summary statistics, seasonal trends, weekday breakdown, correlations |
| `/pipeline-metadata` | `GET` | Record counts across raw, cleaned, daily, and ML stages |
| `/model-analytics` | `GET` | Model comparison, feature importances, cluster summaries |
| `/historical-data` | `GET` | Recorded daily consumption history (`?limit=N&before=YYYY-MM-DD`) |
| `/anomalies` | `GET` | Flagged Isolation Forest anomaly incidents with scores & details |
| `/predict` | `POST` | Single-day forecast given 30-day context & target date |
| `/predict-horizon` | `POST` | Multi-day iterative roll-forward forecast (1–30 days) |
| `/predict-bill` | `POST` | Bill estimation based on forecast, tariff rate, and days |

---

## 15. Installation & Setup

### Prerequisites
* **Python 3.10+**
* **Node.js 18+ & npm**

### 1. Clone Repository
```bash
git clone https://github.com/swara2402/wattwise.git
cd wattwise
```

### 2. Backend Setup (`WattWise-AI`)
```bash
cd WattWise-AI
python -m venv venv
# On Windows:
venv\Scripts\activate
# On Linux/macOS:
# source venv/bin/activate

pip install -r requirements.txt
```

### 3. Frontend Setup (`web`)
```bash
cd ../web
npm install
```

---

## 16. Running the Project

### Running Backend API
```bash
cd WattWise-AI
uvicorn src.api:app --reload --port 8000
```
API docs available at `http://127.0.0.1:8000/docs`.

### Running Frontend Development Server
```bash
cd web
npm run dev
```
Open `http://localhost:5173` in browser.

### Running Backend Unit Tests
```bash
cd WattWise-AI
python -m pytest
```

---

## 17. Results & Key Findings

1. **Random Forest benchmark**: Random Forest V2 outperformed Naive Baseline by reducing MAE from $4.755\text{ kWh}$ to $4.003\text{ kWh}$ ($15.8\%$ error reduction) and explaining $45.8\%$ of daily consumption variance.
2. **Weekend consumption pattern**: The historical dataset shows a $1.12\times$ weekend-to-weekday mean ratio. This is a descriptive pattern in the benchmark data, not proof of the underlying cause.
3. **Primary Energy Driver**: Exponential moving average (`ewm_7`) and short-term rolling averages (`rolling_mean_3`, `rolling_mean_7`) account for over $31.4\%$ of total feature importance, proving that recent consumption inertia strongly predicts near-term demand.

---

## 18. Limitations

* **Chronological Timeline Shift**: Historical 2006–2010 readings were calendar-shifted forward to align with modern demo dates.
* **Flat Tariff Assumption**: Bill predictions assume flat per-unit rates; time-of-use (TOU) peak/off-peak pricing is not yet included in the default billing module.
* **Unmetered Load**: Approximately 46.6% of active household energy is unmetered by sub-circuits 1, 2, and 3.

---

## 19. Future Scope

1. **PySpark Structured Streaming**: Real-time smart meter anomaly detection over Kafka streams.
2. **Sub-Appliance Disaggregation (NILM)**: Non-Intrusive Load Monitoring to isolate individual appliance signatures from total power curves.
3. **Deep Learning Forecasting**: Integration of Temporal Fusion Transformers (TFT) or LSTM networks for complex seasonal patterns.
4. **Time-of-Use Tariff Slabs**: Advanced billing algorithms supporting dynamic peak/off-peak rate bands.

---

## 20. License & Citation

* **Dataset**: UCI Machine Learning Repository (Individual Household Electric Power Consumption).
* **License**: MIT License.