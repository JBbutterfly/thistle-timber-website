"""Monthly summary, spending trend, and "gaps & opportunities" insights."""
from __future__ import annotations

import sqlite3
from datetime import date, timedelta

from fastapi import APIRouter, Depends

from ..auth import current_user
from ..db import get_conn
from ..services.budget import debt_view, month_bounds, month_summary, shift_month, spend_rows, trend
from ..services.forecast import inventory
from .common import check_month, money, today

router = APIRouter(prefix="/api/reports", tags=["reports"], dependencies=[Depends(current_user)])

CREEP_RATIO = 1.25     # flag a category 25% above its 3-month average...
CREEP_MIN_CENTS = 2500  # ...when the difference is at least $25
UNPLANNED_SHARE = 0.2


@router.get("/summary")
def summary(month: str | None = None, conn: sqlite3.Connection = Depends(get_conn)):
    return month_summary(conn, check_month(month), today())


@router.get("/trend")
def spending_trend(months: int = 6, conn: sqlite3.Connection = Depends(get_conn)):
    return trend(conn, max(1, min(months, 36)), today().strftime("%Y-%m"))


def _short(iso: str) -> str:
    d = date.fromisoformat(iso)
    return f"{d:%b} {d.day}"  # no %-d: it isn't portable to Windows


def _three_month_average(conn: sqlite3.Connection, month: str) -> dict[int | None, float]:
    start, _, _ = month_bounds(shift_month(month, -3))
    _, end, _ = month_bounds(shift_month(month, -1))
    totals: dict[int | None, int] = {}
    months_seen: set[str] = set()
    for r in spend_rows(conn, start, end):
        if r["kind"] == "expense":
            totals[r["top_id"]] = totals.get(r["top_id"], 0) + r["amount_cents"]
            months_seen.add(r["date"][:7])
    n = len(months_seen)
    return {k: v / n for k, v in totals.items()} if n else {}


def build_insights(conn: sqlite3.Connection, month: str, now: date) -> list[dict]:
    s = month_summary(conn, month, now)
    is_current = month == now.strftime("%Y-%m")
    out: list[dict] = []

    def add(level: str, text: str) -> None:
        out.append({"level": level, "text": text})

    expense_cats = [c for c in s["categories"] if c["kind"] == "expense"]

    for c in sorted((c for c in expense_cats if c["over"]), key=lambda c: c["budget"] - c["actual"]):
        add("warn", f"{c['name']} is {money(c['actual'] - c['budget'])} over its {money(c['budget'])} budget.")

    budget = s["budget_expense_total"]
    if is_current and budget and s["days_elapsed"] >= 3:
        diff = s["projected_month_spend"] - budget
        if diff > 0:
            add("warn", f"On pace to spend {money(s['projected_month_spend'])} this month, {money(diff)} over budget.")
        elif -diff >= budget * 0.05:
            add("good", f"On pace to finish {money(-diff)} under budget.")

    avg = _three_month_average(conn, month)
    for c in expense_cats:
        base = avg.get(c["category_id"], 0)
        if base and c["actual"] > base * CREEP_RATIO and c["actual"] - base >= CREEP_MIN_CENTS:
            pct = round(100 * (c["actual"] - base) / base)
            add("warn", f"{c['name']} is up {pct}% on your 3-month average ({money(c['actual'])} vs. {money(base)}).")

    if s["expenses"] and s["unplanned_expenses"] / s["expenses"] >= UNPLANNED_SHARE:
        pct = round(100 * s["unplanned_expenses"] / s["expenses"])
        add("warn", f"{pct}% of spending this month was unplanned ({money(s['unplanned_expenses'])}).")

    if s["recurring_discretionary_annual"]:
        add("info", f"Discretionary subscriptions cost {money(s['recurring_discretionary_annual'])} a year "
                    f"({money(s['recurring_discretionary_annual'] / 12)} a month). Worth a review?")

    if is_current:
        week = (now + timedelta(days=7)).isoformat()
        due = [dict(r) for r in conn.execute(
            "SELECT name, amount_cents, next_due FROM recurring WHERE active = 1 AND next_due IS NOT NULL AND next_due <= ? "
            "ORDER BY next_due", (week,))]
        if due:
            parts = [f"{d['name']} {money(d['amount_cents'])} ({'overdue' if d['next_due'] < now.isoformat() else _short(d['next_due'])})" for d in due[:5]]
            add("info", "Bills due this week: " + ", ".join(parts) + ("…" if len(due) > 5 else "") + ".")

        stock = inventory(conn, now)
        low = [f for f in stock if f["status"] in ("out", "low")]
        if low:
            names = ", ".join(f["name"] for f in low[:4]) + ("…" if len(low) > 4 else "")
            add("warn", f"{len(low)} item{'s' if len(low) != 1 else ''} low or out: {names}.")
        costly = sorted((f for f in stock if f["monthly_cost"]), key=lambda f: -f["monthly_cost"])[:3]
        if costly:
            add("info", "Costliest consumables: " + ", ".join(f"{f['name']} ({money(f['monthly_cost'])}/mo)" for f in costly) + ".")

    debts = [debt_view(dict(r)) for r in conn.execute(
        "SELECT id, name, balance_cents, apr, min_payment_cents, extra_payment_cents FROM debts WHERE balance_cents > 0 AND apr > 0 "
        "ORDER BY apr DESC LIMIT 1")]
    if debts:
        d = debts[0]
        add("info", f"Highest-rate debt: {d['name']} at {d['apr']:g}% APR, about {money(d['monthly_interest_cents'])} a month in interest. "
                    "Extra payments save the most there.")

    if s["income"] and s["net"] > 0 and not is_current:
        add("good", f"{money(s['net'])} was left to invest after spending and savings.")
    elif s["income"] and s["net"] > 0:
        add("good", f"{money(s['net'])} left to invest so far this month.")
    return out


@router.get("/insights")
def insights(month: str | None = None, conn: sqlite3.Connection = Depends(get_conn)):
    return build_insights(conn, check_month(month), today())
