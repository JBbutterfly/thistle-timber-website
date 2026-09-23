from datetime import date

import pytest

from app.routers.core import advance
from app.services.budget import month_summary, normalize, payoff_months, shift_month, trend


def add_tx(conn, day, amount, category_id=None, source="manual", planned=True, lines=()):
    tx = conn.execute("INSERT INTO transactions (tx_date, amount_cents, category_id, source, planned) VALUES (?,?,?,?,?)",
                      (day, amount, category_id, source, int(planned))).lastrowid
    for item_id, line_cat, amt in lines:
        conn.execute("INSERT INTO transaction_lines (transaction_id, item_id, amount_cents, category_id) VALUES (?,?,?,?)",
                     (tx, item_id, amt, line_cat))
    conn.commit()
    return tx


def test_normalize_frequencies():
    assert normalize(1000, "monthly") == {"annual": 12000, "monthly": 1000, "weekly": 231, "daily": 33}
    assert normalize(1000, "weekly")["annual"] == 52000
    assert normalize(1000, "biweekly")["monthly"] == 2167
    assert normalize(13900, "annual")["monthly"] == 1158


def test_payoff_matches_excel_nper():
    # =NPER(5%/12, -200, 10000) in Excel is 56.18
    assert payoff_months(1_000_000, 5, 20_000) == pytest.approx(56.18, abs=0.01)
    assert payoff_months(120_000, 0, 10_000) == 12
    assert payoff_months(0, 20, 5000) == 0
    # A payment that doesn't cover the monthly interest never pays off.
    assert payoff_months(1_000_000, 24, 20_000) is None


def test_fixed_bills_are_not_extrapolated(conn, cat):
    conn.execute("INSERT INTO recurring (name, amount_cents, frequency, category_id, fixed) VALUES ('Mortgage', 150000, 'monthly', ?, 1)",
                 (cat("Mortgage / rent"),))
    add_tx(conn, "2026-09-01", 150000, cat("Mortgage / rent"))
    add_tx(conn, "2026-09-05", 30000, cat("Groceries"))
    s = month_summary(conn, "2026-09", today=date(2026, 9, 10))
    assert s["expenses"] == 180000
    assert s["fixed_expenses"] == 150000
    # 30 days in September, 10 elapsed: only the $300 of groceries is scaled.
    assert s["projected_month_spend"] == 150000 + 90000
    assert s["avg_daily_spend"] == 3000
    assert s["avg_weekly_spend"] == 21000


def test_spend_resolver_line_then_item_then_transaction(conn, cat):
    item = conn.execute("INSERT INTO items (name, category_id) VALUES ('Shampoo', ?)", (cat("Toiletries & personal care"),)).lastrowid
    add_tx(conn, "2026-08-03", 0, cat("Groceries"), lines=[
        (None, cat("Dining out"), 1000),  # line category wins
        (item, None, 700),                # then the item's category
        (None, None, 300),                # then the transaction's
    ])
    s = month_summary(conn, "2026-08", today=date(2026, 9, 1))
    by = {c["name"]: c["actual"] for c in s["categories"]}
    assert by["Food"] == 1300
    assert by["Household"] == 700
    assert s["expenses"] == 2000


def test_budgets_add_up_and_flag_overspend(conn, cat):
    conn.execute("INSERT INTO budgets (category_id, amount_cents) VALUES (?, 50000)", (cat("Groceries"),))
    conn.execute("INSERT INTO budgets (category_id, amount_cents) VALUES (?, 20000)", (cat("Dining out"),))
    add_tx(conn, "2026-08-10", 80000, cat("Groceries"))
    s = month_summary(conn, "2026-08", today=date(2026, 9, 1))
    food = next(c for c in s["categories"] if c["name"] == "Food")
    assert food["budget"] == 70000 and food["actual"] == 80000 and food["over"]
    assert s["budget_expense_total"] == 70000


def test_income_savings_and_net(conn, cat):
    add_tx(conn, "2026-08-01", 500000, cat("Paycheck"))
    add_tx(conn, "2026-08-02", 50000, cat("Retirement"))
    add_tx(conn, "2026-08-03", 120000, cat("Groceries"), planned=False)
    s = month_summary(conn, "2026-08", today=date(2026, 9, 1))
    assert (s["income"], s["savings"], s["expenses"]) == (500000, 50000, 120000)
    assert s["net"] == 330000
    assert s["unplanned_expenses"] == 120000
    t = trend(conn, 3, "2026-09")
    assert [x["month"] for x in t] == ["2026-07", "2026-08", "2026-09"]
    assert t[1]["expenses"] == 120000


def test_month_math_and_due_dates():
    assert shift_month("2026-01", -1) == "2025-12"
    assert shift_month("2026-11", 3) == "2027-02"
    assert advance(date(2026, 1, 31), "monthly") == date(2026, 2, 28)
    assert advance(date(2026, 9, 1), "semimonthly") == date(2026, 9, 16)
    assert advance(date(2026, 9, 16), "semimonthly") == date(2026, 10, 1)
    assert advance(date(2026, 9, 1), "biweekly") == date(2026, 9, 15)
    assert advance(date(2026, 3, 15), "annual") == date(2027, 3, 15)
