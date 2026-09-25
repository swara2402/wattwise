"""
WattWise AI PySpark Pipeline
Scalable distributed data processing for household energy consumption data
"""
import time
from pathlib import Path
from pyspark.sql import SparkSession
from pyspark.sql.functions import (
    col, to_timestamp, year, month, dayofmonth, dayofweek, quarter, 
    when, lag, avg, min, max, stddev, count, sum
)
from pyspark.sql.window import Window
from pyspark.ml.feature import VectorAssembler
from pyspark.ml.regression import RandomForestRegressor
from pyspark.ml.evaluation import RegressionEvaluator


def create_spark_session():
    """Create and configure SparkSession"""
    start_time = time.time()
    
    # Configure Spark with better local execution settings
    spark = SparkSession.builder \
        .appName("WattWiseAI-Spark-Pipeline") \
        .master("local[*]") \
        .config("spark.sql.adaptive.enabled", "true") \
        .config("spark.sql.shuffle.partitions", "4") \
        .getOrCreate()
    
    spark.sparkContext.setLogLevel("WARN")
    elapsed = time.time() - start_time
    print(f"✅ SparkSession created in {elapsed:.2f}s")
    print(f"   Spark version: {spark.version}")
    return spark


def load_dataset(spark, data_path):
    """Load dataset using Spark DataFrame"""
    start_time = time.time()
    
    # Load CSV with inferred schema
    df = spark.read.csv(str(data_path), header=True, inferSchema=True)
    
    # Convert datetime string to proper timestamp type for Spark temporal functions
    df = df.withColumn("datetime", to_timestamp(col("datetime")))
    
    # Repartition for distributed processing (maintains scalability for larger datasets)
    df = df.repartition(4)
    
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
    df.select("energy_kwh", "avg_voltage", "avg_intensity").describe().show()
    
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
    
    # Drop any rows with null values in critical columns
    initial_count = df.count()
    df_clean = df.dropna(subset=["datetime", "energy_kwh"])
    
    # Filter out invalid consumption values (negative energy doesn't make sense)
    df_clean = df_clean.filter(col("energy_kwh") > 0)
    
    # Fill any remaining nulls in sub-metering columns with 0
    for col_name in ["sub_metering_1", "sub_metering_2", "sub_metering_3"]:
        df_clean = df_clean.fillna(0, subset=[col_name])
    
    final_count = df_clean.count()
    rows_removed = initial_count - final_count
    print(f"   Rows before cleaning: {initial_count:,}")
    print(f"   Rows after cleaning: {final_count:,}")
    print(f"   Rows removed: {rows_removed}")
    
    elapsed = time.time() - start_time
    print(f"✅ Data cleaning completed in {elapsed:.2f}s")
    return df_clean


def engineer_features(df):
    """Create temporal and lag features using Spark's Window functions"""
    start_time = time.time()
    
    print("\n⚙️ Starting feature engineering...")
    
    # Extract temporal features
    df_features = df \
        .withColumn("year", year(col("datetime"))) \
        .withColumn("month", month(col("datetime"))) \
        .withColumn("day", dayofmonth(col("datetime"))) \
        .withColumn("day_of_week", dayofweek(col("datetime"))) \
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
    
    # Create lag features using Window function (actual distributed window operations)
    window_spec = Window.orderBy("datetime")
    
    # Add 7-day, 14-day, and 30-day lag features
    df_features = df_features \
        .withColumn("energy_kwh_lag7", lag("energy_kwh", 7).over(window_spec)) \
        .withColumn("energy_kwh_lag14", lag("energy_kwh", 14).over(window_spec)) \
        .withColumn("energy_kwh_lag30", lag("energy_kwh", 30).over(window_spec))
    
    # Add rolling averages using window (7-day and 30-day moving averages)
    window_7d = Window.orderBy("datetime").rowsBetween(-6, 0)
    window_30d = Window.orderBy("datetime").rowsBetween(-29, 0)
    
    df_features = df_features \
        .withColumn("energy_kwh_ma7", avg("energy_kwh").over(window_7d)) \
        .withColumn("energy_kwh_ma30", avg("energy_kwh").over(window_30d))
    
    # Drop rows with null lag values (first 30 days)
    df_features = df_features.dropna(subset=["energy_kwh_lag30"])
    
    print(f"   Original columns: {len(df.columns)}")
    print(f"   Final columns: {len(df_features.columns)}")
    print(f"   New features added: {len(df_features.columns) - len(df.columns)}")
    
    # Show sample of engineered features
    print("\n   Sample of engineered features:")
    df_features.select("datetime", "energy_kwh", "year", "month", "day_of_week", "season", "is_weekend", 
                       "energy_kwh_lag7", "energy_kwh_ma7").show(5, truncate=False)
    
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
            sum("energy_kwh").alias("total_kwh"),
            avg("energy_kwh").alias("avg_daily_kwh"),
            max("energy_kwh").alias("max_daily_kwh"),
            min("energy_kwh").alias("min_daily_kwh"),
            stddev("energy_kwh").alias("stddev_kwh"),
            count("*").alias("days_count")
        ) \
        .orderBy("year", "month")
    monthly.show()
    
    # 2. Seasonal consumption
    print("\n   Seasonal consumption summary:")
    seasonal = df.groupBy("season") \
        .agg(
            sum("energy_kwh").alias("total_kwh"),
            avg("energy_kwh").alias("avg_daily_kwh"),
            count("*").alias("days_count")
        ) \
        .orderBy("total_kwh", ascending=False)
    seasonal.show()
    
    # 3. Weekday vs Weekend consumption
    print("\n   Weekday vs Weekend consumption:")
    weekday = df.groupBy("is_weekend") \
        .agg(
            avg("energy_kwh").alias("avg_daily_kwh"),
            count("*").alias("days_count")
        ) \
        .withColumn("day_type", when(col("is_weekend") == 1, "Weekend").otherwise("Weekday"))
    weekday.select("day_type", "avg_daily_kwh", "days_count").show()
    
    # 4. Overall statistics
    overall = df.agg(
        avg("energy_kwh").alias("overall_avg_daily"),
        max("energy_kwh").alias("overall_max"),
        min("energy_kwh").alias("overall_min"),
        sum("energy_kwh").alias("overall_total")
    ).collect()[0]
    
    print(f"\n   Overall dataset statistics:")
    print(f"     Average daily consumption: {overall.overall_avg_daily:.2f} kWh")
    print(f"     Maximum daily consumption: {overall.overall_max:.2f} kWh")
    print(f"     Minimum daily consumption: {overall.overall_min:.2f} kWh")
    print(f"     Total consumption: {overall.overall_total:,.2f} kWh")
    
    elapsed = time.time() - start_time
    print(f"✅ Analytics calculation completed in {elapsed:.2f}s")
    
    return {"monthly": monthly, "seasonal": seasonal, "weekday": weekday}


def run_spark_ml_experiment(df):
    """Optional: Run Spark MLlib RandomForestRegressor as a scalable benchmark"""
    start_time = time.time()
    
    print("\n🤖 Running Spark MLlib experiment - RandomForest Regression...")
    
    # Prepare features for ML
    feature_cols = [
        "avg_voltage", "avg_intensity", "avg_reactive_power",
        "sub_metering_1", "sub_metering_2", "sub_metering_3",
        "month", "day_of_week", "is_weekend",
        "energy_kwh_lag7", "energy_kwh_lag14", "energy_kwh_lag30",
        "energy_kwh_ma7", "energy_kwh_ma30"
    ]
    
    # Assemble feature vector
    assembler = VectorAssembler(inputCols=feature_cols, outputCol="features", handleInvalid="skip")
    df_ml = assembler.transform(df).select("features", col("energy_kwh").alias("label"))
    
    # Split into train/test
    train_data, test_data = df_ml.randomSplit([0.8, 0.2], seed=42)
    print(f"   Train set size: {train_data.count():,}")
    print(f"   Test set size: {test_data.count():,}")
    
    # Train RandomForest
    rf = RandomForestRegressor(
        featuresCol="features",
        labelCol="label",
        numTrees=100,
        maxDepth=10,
        seed=42
    )
    
    model = rf.fit(train_data)
    predictions = model.transform(test_data)
    
    # Evaluate
    evaluator_mae = RegressionEvaluator(labelCol="label", predictionCol="prediction", metricName="mae")
    evaluator_rmse = RegressionEvaluator(labelCol="label", predictionCol="prediction", metricName="rmse")
    evaluator_r2 = RegressionEvaluator(labelCol="label", predictionCol="prediction", metricName="r2")
    
    mae = evaluator_mae.evaluate(predictions)
    rmse = evaluator_rmse.evaluate(predictions)
    r2 = evaluator_r2.evaluate(predictions)
    
    print(f"\n   Spark MLlib RandomForest Metrics:")
    print(f"     MAE: {mae:.4f} kWh")
    print(f"     RMSE: {rmse:.4f} kWh")
    print(f"     R²: {r2:.4f}")
    
    elapsed = time.time() - start_time
    print(f"✅ Spark ML experiment completed in {elapsed:.2f}s")
    
    return {"mae": mae, "rmse": rmse, "r2": r2}


def save_outputs(df, analytics, output_dir, spark_ml_metrics=None):
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
    
    # Save Spark ML metrics if available
    if spark_ml_metrics:
        metrics_path = output_dir / "spark_ml_metrics.txt"
        with open(metrics_path, "w") as f:
            f.write(f"Spark MLlib RandomForest Metrics:\n")
            f.write(f"MAE: {spark_ml_metrics['mae']:.4f} kWh\n")
            f.write(f"RMSE: {spark_ml_metrics['rmse']:.4f} kWh\n")
            f.write(f"R²: {spark_ml_metrics['r2']:.4f}\n")
        print(f"   Spark ML metrics saved to: {metrics_path}")
    
    elapsed = time.time() - start_time
    print(f"✅ Outputs saved in {elapsed:.2f}s")


def main():
    """Main pipeline execution"""
    total_start = time.time()
    print("=" * 60)
    print("🚀 Starting WattWise AI PySpark Pipeline")
    print("=" * 60)
    
    # Configure paths
    project_root = Path(__file__).parent.parent
    data_path = project_root / "data" / "processed" / "daily_consumption_v2.csv"
    output_dir = Path(__file__).parent / "output"
    
    print(f"\n📁 Project root: {project_root}")
    print(f"📊 Input data: {data_path}")
    print(f"📤 Output directory: {output_dir}")
    
    spark = None
    try:
        # 1. Create Spark session
        spark = create_spark_session()
        
        # 2. Load dataset
        df = load_dataset(spark, data_path)
        
        # 3. Inspect dataset
        inspect_dataset(df)
        
        # 4. Clean dataset
        df_clean = clean_dataset(df)
        
        # 5. Engineer features
        df_features = engineer_features(df_clean)
        
        # 6. Calculate analytics
        analytics = calculate_analytics(df_features)
        
        # 7. Run Spark ML experiment (optional benchmark)
        spark_ml_metrics = run_spark_ml_experiment(df_features)
        
        # 8. Save outputs
        save_outputs(df_features, analytics, output_dir, spark_ml_metrics)
        
        total_elapsed = time.time() - total_start
        print("\n" + "=" * 60)
        print(f"✅ Pipeline completed successfully! Total time: {total_elapsed:.2f}s")
        print("=" * 60)
        
        # Scalability note as per requirements
        print("\n📝 Scalability Note:")
        print("   This pipeline uses Apache Spark's distributed processing architecture.")
        print("   While the current dataset is small (~1.4k rows), the same code can scale")
        print("   to millions of rows by simply increasing cluster resources.")
        print("   All DataFrame operations (window functions, aggregations, ML) are")
        print("   designed to run in a distributed environment.")
        
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