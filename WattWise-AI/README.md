# WattWise: Household Electricity Consumption Analysis using Apache PySpark

A Big Data Analytics mini project implementing scalable household electricity consumption preprocessing, distributed aggregation, exploratory analytics, hourly consumption forecasting using PySpark MLlib, and empirical performance benchmarking.

---

## 1. Problem Definition

Analyze and process large-scale household electricity consumption data using **Apache PySpark** to identify consumption patterns and perform electricity consumption analysis using scalable distributed processing.

### Objectives
* Perform distributed big data preprocessing on minute-level smart meter records.
* Aggregate minute-level readings into structured hourly consumption datasets.
* Engineer temporal, lag, and rolling window features for hourly forecasting.
* Implement a distributed Machine Learning regression algorithm using Spark MLlib (`RandomForestRegressor`).
* Evaluate forecasting accuracy using RMSE, MAE, and R² metrics.
* Conduct empirical runtime performance analysis across all pipeline stages.

---

## 2. Dataset Identification

* **Dataset Name**: UCI Individual Household Electric Power Consumption Dataset
* **Dataset Source**: UCI Machine Learning Repository
* **Number of Raw Records**: 2,075,259 minute-level measurements
* **Raw File Size**: 126.80 MB
* **Date Range**: December 16, 2006 to November 26, 2010 (~4 years)
* **Sampling Frequency**: 1-minute sampling interval
* **Missing Value Representation**: `?` (represented as string nulls in raw CSV)
* **Dataset Attributes**:
  1. `Date`: Date in format `dd/mm/yyyy`
  2. `Time`: Time in format `hh:mm:ss`
  3. `Global_active_power`: Household global minute-averaged active power (in kW)
  4. `Global_reactive_power`: Household global minute-averaged reactive power (in kW)
  5. `Voltage`: Minute-averaged voltage (in Volts)
  6. `Global_intensity`: Minute-averaged current intensity (in Amperes)
  7. `Sub_metering_1`: Active energy for kitchen appliances (in Wh)
  8. `Sub_metering_2`: Active energy for laundry & refrigeration (in Wh)
  9. `Sub_metering_3`: Active energy for electric water-heater & air-conditioner (in Wh)

---

## 3. Data Preprocessing

Data preprocessing is executed entirely in **Apache PySpark** without converting raw data to Pandas:
* **Raw CSV Parsing**: Loaded using `spark.read.csv(sep=";", header=True)`.
* **Missing Value Clean-up**: Converted `?` missing symbols to PySpark `Null` values; dropped invalid records missing critical power attributes.
* **Timestamp Construction**: Combined `Date` and `Time` into a single PySpark `TimestampType` using `to_timestamp(concat_ws(" ", col("Date"), col("Time")), "d/M/yyyy HH:mm:ss")`.
* **Numeric Casting**: Cast all 7 electrical attributes from StringType to `DoubleType`.
* **Data Integrity Filtering**: Filtered out negative or corrupted power readings and ensured chronological order.
* **Result**: Cleaned 2,049,280 valid minute-level records from 2,075,259 raw records (25,979 invalid/missing rows removed).

---

## 4. Big Data / Distributed Processing

Distributed processing forms the core of the PySpark pipeline:
* **Minute-to-Hourly Aggregation**:
  Aggregated 2,049,280 minute-level records into 34,157 hourly records. Total active energy in kWh per hour is computed as:
  $$\text{Energy (kWh)} = \frac{\sum \text{Global\_active\_power (kW)}}{60}$$
* **Optimized PySpark Window Operations**:
  All lag (`lag_1h`, `lag_24h`) and rolling average (`rolling_avg_3h`, `rolling_avg_24h`) features are defined with partition specifications (`Window.partitionBy("year").orderBy("datetime")`). This completely eliminates PySpark unpartitioned window warnings (`WindowExec: No Partition Defined for Window operation!`) and ensures true distributed partition execution.
* **Distributed DataFrame Transformations**: Utilized PySpark `groupBy`, `agg`, `filter`, and `repartition(4)` for distributed computation across available CPU cores.

---

## 5. Feature Engineering & Analytics

### Feature Set
* `hour`: Hour of day (0–23)
* `day_of_week`: Day of week (1=Sunday, 7=Saturday)
* `is_weekend`: Binary flag (1 if weekend, 0 if weekday)
* `month`: Month of year (1–12)
* `year`: Measurement year
* `season`: Categorical season (Winter, Spring, Summer, Fall)
* `lag_1h`: Previous hour's energy consumption (kWh)
* `lag_24h`: Previous day's same hour consumption (kWh)
* `rolling_avg_3h`: 3-hour moving average consumption
* `rolling_avg_24h`: 24-hour moving average consumption

### Aggregated Analytics
* **Hourly Consumption Patterns**: Peak usage observed between 18:00–21:00.
* **Daily & Monthly Trends**: Seasonal peak consumption during Winter months.
* **Weekday vs Weekend**: Higher average consumption recorded during weekends.

---

## 6. Algorithm Implementation

* **Framework**: PySpark MLlib (`pyspark.ml.regression.RandomForestRegressor`)
* **Target Variable**: `target_next_hour_kwh` (predicting next-hour consumption)
* **Feature Vector**: Assembled using PySpark `VectorAssembler`
* **Hyperparameters**:
  * `numTrees`: 50
  * `maxDepth`: 8
  * `seed`: 42
* **Data Splitting**: Time-series-aware chronological split:
  * **Training Set**: Records prior to `2010-01-01` (26,433 records, ~77.4%)
  * **Testing Set**: Records from `2010-01-01` onwards (7,599 records, ~22.6%)

---

## 7. Evaluation

Evaluated on the out-of-sample testing partition using PySpark `RegressionEvaluator`:

| Metric | Empirical Value | Description |
| :--- | :--- | :--- |
| **RMSE** | **0.4949 kWh** | Root Mean Squared Error penalizing larger prediction spikes |
| **MAE** | **0.3465 kWh** | Mean Absolute Error measuring average forecast deviation |
| **R² Score**| **0.6001** | Coefficient of Determination explaining 60.01% of variance |

---

## 8. Result Visualization

All visualizations are generated from small aggregated DataFrames and saved to `visualizations/`:
1. `hourly_consumption_pattern.png`: Average consumption curve by hour of day.
2. `daily_consumption_trend.png`: Chronological daily consumption time series.
3. `monthly_consumption.png`: Total monthly electricity consumption across 4 years.
4. `weekday_vs_weekend.png`: Comparative bar chart of weekday vs weekend load.
5. `seasonal_consumption.png`: Breakdown of total energy demand by season.
6. `actual_vs_predicted.png`: Next-hour actual vs RandomForest predicted kWh curve.

---

## 9. Performance Analysis

Empirical execution timing for each stage on local Spark master (`local[*]`):

| Pipeline Stage | Processing Task | Execution Time |
| :--- | :--- | :--- |
| **Stage 1 & 2** | Dataset Loading & Schema Inference | 4.52s |
| **Stage 3** | Data Preprocessing & Date Parsing | 2.96s |
| **Stage 4** | Distributed Hourly Aggregation (2.07M rows → 34.1k rows) | 3.46s |
| **Stage 5** | Feature Engineering & Window Aggregations | 0.35s |
| **Stage 6 & 7** | PySpark MLlib RandomForest Training & Evaluation | 8.46s |
| **Stage 8** | Visualization Rendering & CSV Output Export | 4.86s |
| **Total Pipeline**| **Complete End-to-End Execution** | **28.13s** |

### Summary Statistics
* **Raw Input Records**: 2,075,259 rows (126.80 MB)
* **Cleaned Records**: 2,049,280 rows
* **Aggregated Hourly Records**: 34,157 rows
* **PySpark Shuffle Partitions**: 4

---

## 10. Conclusion

* Successfully implemented an end-to-end big data analytics pipeline for smart meter data using **Apache PySpark**.
* Reduced 2.07 million minute-level records into 34,157 structured hourly energy features using distributed DataFrame aggregations.
* Achieved strong predictive accuracy ($R^2 = 0.6001$, $MAE = 0.3465\text{ kWh}$) for next-hour electricity forecasting using PySpark MLlib's `RandomForestRegressor`.
* Optimized Window operations by partitioning on `year`, eliminating global shuffle bottlenecks and PySpark execution warnings.

---

## 11. Future Scope

1. **Streaming Analytics**: Extend the pipeline to PySpark Structured Streaming for real-time smart meter anomaly detection.
2. **Distributed Cluster Deployment**: Scale execution from local mode to a multi-node Apache Spark cluster on YARN or Kubernetes.
3. **Hyperparameter Tuning**: Implement PySpark `ParamGridBuilder` and `CrossValidator` for automated RF hyperparameter optimization.
