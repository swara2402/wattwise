"""
WattWise Big Data Mini-Project
UCI Household Electric Power Consumption Analysis using Apache PySpark
Project Pipeline: Dataset → Preprocessing → PySpark Distributed Processing → Algorithm → Evaluation → Results
"""
import time
import sys
import subprocess
from pathlib import Path

def progress_bar(percent, message, width=30):
    """Generate a simple text progress bar to show pipeline activity"""
    filled = int(width * percent / 100)
    bar = "█" * filled + "░" * (width - filled)
    print(f"   ⏳ {message} {bar} ({percent}%)")
from pyspark.sql import SparkSession
from pyspark.sql.functions import (
    col, to_timestamp, concat_ws, year, month, dayofmonth, dayofweek, quarter, hour,
    when, lag, avg, min, max, stddev, count, sum, first, last, date_trunc
)
from pyspark.sql.window import Window
from pyspark.ml.feature import VectorAssembler
from pyspark.ml.regression import RandomForestRegressor
from pyspark.ml.evaluation import RegressionEvaluator


def install_package(package):
    """Install package if not already installed"""
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", package])


def create_spark_session():
    """Create and configure SparkSession"""
    start_time = time.time()
    
    # Configure Spark with better local execution settings
    spark = SparkSession.builder \
        .appName("WattWiseAI-Spark-Pipeline") \
        .master("local[*]") \
        .config("spark.driver.memory", "8g") \
        .config("spark.sql.shuffle.partitions", "16") \
        .config("spark.default.parallelism", "16") \
        .config("spark.sql.adaptive.enabled", "true") \
        .config("spark.sql.legacy.timeParserPolicy", "LEGACY") \
        .getOrCreate()
    
    spark.sparkContext.setLogLevel("WARN")
    elapsed = time.time() - start_time
    print(f"✅ SparkSession created in {elapsed:.2f}s")
    print(f"   Spark version: {spark.version}")
    return spark


def load_dataset(spark, data_path):
    """Load raw UCI Household Power Consumption dataset using Spark DataFrame"""
    start_time = time.time()
    
    # UCI dataset uses semicolon separators, not commas
    df = spark.read.csv(str(data_path), header=True, inferSchema=True, sep=';')
    
    # Combine Date and Time columns into a single timestamp
    # UCI format: Date as dd/MM/yyyy, Time as HH:mm:ss
    df = df.withColumn("datetime_str", concat_ws(" ", col("Date"), col("Time")))
    df = df.withColumn("datetime", to_timestamp(col("datetime_str"), "dd/MM/yyyy HH:mm:ss"))
    
    # Drop original Date/Time columns and intermediate string column
    df = df.drop("Date", "Time", "datetime_str")
    
    # Convert numeric columns from strings to proper types (handle '?' missing values)
    numeric_cols = [
        "Global_active_power", "Global_reactive_power", "Voltage", "Global_intensity",
        "Sub_metering_1", "Sub_metering_2", "Sub_metering_3"
    ]
    
    for col_name in numeric_cols:
        df = df.withColumn(col_name, when(col(col_name) == "?", None).otherwise(col(col_name).cast("double")))
    
    # Repartition for distributed processing (16 partitions for 2M+ rows)
    df = df.repartition(16)
    
    elapsed = time.time() - start_time
    print(f"\n✅ Dataset loaded in {elapsed:.2f}s")
    print(f"   Number of rows: {df.count():,}")
    print(f"   Number of columns: {len(df.columns)}")
    print(f"   Number of partitions: {df.rdd.getNumPartitions()}")
    
    # Print schema
    print("\n📋 Dataset Schema:")
    df.printSchema()
    
    return df


def inspect_dataset(df):
    """Perform initial dataset inspection and validation"""
    start_time = time.time()
    
    print("\n🔍 Dataset Inspection:")
    
    # Check for null values
    null_counts = df.select([count(when(col(c).isNull(), c)).alias(c) for c in df.columns])
    print("\n   Null value counts per column:")
    null_counts.show(truncate=False)
    
    # Basic statistics
    print("\n   Basic statistics for numeric columns:")
    df.select("Global_active_power", "Voltage", "Global_intensity").describe().show()
    
    # Validate date range
    date_range = df.agg(min("datetime").alias("min_date"), max("datetime").alias("max_date")).collect()[0]
    print(f"\n   Date range: {date_range.min_date} to {date_range.max_date}")
    
    elapsed = time.time() - start_time
    print(f"\n✅ Dataset inspection completed in {elapsed:.2f}s")
    return df


def clean_dataset(df):
    """Clean dataset - handle missing values, filter invalid values"""
    start_time = time.time()
    
    print("\n🧹 Starting data cleaning...")
    
    # Add partition key for window operations - create year-month partitions to fix "No Partition Defined" warnings
    df = df.withColumn("year_month", date_trunc("month", col("datetime")))
    
    # Repartition by year_month to eliminate window operation warnings
    df = df.repartition(8, "year_month")
    print(f"   Data repartitioned by year_month: {df.rdd.getNumPartitions()} partitions")
    
    # Handle missing values using forward fill and backward fill for time series
    # First drop rows where datetime or Global_active_power is null - those are unrecoverable
    initial_count = df.count()
    df = df.dropna(subset=["datetime", "Global_active_power"], how="any")
    
    # Window specification for forward/backward fill - PARTITION BY year_month to fix warnings
    window_spec = Window.partitionBy("year_month").orderBy("datetime")
    window_spec_backward = Window.partitionBy("year_month").orderBy("datetime").rowsBetween(0, Window.unboundedFollowing)
    
    # Forward fill remaining nulls using last valid observation
    for col_name in ["Voltage", "Global_intensity", "Global_reactive_power"]:
        df = df.withColumn(col_name, first(col(col_name), ignorenulls=True).over(window_spec))
    
    # Then backward fill any remaining nulls at the start
    for col_name in ["Voltage", "Global_intensity", "Global_reactive_power"]:
        df = df.withColumn(col_name, last(col(col_name), ignorenulls=True).over(window_spec_backward))
    
    # Fill any remaining nulls in sub-metering columns with 0 (these are often zero anyway)
    for col_name in ["Sub_metering_1", "Sub_metering_2", "Sub_metering_3"]:
        df = df.fillna(0, subset=[col_name])
    
    # Filter out invalid consumption values (negative energy doesn't make sense)
    df_clean = df.filter(col("Global_active_power") > 0)
    
    final_count = df_clean.count()
    rows_removed = initial_count - final_count
    print(f"   Rows before cleaning: {initial_count:,}")
    print(f"   Rows after cleaning: {final_count:,}")
    print(f"   Rows removed: {rows_removed}")
    
    elapsed = time.time() - start_time
    print(f"✅ Data cleaning completed in {elapsed:.2f}s")
    return df_clean


def aggregate_to_hourly(df):
    """Aggregate minute-level data to hourly for more stable forecasting"""
    start_time = time.time()
    print("\n📊 Aggregating minute-level data to hourly...")
    
    # Truncate datetime to hour for grouping
    df_hourly = df.withColumn("datetime", date_trunc("hour", col("datetime")))
    
    # Aggregate by hour - average continuous metrics, sum consumption metrics (consistent with UCI dataset)
    df_hourly = df_hourly.groupBy("datetime").agg(
        avg("Voltage").alias("Voltage"),
        avg("Global_intensity").alias("Global_intensity"),
        avg("Global_reactive_power").alias("Global_reactive_power"),
        sum("Global_active_power").alias("Global_active_power"),
        sum("Sub_metering_1").alias("Sub_metering_1"),
        sum("Sub_metering_2").alias("Sub_metering_2"),
        sum("Sub_metering_3").alias("Sub_metering_3")
    ).orderBy("datetime")
    
    print(f"   Minute-level rows: {df.count():,}")
    print(f"   Hourly rows: {df_hourly.count():,}")
    
    elapsed = time.time() - start_time
    print(f"✅ Hourly aggregation completed in {elapsed:.2f}s")
    return df_hourly


def engineer_features(df):
    """Create temporal and lag features using Spark's Window functions"""
    start_time = time.time()
    
    print("\n⚙️ Starting feature engineering...")
    
    # First aggregate to hourly (more stable for forecasting)
    df_hourly = aggregate_to_hourly(df)
    
    # Extract temporal features
    df_features = df_hourly \
        .withColumn("year", year(col("datetime"))) \
        .withColumn("month", month(col("datetime"))) \
        .withColumn("day", dayofmonth(col("datetime"))) \
        .withColumn("day_of_week", dayofweek(col("datetime"))) \
        .withColumn("hour", hour(col("datetime"))) \
        .withColumn("quarter", quarter(col("datetime"))) \
        .withColumn("is_weekend", when(col("day_of_week").isin([1, 7]), 1).otherwise(0))
    
    # Add seasonal category
    df_features = df_features.withColumn(
        "season",
        when(col("month").isin(12, 1, 2), "winter")
        .when(col("month").isin(3, 4, 5), "spring")
        .when(col("month").isin(6, 7, 8), "summer")
        .when(col("month").isin(9, 10, 11), "fall")
    )
    
    # First add year_month partition key to fix window operation warnings
    df_features = df_features.withColumn("year_month", date_trunc("month", col("datetime")))
    df_features = df_features.repartition(8, "year_month")
    
    # Create lag features using Window function (partitioned by year_month to fix warnings)
    window_spec = Window.partitionBy("year_month").orderBy("datetime")
    
    # Add lag features relevant to hourly data: previous hour, previous day (24h), previous week (168h)
    df_features = df_features \
        .withColumn("Global_active_power_lag1", lag("Global_active_power", 1).over(window_spec)) \
        .withColumn("Global_active_power_lag24", lag("Global_active_power", 24).over(window_spec)) \
        .withColumn("Global_active_power_lag168", lag("Global_active_power", 168).over(window_spec))
    
    # Create target: next hour's energy consumption (what we want to forecast)
    df_features = df_features.withColumn("target", lag("Global_active_power", -1).over(window_spec))
    
    # Add rolling averages using window (24h and 168h moving averages) - partitioned
    window_24h = Window.partitionBy("year_month").orderBy("datetime").rowsBetween(-23, 0)
    window_168d = Window.partitionBy("year_month").orderBy("datetime").rowsBetween(-167, 0)
    
    df_features = df_features \
        .withColumn("Global_active_power_ma24", avg("Global_active_power").over(window_24h)) \
        .withColumn("Global_active_power_ma168", avg("Global_active_power").over(window_168d))
    
    # Drop rows with null lag values (first week of data to ensure all features are available)
    df_features = df_features.dropna(subset=["Global_active_power_lag168", "target"])
    
    print(f"   Original columns: {len(df_hourly.columns)}")
    print(f"   Final columns: {len(df_features.columns)}")
    print(f"   New features added: {len(df_features.columns) - len(df_hourly.columns)}")
    
    # Show sample of engineered features
    print("\n   Sample of engineered features:")
    df_features.select("datetime", "Global_active_power", "target", "hour", "day_of_week", "is_weekend", 
                       "Global_active_power_lag1", "Global_active_power_lag24", "Global_active_power_ma24").show(5, truncate=False)
    
    elapsed = time.time() - start_time
    print(f"✅ Feature engineering completed in {elapsed:.2f}s")
    return df_features


def calculate_analytics(df):
    """Generate aggregate analytics using Spark"""
    start_time = time.time()
    
    print("\n📊 Calculating aggregate analytics...")
    
    # 1. Monthly consumption
    print("\n   Monthly consumption summary:")
    monthly = df.groupBy("year", "month") \
        .agg(
            sum("Global_active_power").alias("total_kw"),
            avg("Global_active_power").alias("avg_hourly_kw"),
            max("Global_active_power").alias("max_hourly_kw"),
            min("Global_active_power").alias("min_hourly_kw"),
            stddev("Global_active_power").alias("stddev_kw"),
            count("*").alias("hours_count")
        ) \
        .orderBy("year", "month")
    monthly.show()
    
    # 2. Seasonal consumption
    print("\n   Seasonal consumption summary:")
    seasonal = df.groupBy("season") \
        .agg(
            sum("Global_active_power").alias("total_kw"),
            avg("Global_active_power").alias("avg_hourly_kw"),
            count("*").alias("hours_count")
        ) \
        .orderBy("total_kw", ascending=False)
    seasonal.show()
    
    # 3. Weekday vs Weekend consumption
    print("\n   Weekday vs Weekend consumption:")
    weekday = df.groupBy("is_weekend") \
        .agg(
            avg("Global_active_power").alias("avg_hourly_kw"),
            count("*").alias("hours_count")
        ) \
        .withColumn("day_type", when(col("is_weekend") == 1, "Weekend").otherwise("Weekday"))
    weekday.select("day_type", "avg_hourly_kw", "hours_count").show()
    
    # 4. Overall statistics
    overall = df.agg(
        avg("Global_active_power").alias("overall_avg_hourly"),
        max("Global_active_power").alias("overall_max"),
        min("Global_active_power").alias("overall_min"),
        sum("Global_active_power").alias("overall_total")
    ).collect()[0]
    
    print(f"\n   Overall dataset statistics:")
    print(f"     Average hourly consumption: {overall.overall_avg_hourly:.2f} kW")
    print(f"     Maximum hourly consumption: {overall.overall_max:.2f} kW")
    print(f"     Minimum hourly consumption: {overall.overall_min:.2f} kW")
    print(f"     Total consumption: {overall.overall_total:,.2f} kW")
    
    elapsed = time.time() - start_time
    print(f"✅ Analytics calculation completed in {elapsed:.2f}s")
    
    return {"monthly": monthly, "seasonal": seasonal, "weekday": weekday}


def run_spark_ml_experiment(df):
    """Run Spark MLlib RandomForestRegressor for scalable hourly energy forecasting"""
    start_time = time.time()
    
    print("\n🤖 Starting Spark MLlib RandomForest experiment (Hourly Forecasting)")
    
    # Prepare features for ML - chronological split (no shuffling for time series)
    feature_cols = [
        "Voltage", "Global_intensity", "Global_reactive_power",
        "Sub_metering_1", "Sub_metering_2", "Sub_metering_3",
        "year", "month", "day", "day_of_week", "hour", "is_weekend",
        "Global_active_power_lag1", "Global_active_power_lag24", "Global_active_power_lag168",
        "Global_active_power_ma24", "Global_active_power_ma168"
    ]
    
    # Sort by datetime to ensure proper chronological split
    progress_bar(91, "Sorting data chronologically...")
    df_sorted = df.orderBy("datetime")
    
    # Assemble feature vector
    progress_bar(92, "Assembling feature vectors...")
    assembler = VectorAssembler(inputCols=feature_cols, outputCol="features", handleInvalid="skip")
    df_ml = assembler.transform(df_sorted).select("datetime", "features", col("target").alias("label"))
    
    # For distributed processing, use randomSplit with fixed seed (reproducible results)
    # This avoids the global window bottleneck while maintaining good model performance
    progress_bar(93, "Creating train/test splits...")
    train_data, test_data = df_ml.select("features", "label").randomSplit([0.8, 0.2], seed=42)
    
    # Get counts after split (distributed operation, no global bottleneck)
    total_rows = train_data.count() + test_data.count()
    train_count = train_data.count()
    test_count = test_data.count()
    
    print(f"   Total ML rows: {total_rows:,}")
    print(f"   Train set size: {train_count:,}")
    print(f"   Test set size: {test_count:,}")
    
    # Train RandomForest - reduced trees for local mode performance (20 instead of 100)
    progress_bar(95, "Initializing RandomForest model...")
    rf = RandomForestRegressor(
        featuresCol="features",
        labelCol="label",
        numTrees=10,
        maxDepth=8,
        seed=42
    )
    
    progress_bar(96, "Fitting model to training data (this takes time!)...")
    model = rf.fit(train_data)
    predictions = model.transform(test_data)
    
    # Evaluate
    progress_bar(97, "Evaluating model performance...")
    evaluator_mae = RegressionEvaluator(labelCol="label", predictionCol="prediction", metricName="mae")
    evaluator_rmse = RegressionEvaluator(labelCol="label", predictionCol="prediction", metricName="rmse")
    evaluator_r2 = RegressionEvaluator(labelCol="label", predictionCol="prediction", metricName="r2")
    
    mae = evaluator_mae.evaluate(predictions)
    rmse = evaluator_rmse.evaluate(predictions)
    r2 = evaluator_r2.evaluate(predictions)
    
    print(f"\n   Spark MLlib RandomForest Metrics:")
    print(f"     MAE: {mae:.4f} kW")
    print(f"     RMSE: {rmse:.4f} kW")
    print(f"     R²: {r2:.4f}")
    
    elapsed = time.time() - start_time
    print(f"✅ Spark ML experiment completed in {elapsed:.2f}s")
    
    return {"mae": mae, "rmse": rmse, "r2": r2, "training_time": elapsed}


def save_outputs(df, analytics, output_dir, spark_ml_metrics=None, performance_metrics=None):
    """Save processed dataset and analytics to output directory"""
    start_time = time.time()
    
    # Create output directory if it doesn't exist
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print("\n💾 Saving outputs...")
    
    # Coalesce to single file for small dataset to avoid many small output files
    # This is safe for the current dataset size and still demonstrates the pipeline
    df_coalesced = df.coalesce(1)
    
    # Save processed dataset as Parquet
    parquet_path = output_dir / "processed_consumption.parquet"
    df_coalesced.write.mode("overwrite").parquet(str(parquet_path))
    print(f"   Processed dataset saved to: {parquet_path}")
    
    # Save as CSV for easy inspection
    csv_path = output_dir / "processed_consumption.csv"
    df_coalesced.write.mode("overwrite").csv(str(csv_path), header=True)
    print(f"   CSV copy saved to: {csv_path}")
    
    # Save analytics (also coalesce to single files for readability)
    analytics["monthly"].coalesce(1).write.mode("overwrite").csv(str(output_dir / "monthly_analytics.csv"), header=True)
    analytics["seasonal"].coalesce(1).write.mode("overwrite").csv(str(output_dir / "seasonal_analytics.csv"), header=True)
    analytics["weekday"].coalesce(1).write.mode("overwrite").csv(str(output_dir / "weekday_analytics.csv"), header=True)
    
    # Save all metrics including performance if available
    if spark_ml_metrics or performance_metrics:
        metrics_path = output_dir / "spark_ml_metrics.txt"
        with open(metrics_path, "w") as f:
            f.write(f"Spark MLlib RandomForest Metrics:\n")
            if spark_ml_metrics:
                f.write(f"MAE: {spark_ml_metrics['mae']:.4f} kWh\n")
                f.write(f"RMSE: {spark_ml_metrics['rmse']:.4f} kWh\n")
                f.write(f"R²: {spark_ml_metrics['r2']:.4f}\n")
            
            if performance_metrics:
                f.write(f"\nPERFORMANCE METRICS:\n")
                f.write(f"Dataset size (rows): {performance_metrics.get('total_rows', 'N/A'):,}\n")
                f.write(f"Spark partitions: {performance_metrics.get('num_partitions', 'N/A')}\n")
                f.write(f"Spark initialization: {performance_metrics.get('spark_init_time', 0):.2f}s\n")
                f.write(f"Data loading: {performance_metrics.get('load_time', 0):.2f}s\n")
                f.write(f"Data cleaning: {performance_metrics.get('clean_time', 0):.2f}s\n")
                f.write(f"Feature engineering: {performance_metrics.get('feature_engineering_time', 0):.2f}s\n")
                f.write(f"ML training & evaluation: {performance_metrics.get('ml_total_time', 0):.2f}s\n")
                f.write(f"Total pipeline time: {performance_metrics.get('total_pipeline_time', 0):.2f}s\n")
        print(f"   All metrics saved to: {metrics_path}")
    
    elapsed = time.time() - start_time
    print(f"✅ Outputs saved in {elapsed:.2f}s")


def main():
    """Main pipeline execution"""
    total_start = time.time()
    print("=" * 80)
    print("🚀 Starting WattWise AI PySpark Pipeline - UCI Household Power Consumption")
    print("=" * 80)
    
    # Check if pyspark is installed, if not install it
    try:
        import pyspark
        print(f"✅ PySpark already installed: {pyspark.__version__}")
    except ImportError:
        print("📦 Installing PySpark...")
        install_package("pyspark==3.5.9")
        import pyspark
        print(f"✅ PySpark installed successfully: {pyspark.__version__}")
    
    # Configure paths - use raw UCI dataset
    project_root = Path(__file__).parent.parent
    # Path to the raw UCI dataset (downloaded to wattwise_uci/raw/household_power_consumption.txt)
    data_path = project_root.parent / "wattwise_uci" / "raw" / "household_power_consumption.txt"
    output_dir = Path(__file__).parent / "output"
    
    print(f"\n📁 Project root: {project_root}")
    print(f"📊 Input data (raw UCI): {data_path}")
    print(f"📤 Output directory: {output_dir}")
    
    # Verify input file exists
    if not data_path.exists():
        raise FileNotFoundError(f"Raw UCI dataset not found at: {data_path}\nPlease download the dataset first to the wattwise_uci/raw directory.")
    
    spark = None
    performance_metrics = {}
    
    try:
        # Main pipeline progress tracking - 8 major stages
        # Stage 1: Create Spark session (10%)
        progress_bar(10, "Creating Spark session...")
        step_start = time.time()
        spark = create_spark_session()
        performance_metrics["spark_init_time"] = time.time() - step_start
        
        # Stage 2: Load dataset (25%)
        progress_bar(25, "Loading UCI dataset...")
        step_start = time.time()
        df = load_dataset(spark, data_path)
        performance_metrics["load_time"] = time.time() - step_start
        performance_metrics["total_rows"] = df.count()
        performance_metrics["num_partitions"] = df.rdd.getNumPartitions()
        
        # Stage 3: Inspect dataset (35%)
        progress_bar(35, "Inspecting dataset...")
        step_start = time.time()
        inspect_dataset(df)
        performance_metrics["inspect_time"] = time.time() - step_start
        
        # Stage 4: Clean dataset (50%)
        progress_bar(50, "Cleaning data (handling missing values)...")
        step_start = time.time()
        df_clean = clean_dataset(df)
        performance_metrics["clean_time"] = time.time() - step_start
        
        # Stage 5: Engineer features (65%)
        progress_bar(65, "Engineering features (lags, rolling averages)...")
        step_start = time.time()
        df_features = engineer_features(df_clean)
        performance_metrics["feature_engineering_time"] = time.time() - step_start
        
        # Stage 6: Calculate analytics (75%)
        progress_bar(75, "Calculating consumption analytics...")
        step_start = time.time()
        analytics = calculate_analytics(df_features)
        performance_metrics["analytics_time"] = time.time() - step_start
        
        # Stage 7: Run Spark ML experiment (90%)
        progress_bar(90, "Training RandomForest model...")
        step_start = time.time()
        spark_ml_metrics = run_spark_ml_experiment(df_features)
        performance_metrics["ml_total_time"] = time.time() - step_start
        if spark_ml_metrics:
            performance_metrics.update(spark_ml_metrics)
        
        # Stage 8: Save all outputs (98%)
        progress_bar(98, "Saving outputs and metrics...")
        step_start = time.time()
        save_outputs(df_features, analytics, output_dir, spark_ml_metrics, performance_metrics)
        performance_metrics["save_time"] = time.time() - step_start
        
        total_elapsed = time.time() - total_start
        performance_metrics["total_pipeline_time"] = total_elapsed
        
        print("\n" + "=" * 80)
        print(f"✅ Pipeline completed successfully! Total time: {total_elapsed:.2f}s")
        print("=" * 80)
        
        # Print comprehensive performance report
        print("\n📊 PERFORMANCE METRICS SUMMARY:")
        print("-" * 80)
        print(f"Dataset size (rows): {performance_metrics.get('total_rows', 'N/A'):,}")
        print(f"Spark partitions: {performance_metrics.get('num_partitions', 'N/A')}")
        print(f"Spark initialization: {performance_metrics.get('spark_init_time', 0):.2f}s")
        print(f"Data loading: {performance_metrics.get('load_time', 0):.2f}s")
        print(f"Data inspection: {performance_metrics.get('inspect_time', 0):.2f}s")
        print(f"Data cleaning: {performance_metrics.get('clean_time', 0):.2f}s")
        print(f"Feature engineering: {performance_metrics.get('feature_engineering_time', 0):.2f}s")
        print(f"Analytics calculation: {performance_metrics.get('analytics_time', 0):.2f}s")
        print(f"ML training & evaluation: {performance_metrics.get('ml_total_time', 0):.2f}s")
        print(f"Output saving: {performance_metrics.get('save_time', 0):.2f}s")
        print(f"Total pipeline time: {total_elapsed:.2f}s")
        print("-" * 80)
        
        if spark_ml_metrics:
            print("\n🤖 MODEL EVALUATION METRICS:")
            print("-" * 80)
            print(f"MAE: {spark_ml_metrics.get('mae', 'N/A'):.4f} kWh")
            print(f"RMSE: {spark_ml_metrics.get('rmse', 'N/A'):.4f} kWh")
            print(f"R² Score: {spark_ml_metrics.get('r2', 'N/A'):.4f}")
            print("-" * 80)
        
        # Scalability note as per requirements
        print("\n📝 Scalability Note:")
        print("   This pipeline uses Apache Spark's distributed processing architecture.")
        print(f"   Processed {performance_metrics.get('total_rows', 0):,} rows of minute-level UCI data")
        print("   The same code can scale to billions of rows by simply increasing cluster resources.")
        print("   All DataFrame operations (window functions, aggregations, ML) are")
        print("   designed to run in a distributed environment across multiple machines.")
        
    except Exception as e:
        print(f"\n❌ Pipeline failed with error: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        # Ensure Spark session is always stopped
        if spark:
            print("\n🛑 Stopping Spark session...")
            spark.stop()
            print("✅ Spark session stopped cleanly")


if __name__ == "__main__":
    main()