#!/usr/bin/env python3
"""End-to-end smoke test against a running WattWise API.

Unlike the pytest suite this does not import the app. It talks HTTP to a real
server, so it catches the things unit tests cannot: a bad start command, a
missing static artifact, a CORS misconfiguration, a dependency that is
installed locally but absent on the host, or a route that only works when
uvicorn has actually loaded the module.

Usage::

    # terminal 1
    uvicorn src.api:app --port 8000
    # terminal 2
    python smoke_test.py
    python smoke_test.py --url https://your-deployment.onrender.com

Exit status is 0 when every check passes, 1 otherwise.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from typing import Any

PASS = "  ok  "
FAIL = " FAIL "

GREEN = "\033[32m"
RED = "\033[31m"
DIM = "\033[2m"
RESET = "\033[0m"


class Result:
    def __init__(self) -> None:
        self.passed = 0
        self.failed: list[str] = []

    def check(self, name: str, ok: bool, detail: str = "") -> None:
        if ok:
            self.passed += 1
            print(f"[{GREEN}{PASS}{RESET}] {name}" + (f" {DIM}{detail}{RESET}" if detail else ""))
        else:
            self.failed.append(name)
            print(f"[{RED}{FAIL}{RESET}] {name}" + (f" {detail}" if detail else ""))

    def summary(self) -> int:
        total = self.passed + len(self.failed)
        print()
        if self.failed:
            print(f"{RED}{len(self.failed)} of {total} checks failed:{RESET}")
            for name in self.failed:
                print(f"  - {name}")
            return 1
        print(f"{GREEN}all {total} checks passed{RESET}")
        return 0


class Client:
    def __init__(self, base: str, timeout: float = 30.0) -> None:
        self.base = base.rstrip("/")
        self.timeout = timeout

    def request(
        self, method: str, path: str, payload: dict[str, Any] | None = None
    ) -> tuple[int, Any, dict[str, str]]:
        url = f"{self.base}{path}"
        data = json.dumps(payload).encode() if payload is not None else None
        request = urllib.request.Request(
            url,
            data=data,
            method=method,
            headers={"Content-Type": "application/json", "Accept": "application/json"},
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                body = response.read().decode()
                return response.status, _maybe_json(body), dict(response.headers)
        except urllib.error.HTTPError as error:
            body = error.read().decode()
            return error.code, _maybe_json(body), dict(error.headers)

    def get(self, path: str) -> tuple[int, Any, dict[str, str]]:
        return self.request("GET", path)

    def post(self, path: str, payload: dict[str, Any]) -> tuple[int, Any, dict[str, str]]:
        return self.request("POST", path, payload)


def _maybe_json(body: str) -> Any:
    try:
        return json.loads(body)
    except json.JSONDecodeError:
        return body


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--url",
        default="http://127.0.0.1:8000",
        help="Base URL of a running API (default: %(default)s)",
    )
    parser.add_argument("--timeout", type=float, default=30.0)
    args = parser.parse_args()

    client = Client(args.url, args.timeout)
    result = Result()

    print(f"WattWise smoke test against {client.base}")
    print("=" * 60)

    # ------------------------------------------------------------------
    print("\nReachability")

    try:
        status, _, _ = client.get("/health")
    except Exception as exc:
        print(f"[{RED}{FAIL}{RESET}] cannot reach {client.base}: {exc}")
        print("\nStart the API first:  uvicorn src.api:app --port 8000")
        return 1

    result.check("service is reachable", status == 200, f"HTTP {status}")

    if result.failed:
        return result.summary()

    # ------------------------------------------------------------------
    print("\nHealth and metadata")

    _, health, _ = client.get("/health")
    result.check("health reports healthy", health.get("status") == "healthy")
    result.check("26 features are wired up", health.get("feature_count") == 26)
    start, end = health.get("dataset_start"), health.get("dataset_end")
    result.check(
        "dataset range is the shifted window",
        (start, end) == ("2022-12-16", "2026-11-26"),
        f"{start} -> {end}",
    )

    origins = health.get("allowed_origins", [])
    result.check("CORS uses explicit origins", "*" not in origins, f"{len(origins)} origins")
    result.check("CORS is not empty", bool(origins))

    _, info, _ = client.get("/model-info")
    hyper = info.get("hyperparameters", {})
    result.check("model is the Random Forest v2", "Random Forest" in info.get("model_name", ""))
    result.check("400 trees (not the 300 once shown in the UI)", hyper.get("n_estimators") == 400)
    result.check("26 feature names are published", len(info.get("features", [])) == 26)
    split = info.get("split", {})
    total = split.get("training_rows", 0) + split.get("validation_rows", 0) + split.get("test_rows", 0)
    result.check("split row counts add up to 1403", total == 1403, f"{total} rows")
    result.check("date-shift provenance is published", info.get("dataset", {}).get("date_shift_days") == 5844)

    metrics = info.get("metrics", {}).get("Random Forest V2", {})
    result.check(
        "held-out MAE is 4.0028 kWh",
        abs(metrics.get("mae_kwh", 0) - 4.0028075159) < 1e-6,
        f"{metrics.get('mae_kwh')} kWh",
    )

    _, dataset, _ = client.get("/dataset-info")
    result.check("dataset-info exposes the anomaly context", "anomaly_detection" in dataset)

    # ------------------------------------------------------------------
    print("\nHistorical data")

    _, history, _ = client.get("/historical-data?limit=30")
    rows = history.get("data", [])
    result.check("30 historical days are returned", history.get("count") == 30)
    result.check(
        "history ends on the dataset's last day",
        bool(rows) and rows[-1]["date"] == end,
        rows[-1]["date"] if rows else "none",
    )
    result.check("history is oldest-first", [r["date"] for r in rows] == sorted(r["date"] for r in rows))

    if not rows:
        return result.summary()

    window = [row["energy_kwh"] for row in rows]

    # ------------------------------------------------------------------
    print("\nPrediction")

    status, prediction, _ = client.post(
        "/predict", {"consumption": window, "target_date": end}
    )
    result.check("predict accepts the real history", status == 200, f"HTTP {status}")
    if status == 200:
        result.check(
            "prediction is a positive number",
            isinstance(prediction.get("predicted_kwh"), (int, float))
            and prediction["predicted_kwh"] > 0,
            f"{prediction.get('predicted_kwh')} kWh",
        )
        result.check(
            "prediction is labelled with the target date",
            prediction.get("target_date") == end,
        )
        result.check(
            "typical error is served, not hard-coded",
            abs(prediction.get("typical_error_kwh", 0) - 4.003) < 1e-3,
            f"{prediction.get('typical_error_kwh')} kWh",
        )

    _, repeat, _ = client.post("/predict", {"consumption": window, "target_date": end})
    result.check(
        "identical input gives an identical answer",
        repeat.get("predicted_kwh") == prediction.get("predicted_kwh"),
    )

    status, body, _ = client.post(
        "/predict", {"consumption": window, "target_date": "2019-01-01"}
    )
    result.check(
        "a date before the dataset is refused with guidance",
        status == 400 and "2022-12-16" in str(body.get("detail", "")),
        f"HTTP {status}",
    )

    status, _, _ = client.post("/predict", {"consumption": window[:10], "target_date": end})
    result.check("a short history window is refused", status == 422, f"HTTP {status}")

    # ------------------------------------------------------------------
    print("\nBilling")

    status, bill, _ = client.post(
        "/predict-bill", {"predicted_kwh": 22.6419, "tariff_per_kwh": 8.5}
    )
    result.check("predict-bill responds", status == 200, f"HTTP {status}")
    if status == 200:
        result.check("period defaults to 30 days", bill.get("period_days") == 30)
        result.check(
            "period consumption is daily x 30",
            abs(bill.get("consumption_kwh", 0) - 679.257) < 0.01,
            f"{bill.get('consumption_kwh')} kWh",
        )
        result.check(
            "bill is energy charge plus standing charge",
            abs(
                bill.get("estimated_bill", 0)
                - (bill.get("energy_charge", 0) + bill.get("fixed_charge_per_period", 0))
            )
            < 0.02,
            f"{bill.get('estimated_bill')} {bill.get('currency')}",
        )
        result.check("the tariff is declared flat", bill.get("tariff_type") == "flat")

    _, with_charge, _ = client.post(
        "/predict-bill",
        {
            "predicted_kwh": 20.0,
            "tariff_per_kwh": 5.0,
            "days": 30,
            "fixed_charge_per_period": 100,
        },
    )
    result.check(
        "the standing charge is added once, not per day",
        abs(
            with_charge.get("estimated_bill", 0)
            - (with_charge.get("energy_charge", 0) + 100)
        )
        < 0.02,
    )

    status, _, _ = client.post(
        "/predict-bill", {"predicted_kwh": 20.0, "tariff_per_kwh": 5.0, "days": 400}
    )
    result.check("an absurd billing period is refused", status == 422, f"HTTP {status}")

    # ------------------------------------------------------------------
    print("\nAnalytics and anomalies")

    _, analytics, _ = client.get("/model-analytics")
    clusters = analytics.get("clusters", [])
    result.check("clusters are reported", len(clusters) == 2, f"{len(clusters)} clusters")
    result.check(
        "cluster day counts cover the dataset",
        sum(c.get("days", 0) for c in clusters) == 1403,
    )
    importances = analytics.get("feature_importances", [])
    result.check("26 feature importances are published", len(importances) == 26)
    result.check(
        "importances are sorted and normalised",
        bool(importances)
        and all(
            importances[i]["importance"] >= importances[i + 1]["importance"]
            for i in range(len(importances) - 1)
        )
        and abs(sum(i["importance"] for i in importances) - 1.0) < 1e-6,
    )
    matrix = analytics.get("anomaly_matrix", {})
    result.check(
        "anomaly tallies are internally consistent",
        matrix.get("anomalies_detected", 0) + matrix.get("inliers_normal", 0)
        == matrix.get("total_evaluations"),
    )

    _, anomalies, _ = client.get("/anomalies")
    result.check("anomalies are reported", anomalies.get("count", 0) > 0, f"{anomalies.get('count')} days")
    result.check(
        "every anomaly score is negative",
        all(row.get("anomaly_score", 0) < 0 for row in anomalies.get("anomalies", [])),
    )
    result.check(
        "anomaly dates fall inside the dataset",
        all(start <= row["date"] <= end for row in anomalies.get("anomalies", [])),
    )

    # ------------------------------------------------------------------
    print("\nCORS preflight from the deployed frontend")

    frontend = "https://web-24f6gbeec-swara2402s-projects.vercel.app"
    request = urllib.request.Request(
        f"{client.base}/predict",
        method="OPTIONS",
        headers={
            "Origin": frontend,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=args.timeout) as response:
            allowed = response.headers.get("Access-Control-Allow-Origin")
        result.check(
            "the deployed frontend is allowed",
            allowed == frontend,
            str(allowed),
        )
    except Exception as exc:
        result.check("the deployed frontend is allowed", False, str(exc))

    request = urllib.request.Request(
        f"{client.base}/health", method="OPTIONS",
        headers={"Origin": "https://not-a-real-site.example", "Access-Control-Request-Method": "GET"},
    )
    try:
        with urllib.request.urlopen(request, timeout=args.timeout) as response:
            allowed = response.headers.get("Access-Control-Allow-Origin")
        result.check("an unknown origin is not echoed back", allowed is None, str(allowed))
    except urllib.error.HTTPError as error:
        allowed = error.headers.get("Access-Control-Allow-Origin")
        result.check("an unknown origin is not echoed back", allowed is None, str(allowed))
    except Exception as exc:
        result.check("an unknown origin is not echoed back", False, str(exc))

    # ------------------------------------------------------------------
    print("\nDocumentation")

    _, schema, _ = client.get("/openapi.json")
    missing = [
        path
        for path in (
            "/health", "/model-info", "/dataset-info", "/model-analytics",
            "/predict", "/predict-bill", "/historical-data", "/anomalies",
        )
        if path not in schema.get("paths", {})
    ]
    result.check("OpenAPI documents every route", not missing, ", ".join(missing))

    return result.summary()


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\ninterrupted")
        sys.exit(130)
