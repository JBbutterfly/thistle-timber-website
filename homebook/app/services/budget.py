"""Budget math: recurring normalization, the monthly summary, trends, and NPER."""
from __future__ import annotations

import calendar
import math
import sqlite3
from datetime import date

# Payments per year for each recurring frequency.
PER_YEAR = {"weekly": 52, "biweekly": 26, "semimonthly": 24, "monthly": 12, "quarterly": 4, "semiannual": 2, "annual": 1}

# The one spend resolver. Each dollar gets its category from the line, then the
# line's item, then the transaction. Transactions without lines count whole.
SPEND_SQL = """
SELECT t.id AS tx_id, t.tx_date AS date, t.planned, t.source, t.recurring_id,
       l.amount_cents AS amount_cents,
       COALESCE(l.category_id, i.category_id, t.category_id) AS category_id
  FROM transactions t
  JOIN transaction_lines l ON l.transaction_id = t.id
  LEFT JOIN items i ON i.id = l.item_id
UNION ALL
SELECT t.id, t.tx_date, t.planned, t.source, t.recurring_id, t.amount_cents, t.category_id
  FROM transactions t
 WHERE NOT EXISTS (SELECT 1 FROM transaction_lines l WHERE l.transaction_id = t.id)
"""

# SPEND_SQL rows with their top-level category and kind (uncategorized = expense).
RESOLVED_SQL = f"""
SELECT s.*, COALESCE(c.parent_id, c.id) AS top_id, COALESCE(c.kind, 'expense') AS kind
  FROM ({SPEND_SQL}) s LEFT JOIN categories c ON c.id = s.category_id
"""


def normalize(amount_cents: int, frequency: str) -> dict:
    """A recurring amount expressed per year, month, week and day (integer cents)."""
    annual = amount_cents * PER_YEAR[frequency]
    return {
        "annual": annual,
        "monthly": round(annual / 12),
        "weekly": round(annual / 52),
        "daily": round(annual / 365),
    }


def month_bounds(month: str) -> tuple[str, str, int]:
    y, m = (int(x) for x in month.split("-"))
    days = calendar.monthrange(y, m)[1]
    return f"{month}-01", f"{month}-{days:02d}", days


def shift_month(month: str, delta: int) -> str:
    y, m = (int(x) for x in month.split("-"))
    idx = y * 12 + (m - 1) + delta
    return f"{idx // 12:04d}-{idx % 12 + 1:02d}"


def spend_rows(conn: sqlite3.Connection, start: str, end: str) -> list[dict]:
    cur = conn.execute(f"SELECT * FROM ({RESOLVED_SQL}) WHERE date BETWEEN ? AND ?", (start, end))
    return [dict(r) for r in cur.fetchall()]


def effective_budgets(conn: sqlite3.Connection, month: str) -> dict[int, int]:
    """category_id -> budget for this month (a month override beats the every-month value)."""
    out: dict[int, int] = {}
    for r in conn.execute("SELECT category_id, month, amount_cents FROM budgets WHERE month IN ('', ?) ORDER BY month", (month,)):
        out[r["category_id"]] = r["amount_cents"]
    return out


def recurring_totals(conn: sqlite3.Connection) -> dict:
    tot = {"annual": 0, "monthly": 0, "weekly": 0, "daily": 0}
    discretionary = 0
    for r in conn.execute(
        "SELECT r.amount_cents, r.frequency, r.essential FROM recurring r "
        "LEFT JOIN categories c ON c.id = r.category_id WHERE r.active = 1 AND COALESCE(c.kind, 'expense') != 'income'"
    ):
        n = normalize(r["amount_cents"], r["frequency"])
        for k in tot:
            tot[k] += n[k]
        if not r["essential"]:
            discretionary += n["annual"]
    return {**tot, "discretionary_annual": discretionary}


def fixed_category_ids(conn: sqlite3.Connection) -> set[int]:
    return {r[0] for r in conn.execute("SELECT DISTINCT category_id FROM recurring WHERE active = 1 AND fixed = 1 AND category_id IS NOT NULL")}


def month_summary(conn: sqlite3.Connection, month: str, today: date | None = None) -> dict:
    today = today or date.today()
    start, end, days_in_month = month_bounds(month)
    current = today.strftime("%Y-%m")
    days_elapsed = days_in_month if month < current else today.day if month == current else 0

    rows = spend_rows(conn, start, end)
    fixed_cats = fixed_category_ids(conn)
    expenses = income = savings = fixed = unplanned = 0
    by_top: dict[int | None, int] = {}
    for r in rows:
        amt = r["amount_cents"]
        by_top[r["top_id"]] = by_top.get(r["top_id"], 0) + amt
        if r["kind"] == "income":
            income += amt
        elif r["kind"] == "savings":
            savings += amt
        else:
            expenses += amt
            if r["source"] == "recurring" or r["category_id"] in fixed_cats:
                fixed += amt
            if not r["planned"]:
                unplanned += amt
    variable = expenses - fixed

    # Fixed bills aren't extrapolated; only day-to-day spending is scaled by pace.
    if month == current and 0 < days_elapsed < days_in_month:
        projected = fixed + round(variable * days_in_month / days_elapsed)
    else:
        projected = expenses
    avg_daily = round(variable / days_elapsed) if days_elapsed else 0

    budgets = effective_budgets(conn, month)
    cats = [dict(r) for r in conn.execute("SELECT id, name, parent_id, kind, sort FROM categories ORDER BY sort, name")]
    categories = []
    for top in (c for c in cats if c["parent_id"] is None):
        budget = budgets.get(top["id"], 0) + sum(budgets.get(c["id"], 0) for c in cats if c["parent_id"] == top["id"])
        actual = by_top.get(top["id"], 0)
        categories.append({"category_id": top["id"], "name": top["name"], "kind": top["kind"], "actual": actual,
                           "budget": budget, "over": bool(budget) and actual > budget})
    if by_top.get(None):
        categories.append({"category_id": None, "name": "Uncategorized", "kind": "expense", "actual": by_top[None], "budget": 0, "over": False})

    rec = recurring_totals(conn)
    return {
        "month": month,
        "days_in_month": days_in_month,
        "days_elapsed": days_elapsed,
        "expenses": expenses,
        "income": income,
        "savings": savings,
        "net": income - expenses - savings,
        "fixed_expenses": fixed,
        "variable_expenses": variable,
        "unplanned_expenses": unplanned,
        "projected_month_spend": projected,
        "avg_daily_spend": avg_daily,
        "avg_weekly_spend": avg_daily * 7,
        "budget_expense_total": sum(c["budget"] for c in categories if c["kind"] == "expense"),
        "categories": categories,
        "recurring": {k: rec[k] for k in ("annual", "monthly", "weekly", "daily")},
        "recurring_discretionary_annual": rec["discretionary_annual"],
    }


def trend(conn: sqlite3.Connection, months: int = 6, end_month: str | None = None) -> list[dict]:
    end_month = end_month or date.today().strftime("%Y-%m")
    out = []
    for i in range(months - 1, -1, -1):
        m = shift_month(end_month, -i)
        start, end, _ = month_bounds(m)
        tot = {"expense": 0, "income": 0, "savings": 0}
        for r in conn.execute(f"SELECT kind, SUM(amount_cents) AS s FROM ({RESOLVED_SQL}) WHERE date BETWEEN ? AND ? GROUP BY kind", (start, end)):
            tot[r["kind"]] = r["s"] or 0
        out.append({"month": m, "expenses": tot["expense"], "income": tot["income"], "savings": tot["savings"]})
    return out


def payoff_months(balance_cents: int, apr: float, payment_cents: int) -> float | None:
    """Months to pay off a balance, like Excel's NPER(rate/12, -pmt, pv). None if it never pays off."""
    if balance_cents <= 0:
        return 0.0
    if payment_cents <= 0:
        return None
    r = apr / 100 / 12
    if r == 0:
        return balance_cents / payment_cents
    if payment_cents <= r * balance_cents:
        return None
    return -math.log(1 - r * balance_cents / payment_cents) / math.log(1 + r)


def debt_view(d: dict) -> dict:
    base = payoff_months(d["balance_cents"], d["apr"], d["min_payment_cents"])
    total_pay = d["min_payment_cents"] + (d["extra_payment_cents"] or 0)
    with_extra = payoff_months(d["balance_cents"], d["apr"], total_pay)
    saved = base - with_extra if d["extra_payment_cents"] and base is not None and with_extra is not None else None
    return {
        **d,
        "monthly_interest_cents": round(d["balance_cents"] * d["apr"] / 100 / 12),
        "payoff_months": with_extra,
        "payoff_months_min_only": base,
        "months_saved_by_extra": saved,
    }
