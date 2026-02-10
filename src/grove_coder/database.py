"""SQLite cost tracking database for grove-coder."""

import sqlite3
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

VALID_PERIODS = ("today", "week", "month", "all")


class CostDatabase:
    """Tracks API request costs and token usage in SQLite."""

    def __init__(self, db_path: str | Path):
        self.db_path = str(db_path)
        self._init_db()

    def _init_db(self) -> None:
        """Create the requests table if it doesn't exist."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS requests (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                    tool_name TEXT NOT NULL,
                    cost_usd REAL NOT NULL,
                    input_tokens INTEGER,
                    output_tokens INTEGER,
                    file_path TEXT
                )
            """)
            conn.commit()

    def log_request(
        self,
        tool_name: str,
        cost_usd: float,
        tokens: dict[str, int],
        file_path: str | None = None,
    ) -> None:
        """Log a single API request with cost and token data."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                "INSERT INTO requests (tool_name, cost_usd, input_tokens, output_tokens, file_path)"
                " VALUES (?, ?, ?, ?, ?)",
                (
                    tool_name,
                    cost_usd,
                    tokens.get("input", 0),
                    tokens.get("output", 0),
                    file_path,
                ),
            )
            conn.commit()

    def get_report(
        self, period: str, tool_filter: str | None = None
    ) -> dict[str, Any]:
        """Generate a cost report for the given period.

        Args:
            period: One of "today", "week", "month", "all".
            tool_filter: Optional tool name to filter by.
        """
        if period not in VALID_PERIODS:
            valid = ", ".join(VALID_PERIODS)
            raise ValueError(f"Invalid period '{period}'. Must be one of: {valid}")

        if period == "today":
            start_date = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        elif period == "week":
            start_date = datetime.now() - timedelta(days=7)
        elif period == "month":
            start_date = datetime.now() - timedelta(days=30)
        else:
            start_date = datetime(1970, 1, 1)

        query = """
            SELECT date(timestamp) as date, tool_name, COUNT(*) as requests, SUM(cost_usd) as cost
            FROM requests
            WHERE timestamp >= ?
        """
        params: list[Any] = [start_date.strftime("%Y-%m-%d %H:%M:%S")]

        if tool_filter:
            query += " AND tool_name = ?"
            params.append(tool_filter)

        query += " GROUP BY date(timestamp), tool_name ORDER BY date DESC"

        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(query, params)
            rows = cursor.fetchall()

        total_cost = sum(row[3] for row in rows)
        total_requests = sum(row[2] for row in rows)

        return {
            "total_requests": total_requests,
            "total_cost_usd": round(total_cost, 6),
            "breakdown": [
                {
                    "date": row[0],
                    "tool": row[1],
                    "requests": row[2],
                    "cost_usd": round(row[3], 6),
                }
                for row in rows
            ],
        }

    def check_cost_limit(self, period: str, limit_usd: float) -> bool:
        """Check if spending is within the limit for the given period.

        Returns True if under limit, False if limit exceeded.
        """
        report = self.get_report(period)
        return report["total_cost_usd"] < limit_usd
