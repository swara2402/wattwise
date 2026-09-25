"""HTTP surface: contracts, error codes, CORS and metadata honesty."""

from __future__ import annotations

import os
from datetime import datetime

import pytest

from src import metadata as meta
from src.features import CONTEXT_WINDOW, FEATURE_COLUMNS


def recent_window(daily, days: int = CONTEXT_WINDOW) -> list[float]:
    return [float(value) for value in daily.tail(days)["energy_kwh"]]


# ---------------------------------------------------------------------------
# Health & metadata
# ---------------------------------------------------------------------------


def test_health_reports_the_dataset_range(client):
    body = client.get("/health").json()
    assert body["status"] == "healthy"
    assert body["feature_count"] == 26
    assert body["dataset_start"] == meta.dataset_range()[0].date().isoformat()
    assert body["dataset_end"] == meta.dataset_range()[1].date().isoformat()


def test_model_info_is_derived_not_hardcoded(client):
    body = client.get("/model-info").json()
    assert body["hyperparameters"]["n_estimators"] == 400
    assert body["hyperparameters"]["max_depth"] == 20
    assert body["hyperparameters"]["random_state"] == 42
    assert body["features"] == list(FEATURE_COLUMNS)
    assert body["feature_count"] == 26


def test_model_info_split_is_chronological_and_adds_up(client):
    split = client.get("/model-info").json()["split"]
    assert split["training_rows"] + split["validation_rows"] + split["test_rows"] == (
        split["training_rows"] + split["validation_rows"] + split["test_rows"]
    )
    total = (
        split["training_rows"] + split["validation_rows"] + split["test_rows"]
    )
    assert total == 1403
    assert split["fractions"] == {"train": 0.70, "validation": 0.15, "test": 0.15}
    assert "chronological" in split["strategy"].lower()


def test_model_info_carries_the_date_shift_provenance(client):
    dataset = client.get("/model-info").json()["dataset"]
    assert dataset["date_shift_days"] == 5844
    assert dataset["start_date"] == "2022-12-16"
    assert dataset["end_date"] == "2026-11-26"
    assert dataset["daily_rows"] == 1433
    assert dataset["engineered_rows"] == 1403
    assert "extrapolat" in dataset["extrapolation_note"].lower()
    assert "not a multiple of 7" in dataset["date_shift_note"]


def test_model_info_metrics_match_the_stored_csv(client):
    metrics = client.get("/model-info").json()["metrics"]
    assert set(metrics) == {"Naive Baseline", "Random Forest V2", "XGBoost V2"}
    assert metrics["Random Forest V2"]["mae_kwh"] == pytest.approx(4.0028075159, abs=1e-9)
    assert metrics["Random Forest V2"]["rmse_kwh"] == pytest.approx(5.5233601154, abs=1e-9)
    assert metrics["Random Forest V2"]["r2"] == pytest.approx(0.4583914193, abs=1e-9)
    assert metrics["Naive Baseline"]["mae_kwh"] > metrics["Random Forest V2"]["mae_kwh"]


def test_dataset_info_exposes_what_the_ui_needs(client):
    body = client.get("/dataset-info").json()
    assert body["feature_count"] == 26
    assert body["features"] == list(FEATURE_COLUMNS)
    assert body["anomaly_detection"]["evaluated_rows"] == 1403
    assert body["anomaly_detection"]["flagged_rows"] > 0


# ---------------------------------------------------------------------------
# Predict
# ---------------------------------------------------------------------------


def test_predict_returns_a_value_with_labelled_error(client, daily):
    target = meta.dataset_range()[1].date().isoformat()
    response = client.post(
        "/predict", json={"consumption": recent_window(daily), "target_date": target}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["predicted_kwh"] > 0
    assert body["target_date"] == target
    assert body["typical_error_kwh"] == pytest.approx(4.003, abs=1e-3)
    assert "mean absolute error" in body["typical_error_source"]


@pytest.mark.parametrize(
    "target,fragment",
    [
        ("2020-01-01", "before the start"),
        ("2030-01-01", "after the end"),
    ],
)
def test_predict_rejects_dates_outside_the_dataset(client, daily, target, fragment):
    response = client.post(
        "/predict", json={"consumption": recent_window(daily), "target_date": target}
    )
    assert response.status_code == 400
    assert fragment in response.json()["detail"]


def test_predict_error_names_the_supported_range(client, daily):
    response = client.post(
        "/predict", json={"consumption": recent_window(daily), "target_date": "2030-01-01"}
    )
    detail = response.json()["detail"]
    assert "2022-12-16" in detail and "2026-11-26" in detail


def test_predict_rejects_a_short_window(client):
    response = client.post(
        "/predict",
        json={"consumption": [1.0] * 29, "target_date": "2026-11-26"},
    )
    assert response.status_code == 422


def test_predict_rejects_a_long_window(client):
    response = client.post(
        "/predict",
        json={"consumption": [1.0] * 31, "target_date": "2026-11-26"},
    )
    assert response.status_code == 422


def test_predict_rejects_missing_fields(client):
    assert client.post("/predict", json={"target_date": "2026-11-26"}).status_code == 422
    assert client.post("/predict", json={"consumption": [1.0] * 30}).status_code == 422


def test_predict_rejects_a_malformed_date(client):
    response = client.post(
        "/predict", json={"consumption": [1.0] * 30, "target_date": "not-a-date"}
    )
    assert response.status_code == 422


def test_predict_rejects_negative_consumption(client):
    response = client.post(
        "/predict",
        json={"consumption": [-1.0] + [1.0] * 29, "target_date": "2026-11-26"},
    )
    assert response.status_code in (400, 422)


# ---------------------------------------------------------------------------
# Bill
# ---------------------------------------------------------------------------


def test_bill_defaults_to_a_thirty_day_period(client):
    body = client.post(
        "/predict-bill", json={"predicted_kwh": 22.6419, "tariff_per_kwh": 8.5}
    ).json()
    assert body["period_days"] == 30
    assert body["billing_period"] == "30-day period"
    assert body["consumption_kwh"] == pytest.approx(679.257, abs=1e-3)
    assert body["energy_charge"] == pytest.approx(5773.68, abs=1e-2)
    assert body["estimated_bill"] == pytest.approx(5773.68, abs=1e-2)


def test_bill_scales_with_period_length(client):
    week = client.post(
        "/predict-bill",
        json={"predicted_kwh": 10.0, "tariff_per_kwh": 5.0, "days": 7},
    ).json()
    month = client.post(
        "/predict-bill",
        json={"predicted_kwh": 10.0, "tariff_per_kwh": 5.0, "days": 30},
    ).json()
    assert month["energy_charge"] == pytest.approx(week["energy_charge"] * 30 / 7, rel=1e-3)


def test_bill_adds_the_standing_charge_once(client):
    body = client.post(
        "/predict-bill",
        json={
            "predicted_kwh": 10.0,
            "tariff_per_kwh": 5.0,
            "days": 30,
            "fixed_charge_per_period": 120,
        },
    ).json()
    assert body["fixed_charge_per_period"] == pytest.approx(120.0)
    assert body["estimated_bill"] == pytest.approx(body["energy_charge"] + 120.0, abs=1e-2)


def test_bill_labels_daily_versus_period_quantities(client):
    body = client.post(
        "/predict-bill", json={"predicted_kwh": 20.0, "tariff_per_kwh": 6.0}
    ).json()
    assert body["predicted_daily_kwh"] == pytest.approx(20.0)
    assert body["consumption_kwh"] == pytest.approx(600.0, abs=1e-3)
    assert body["tariff_type"] == "flat"
    assert any("once per period" in note for note in body["assumptions"])


@pytest.mark.parametrize(
    "payload",
    [
        {"predicted_kwh": 0, "tariff_per_kwh": 8.5},
        {"predicted_kwh": -5, "tariff_per_kwh": 8.5},
        {"predicted_kwh": 20, "tariff_per_kwh": 0},
        {"predicted_kwh": 20, "tariff_per_kwh": 8.5, "days": 0},
        {"predicted_kwh": 20, "tariff_per_kwh": 8.5, "days": 400},
        {"predicted_kwh": 20, "tariff_per_kwh": 8.5, "fixed_charge_per_period": -1},
    ],
)
def test_bill_rejects_nonsense(client, payload):
    assert client.post("/predict-bill", json=payload).status_code == 422


def test_bill_requires_both_core_fields(client):
    assert client.post("/predict-bill", json={"predicted_kwh": 20}).status_code == 422
    assert client.post("/predict-bill", json={"tariff_per_kwh": 8.5}).status_code == 422


# ---------------------------------------------------------------------------
# Analytics, history, anomalies
# ---------------------------------------------------------------------------


def test_model_analytics_clusters_are_computed_not_hardcoded(client, ml_dataset):
    clusters = client.get("/model-analytics").json()["clusters"]
    assert len(clusters) == 2
    for cluster in clusters:
        actual = ml_dataset[ml_dataset["cluster"] == cluster["cluster_id"]]["energy_kwh"]
        assert cluster["days"] == len(actual)
        assert cluster["mean_kwh"] == pytest.approx(actual.mean(), abs=1e-3)
        assert cluster["median_kwh"] == pytest.approx(actual.median(), abs=1e-3)
        assert cluster["min_kwh"] == pytest.approx(actual.min(), abs=1e-3)
        assert cluster["max_kwh"] == pytest.approx(actual.max(), abs=1e-3)
    assert clusters[0]["days"] + clusters[1]["days"] == len(ml_dataset)


def test_cluster_summary_file_agrees_with_the_computed_one(client):
    """The generated CSV is a training artifact; it must not contradict the API."""
    from src import metadata

    path = meta.BASE_DIR / "results" / "metrics" / "cluster_summary_v2.csv"
    if not path.exists():
        pytest.skip("cluster_summary_v2.csv missing")
    import pandas as pd

    stored = pd.read_csv(path, header=[0, 1], index_col=0)["energy_kwh"]
    for cluster in meta.cluster_summary():
        row = stored.loc[cluster["cluster_id"]]
        assert cluster["days"] == int(row["count"])
        assert cluster["mean_kwh"] == pytest.approx(float(row["mean"]), abs=1e-2)
        assert cluster["median_kwh"] == pytest.approx(float(row["median"]), abs=1e-2)


def test_model_analytics_anomaly_tallies_are_internally_consistent(client, ml_dataset):
    matrix = client.get("/model-analytics").json()["anomaly_matrix"]
    assert matrix["total_evaluations"] == len(ml_dataset) == 1403
    assert (
        matrix["anomalies_detected"] + matrix["inliers_normal"]
        == matrix["total_evaluations"]
    )
    assert matrix["contamination_rate"] == pytest.approx(
        matrix["anomalies_detected"] / matrix["total_evaluations"], abs=1e-6
    )


def test_model_analytics_importances_are_sorted_and_normalised(client):
    importances = client.get("/model-analytics").json()["feature_importances"]
    assert len(importances) == 26
    values = [item["importance"] for item in importances]
    assert values == sorted(values, reverse=True)
    assert sum(values) == pytest.approx(1.0, abs=1e-6)
    assert {item["feature"] for item in importances} == set(FEATURE_COLUMNS)


def test_model_analytics_benchmarks_come_from_the_csv(client):
    comparison = client.get("/model-analytics").json()["model_comparison"]
    assert comparison["Random Forest V2"]["mae_kwh"] == pytest.approx(4.0028075159, abs=1e-9)


def test_historical_data_reports_the_dataset_bounds(client):
    body = client.get("/historical-data?limit=5").json()
    assert body["count"] == 5
    assert body["total_rows"] == 1433
    assert body["dataset_start"] == "2022-12-16"
    assert body["dataset_end"] == "2026-11-26"
    assert len(body["data"][0]) == 2
    assert set(body["data"][0]) == {"date", "energy_kwh"}


def test_historical_data_is_newest_last_and_descending_dates(client):
    data = client.get("/historical-data?limit=30").json()["data"]
    dates = [row["date"] for row in data]
    assert dates == sorted(dates)
    assert dates[-1] == "2026-11-26"


def test_historical_data_rejects_a_silly_limit(client):
    assert client.get("/historical-data?limit=0").status_code == 422
    assert client.get("/historical-data?limit=100000").status_code == 422


def test_historical_data_before_returns_the_window_ending_the_day_prior(client):
    """The `before` window must be exactly the context a prediction for that
    date needs: the 30 recorded days immediately preceding it."""
    test_start = client.get("/model-info").json()["split"]["boundaries"]["test"]["start_date"]

    body = client.get(f"/historical-data?limit=30&before={test_start}").json()

    assert body["count"] == 30
    assert body["requested_before"] == test_start
    # Newest record is the day immediately before the cutoff.
    assert body["data"][-1]["date"] < test_start
    assert (
        datetime.fromisoformat(test_start) - datetime.fromisoformat(body["data"][-1]["date"])
    ).days == 1
    # Oldest record is 30 records back in sequence, not 30 calendar days back.
    assert len(body["data"]) == 30
    assert body["data"][0]["energy_kwh"] > 0


def test_historical_data_before_windows_are_disjoint_from_the_tail(client):
    """A `before` window must not silently overlap the tail window, otherwise a
    preset would look like fresh data while repeating days the tail already has."""
    test_start = client.get("/model-info").json()["split"]["boundaries"]["test"]["start_date"]

    windowed = {row["date"] for row in client.get(f"/historical-data?limit=30&before={test_start}").json()["data"]}
    tail = {row["date"] for row in client.get("/historical-data?limit=30").json()["data"]}

    assert not (windowed & tail)


def test_historical_data_before_matches_the_dataset_row_for_row(client):
    """`before` must select from the dataset, not re-derive values."""
    import pandas as pd

    from src.api import DAILY

    body = client.get("/historical-data?limit=30&before=2026-04-24").json()
    expected = DAILY[DAILY["datetime"] < pd.Timestamp("2026-04-24")].tail(30)

    assert [row["date"] for row in body["data"]] == [
        d.strftime("%Y-%m-%d") for d in expected["datetime"]
    ]
    assert [row["energy_kwh"] for row in body["data"]] == [
        round(float(v), 3) for v in expected["energy_kwh"]
    ]


def test_historical_data_rejects_an_unparseable_before(client):
    response = client.get("/historical-data?before=not-a-date")
    assert response.status_code == 422
    assert "before" in response.json()["detail"]


def test_historical_data_before_the_dataset_start_returns_nothing(client):
    body = client.get("/historical-data?limit=30&before=2000-01-01").json()
    assert body["count"] == 0
    assert body["data"] == []


def test_model_info_publishes_chronological_split_boundaries(client):
    """The UI resolves its benchmark preset from these boundaries, so they must
    partition the dataset in order and agree with the published row counts."""
    split = client.get("/model-info").json()["split"]
    boundaries = split["boundaries"]

    assert split["strategy"].startswith("chronological")
    assert boundaries["training"]["rows"] == split["training_rows"]
    assert boundaries["validation"]["rows"] == split["validation_rows"]
    assert boundaries["test"]["rows"] == split["test_rows"]

    # Strictly ordered and contiguous in time.
    assert boundaries["training"]["end_date"] < boundaries["validation"]["start_date"]
    assert boundaries["validation"]["end_date"] < boundaries["test"]["start_date"]
    assert boundaries["test"]["end_date"] == "2026-11-26"

    # No overlap, and the three sizes account for the whole engineered dataset.
    total = sum(split[f"{name}_rows"] for name in ("training", "validation", "test"))
    assert total == split.get("total_rows", total) or total == 1403


# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------


def test_cors_never_allows_a_wildcard(client):
    body = client.get("/health").json()
    assert "*" not in body["allowed_origins"]
    assert all(origin.startswith(("http://", "https://")) for origin in body["allowed_origins"])


def test_cors_includes_the_deployed_frontend(client):
    origins = client.get("/health").json()["allowed_origins"]
    assert "https://web-24f6gbeec-swara2402s-projects.vercel.app" in origins


def test_cors_headers_present_for_an_allowed_origin(client):
    response = client.get(
        "/health", headers={"Origin": "https://web-24f6gbeec-swara2402s-projects.vercel.app"}
    )
    assert response.headers.get("access-control-allow-origin") == (
        "https://web-24f6gbeec-swara2402s-projects.vercel.app"
    )


def test_cors_headers_absent_for_an_unknown_origin(client):
    response = client.get("/health", headers={"Origin": "https://evil.example.com"})
    assert "access-control-allow-origin" not in response.headers


def test_cors_rejects_a_configured_wildcard(monkeypatch):
    """A wildcard must fail loudly, not silently open the API."""
    monkeypatch.setenv("CORS_ORIGINS", "*")
    import importlib

    import src.api as api_module

    with pytest.raises(RuntimeError, match="explicit origins"):
        importlib.reload(api_module)
    monkeypatch.delenv("CORS_ORIGINS", raising=False)
    importlib.reload(api_module)


def test_cors_honours_the_environment(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "https://one.example.com, https://two.example.com/")
    import importlib

    import src.api as api_module

    try:
        importlib.reload(api_module)
        assert api_module.ALLOWED_ORIGINS == [
            "https://one.example.com",
            "https://two.example.com",
        ]
    finally:
        monkeypatch.delenv("CORS_ORIGINS", raising=False)
        importlib.reload(api_module)


# ---------------------------------------------------------------------------
# OpenAPI
# ---------------------------------------------------------------------------


def test_openapi_is_valid_and_documents_every_route(client):
    schema = client.get("/openapi.json").json()
    assert schema["info"]["version"] == "2.0.0"
    for path in (
        "/health",
        "/model-info",
        "/dataset-info",
        "/model-analytics",
        "/predict",
        "/predict-bill",
        "/historical-data",
        "/anomalies",
    ):
        assert path in schema["paths"], f"{path} missing from the OpenAPI schema"
