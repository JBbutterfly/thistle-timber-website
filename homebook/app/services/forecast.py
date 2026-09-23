"""Inventory forecasting from the ledger: on hand, burn rate, days left, cost per month."""
from __future__ import annotations

import sqlite3
from datetime import date, timedelta

WINDOW_DAYS = 180
DAYS_PER_MONTH = 30.4
STATUS_ORDER = {"out": 0, "low": 1, "ok": 2, "learning": 3}


def _d(s: str) -> date:
    return date.fromisoformat(s[:10])


def _num(x: float) -> float | int:
    x = round(x, 2)
    return int(x) if x == int(x) else x


def daily_rate(events: list[dict], today: date | None = None) -> tuple[float | None, str | None]:
    """Units used per day: the higher of logged use and buying cadence over the last 180 days.

    Taking the higher rate means a forgotten "used one up" tap suggests reordering
    early rather than letting you run out. Returns (None, None) while still learning.
    """
    today = today or date.today()
    start = today - timedelta(days=WINDOW_DAYS)
    recent = [e for e in events if _d(e["event_date"]) >= start]

    candidates: list[tuple[float, str]] = []

    purchases = [e for e in recent if e["kind"] == "purchase" and e["delta"] > 0]
    if len({e["event_date"][:10] for e in purchases}) >= 2:
        first = min(_d(e["event_date"]) for e in purchases)
        last = max(_d(e["event_date"]) for e in purchases)
        span = (last - first).days
        if span > 0:
            candidates.append((sum(e["delta"] for e in purchases) / span, "cadence"))

    # "Used one up" taps, plus physical counts that came in lower than the ledger.
    uses = [e for e in recent if e["kind"] in ("use", "count") and e["delta"] < 0]
    if len(uses) >= 2:
        first_seen = min(_d(e["event_date"]) for e in recent)
        span = max(1, (today - first_seen).days)
        candidates.append((sum(-e["delta"] for e in uses) / span, "usage"))

    if not candidates:
        return None, None
    rate, method = max(candidates)
    return rate, method


def item_forecast(conn: sqlite3.Connection, item: dict, today: date | None = None) -> dict:
    today = today or date.today()
    events = [dict(r) for r in conn.execute(
        "SELECT kind, delta, event_date FROM inventory_events WHERE item_id = ? ORDER BY event_date, id", (item["id"],))]
    on_hand = sum(e["delta"] for e in events)
    rate, method = daily_rate(events, today)

    price = conn.execute(
        "SELECT SUM(amount_cents) AS amt, SUM(qty) AS qty FROM transaction_lines WHERE item_id = ? AND qty > 0", (item["id"],)
    ).fetchone()
    unit_cost = round(price["amt"] / price["qty"]) if price["qty"] else None

    days_left = runs_out_on = reorder_on = None
    if rate:
        days_left = max(0.0, on_hand / rate)
        runs_out = today + timedelta(days=int(days_left))
        runs_out_on = runs_out.isoformat()
        reorder_on = max(today, runs_out - timedelta(days=item["reorder_days"] or 0)).isoformat()

    min_qty = item.get("min_qty") or 0
    if not events:
        status = "learning"
    elif on_hand <= 0:
        status = "out"
    elif (min_qty and on_hand < min_qty) or (days_left is not None and days_left < (item["reorder_days"] or 0)):
        status = "low"
    elif rate is None:
        status = "learning"
    else:
        status = "ok"

    return {
        "item_id": item["id"],
        "id": item["id"],
        "name": item["name"],
        "brand": item.get("brand"),
        "unit": item.get("unit") or "each",
        "category_name": item.get("category_name"),
        "on_hand": _num(on_hand),
        "daily_rate": rate,
        "rate_method": method,
        "days_left": days_left,
        "runs_out_on": runs_out_on,
        "reorder_on": reorder_on,
        "unit_cost": unit_cost,
        "monthly_cost": round(rate * unit_cost * DAYS_PER_MONTH) if rate and unit_cost else None,
        "status": status,
    }


ITEM_SQL = ("SELECT i.*, c.name AS category_name FROM items i "
            "LEFT JOIN categories c ON c.id = i.category_id")


def inventory(conn: sqlite3.Connection, today: date | None = None) -> list[dict]:
    items = [dict(r) for r in conn.execute(ITEM_SQL + " WHERE i.track_inventory = 1")]
    out = [item_forecast(conn, it, today) for it in items]
    out.sort(key=lambda f: (STATUS_ORDER[f["status"]], f["days_left"] if f["days_left"] is not None else 1e9, f["name"].lower()))
    return out


def shopping_list(conn: sqlite3.Connection, days: int = 7, today: date | None = None) -> list[dict]:
    """Tracked items that are out, low, or due for reorder within `days`."""
    today = today or date.today()
    horizon = (today + timedelta(days=days)).isoformat()
    return [f for f in inventory(conn, today)
            if f["status"] in ("out", "low") or (f["reorder_on"] and f["reorder_on"] <= horizon)]
