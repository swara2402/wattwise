"""Shared pytest fixtures.

Puts ``WattWise-AI`` on ``sys.path`` so ``src.api`` imports the same way it
does under uvicorn, and exposes the heavy artifacts once per session.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd
import pytest

WATTWISE_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = WATTWISE_DIR.parent

if str(WATTWISE_DIR) not in sys.path:
    sys.path.insert(0, str(WATTWISE_DIR))


@pytest.fixture(scope="session")
def wattwise_dir() -> Path:
    return WATTWISE_DIR


@pytest.fixture(scope="session")
def billing_cases() -> dict:
    import json

    path = REPO_ROOT / "web" / "src" / "lib" / "billingCases.json"
    if not path.exists():
        pytest.skip(f"shared billing fixture missing: {path}")
    return json.loads(path.read_text())


@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient

    from src.api import app

    return TestClient(app)


@pytest.fixture(scope="session")
def daily() -> pd.DataFrame:
    from src import metadata as meta

    return meta.daily_frame()


@pytest.fixture(scope="session")
def ml_dataset() -> pd.DataFrame:
    from src import metadata as meta

    return meta.ml_frame()


@pytest.fixture(scope="session")
def stored_test_predictions() -> pd.DataFrame:
    from src import metadata as meta

    path = meta.BASE_DIR / "results" / "predictions" / "test_predictions_v2.csv"
    if not path.exists():
        pytest.skip("test_predictions_v2.csv missing")
    return pd.read_csv(path, parse_dates=["datetime"])
