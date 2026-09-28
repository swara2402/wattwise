"""Static regression checks for the Spark time-series pipeline.

These checks intentionally do not require a live Spark cluster. They protect
the two methodological invariants that are easy to regress during refactors:
continuous chronological windows and causal (past-only) rolling features.
"""

from pathlib import Path


PIPELINE = Path(__file__).parents[1] / "spark" / "spark_pipeline.py"


def test_spark_pipeline_uses_continuous_time_window():
    source = PIPELINE.read_text(encoding="utf-8")
    assert 'Window.partitionBy("year")' not in source
    assert 'w_time = Window.orderBy("datetime")' in source


def test_spark_rolling_windows_are_strictly_past_only():
    source = PIPELINE.read_text(encoding="utf-8")
    assert 'rowsBetween(-3, -1)' in source
    assert 'rowsBetween(-24, -1)' in source
    assert 'rowsBetween(-2, 0)' not in source
    assert 'rowsBetween(-23, 0)' not in source


def test_spark_fallback_never_uses_random_split():
    source = PIPELINE.read_text(encoding="utf-8")
    assert "randomSplit(" not in source
    assert 'orderBy("datetime")' in source
