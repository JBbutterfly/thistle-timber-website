"""Match receipt lines and product names to the item library: UPC, learned alias, name, then fuzzy."""
from __future__ import annotations

import re
import sqlite3
from difflib import SequenceMatcher

from .barcode import normalize_upc

FUZZY_THRESHOLD = 0.8


def norm(s: str | None) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^A-Z0-9]+", " ", (s or "").upper())).strip()


class Library:
    """Items and aliases loaded once so a whole receipt can be matched cheaply."""

    def __init__(self, conn: sqlite3.Connection):
        self.items = [dict(r) for r in conn.execute("SELECT id, name, brand, upc FROM items")]
        self.by_upc = {i["upc"]: i["id"] for i in self.items if i["upc"]}
        self.aliases = {r["alias"]: r["item_id"] for r in conn.execute("SELECT alias, item_id FROM item_aliases")}
        self.names: list[tuple[str, int]] = []
        for i in self.items:
            self.names.append((norm(i["name"]), i["id"]))
            if i["brand"]:
                self.names.append((norm(f"{i['brand']} {i['name']}"), i["id"]))

    def match(self, description: str | None = None, raw: str | None = None, upc: str | None = None) -> tuple[int | None, dict | None]:
        code = normalize_upc(upc) if upc else None
        if code and code in self.by_upc:
            return self.by_upc[code], {"how": "upc", "score": 1.0}
        for text in (raw, description):
            if text and norm(text) in self.aliases:
                return self.aliases[norm(text)], {"how": "alias", "score": 1.0}
        d = norm(description)
        for name, item_id in self.names:
            if d and d == name:
                return item_id, {"how": "name", "score": 1.0}
        best, best_id = 0.0, None
        for text in (d, norm(raw)):
            if not text:
                continue
            candidates = self.names + list(self.aliases.items())
            for name, item_id in candidates:
                score = SequenceMatcher(None, text, name).ratio()
                if score > best:
                    best, best_id = score, item_id
        if best_id is not None and best >= FUZZY_THRESHOLD:
            return best_id, {"how": "fuzzy", "score": round(best, 2)}
        return None, None


def learn_alias(conn: sqlite3.Connection, text: str | None, item_id: int) -> None:
    """Remember a receipt spelling so the next receipt matches it exactly."""
    key = norm(text)
    if len(key) >= 3:
        conn.execute("INSERT OR REPLACE INTO item_aliases (alias, item_id) VALUES (?, ?)", (key, item_id))
