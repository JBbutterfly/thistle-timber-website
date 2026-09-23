"""Transactions: simple (one amount, one category) or itemized lines that feed the inventory ledger."""
from __future__ import annotations

import csv
import io
import sqlite3
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from ..auth import current_user
from ..db import get_conn
from ..services import barcode
from ..services.matching import learn_alias
from .common import categories, check_date, require_row
from .items import ItemIn, save_item

router = APIRouter(prefix="/api", tags=["transactions"], dependencies=[Depends(current_user)])

Source = Literal["manual", "barcode", "receipt", "photo", "recurring", "import"]


class NewItemIn(BaseModel):
    name: str
    brand: str | None = None
    upc: str | None = None
    category_id: int | None = None


class LineIn(BaseModel):
    item_id: int | None = None
    description: str | None = None
    raw: str | None = None
    qty: float = Field(default=1, gt=0)
    amount_cents: int
    category_id: int | None = None
    new_item: NewItemIn | None = None


class TransactionIn(BaseModel):
    tx_date: str
    merchant: str | None = None
    amount_cents: int | None = None
    category_id: int | None = None
    account_id: int | None = None
    source: Source = "manual"
    planned: bool = True
    note: str | None = None
    image_path: str | None = None
    lines: list[LineIn] | None = None


def _item_for_new(conn: sqlite3.Connection, n: NewItemIn, user_id: int) -> int:
    """Reuse a library item with the same barcode or name, else create one."""
    code = barcode.normalize_upc(n.upc)
    if code:
        r = conn.execute("SELECT id FROM items WHERE upc = ?", (code,)).fetchone()
        if r:
            return r["id"]
    r = conn.execute("SELECT id FROM items WHERE name = ? COLLATE NOCASE AND COALESCE(brand, '') = COALESCE(?, '') COLLATE NOCASE",
                     (n.name.strip(), (n.brand or "").strip() or None)).fetchone()
    if r:
        return r["id"]
    return save_item(conn, ItemIn(name=n.name, brand=n.brand, upc=code, category_id=n.category_id), user_id)


def _validate(conn: sqlite3.Connection, body: TransactionIn) -> str:
    tx_date = check_date(body.tx_date, "tx_date")
    if not tx_date:
        raise HTTPException(422, "Date is required")
    require_row(conn, "accounts", body.account_id, "account")
    require_row(conn, "categories", body.category_id, "category")
    if body.lines:
        for l in body.lines:
            require_row(conn, "items", l.item_id, "item")
            require_row(conn, "categories", l.category_id, "category")
            if l.new_item:
                require_row(conn, "categories", l.new_item.category_id, "category")
    else:
        if not body.amount_cents or body.amount_cents <= 0:
            raise HTTPException(422, "Enter an amount")
        if body.category_id is None:
            raise HTTPException(422, "Pick a category")
    return tx_date


def _write_lines(conn: sqlite3.Connection, tx_id: int, tx_date: str, lines: list[LineIn], user_id: int) -> None:
    for l in lines:
        item_id = l.item_id
        if not item_id and l.new_item and l.new_item.name.strip():
            item_id = _item_for_new(conn, l.new_item, user_id)
        line_id = conn.execute(
            "INSERT INTO transaction_lines (transaction_id, item_id, description, raw, qty, amount_cents, category_id) VALUES (?,?,?,?,?,?,?)",
            (tx_id, item_id, (l.description or "").strip() or None, l.raw, l.qty, l.amount_cents,
             None if item_id else l.category_id)).lastrowid
        if item_id:
            tracked = conn.execute("SELECT track_inventory FROM items WHERE id = ?", (item_id,)).fetchone()[0]
            if tracked:
                conn.execute("INSERT INTO inventory_events (item_id, line_id, kind, delta, event_date, user_id) VALUES (?,?,?,?,?,?)",
                             (item_id, line_id, "purchase", l.qty, tx_date, user_id))
            if l.raw:
                learn_alias(conn, l.raw, item_id)


def _save(conn: sqlite3.Connection, body: TransactionIn, user_id: int, tx_id: int | None = None) -> int:
    tx_date = _validate(conn, body)
    lines = body.lines or []
    amount = sum(l.amount_cents for l in lines) if lines else body.amount_cents
    values = (tx_date, (body.merchant or "").strip() or None, amount, body.category_id, body.account_id, body.source,
              int(body.planned), (body.note or "").strip() or None, body.image_path)
    if tx_id is None:
        tx_id = conn.execute(
            "INSERT INTO transactions (tx_date, merchant, amount_cents, category_id, account_id, source, planned, note, image_path, user_id) "
            "VALUES (?,?,?,?,?,?,?,?,?,?)", values + (user_id,)).lastrowid
    else:
        conn.execute(
            "UPDATE transactions SET tx_date=?, merchant=?, amount_cents=?, category_id=?, account_id=?, source=?, planned=?, note=?, "
            "image_path=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id=?", values + (tx_id,))
        # Lines are recreated; their purchase events cascade away with them.
        conn.execute("DELETE FROM transaction_lines WHERE transaction_id = ?", (tx_id,))
    _write_lines(conn, tx_id, tx_date, lines, user_id)
    return tx_id


def _get(conn: sqlite3.Connection, tx_id: int) -> dict:
    r = conn.execute(
        "SELECT t.id, t.tx_date AS date, t.merchant, t.amount_cents, t.category_id, c.name AS category_name, t.account_id, "
        "t.source, t.planned, t.note, t.image_path, t.recurring_id, t.user_id, u.name AS user_name, t.created_at, t.updated_at "
        "FROM transactions t LEFT JOIN categories c ON c.id = t.category_id LEFT JOIN users u ON u.id = t.user_id WHERE t.id = ?",
        (tx_id,)).fetchone()
    if not r:
        raise HTTPException(404, "Transaction not found")
    lines = [dict(x) for x in conn.execute(
        "SELECT l.id, l.item_id, i.name AS item_name, l.description, l.raw, l.qty, l.amount_cents, l.category_id "
        "FROM transaction_lines l LEFT JOIN items i ON i.id = l.item_id WHERE l.transaction_id = ? ORDER BY l.id", (tx_id,))]
    return {**dict(r), "planned": bool(r["planned"]), "lines": lines}


@router.get("/transactions")
def list_transactions(limit: int = 100, offset: int = 0, q: str | None = None, month: str | None = None,
                      conn: sqlite3.Connection = Depends(get_conn)):
    where, args = [], []
    if q:
        where.append("(t.merchant LIKE ? OR t.note LIKE ? OR EXISTS (SELECT 1 FROM transaction_lines l WHERE l.transaction_id = t.id AND l.description LIKE ?))")
        args += [f"%{q}%"] * 3
    if month:
        where.append("substr(t.tx_date, 1, 7) = ?")
        args.append(month)
    sql = ("SELECT t.id, t.tx_date AS date, t.merchant, t.amount_cents, t.category_id, c.name AS category_name, t.source, t.planned, "
           "u.name AS user_name, (SELECT COUNT(*) FROM transaction_lines l WHERE l.transaction_id = t.id) AS line_count "
           "FROM transactions t LEFT JOIN categories c ON c.id = t.category_id LEFT JOIN users u ON u.id = t.user_id")
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY t.tx_date DESC, t.id DESC LIMIT ? OFFSET ?"
    args += [max(1, min(limit, 1000)), max(0, offset)]
    return [{**dict(r), "planned": bool(r["planned"])} for r in conn.execute(sql, args)]


@router.get("/transactions/{tx_id}")
def get_transaction(tx_id: int, conn: sqlite3.Connection = Depends(get_conn)):
    return _get(conn, tx_id)


@router.post("/transactions")
def add_transaction(body: TransactionIn, user: dict = Depends(current_user), conn: sqlite3.Connection = Depends(get_conn)):
    tx_id = _save(conn, body, user["id"])
    conn.commit()
    return _get(conn, tx_id)


@router.put("/transactions/{tx_id}")
def update_transaction(tx_id: int, body: TransactionIn, user: dict = Depends(current_user), conn: sqlite3.Connection = Depends(get_conn)):
    _get(conn, tx_id)
    _save(conn, body, user["id"], tx_id)
    conn.commit()
    return _get(conn, tx_id)


@router.delete("/transactions/{tx_id}")
def delete_transaction(tx_id: int, conn: sqlite3.Connection = Depends(get_conn)):
    conn.execute("DELETE FROM transactions WHERE id = ?", (tx_id,))
    conn.commit()
    return {"ok": True}


@router.get("/export/transactions.csv")
def export_csv(conn: sqlite3.Connection = Depends(get_conn)):
    """One row per line item (a simple transaction is one row). Opens cleanly in Excel / Power Query."""
    cats = {c["id"]: c for c in categories(conn)}
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["transaction_id", "date", "merchant", "description", "item", "qty", "amount", "category", "parent_category",
                "kind", "paid_with", "source", "planned", "added_by", "note"])
    cur = conn.execute(
        "SELECT t.id, t.tx_date, t.merchant, l.description, i.name AS item, COALESCE(l.qty, 1) AS qty, "
        "COALESCE(l.amount_cents, t.amount_cents) AS amount_cents, "
        "CASE WHEN l.id IS NULL THEN t.category_id ELSE COALESCE(l.category_id, i.category_id, t.category_id) END AS category_id, "
        "a.name AS account, t.source, t.planned, u.name AS user_name, t.note "
        "FROM transactions t LEFT JOIN transaction_lines l ON l.transaction_id = t.id LEFT JOIN items i ON i.id = l.item_id "
        "LEFT JOIN accounts a ON a.id = t.account_id LEFT JOIN users u ON u.id = t.user_id ORDER BY t.tx_date, t.id, l.id")
    for r in cur:
        c = cats.get(r["category_id"])
        w.writerow([r["id"], r["tx_date"], r["merchant"] or "", r["description"] or "", r["item"] or "", f"{r['qty']:g}",
                    f"{r['amount_cents'] / 100:.2f}", c["name"] if c else "", (c["parent_name"] or "") if c else "",
                    c["kind"] if c else "expense", r["account"] or "", r["source"], "yes" if r["planned"] else "no",
                    r["user_name"] or "", r["note"] or ""])
    return Response("﻿" + out.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": 'attachment; filename="homebook-transactions.csv"'})
