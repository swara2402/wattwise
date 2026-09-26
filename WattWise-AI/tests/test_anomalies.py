"""Anomaly and cluster reporting must be derived from the shipped data.

The previous implementation returned a literal list of two clusters with
hand-typed numbers. These tests recompute the figures from
``ml_dataset_v2.csv`` so that a hard-coded response cannot pass.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from src import metadata as meta


# ---------------------------------------------------------------------------
# Anomalies
# ---------------------------------------------------------------------------


def test_anomaly_file_is_present_and_parsed(client):
    body = client.get("/anomalies").json()
    assert body["count"] == len(meta.anomaly_frame())
    assert body["count"] > 0


def test_every_anomaly_row_is_well_formed(client):
    body = client.get("/anomalies").json()
    for row in body["anomalies"]:
        assert set(row) == {
            "date",
            "energy_kwh",
            "rolling_mean_7",
            "rolling_std_7",
            "anomaly_score",
        }
        assert len(row["date"]) == 10 and row["date"][4] == "-"
        for key in ("energy_kwh", "rolling_mean_7", "rolling_std_7", "anomaly_score"):
            assert np.isfinite(row[key])


def test_anomaly_dates_lie_inside_the_dataset_range(client, daily):
    start = daily["datetime"].min().date().isoformat()
    end = daily["datetime"].max().date().isoformat()
    dates = [row["date"] for row in client.get("/anomalies").json()["anomalies"]]
    assert dates == sorted(dates)
    for value in dates:
        assert start <= value <= end, f"{value} outside {start}..{end}"


def test_anomaly_rate_is_consistent(client, ml_dataset):
    body = client.get("/anomalies").json()
    assert body["evaluated_rows"] == len(ml_dataset)
    assert body["flagged_rate"] == pytest.approx(
        body["count"] / body["evaluated_rows"], abs=1e-6
    )
    assert 0 < body["flagged_rate"] < 0.10, (
        "contamination was configured at 2%; a very different rate means the "
        "threshold and the file disagree"
    )


def test_flagged_days_are_exactly_the_negative_scores(client, ml_dataset):
    """Isolation Forest's score_samples is signed: lower means more anomalous.

    The training run kept every day scoring below zero, and the shipped file
    must be exactly that set - no more, no less.
    """
    flagged = {row["date"] for row in client.get("/anomalies").json()["anomalies"]}
    expected = {
        stamp.strftime("%Y-%m-%d")
        for stamp in ml_dataset.loc[ml_dataset["anomaly_score"] < 0, "datetime"]
    }
    assert flagged == expected
    assert len(flagged) == 29
    assert all(row["anomaly_score"] < 0 for row in client.get("/anomalies").json()["anomalies"])


def test_anomaly_energy_differs_from_its_rolling_baseline(client):
    """A flagged day is one that departs from its own recent norm."""
    rows = client.get("/anomalies").json()["anomalies"]
    deviations = [abs(row["energy_kwh"] - row["rolling_mean_7"]) for row in rows]
    assert max(deviations) > 5.0


def test_context_reports_the_configured_contamination(client, ml_dataset):
    context = meta.anomaly_context()
    assert context["contamination"] == pytest.approx(0.02)
    assert context["score_min"] <= context["score_max"]
    assert context["flagged_rows"] == len(meta.anomaly_frame())


# ---------------------------------------------------------------------------
# Clusters
# ---------------------------------------------------------------------------


def test_clusters_cover_every_engineered_row(ml_dataset):
    clusters = meta.cluster_summary()
    assert sum(cluster["days"] for cluster in clusters) == len(ml_dataset)


def test_cluster_statistics_are_exact(ml_dataset):
    for cluster in meta.cluster_summary():
        values = ml_dataset[ml_dataset["cluster"] == cluster["cluster_id"]]["energy_kwh"]
        assert cluster["mean_kwh"] == pytest.approx(values.mean(), abs=1e-3)
        assert cluster["median_kwh"] == pytest.approx(values.median(), abs=1e-3)
        assert cluster["min_kwh"] == pytest.approx(values.min(), abs=1e-3)
        assert cluster["max_kwh"] == pytest.approx(values.max(), abs=1e-3)
        assert cluster["share_of_days"] == pytest.approx(len(values) / len(ml_dataset), abs=1e-4)


def test_clusters_are_ordered_by_mean_and_labelled_behaviourally(ml_dataset):
    clusters = meta.cluster_summary()
    means = [cluster["mean_kwh"] for cluster in clusters]
    assert means == sorted(means, reverse=True)
    assert clusters[0]["behaviour"] == "higher_consumption"
    assert clusters[-1]["behaviour"] == "lower_consumption"


def test_cluster_day_counts_match_the_stored_summary():
    path = meta.BASE_DIR / "results" / "metrics" / "cluster_summary_v2.csv"
    if not path.exists():
        pytest.skip("cluster_summary_v2.csv missing")
    stored = pd.read_csv(path, header=[0, 1], index_col=0)["energy_kwh"]
    for cluster in meta.cluster_summary():
        assert cluster["days"] == int(stored.loc[cluster["cluster_id"], "count"])


def test_cluster_medians_lie_inside_their_own_range():
    for cluster in meta.cluster_summary():
        assert cluster["min_kwh"] <= cluster["median_kwh"] <= cluster["max_kwh"]
        assert cluster["min_kwh"] <= cluster["mean_kwh"] <= cluster["max_kwh"]


def test_the_two_clusters_are_well_separated_in_mean(ml_dataset):
    """K-means on standardised lags separates the profiles but leaves the
    marginal distributions overlapping, so assert separation, not disjointness."""
    clusters = meta.cluster_summary()
    if len(clusters) < 2:
        pytest.skip("need at least two clusters")
    high, low = clusters[0], clusters[-1]
    assert high["mean_kwh"] - low["mean_kwh"] > 10.0
    assert high["median_kwh"] > low["median_kwh"]
