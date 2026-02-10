"""Tests for grove_coder.database."""

import sqlite3

import pytest

from grove_coder.database import VALID_PERIODS, CostDatabase


@pytest.fixture
def db(tmp_path):
    """Create a temporary CostDatabase."""
    return CostDatabase(tmp_path / "test.db")


def test_init_creates_table(db):
    """Database initializes with the requests table."""
    conn = sqlite3.connect(db.db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='requests'")
    assert cursor.fetchone() is not None
    conn.close()


def test_log_request(db):
    """Requests are logged with correct data."""
    db.log_request(
        tool_name="generate_code",
        cost_usd=0.000123,
        tokens={"input": 500, "output": 200},
        file_path="test.py",
    )

    conn = sqlite3.connect(db.db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT tool_name, cost_usd, input_tokens, output_tokens, file_path FROM requests")
    row = cursor.fetchone()
    conn.close()

    assert row[0] == "generate_code"
    assert abs(row[1] - 0.000123) < 1e-9
    assert row[2] == 500
    assert row[3] == 200
    assert row[4] == "test.py"


def test_log_request_without_file_path(db):
    """Requests can be logged without a file_path."""
    db.log_request("review_code", 0.001, {"input": 100, "output": 50})

    conn = sqlite3.connect(db.db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT file_path FROM requests")
    row = cursor.fetchone()
    conn.close()

    assert row[0] is None


def test_get_report_empty(db):
    """Empty database returns zero totals."""
    report = db.get_report("all")
    assert report["total_requests"] == 0
    assert report["total_cost_usd"] == 0.0
    assert report["breakdown"] == []


def test_get_report_with_data(db):
    """Report aggregates costs correctly."""
    db.log_request("generate_code", 0.01, {"input": 1000, "output": 500})
    db.log_request("generate_code", 0.02, {"input": 2000, "output": 1000})
    db.log_request("edit_code", 0.005, {"input": 300, "output": 150})

    report = db.get_report("all")
    assert report["total_requests"] == 3
    assert abs(report["total_cost_usd"] - 0.035) < 1e-6


def test_get_report_tool_filter(db):
    """Report can filter by tool name."""
    db.log_request("generate_code", 0.01, {"input": 1000, "output": 500})
    db.log_request("edit_code", 0.005, {"input": 300, "output": 150})

    report = db.get_report("all", tool_filter="generate_code")
    assert report["total_requests"] == 1
    assert abs(report["total_cost_usd"] - 0.01) < 1e-6


def test_get_report_today(db):
    """Today's report includes requests from today."""
    db.log_request("generate_code", 0.01, {"input": 1000, "output": 500})
    report = db.get_report("today")
    assert report["total_requests"] == 1


def test_check_cost_limit_under(db):
    """Returns True when under the cost limit."""
    db.log_request("generate_code", 1.0, {"input": 1000, "output": 500})
    assert db.check_cost_limit("all", 10.0) is True


def test_check_cost_limit_exceeded(db):
    """Returns False when cost limit is exceeded."""
    db.log_request("generate_code", 15.0, {"input": 1000, "output": 500})
    assert db.check_cost_limit("all", 10.0) is False


def test_invalid_period_raises(db):
    """Invalid period raises ValueError."""
    with pytest.raises(ValueError, match="Invalid period"):
        db.get_report("invalid_period")


def test_valid_periods_constant():
    """VALID_PERIODS contains the expected values."""
    assert set(VALID_PERIODS) == {"today", "week", "month", "all"}
