"""Item library, barcode lookup/decoding, and the inventory ledger."""
from __future__ import annotations

import sqlite3
from typing import Literal

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from ..auth import current_user
from ..config import settings
from ..db import get_conn
from ..services import barcode
from ..services.forecast import ITEM_SQL, inventory, item_forecast, shopping_list
from .common import require_row, today

router = APIRouter(prefix="/api", tags=["items"], dependencies=[Depends(current_user)])


class ItemIn(BaseModel):
    name: str
    brand: str | None = None
    upc: str | None = None
    category_id: int | None = None
    unit: str = "each"
    track_inventory: bool = True
    reorder_days: int = Field(default=7, ge=0, le=365)
    min_qty: float = Field(default=0, ge=0)
    notes: str | None = None
    image_path: str | None = None


def get_item(conn: sqlite3.Connection, item_id: int) -> dict:
    r = conn.execute(ITEM_SQL + " WHERE i.id = ?", (item_id,)).fetchone()
    if not r:
        raise HTTPException(404, "Item not found")
    d = dict(r)
    d["track_inventory"] = bool(d["track_inventory"])
    return d


def find_by_upc(conn: sqlite3.Connection, upc: str | None) -> dict | None:
    code = barcode.normalize_upc(upc)
    if not code:
        return None
    r = conn.execute("SELECT id FROM items WHERE upc = ?", (code,)).fetchone()
    return get_item(conn, r["id"]) if r else None


def save_item(conn: sqlite3.Connection, body: ItemIn, user_id: int | None, item_id: int | None = None) -> int:
    """Insert or update an item. Does not commit."""
    name = body.name.strip()
    if not name:
        raise HTTPException(422, "Item name is required")
    require_row(conn, "categories", body.category_id, "category")
    values = (name, (body.brand or "").strip() or None, barcode.normalize_upc(body.upc), body.category_id,
              (body.unit or "each").strip() or "each", int(body.track_inventory), body.reorder_days, body.min_qty,
              (body.notes or "").strip() or None)
    try:
        if item_id is None:
            return conn.execute(
                "INSERT INTO items (name, brand, upc, category_id, unit, track_inventory, reorder_days, min_qty, notes, image_path, created_by) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?)", values + (body.image_path, user_id)).lastrowid
        conn.execute("UPDATE items SET name=?, brand=?, upc=?, category_id=?, unit=?, track_inventory=?, reorder_days=?, min_qty=?, notes=?, "
                     "image_path=COALESCE(?, image_path) WHERE id=?", values + (body.image_path, item_id))
        return item_id
    except sqlite3.IntegrityError:
        raise HTTPException(409, "Another item already has that barcode") from None


@router.get("/items")
def list_items(q: str | None = None, conn: sqlite3.Connection = Depends(get_conn)):
    sql, args = ITEM_SQL, []
    if q:
        sql += " WHERE i.name LIKE ? OR i.brand LIKE ? OR i.upc = ?"
        args = [f"%{q}%", f"%{q}%", barcode.normalize_upc(q)]
    out = [dict(r) for r in conn.execute(sql + " ORDER BY i.name COLLATE NOCASE", args)]
    for d in out:
        d["track_inventory"] = bool(d["track_inventory"])
    return out


@router.post("/items")
def add_item(body: ItemIn, user: dict = Depends(current_user), conn: sqlite3.Connection = Depends(get_conn)):
    item_id = save_item(conn, body, user["id"])
    conn.commit()
    return get_item(conn, item_id)


@router.get("/items/{item_id}")
def item_detail(item_id: int, conn: sqlite3.Connection = Depends(get_conn)):
    item = get_item(conn, item_id)
    prices = [dict(r) for r in conn.execute(
        "SELECT t.tx_date AS date, t.merchant, l.qty, l.amount_cents FROM transaction_lines l "
        "JOIN transactions t ON t.id = l.transaction_id WHERE l.item_id = ? ORDER BY t.tx_date DESC, l.id DESC LIMIT 20", (item_id,))]
    history = [dict(r) for r in conn.execute(
        "SELECT e.kind, e.delta, e.event_date AS date, e.note, u.name AS user_name FROM inventory_events e "
        "LEFT JOIN users u ON u.id = e.user_id WHERE e.item_id = ? ORDER BY e.event_date DESC, e.id DESC LIMIT 50", (item_id,))]
    for h in history:
        h["delta"] = int(h["delta"]) if h["delta"] == int(h["delta"]) else h["delta"]
    return {**item, "forecast": item_forecast(conn, item), "prices": prices, "history": history}


@router.put("/items/{item_id}")
def update_item(item_id: int, body: ItemIn, conn: sqlite3.Connection = Depends(get_conn)):
    get_item(conn, item_id)
    save_item(conn, body, None, item_id)
    conn.commit()
    return get_item(conn, item_id)


@router.delete("/items/{item_id}")
def delete_item(item_id: int, conn: sqlite3.Connection = Depends(get_conn)):
    """Deletes the item and its stock history. Past transaction lines keep their amounts."""
    conn.execute("DELETE FROM items WHERE id = ?", (item_id,))
    conn.commit()
    return {"ok": True}


# ---------------- barcodes ----------------

def barcode_result(conn: sqlite3.Connection, code: str) -> dict:
    upc = barcode.normalize_upc(code)
    if not upc:
        raise HTTPException(422, "Empty barcode")
    item = find_by_upc(conn, upc)
    suggestion = None
    if not item and settings.product_lookup:
        suggestion = barcode.lookup_product(upc)
    return {"upc": upc, "item": item, "suggestion": suggestion}


@router.get("/barcode/{code}")
def barcode_lookup(code: str, conn: sqlite3.Connection = Depends(get_conn)):
    return barcode_result(conn, code)


async def read_image(image: UploadFile) -> bytes:
    data = await image.read(settings.max_upload_bytes + 1)
    if len(data) > settings.max_upload_bytes:
        raise HTTPException(413, "That photo is too large (15 MB max)")
    if not data:
        raise HTTPException(422, "No photo received")
    return data


def _decode(data: bytes) -> list[dict]:
    try:
        return barcode.decode(data)
    except Exception as e:  # Pillow raises several types for non-images
        raise HTTPException(422, "That file isn't a readable image") from e


@router.post("/barcode/decode")
async def barcode_decode(image: UploadFile = File(...), conn: sqlite3.Connection = Depends(get_conn)):
    """Find barcodes in a photo on this server; nothing is sent anywhere."""
    data = await read_image(image)
    codes = await run_in_threadpool(_decode, data)
    result = await run_in_threadpool(barcode_result, conn, codes[0]["text"]) if codes else None
    return {"codes": codes, "result": result}


# ---------------- inventory ----------------

class EventIn(BaseModel):
    item_id: int
    delta: float
    kind: Literal["use", "adjust", "purchase"] = "use"
    note: str | None = None


class CountIn(BaseModel):
    item_id: int
    on_hand: float = Field(ge=0)


@router.get("/inventory")
def list_inventory(conn: sqlite3.Connection = Depends(get_conn)):
    return inventory(conn)


@router.get("/inventory/shopping-list")
def list_shopping(days: int = 7, conn: sqlite3.Connection = Depends(get_conn)):
    return shopping_list(conn, max(0, min(days, 365)))


@router.post("/inventory/events")
def add_event(body: EventIn, user: dict = Depends(current_user), conn: sqlite3.Connection = Depends(get_conn)):
    item = get_item(conn, body.item_id)
    # "use" always subtracts, whatever sign the client sent.
    delta = -abs(body.delta) if body.kind == "use" else body.delta
    if delta == 0:
        raise HTTPException(422, "delta can't be zero")
    conn.execute("INSERT INTO inventory_events (item_id, kind, delta, event_date, note, user_id) VALUES (?,?,?,?,?,?)",
                 (item["id"], body.kind, delta, today().isoformat(), body.note, user["id"]))
    conn.commit()
    return item_forecast(conn, item)


@router.post("/inventory/count")
def set_count(body: CountIn, user: dict = Depends(current_user), conn: sqlite3.Connection = Depends(get_conn)):
    """Record a physical count as the difference from what the ledger says."""
    item = get_item(conn, body.item_id)
    current = conn.execute("SELECT COALESCE(SUM(delta), 0) FROM inventory_events WHERE item_id = ?", (item["id"],)).fetchone()[0]
    delta = round(body.on_hand - current, 4)
    if delta:
        conn.execute("INSERT INTO inventory_events (item_id, kind, delta, event_date, note, user_id) VALUES (?,?,?,?,?,?)",
                     (item["id"], "count", delta, today().isoformat(), f"counted {body.on_hand:g}", user["id"]))
        conn.commit()
    return item_forecast(conn, item)
