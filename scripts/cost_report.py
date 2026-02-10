#!/usr/bin/env python3
"""CLI cost report for grove-coder usage."""

import sqlite3
import sys
from datetime import datetime
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "grove_coder.db"


def main() -> None:
    if not DB_PATH.exists():
        print("No database found. Run grove-coder first to generate usage data.")
        sys.exit(0)

    with sqlite3.connect(str(DB_PATH)) as conn:
        cursor = conn.cursor()

        print("=== grove-coder Cost Report ===\n")

        # Today's costs
        cursor.execute("""
            SELECT tool_name, COUNT(*), SUM(cost_usd)
            FROM requests
            WHERE date(timestamp) = date('now')
            GROUP BY tool_name
        """)
        today = cursor.fetchall()

        print(f"Today ({datetime.now().date()}):")
        if today:
            for tool, count, cost in today:
                print(f"  {tool}: {count} requests, ${cost:.6f}")
        else:
            print("  No requests today.")

        # This month
        cursor.execute("""
            SELECT SUM(cost_usd), COUNT(*)
            FROM requests
            WHERE strftime('%Y-%m', timestamp) = strftime('%Y-%m', 'now')
        """)
        row = cursor.fetchone()
        month_cost = row[0] or 0.0
        month_count = row[1] or 0
        print(f"\nThis Month: {month_count} requests, ${month_cost:.6f}")

        # All time
        cursor.execute("SELECT SUM(cost_usd), COUNT(*) FROM requests")
        row = cursor.fetchone()
        total_cost = row[0] or 0.0
        total_count = row[1] or 0
        print(f"All Time:   {total_count} requests, ${total_cost:.6f}")


if __name__ == "__main__":
    main()
