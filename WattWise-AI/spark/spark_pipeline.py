"""
WattWise: Household Electricity Consumption Analysis using Apache PySpark
========================================================================

Pipeline Stages:
1. Problem Definition & Environment Setup
2. Dataset Identification & Loading (UCI Household Power Consumption)
3. Data Preprocessing & Cleaning (PySpark DataFrames)
4. Big Data / Distributed Processing (Minute to Hourly Aggregation)
5. Feature Engineering & Aggregate Analytics
6. Algorithm Implementation (Spark MLlib RandomForestRegressor)
7. Time-Series Aware Data Splitting & Evaluation (RMSE, MAE, R²)
8. Result Visualization & Performance Analysis Export
"""

import os
import sys
import time
import shutil
import zipfile
from pathlib import Path

# Force UTF-8 output encoding for Windows stdout
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

import matplotlib.pyplot as plt
import pandas as pd
import numpy as np

# PySpark imports
from pyspark.sql import SparkSession
from pyspark.sql.functions import (
    col, to_timestamp, year, month, dayofmonth, dayofweek, quarter, hour,
    when, lag, lead, avg, min as spark_min, max as spark_max, stddev, count, sum as spark_sum, concat_ws, date_format, to_date
)
from pyspark.sql.types import DoubleType
from pyspark.sql.window import Window
from pyspark.ml.feature import VectorAssembler
from pyspark.ml.regression import RandomForestRegressor
from pyspark.ml.evaluation import RegressionEvaluator


def remove_path_if_exists(path: Path):
    """Safely remove a file or directory if it exists."""
    if path.exists():
        if path.is_dir():
            shutil.rmtree(path)
        else:
            path.unlink()


def create_spark_session() -> SparkSession:
    """Create and configure optimized local SparkSession."""
    start_time = time.time()
    spark = SparkSession.builder \
        .appName("WattWise-Household-Power-PySpark") \
        .master("local[*]") \
        .config("spark.sql.adaptive.enabled", "true") \
        .config("spark.sql.shuffle.partitions", "4") \
        .config("spark.driver.memory", "4g") \
        .getOrCreate()

    spark.sparkContext.setLogLevel("ERROR")
    elapsed = time.time() - start_time
    print(f"[OK] SparkSession created in {elapsed:.2f}s (Spark v{spark.version})")
    return spark


def load_dataset(spark: SparkSession, raw_path: Path, zip_path: Path, processed_path: Path):
    """
    Stage 2: Dataset Identification & Loading
    Loads the raw UCI minute-level dataset (extracting zip if required), else falls back to processed dataset.
    """
    start_time = time.time()
    print("\n" + "=" * 60)
    print("[STAGE 1 & 2] DATASET LOADING")
    print("=" * 60)

    # Auto-extract zip if txt is missing
    if not raw_path.exists() and zip_path.exists():
        print(f"   Extracting {zip_path.name}...")
        with zipfile.ZipFile(zip_path, "r") as zip_ref:
            zip_ref.extractall(raw_path.parent)

    if raw_path.exists():
        print(f"   Source: Raw UCI Dataset ({raw_path})")
        file_size_mb = raw_path.stat().st_size / (1024 * 1024)
        print(f"   Raw File Size: {file_size_mb:.2f} MB")

        # Load raw semicolon-delimited dataset
        df_raw = spark.read.csv(
            str(raw_path),
            header=True,
            sep=";",
            inferSchema=False
        )
        is_raw = True
    elif processed_path.exists():
        print(f"   Source: Processed Dataset ({processed_path})")
        file_size_mb = processed_path.stat().st_size / (1024 * 1024)
        print(f"   File Size: {file_size_mb:.2f} MB")
        df_raw = spark.read.csv(str(processed_path), header=True, inferSchema=True)
        is_raw = False
    else:
        raise FileNotFoundError(f"Neither {raw_path} nor {processed_path} found!")

    raw_row_count = df_raw.count()
    elapsed = time.time() - start_time
    print(f"[OK] Dataset loaded in {elapsed:.2f}s")
    print(f"   Raw input rows: {raw_row_count:,}")
    print(f"   Columns: {len(df_raw.columns)} {df_raw.columns}")
    return df_raw, is_raw, file_size_mb, raw_row_count


def preprocess_data(spark: SparkSession, df_raw, is_raw: bool):
    """
    Stage 3: Data Preprocessing
    Parses timestamps, handles missing '?' values, casts numeric columns, removes nulls.
    """
    start_time = time.time()
    print("\n" + "=" * 60)
    print("[STAGE 3] DATA PREPROCESSING & CLEANING")
    print("=" * 60)

    if is_raw:
        # Cast '?' to null and convert numeric columns
        numeric_cols = [
            "Global_active_power", "Global_reactive_power", "Voltage",
            "Global_intensity", "Sub_metering_1", "Sub_metering_2", "Sub_metering_3"
        ]

        df_clean = df_raw
        for c in numeric_cols:
            df_clean = df_clean.withColumn(
                c, when(col(c) == "?", None).otherwise(col(c)).cast(DoubleType())
            )

        # Parse Date (dd/MM/yyyy) and Time (HH:mm:ss) into a single timestamp column
        df_clean = df_clean.withColumn(
            "timestamp",
            to_timestamp(concat_ws(" ", col("Date"), col("Time")), "d/M/yyyy HH:mm:ss")
        )

        # Filter out invalid records with missing timestamps or missing active power
        df_clean = df_clean.filter(
            col("timestamp").isNotNull() &
            col("Global_active_power").isNotNull() &
            (col("Global_active_power") >= 0)
        )

        # Fill sub-metering nulls with 0
        for sm in ["Sub_metering_1", "Sub_metering_2", "Sub_metering_3"]:
            df_clean = df_clean.fillna(0.0, subset=[sm])

    else:
        # Processed daily fallback dataset
        df_clean = df_raw.withColumn("timestamp", to_timestamp(col("datetime")))
        df_clean = df_clean.filter(col("timestamp").isNotNull() & (col("energy_kwh") > 0))

    cleaned_row_count = df_clean.count()
    elapsed = time.time() - start_time
    print(f"[OK] Data preprocessing completed in {elapsed:.2f}s")
    print(f"   Cleaned rows: {cleaned_row_count:,}")

    # Inspect date range
    date_range = df_clean.agg(spark_min("timestamp").alias("min_ts"), spark_max("timestamp").alias("max_ts")).collect()[0]
    print(f"   Date Range: {date_range.min_ts} to {date_range.max_ts}")

    return df_clean, cleaned_row_count


def distributed_aggregation(df_clean, is_raw: bool):
    """
    Stage 4: Big Data / Distributed Processing
    Aggregates minute-level data into hourly energy consumption (kWh) using PySpark DataFrame operations.
    """
    start_time = time.time()
    print("\n" + "=" * 60)
    print("[STAGE 4] BIG DATA / DISTRIBUTED PROCESSING (HOURLY AGGREGATION)")
    print("=" * 60)

    if is_raw:
        # Group minute-level readings into Hourly Aggregated DataFrame
        # Global_active_power is in kW sampled every 1 minute.
        # Total kWh consumed in 1 hour = sum(Global_active_power) / 60
        df_hourly = df_clean.withColumn("date_hour", date_format(col("timestamp"), "yyyy-MM-dd HH:00:00")) \
            .withColumn("datetime", to_timestamp(col("date_hour"))) \
            .groupBy("datetime") \
            .agg(
                (spark_sum("Global_active_power") / 60.0).alias("energy_kwh"),
                avg("Voltage").alias("avg_voltage"),
                avg("Global_intensity").alias("avg_intensity"),
                avg("Global_reactive_power").alias("avg_reactive_power"),
                spark_sum("Sub_metering_1").alias("sub_metering_1"),
                spark_sum("Sub_metering_2").alias("sub_metering_2"),
                spark_sum("Sub_metering_3").alias("sub_metering_3"),
                count("*").alias("minute_count")
            ) \
            .filter(col("minute_count") >= 30) \
            .drop("minute_count")
    else:
        df_hourly = df_clean

    # Repartition for balanced distributed execution
    df_hourly = df_hourly.repartition(4).orderBy("datetime")

    # Cache intermediate hourly DataFrame since it is used for analytics, ML, and output
    df_hourly.persist()
    aggregated_row_count = df_hourly.count()

    elapsed = time.time() - start_time
    print(f"[OK] Distributed hourly aggregation completed in {elapsed:.2f}s")
    print(f"   Aggregated hourly records: {aggregated_row_count:,}")
    print(f"   Spark Partitions: {df_hourly.rdd.getNumPartitions()}")

    return df_hourly, aggregated_row_count


def feature_engineering_and_analytics(df_hourly):
    """
    Stage 5: Feature Engineering & Aggregate Analytics
    Creates useful temporal features & lag features with PROPER WINDOW PARTITIONING
    to avoid 'No Partition Defined for Window operation' warnings.
    """
    start_time = time.time()
    print("\n" + "=" * 60)
    print("[STAGE 5] FEATURE ENGINEERING & AGGREGATE ANALYTICS")
    print("=" * 60)

    # Extract temporal features
    df_feat = df_hourly \
        .withColumn("year", year(col("datetime"))) \
        .withColumn("month", month(col("datetime"))) \
        .withColumn("day", dayofmonth(col("datetime"))) \
        .withColumn("hour", hour(col("datetime"))) \
        .withColumn("day_of_week", dayofweek(col("datetime"))) \
        .withColumn("quarter", quarter(col("datetime"))) \
        .withColumn("is_weekend", when(col("day_of_week").isin(1, 7), 1).otherwise(0))

    # Add season
    df_feat = df_feat.withColumn(
        "season",
        when(col("month").isin(12, 1, 2), "Winter")
        .when(col("month").isin(3, 4, 5), "Spring")
        .when(col("month").isin(6, 7, 8), "Summer")
        .otherwise("Fall")
    )

    # Window specifications PARTITIONED BY YEAR to eliminate PySpark global window warnings!
    w_year = Window.partitionBy("year").orderBy("datetime")
    w_3h = Window.partitionBy("year").orderBy("datetime").rowsBetween(-2, 0)
    w_24h = Window.partitionBy("year").orderBy("datetime").rowsBetween(-23, 0)

    # Lag features & target next-hour prediction
    df_feat = df_feat \
        .withColumn("lag_1h", lag("energy_kwh", 1).over(w_year)) \
        .withColumn("lag_24h", lag("energy_kwh", 24).over(w_year)) \
        .withColumn("rolling_avg_3h", avg("energy_kwh").over(w_3h)) \
        .withColumn("rolling_avg_24h", avg("energy_kwh").over(w_24h)) \
        .withColumn("target_next_hour_kwh", lead("energy_kwh", 1).over(w_year))

    # Drop null rows resulting from lag/lead
    df_feat = df_feat.dropna(subset=["lag_1h", "lag_24h", "target_next_hour_kwh"])

    # Compute Analytics DataFrames
    # 1. Hourly pattern
    hourly_analytics = df_feat.groupBy("hour") \
        .agg(
            avg("energy_kwh").alias("avg_kwh"),
            spark_min("energy_kwh").alias("min_kwh"),
            spark_max("energy_kwh").alias("max_kwh"),
            count("*").alias("hour_count")
        ).orderBy("hour")

    # 2. Daily analytics
    daily_analytics = df_feat.withColumn("date", to_date(col("datetime"))) \
        .groupBy("date") \
        .agg(
            spark_sum("energy_kwh").alias("daily_total_kwh"),
            avg("energy_kwh").alias("daily_avg_kwh")
        ).orderBy("date")

    # 3. Monthly analytics
    monthly_analytics = df_feat.groupBy("year", "month") \
        .agg(
            spark_sum("energy_kwh").alias("monthly_total_kwh"),
            avg("energy_kwh").alias("monthly_avg_kwh"),
            count("*").alias("hours_count")
        ).orderBy("year", "month")

    # 4. Seasonal analytics
    seasonal_analytics = df_feat.groupBy("season") \
        .agg(
            spark_sum("energy_kwh").alias("season_total_kwh"),
            avg("energy_kwh").alias("season_avg_kwh")
        ).orderBy("season_total_kwh", ascending=False)

    # 5. Weekday vs Weekend
    weekday_analytics = df_feat.groupBy("is_weekend") \
        .agg(
            avg("energy_kwh").alias("avg_kwh"),
            spark_sum("energy_kwh").alias("total_kwh"),
            count("*").alias("hours_count")
        ).withColumn("day_type", when(col("is_weekend") == 1, "Weekend").otherwise("Weekday"))

    elapsed = time.time() - start_time
    print(f"[OK] Feature engineering & analytics completed in {elapsed:.2f}s")
    print(f"   Engineered columns: {len(df_feat.columns)}")

    analytics = {
        "hourly": hourly_analytics,
        "daily": daily_analytics,
        "monthly": monthly_analytics,
        "seasonal": seasonal_analytics,
        "weekday": weekday_analytics
    }

    return df_feat, analytics


def train_and_evaluate_mllib(df_feat):
    """
    Stage 6 & 7: Algorithm Implementation & Evaluation
    Trains PySpark MLlib RandomForestRegressor to forecast next-hour electricity consumption.
    Evaluates using RMSE, MAE, and R².
    """
    start_time = time.time()
    print("\n" + "=" * 60)
    print("[STAGE 6 & 7] ALGORITHM IMPLEMENTATION & EVALUATION")
    print("=" * 60)

    # Define feature set
    feature_cols = ["hour", "day_of_week", "month", "is_weekend", "lag_1h", "lag_24h", "rolling_avg_3h", "rolling_avg_24h"]

    if "avg_voltage" in df_feat.columns:
        feature_cols.extend(["avg_voltage", "avg_intensity", "avg_reactive_power", "sub_metering_1", "sub_metering_2", "sub_metering_3"])

    # Vector Assembler
    assembler = VectorAssembler(inputCols=feature_cols, outputCol="features", handleInvalid="skip")
    df_ml = assembler.transform(df_feat).select("datetime", "features", col("target_next_hour_kwh").alias("label"))

    # Time-Series Aware Chronological Split (Train: < 2010-01-01, Test: >= 2010-01-01)
    train_df = df_ml.filter(col("datetime") < "2010-01-01")
    test_df = df_ml.filter(col("datetime") >= "2010-01-01")

    # Fallback to 80/20 randomSplit if date range is narrow
    if train_df.count() == 0 or test_df.count() == 0:
        train_df, test_df = df_ml.randomSplit([0.8, 0.2], seed=42)

    train_count = train_df.count()
    test_count = test_df.count()
    print(f"   Chronological Data Split:")
    print(f"     Train Set Size: {train_count:,} records")
    print(f"     Test Set Size:  {test_count:,} records")

    # Train PySpark MLlib RandomForestRegressor
    print("\n   Training PySpark MLlib RandomForestRegressor (numTrees=50, maxDepth=8)...")
    train_start = time.time()
    rf = RandomForestRegressor(
        featuresCol="features",
        labelCol="label",
        predictionCol="prediction",
        numTrees=50,
        maxDepth=8,
        seed=42
    )

    model = rf.fit(train_df)
    train_elapsed = time.time() - train_start
    print(f"   Model fitting finished in {train_elapsed:.2f}s")

    # Predict on test set
    predictions = model.transform(test_df)
    predictions.persist()

    # Regression Evaluation Metrics
    evaluator_rmse = RegressionEvaluator(labelCol="label", predictionCol="prediction", metricName="rmse")
    evaluator_mae = RegressionEvaluator(labelCol="label", predictionCol="prediction", metricName="mae")
    evaluator_r2 = RegressionEvaluator(labelCol="label", predictionCol="prediction", metricName="r2")

    rmse = evaluator_rmse.evaluate(predictions)
    mae = evaluator_mae.evaluate(predictions)
    r2 = evaluator_r2.evaluate(predictions)

    total_eval_elapsed = time.time() - start_time

    print(f"\n[RESULTS] PySpark MLlib Evaluation Results:")
    print(f"   +-------------------------------------------+")
    print(f"   | Root Mean Squared Error (RMSE) : {rmse:8.4f} kWh |")
    print(f"   | Mean Absolute Error (MAE)     : {mae:8.4f} kWh |")
    print(f"   | R-Squared (R2) Score          : {r2:8.4f}     |")
    print(f"   +-------------------------------------------+")

    return {
        "rmse": rmse,
        "mae": mae,
        "r2": r2,
        "predictions": predictions,
        "train_time": train_elapsed,
        "total_ml_time": total_eval_elapsed
    }


def generate_visualizations_and_exports(analytics, ml_results, output_dir: Path, viz_dir: Path, results_dir: Path):
    """
    Stage 8: Result Visualization & Performance Analysis Export
    Generates plots from small aggregated DataFrames to avoid driver memory overload.
    """
    start_time = time.time()
    print("\n" + "=" * 60)
    print("[STAGE 8] RESULT VISUALIZATION & OUTPUT EXPORT")
    print("=" * 60)

    # Set matplotlib style
    plt.style.use("seaborn-v0_8-whitegrid" if "seaborn-v0_8-whitegrid" in plt.style.available else "default")
    plt.rcParams["font.sans-serif"] = "DejaVu Sans"

    # 1. Hourly Pattern Plot
    df_hourly_pd = analytics["hourly"].toPandas()
    plt.figure(figsize=(10, 5))
    plt.plot(df_hourly_pd["hour"], df_hourly_pd["avg_kwh"], marker="o", color="#2563eb", linewidth=2.5)
    plt.title("Average Hourly Electricity Consumption Pattern", fontsize=14, fontweight="bold", pad=12)
    plt.xlabel("Hour of Day (0-23)", fontsize=11)
    plt.ylabel("Average Consumption (kWh)", fontsize=11)
    plt.xticks(range(0, 24))
    plt.tight_layout()
    plt.savefig(viz_dir / "hourly_consumption_pattern.png", dpi=200)
    plt.close()

    # 2. Daily Consumption Trend Plot
    df_daily_pd = analytics["daily"].toPandas()
    plt.figure(figsize=(12, 5))
    plt.plot(pd.to_datetime(df_daily_pd["date"]), df_daily_pd["daily_total_kwh"], color="#059669", alpha=0.8, linewidth=1)
    plt.title("Daily Electricity Consumption Trend", fontsize=14, fontweight="bold", pad=12)
    plt.xlabel("Date", fontsize=11)
    plt.ylabel("Daily Total Consumption (kWh)", fontsize=11)
    plt.tight_layout()
    plt.savefig(viz_dir / "daily_consumption_trend.png", dpi=200)
    plt.close()

    # 3. Monthly Consumption Bar Plot
    df_monthly_pd = analytics["monthly"].toPandas()
    df_monthly_pd["yr_mo"] = df_monthly_pd["year"].astype(str) + "-" + df_monthly_pd["month"].astype(str).str.zfill(2)
    plt.figure(figsize=(12, 5))
    plt.bar(df_monthly_pd["yr_mo"], df_monthly_pd["monthly_total_kwh"], color="#7c3aed", width=0.7)
    plt.title("Monthly Total Electricity Consumption", fontsize=14, fontweight="bold", pad=12)
    plt.xlabel("Year-Month", fontsize=11)
    plt.ylabel("Monthly Total Consumption (kWh)", fontsize=11)
    plt.xticks(rotation=45, ha="right", fontsize=9)
    plt.tight_layout()
    plt.savefig(viz_dir / "monthly_consumption.png", dpi=200)
    plt.close()

    # 4. Weekday vs Weekend Comparison
    df_weekday_pd = analytics["weekday"].toPandas()
    plt.figure(figsize=(7, 5))
    colors = ["#3b82f6", "#f59e0b"]
    plt.bar(df_weekday_pd["day_type"], df_weekday_pd["avg_kwh"], color=colors, width=0.5)
    plt.title("Average Hourly Consumption: Weekday vs Weekend", fontsize=14, fontweight="bold", pad=12)
    plt.ylabel("Average Consumption (kWh)", fontsize=11)
    plt.tight_layout()
    plt.savefig(viz_dir / "weekday_vs_weekend.png", dpi=200)
    plt.close()

    # 5. Seasonal Consumption Plot
    df_seasonal_pd = analytics["seasonal"].toPandas()
    plt.figure(figsize=(8, 5))
    plt.bar(df_seasonal_pd["season"], df_seasonal_pd["season_total_kwh"], color="#ef4444", width=0.5)
    plt.title("Total Electricity Consumption by Season", fontsize=14, fontweight="bold", pad=12)
    plt.ylabel("Total Consumption (kWh)", fontsize=11)
    plt.tight_layout()
    plt.savefig(viz_dir / "seasonal_consumption.png", dpi=200)
    plt.close()

    # 6. Actual vs Predicted Next-Hour Consumption
    pred_sample_pd = ml_results["predictions"].select("label", "prediction").limit(300).toPandas()
    plt.figure(figsize=(11, 5))
    plt.plot(pred_sample_pd.index, pred_sample_pd["label"], label="Actual kWh", color="#2563eb", alpha=0.8, linewidth=1.5)
    plt.plot(pred_sample_pd.index, pred_sample_pd["prediction"], label="Predicted kWh (Spark RF)", color="#dc2626", linestyle="--", linewidth=1.5)
    plt.title("Spark MLlib RandomForest: Actual vs Predicted Next-Hour Consumption", fontsize=14, fontweight="bold", pad=12)
    plt.xlabel("Sample Index (Next-Hour Testing Records)", fontsize=11)
    plt.ylabel("Consumption (kWh)", fontsize=11)
    plt.legend(frameon=True)
    plt.tight_layout()
    plt.savefig(viz_dir / "actual_vs_predicted.png", dpi=200)
    plt.close()

    # Save CSV copies of analytics & metrics using Pandas to avoid HADOOP_HOME requirement on Windows
    (results_dir / "metrics").mkdir(parents=True, exist_ok=True)

    metrics_df = pd.DataFrame([{
        "Model": "Spark MLlib RandomForestRegressor",
        "RMSE_kWh": ml_results["rmse"],
        "MAE_kWh": ml_results["mae"],
        "R2_Score": ml_results["r2"],
        "Train_Time_Sec": ml_results["train_time"]
    }])
    metrics_df.to_csv(results_dir / "metrics" / "spark_ml_metrics.csv", index=False)

    with open(output_dir / "spark_ml_metrics.txt", "w") as f:
        f.write(f"Spark MLlib RandomForest Metrics:\n")
        f.write(f"RMSE: {ml_results['rmse']:.4f} kWh\n")
        f.write(f"MAE:  {ml_results['mae']:.4f} kWh\n")
        f.write(f"R2:   {ml_results['r2']:.4f}\n")

    # Clean any old directories or files before writing CSV files
    for fname, df_pd in [
        ("monthly_analytics.csv", df_monthly_pd),
        ("seasonal_analytics.csv", df_seasonal_pd),
        ("weekday_analytics.csv", df_weekday_pd),
    ]:
        target_path = output_dir / fname
        remove_path_if_exists(target_path)
        df_pd.to_csv(target_path, index=False)

    elapsed = time.time() - start_time
    print(f"[OK] Visualizations and analytics saved to:")
    print(f"   - Visualizations: {viz_dir}")
    print(f"   - Output Data:    {output_dir}")
    print(f"   - Metrics CSV:    {results_dir / 'metrics' / 'spark_ml_metrics.csv'}")
    print(f"   Stage completed in {elapsed:.2f}s")


def main():
    """Main PySpark Execution Pipeline"""
    total_start = time.time()
    print("=" * 70)
    print("WATTWISE: HOUSEHOLD ELECTRICITY CONSUMPTION ANALYSIS USING PYSPARK")
    print("=" * 70)

    project_root = Path(__file__).parent.parent
    raw_path = project_root / "data" / "raw" / "household_power_consumption.txt"
    zip_path = project_root / "data" / "raw" / "household_power_consumption.zip"
    processed_path = project_root / "data" / "processed" / "daily_consumption_v2.csv"

    output_dir = Path(__file__).parent / "output"
    viz_dir = project_root / "visualizations"
    results_dir = project_root / "results"

    for d in [output_dir, viz_dir, results_dir]:
        d.mkdir(parents=True, exist_ok=True)

    spark = None
    try:
        # 1. Create Spark Session
        spark = create_spark_session()

        # 2. Load Dataset
        t_load_start = time.time()
        df_raw, is_raw, file_size_mb, raw_row_count = load_dataset(spark, raw_path, zip_path, processed_path)
        t_load = time.time() - t_load_start

        # 3. Preprocess Dataset
        t_prep_start = time.time()
        df_clean, cleaned_row_count = preprocess_data(spark, df_raw, is_raw)
        t_prep = time.time() - t_prep_start

        # 4. Distributed Hourly Aggregation
        t_agg_start = time.time()
        df_hourly, aggregated_row_count = distributed_aggregation(df_clean, is_raw)
        t_agg = time.time() - t_agg_start

        # 5. Feature Engineering & Analytics
        t_feat_start = time.time()
        df_feat, analytics = feature_engineering_and_analytics(df_hourly)
        t_feat = time.time() - t_feat_start

        # 6 & 7. Model Training & Evaluation
        t_ml_start = time.time()
        ml_results = train_and_evaluate_mllib(df_feat)
        t_ml = time.time() - t_ml_start

        # 8. Visualizations & Exports
        t_viz_start = time.time()
        generate_visualizations_and_exports(analytics, ml_results, output_dir, viz_dir, results_dir)
        t_viz = time.time() - t_viz_start

        total_elapsed = time.time() - total_start

        # PERFORMANCE ANALYSIS REPORT
        print("\n" + "=" * 70)
        print("PERFORMANCE ANALYSIS REPORT")
        print("=" * 70)
        print(f" Raw Dataset Size        : {file_size_mb:.2f} MB")
        print(f" Raw Input Rows          : {raw_row_count:,}")
        print(f" Cleaned Rows            : {cleaned_row_count:,}")
        print(f" Aggregated Hourly Rows  : {aggregated_row_count:,}")
        print(f" Spark Shuffle Partitions: {df_hourly.rdd.getNumPartitions()}")
        print("-" * 70)
        print(" Execution Stage Breakdown:")
        print(f"   1. Data Loading        : {t_load:6.2f}s")
        print(f"   2. Data Preprocessing  : {t_prep:6.2f}s")
        print(f"   3. Hourly Aggregation  : {t_agg:6.2f}s")
        print(f"   4. Feature Engineering : {t_feat:6.2f}s")
        print(f"   5. MLlib Model & Eval  : {t_ml:6.2f}s")
        print(f"   6. Visualization & Save: {t_viz:6.2f}s")
        print(f" Total Pipeline Time     : {total_elapsed:6.2f}s")
        print("=" * 70)
        print("[DONE] WattWise PySpark Mini Project Pipeline Execution Finished Successfully!")

    except Exception as e:
        print(f"\n[ERROR] Pipeline failed with error: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        if spark:
            spark.stop()
            print("[INFO] Spark session shut down cleanly.")


if __name__ == "__main__":
    main()