"""Small helpers shared by the routers."""
from __future__ import annotations

import re
import sqlite3
from datetime import date

from fastapi import HTTPException

MONTH_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


def today() -> date:
    return date.today()


def check_date(s: str | None, field: str = "date") -> str | None:
    if s in (None, ""):
        return None
    try:
        return date.fromisoformat(s).isoformat()
    except ValueError:
        raise HTTPException(422, f"{field} must be YYYY-MM-DD") from None


def check_month(s: str | None) -> str:
    if not s:
        return today().strftime("%Y-%m")
    if not MONTH_RE.match(s):
        raise HTTPException(422, "month must be YYYY-MM")
    return s


def require_row(conn: sqlite3.Connection, table: str, row_id: int | None, label: str | None = None) -> None:
    """422 when a referenced id doesn't exist (table names are internal constants)."""
    if row_id is None:
        return
    if not conn.execute(f"SELECT 1 FROM {table} WHERE id = ?", (row_id,)).fetchone():
        raise HTTPException(422, f"Unknown {label or table.rstrip('s')} {row_id}")


def categories(conn: sqlite3.Connection) -> list[dict]:
    """All categories, parents first then their children, with parent_name."""
    cur = conn.execute(
        "SELECT c.id, c.name, c.parent_id, p.name AS parent_name, c.kind, c.sort "
        "FROM categories c LEFT JOIN categories p ON p.id = c.parent_id "
        "ORDER BY COALESCE(p.sort, c.sort), COALESCE(p.id, c.id), c.parent_id IS NOT NULL, c.sort, c.name"
    )
    return [dict(r) for r in cur.fetchall()]


def money(cents: int | float | None, exact: bool = False) -> str:
    cents = int(round(cents or 0))
    sign = "-" if cents < 0 else ""
    cents = abs(cents)
    if exact or cents < 1000:
        return f"{sign}${cents / 100:,.2f}"
    return f"{sign}${round(cents / 100):,}"
