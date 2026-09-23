"""SQLite access: one connection per request, schema + seed data on first use."""
from __future__ import annotations

import sqlite3
import threading
from pathlib import Path
from typing import Iterator

from .config import settings

SCHEMA = Path(__file__).with_name("schema.sql")

# (parent, kind, children)
SEED_CATEGORIES = [
    ("Housing", "expense", ["Mortgage / rent", "Utilities", "Internet & phone", "Home maintenance", "Property tax & insurance"]),
    ("Transportation", "expense", ["Car payment", "Fuel", "Car insurance", "Car maintenance", "Registration"]),
    ("Food", "expense", ["Groceries", "Dining out", "Coffee & snacks"]),
    ("Household", "expense", ["Cleaning & paper", "Toiletries & personal care", "Supplements & health"]),
    ("Health", "expense", ["Medical", "Pharmacy", "Dental & vision"]),
    ("Debt payments", "expense", ["Student loans", "Credit card"]),
    ("Subscriptions", "expense", ["Streaming", "Memberships", "Software"]),
    ("Kids", "expense", ["Childcare", "School", "Activities"]),
    ("Personal", "expense", ["Clothing", "Entertainment", "Gifts", "Travel"]),
    ("Income", "income", ["Paycheck", "Other income"]),
    ("Savings & investing", "savings", ["Retirement", "Brokerage", "Emergency fund"]),
]
SEED_ACCOUNTS = ["Cash", "Debit card", "Credit card"]

_init_lock = threading.Lock()
_initialized: set[str] = set()


def connect(path: Path | None = None) -> sqlite3.Connection:
    path = Path(path or settings.db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, check_same_thread=False, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 10000")
    key = str(path.resolve())
    if key not in _initialized:
        with _init_lock:
            if key not in _initialized:
                init_db(conn)
                _initialized.add(key)
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    conn.execute("PRAGMA journal_mode = WAL")
    conn.executescript(SCHEMA.read_text(encoding="utf-8"))
    if not conn.execute("SELECT 1 FROM categories LIMIT 1").fetchone():
        for i, (parent, kind, children) in enumerate(SEED_CATEGORIES):
            pid = conn.execute("INSERT INTO categories (name, kind, sort) VALUES (?,?,?)", (parent, kind, i)).lastrowid
            for j, child in enumerate(children):
                conn.execute("INSERT INTO categories (name, parent_id, kind, sort) VALUES (?,?,?,?)", (child, pid, kind, j))
    if not conn.execute("SELECT 1 FROM accounts LIMIT 1").fetchone():
        conn.executemany("INSERT INTO accounts (name) VALUES (?)", [(a,) for a in SEED_ACCOUNTS])
    conn.commit()


def get_conn() -> Iterator[sqlite3.Connection]:
    """FastAPI dependency: a fresh connection per request, always closed."""
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()


def rows(cur) -> list[dict]:
    return [dict(r) for r in cur.fetchall()]
