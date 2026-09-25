import pandas as pd
import numpy as np

from api import create_prediction_features, model, EXPECTED_FEATURES


# ---------------------------------------------------------
# 1. Load processed training data
# ---------------------------------------------------------
daily = pd.read_csv(
    "data/processed/daily_consumption_v2.csv",
    parse_dates=["datetime"]
)

ml_data = pd.read_csv(
    "data/processed/ml_dataset_v2.csv",
    parse_dates=["datetime"]
)

# Known test date from our V2 test set
target_date = pd.Timestamp("2010-04-24")

print("=" * 60)
print("WATTWISE API FEATURE VALIDATION")
print("=" * 60)

print(f"\nTarget date: {target_date.date()}")

# ---------------------------------------------------------
# 2. Get the 30 days BEFORE target date
# ---------------------------------------------------------
history = daily[
    daily["datetime"] < target_date
].sort_values("datetime").tail(30)

if len(history) != 30:
    raise ValueError(
        f"Expected 30 history records, found {len(history)}"
    )

consumption = history["energy_kwh"].tolist()

print(f"History records: {len(consumption)}")
print(
    f"History period: "
    f"{history['datetime'].iloc[0].date()} → "
    f"{history['datetime'].iloc[-1].date()}"
)

# ---------------------------------------------------------
# 3. Generate features using API code
# ---------------------------------------------------------
api_features = create_prediction_features(
    consumption,
    target_date
)

# ---------------------------------------------------------
# 4. Get the same target row from training dataset
# ---------------------------------------------------------
training_row = ml_data[
    ml_data["datetime"] == target_date
]

if training_row.empty:
    raise ValueError(
        f"Target date {target_date.date()} not found in ml_dataset_v2.csv"
    )

training_row = training_row.iloc[0]

# ---------------------------------------------------------
# 5. Compare all 26 features
# ---------------------------------------------------------
print("\n" + "=" * 60)
print("FEATURE COMPARISON")
print("=" * 60)

differences = []

for feature in EXPECTED_FEATURES:

    api_value = float(api_features.iloc[0][feature])
    training_value = float(training_row[feature])

    difference = abs(api_value - training_value)

    differences.append(difference)

    status = "OK" if difference < 1e-6 else "DIFF"

    print(
        f"{status:4} | "
        f"{feature:20} | "
        f"API={api_value:12.6f} | "
        f"TRAIN={training_value:12.6f} | "
        f"DIFF={difference:.8f}"
    )

# ---------------------------------------------------------
# 6. Overall result
# ---------------------------------------------------------
max_difference = max(differences)

print("\n" + "=" * 60)
print(f"Maximum feature difference: {max_difference:.10f}")
print("=" * 60)

if max_difference < 1e-6:
    print("\n✅ PERFECT FEATURE MATCH")
    print("API feature engineering matches training exactly.")

elif max_difference < 0.01:
    print("\n⚠️ VERY SMALL DIFFERENCE")
    print("API is extremely close to training features.")

else:
    print("\n❌ FEATURE MISMATCH")
    print("API feature engineering needs correction.")

# ---------------------------------------------------------
# 7. Generate API prediction
# ---------------------------------------------------------
prediction = model.predict(
    api_features[EXPECTED_FEATURES]
)[0]

training_prediction = model.predict(
    training_row[EXPECTED_FEATURES].to_frame().T
)[0]

print("\n" + "=" * 60)
print("PREDICTION COMPARISON")
print("=" * 60)

print(f"API features prediction:      {prediction:.6f} kWh")
print(f"Training-row prediction:      {training_prediction:.6f} kWh")
print(
    f"Prediction difference:        "
    f"{abs(prediction - training_prediction):.10f} kWh"
)

print("=" * 60)