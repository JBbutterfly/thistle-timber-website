"""Categories, payment accounts, budgets, recurring bills and debts."""
from __future__ import annotations

import calendar
import sqlite3
from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..auth import current_user
from ..db import get_conn
from ..services.budget import debt_view, normalize
from .common import categories, check_date, check_month, require_row, today

router = APIRouter(prefix="/api", tags=["core"], dependencies=[Depends(current_user)])

Frequency = Literal["weekly", "biweekly", "semimonthly", "monthly", "quarterly", "semiannual", "annual"]


# ---------------- categories & accounts ----------------

class NewCategory(BaseModel):
    name: str
    parent_id: int | None = None
    kind: Literal["expense", "income", "savings"] = "expense"


@router.get("/categories")
def list_categories(conn: sqlite3.Connection = Depends(get_conn)):
    return categories(conn)


@router.post("/categories")
def add_category(body: NewCategory, conn: sqlite3.Connection = Depends(get_conn)):
    name = body.name.strip()
    if not name:
        raise HTTPException(422, "Name is required")
    kind = body.kind
    if body.parent_id is not None:
        parent = conn.execute("SELECT id, parent_id, kind FROM categories WHERE id = ?", (body.parent_id,)).fetchone()
        if not parent:
            raise HTTPException(422, "Unknown parent category")
        if parent["parent_id"] is not None:
            raise HTTPException(422, "Categories go two levels deep; pick a top-level parent")
        kind = parent["kind"]
    dupe = conn.execute("SELECT 1 FROM categories WHERE name = ? COLLATE NOCASE AND parent_id IS ?", (name, body.parent_id)).fetchone()
    if dupe:
        raise HTTPException(409, "That category already exists")
    sort = conn.execute("SELECT COALESCE(MAX(sort), -1) + 1 FROM categories WHERE parent_id IS ?", (body.parent_id,)).fetchone()[0]
    cid = conn.execute("INSERT INTO categories (name, parent_id, kind, sort) VALUES (?,?,?,?)", (name, body.parent_id, kind, sort)).lastrowid
    conn.commit()
    return next(c for c in categories(conn) if c["id"] == cid)


class NewAccount(BaseModel):
    name: str


@router.get("/accounts")
def list_accounts(conn: sqlite3.Connection = Depends(get_conn)):
    return [dict(r) for r in conn.execute("SELECT id, name FROM accounts ORDER BY id")]


@router.post("/accounts")
def add_account(body: NewAccount, conn: sqlite3.Connection = Depends(get_conn)):
    name = body.name.strip()
    if not name:
        raise HTTPException(422, "Name is required")
    try:
        aid = conn.execute("INSERT INTO accounts (name) VALUES (?)", (name,)).lastrowid
    except sqlite3.IntegrityError:
        raise HTTPException(409, "That payment method already exists") from None
    conn.commit()
    return {"id": aid, "name": name}


# ---------------- budgets ----------------

class BudgetIn(BaseModel):
    category_id: int
    amount_cents: int = Field(ge=0)
    month: str | None = None  # None = every month


@router.get("/budgets")
def list_budgets(conn: sqlite3.Connection = Depends(get_conn)):
    return [{"category_id": r["category_id"], "month": r["month"] or None, "amount_cents": r["amount_cents"]}
            for r in conn.execute("SELECT category_id, month, amount_cents FROM budgets ORDER BY month, category_id")]


@router.put("/budgets")
def set_budget(body: BudgetIn, conn: sqlite3.Connection = Depends(get_conn)):
    require_row(conn, "categories", body.category_id, "category")
    month = check_month(body.month) if body.month else ""
    if body.amount_cents == 0:
        conn.execute("DELETE FROM budgets WHERE category_id = ? AND month = ?", (body.category_id, month))
    else:
        conn.execute("INSERT INTO budgets (category_id, month, amount_cents) VALUES (?,?,?) "
                     "ON CONFLICT (category_id, month) DO UPDATE SET amount_cents = excluded.amount_cents",
                     (body.category_id, month, body.amount_cents))
    conn.commit()
    return {"category_id": body.category_id, "month": month or None, "amount_cents": body.amount_cents}


# ---------------- recurring bills & subscriptions ----------------

class RecurringIn(BaseModel):
    name: str
    amount_cents: int = Field(gt=0)
    frequency: Frequency = "monthly"
    category_id: int | None = None
    account_id: int | None = None
    next_due: str | None = None
    fixed: bool = True
    essential: bool = True
    active: bool = True


def _add_months(d: date, n: int) -> date:
    idx = d.year * 12 + d.month - 1 + n
    y, m = idx // 12, idx % 12 + 1
    return date(y, m, min(d.day, calendar.monthrange(y, m)[1]))


def advance(d: date, frequency: str) -> date:
    """The next due date after d."""
    if frequency == "weekly":
        return d + timedelta(days=7)
    if frequency == "biweekly":
        return d + timedelta(days=14)
    if frequency == "semimonthly":  # e.g. the 1st and 16th
        if d.day <= 15:
            return d.replace(day=min(d.day + 15, calendar.monthrange(d.year, d.month)[1]))
        return _add_months(d.replace(day=1), 1).replace(day=max(1, d.day - 15))
    return _add_months(d, {"monthly": 1, "quarterly": 3, "semiannual": 6, "annual": 12}[frequency])


def _recurring_view(r) -> dict:
    d = dict(r)
    for k in ("fixed", "essential", "active"):
        d[k] = bool(d[k])
    return {**d, **normalize(d["amount_cents"], d["frequency"])}


def _check_recurring(conn, body: RecurringIn) -> RecurringIn:
    body.name = body.name.strip()
    if not body.name:
        raise HTTPException(422, "Name is required")
    require_row(conn, "categories", body.category_id, "category")
    require_row(conn, "accounts", body.account_id, "account")
    body.next_due = check_date(body.next_due, "next_due")
    return body


@router.get("/recurring")
def list_recurring(conn: sqlite3.Connection = Depends(get_conn)):
    return [_recurring_view(r) for r in conn.execute(
        "SELECT * FROM recurring ORDER BY active DESC, COALESCE(next_due, '9999'), name")]


@router.post("/recurring")
def add_recurring(body: RecurringIn, user: dict = Depends(current_user), conn: sqlite3.Connection = Depends(get_conn)):
    body = _check_recurring(conn, body)
    rid = conn.execute(
        "INSERT INTO recurring (name, amount_cents, frequency, category_id, account_id, next_due, fixed, essential, active, created_by) "
        "VALUES (?,?,?,?,?,?,?,?,?,?)",
        (body.name, body.amount_cents, body.frequency, body.category_id, body.account_id, body.next_due,
         int(body.fixed), int(body.essential), int(body.active), user["id"])).lastrowid
    conn.commit()
    return _recurring_view(conn.execute("SELECT * FROM recurring WHERE id = ?", (rid,)).fetchone())


@router.put("/recurring/{rid}")
def update_recurring(rid: int, body: RecurringIn, conn: sqlite3.Connection = Depends(get_conn)):
    require_row(conn, "recurring", rid, "bill")
    body = _check_recurring(conn, body)
    conn.execute(
        "UPDATE recurring SET name=?, amount_cents=?, frequency=?, category_id=?, account_id=?, next_due=?, fixed=?, essential=?, active=? WHERE id=?",
        (body.name, body.amount_cents, body.frequency, body.category_id, body.account_id, body.next_due,
         int(body.fixed), int(body.essential), int(body.active), rid))
    conn.commit()
    return _recurring_view(conn.execute("SELECT * FROM recurring WHERE id = ?", (rid,)).fetchone())


@router.delete("/recurring/{rid}")
def delete_recurring(rid: int, conn: sqlite3.Connection = Depends(get_conn)):
    conn.execute("DELETE FROM recurring WHERE id = ?", (rid,))
    conn.commit()
    return {"ok": True}


@router.post("/recurring/{rid}/post")
def post_recurring(rid: int, user: dict = Depends(current_user), conn: sqlite3.Connection = Depends(get_conn)):
    """Record a payment today and roll the due date forward one period."""
    r = conn.execute("SELECT * FROM recurring WHERE id = ?", (rid,)).fetchone()
    if not r:
        raise HTTPException(404, "Bill not found")
    paid_on = today()
    tx_id = conn.execute(
        "INSERT INTO transactions (tx_date, merchant, amount_cents, category_id, account_id, source, planned, recurring_id, user_id) "
        "VALUES (?,?,?,?,?,'recurring',1,?,?)",
        (paid_on.isoformat(), r["name"], r["amount_cents"], r["category_id"], r["account_id"], rid, user["id"])).lastrowid
    base = date.fromisoformat(r["next_due"]) if r["next_due"] else paid_on
    next_due = advance(base, r["frequency"]).isoformat()
    conn.execute("UPDATE recurring SET next_due = ? WHERE id = ?", (next_due, rid))
    conn.commit()
    return {"transaction_id": tx_id, "next_due": next_due}


# ---------------- debts ----------------

class DebtIn(BaseModel):
    name: str
    balance_cents: int = Field(ge=0)
    apr: float = Field(ge=0, le=100)
    min_payment_cents: int = Field(ge=0)
    extra_payment_cents: int = Field(default=0, ge=0)


def _check_debt(body: DebtIn) -> DebtIn:
    body.name = body.name.strip()
    if not body.name:
        raise HTTPException(422, "Name is required")
    return body


def _debt(conn, did: int) -> dict:
    return debt_view(dict(conn.execute(
        "SELECT id, name, balance_cents, apr, min_payment_cents, extra_payment_cents FROM debts WHERE id = ?", (did,)).fetchone()))


@router.get("/debts")
def list_debts(conn: sqlite3.Connection = Depends(get_conn)):
    return [debt_view(dict(r)) for r in conn.execute(
        "SELECT id, name, balance_cents, apr, min_payment_cents, extra_payment_cents FROM debts ORDER BY apr DESC, balance_cents DESC")]


@router.post("/debts")
def add_debt(body: DebtIn, conn: sqlite3.Connection = Depends(get_conn)):
    body = _check_debt(body)
    did = conn.execute("INSERT INTO debts (name, balance_cents, apr, min_payment_cents, extra_payment_cents) VALUES (?,?,?,?,?)",
                       (body.name, body.balance_cents, body.apr, body.min_payment_cents, body.extra_payment_cents)).lastrowid
    conn.commit()
    return _debt(conn, did)


@router.put("/debts/{did}")
def update_debt(did: int, body: DebtIn, conn: sqlite3.Connection = Depends(get_conn)):
    require_row(conn, "debts", did, "debt")
    body = _check_debt(body)
    conn.execute("UPDATE debts SET name=?, balance_cents=?, apr=?, min_payment_cents=?, extra_payment_cents=? WHERE id=?",
                 (body.name, body.balance_cents, body.apr, body.min_payment_cents, body.extra_payment_cents, did))
    conn.commit()
    return _debt(conn, did)


@router.delete("/debts/{did}")
def delete_debt(did: int, conn: sqlite3.Connection = Depends(get_conn)):
    conn.execute("DELETE FROM debts WHERE id = ?", (did,))
    conn.commit()
    return {"ok": True}
