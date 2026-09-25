# WattWise AI - PySpark Distributed Processing Layer

## Overview
This PySpark component adds scalable distributed data processing capabilities to the WattWise AI project, fulfilling the college requirement for Big Data Analytics / Scalable Machine Learning demonstration.

The Spark pipeline demonstrates genuine distributed processing that can scale from the current small dataset to large-scale household energy consumption datasets with millions of records.

## Why PySpark?
- **Distributed Processing**: All transformations run on Spark's execution engine, enabling horizontal scaling
- **Window Functions**: Advanced temporal feature engineering using Spark's distributed window operations
- **Built-in MLlib**: Scalable machine learning algorithms that work on large datasets
- **Fault Tolerance**: Spark's RDD abstraction provides built-in fault tolerance for large workloads
- **Production Ready**: The same code runs locally for development and on cloud clusters for production

## Architecture
```
Raw Dataset (daily_consumption_v2.csv)
          ↓
SparkSession Initialization
          ↓
Distributed Data Loading (Spark DataFrame)
          ↓
Schema Inspection & Validation
          ↓
Distributed Data Cleaning
          ↓
Temporal Feature Engineering
          ↓
Window-based Lag/Rolling Features
          ↓
Aggregate Analytics Calculation
          ↓
Optional: Spark MLlib RandomForest Experiment
          ↓
Output: Parquet + CSV + Metrics
```

## Requirements
- Python 3.10+
- Java 8+ (required for Spark)
- All dependencies in `requirements.txt`

## Installation
```bash
# From the spark directory
pip install -r requirements.txt
```

## How to Run
```bash
# From the project root (WattWise-AI/)
python -m spark.spark_pipeline
```

Or from the spark directory:
```bash
cd spark
python spark_pipeline.py
```

## What the Pipeline Does

### 1. SparkSession Creation
- Configures Spark application with appropriate settings
- Sets log level to reduce noise
- Reports Spark version and initialization time

### 2. Dataset Loading
- Loads CSV with schema inference
- Repartitions for distributed processing (configurable for larger datasets)
- Reports row/column/partition counts

### 3. Data Inspection
- Prints full schema
- Counts null values per column
- Displays basic statistics for key metrics
- Validates date range

### 4. Data Cleaning
- Removes rows with null values in critical columns
- Filters out invalid negative energy consumption values
- Fills nulls in sub-metering columns with 0
- Reports rows removed during cleaning

### 5. Feature Engineering (Distributed)
- **Temporal features**: year, month, day, day_of_week, quarter, is_weekend, season
- **Lag features**: 7-day, 14-day, 30-day energy consumption lags using Spark Window
- **Rolling averages**: 7-day and 30-day moving averages using Spark Window
- All window operations execute in a distributed manner

### 6. Analytics Calculation
- Monthly consumption aggregates (sum, avg, max, min, stddev)
- Seasonal consumption comparison
- Weekday vs Weekend consumption analysis
- Overall dataset statistics

### 7. Spark MLlib Experiment (Optional Benchmark)
- Trains a RandomForestRegressor using Spark's distributed ML library
- Splits data into 80%/20% train/test
- Evaluates with MAE, RMSE, R² metrics
- Provides a scalable benchmark against the existing scikit-learn model

## Outputs Generated
All outputs are saved to the `output/` directory:

1. `processed_consumption.parquet` - Optimized columnar storage of processed dataset
2. `processed_consumption.csv` - Human-readable CSV copy
3. `monthly_analytics.csv` - Monthly consumption statistics
4. `seasonal_analytics.csv` - Seasonal consumption statistics
5. `weekday_analytics.csv` - Weekday/weekend comparison
6. `spark_ml_metrics.txt` - Spark MLlib model evaluation metrics

## Scalability Note
> The project demonstrates a scalable distributed processing architecture using Apache Spark that can be extended to larger household energy datasets.

While the current dataset contains only ~1,433 daily observations, every component of this Spark pipeline is designed to scale:
- DataFrame transformations are lazy evaluated and optimized by Spark's Catalyst engine
- Window functions distribute computation across cluster nodes
- MLlib algorithms use distributed training for large datasets
- The pipeline can be deployed on YARN, Kubernetes, or cloud-managed Spark clusters

## Current Dataset Limitations
- Time range: 2022-12-16 to 2026-11-26 (date-shifted for demonstration)
- Original underlying data: 2006-2010 household energy consumption
- Single household: The architecture supports ingesting thousands of households

## Difference from Existing ML Pipeline
| Aspect | Existing Pipeline | Spark Pipeline |
|--------|-------------------|----------------|
| Processing | Single-machine Pandas/NumPy | Distributed Spark |
| ML Framework | scikit-learn, XGBoost | Spark MLlib (experimental) |
| Use Case | Real-time API inference | Batch processing at scale |
| Deployment | FastAPI web service | ETL/analytics pipeline |

The Spark component **does not modify or replace** any existing functionality. It runs as a separate preprocessing/analytics layer that can feed into the existing ML pipeline if needed.