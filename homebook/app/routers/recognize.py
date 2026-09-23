"""Receipt and product photos. Results are drafts: nothing here writes transactions or items."""
from __future__ import annotations

import re
import secrets
import sqlite3

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse

from ..auth import current_user
from ..config import settings
from ..db import get_conn
from ..services import barcode
from ..services.matching import Library
from ..services.recognize import RecognitionError, identify_product, prepare_image, read_receipt
from .common import categories, check_date, today
from .items import find_by_upc, get_item, read_image

router = APIRouter(prefix="/api", tags=["recognize"], dependencies=[Depends(current_user)])

UPLOAD_RE = re.compile(r"^[a-f0-9]{24}\.jpg$")
STRONG_MATCH = 0.9


def save_upload(jpeg: bytes) -> str:
    settings.uploads_dir.mkdir(parents=True, exist_ok=True)
    name = f"{secrets.token_hex(12)}.jpg"
    (settings.uploads_dir / name).write_bytes(jpeg)
    return name


async def _prepare(data: bytes) -> bytes:
    try:
        return await run_in_threadpool(prepare_image, data)
    except Exception as e:  # Pillow raises several types for non-images
        raise HTTPException(422, "That file isn't a readable image") from e


def _require_ai() -> None:
    if not settings.ai_enabled:
        raise HTTPException(503, "Photo recognition is off. Set ANTHROPIC_API_KEY on the server.")


def build_receipt_draft(conn: sqlite3.Connection, parsed: dict, cats: list[dict]) -> dict:
    """Turn Claude's reading into an editable draft, matched against the item library."""
    valid_cats = {c["id"] for c in cats}
    lib = Library(conn)
    item_cat = {r["id"]: r["category_id"] for r in conn.execute("SELECT id, category_id FROM items")}
    lines = []
    for p in parsed.get("lines", []):
        amount = int(p.get("amount_cents") or 0)
        if not amount:
            continue
        description = (p.get("description") or p.get("raw") or "").strip()
        item_id, match = lib.match(description=description, raw=p.get("raw"))
        cat = p.get("category_id") if p.get("category_id") in valid_cats else None
        lines.append({
            "item_id": item_id, "match": match, "description": description, "raw": (p.get("raw") or "").strip() or None,
            "brand": (p.get("brand") or "").strip() or None, "qty": p.get("qty") or 1, "amount_cents": amount,
            "category_id": None if item_id else cat, "_cat": item_cat.get(item_id) if item_id else cat,
        })
    tax = int(parsed.get("tax_cents") or 0)
    if tax > 0:
        # File tax under the category that got the most spending on this receipt.
        by_cat: dict[int, int] = {}
        for l in lines:
            if l["_cat"]:
                by_cat[l["_cat"]] = by_cat.get(l["_cat"], 0) + l["amount_cents"]
        tax_cat = max(by_cat, key=by_cat.get) if by_cat else None
        lines.append({"item_id": None, "match": None, "description": "Sales tax", "raw": None, "brand": None,
                      "qty": 1, "amount_cents": tax, "category_id": tax_cat, "_cat": tax_cat})
    for l in lines:
        del l["_cat"]

    try:
        tx_date = check_date(parsed.get("date") or None) or today().isoformat()
    except HTTPException:
        tx_date = today().isoformat()
    if tx_date > today().isoformat():
        tx_date = today().isoformat()
    total = int(parsed.get("total_cents") or 0) or None
    line_sum = sum(l["amount_cents"] for l in lines)
    return {
        "draft": {"tx_date": tx_date, "merchant": (parsed.get("merchant") or "").strip() or None,
                  "source": "receipt", "planned": True, "lines": lines},
        "receipt_total_cents": total,
        "mismatch_cents": (line_sum - total) if total else 0,
    }


@router.post("/recognize/receipt")
async def recognize_receipt(image: UploadFile = File(...), conn: sqlite3.Connection = Depends(get_conn)):
    _require_ai()
    jpeg = await _prepare(await read_image(image))
    cats = categories(conn)
    try:
        parsed = await run_in_threadpool(read_receipt, jpeg, cats)
    except RecognitionError as e:
        raise HTTPException(502, str(e)) from e
    result = build_receipt_draft(conn, parsed, cats)
    return {**result, "image_path": save_upload(jpeg)}


@router.post("/recognize/product")
async def recognize_product(image: UploadFile = File(...), conn: sqlite3.Connection = Depends(get_conn)):
    """Barcode first, on this server. Claude only sees the photo when no known barcode is found."""
    data = await read_image(image)
    try:
        codes = await run_in_threadpool(barcode.decode, data)
    except Exception as e:
        raise HTTPException(422, "That file isn't a readable image") from e
    upc = barcode.normalize_upc(codes[0]["text"]) if codes else None

    if upc:
        item = find_by_upc(conn, upc)
        if item:
            return {"item": item, "upc": upc, "suggestion": None, "image_path": None}
        found = await run_in_threadpool(barcode.lookup_product, upc) if settings.product_lookup else None
        if found:
            jpeg = await _prepare(data)
            return {"item": None, "upc": upc, "image_path": save_upload(jpeg),
                    "suggestion": {**found, "category_id": None, "confidence": None}}

    if not settings.ai_enabled:
        if upc:
            return {"item": None, "upc": upc, "suggestion": None, "image_path": save_upload(await _prepare(data))}
        raise HTTPException(503, "No barcode found, and photo recognition is off.")

    jpeg = await _prepare(data)
    cats = categories(conn)
    try:
        p = await run_in_threadpool(identify_product, jpeg, cats)
    except RecognitionError as e:
        raise HTTPException(502, str(e)) from e

    if not upc and p.get("barcode"):
        upc = barcode.normalize_upc("".join(ch for ch in p["barcode"] if ch.isdigit())) or None
        item = find_by_upc(conn, upc) if upc else None
        if item:
            return {"item": item, "upc": upc, "suggestion": None, "image_path": None}
    item_id, match = Library(conn).match(description=" ".join(x for x in (p.get("brand"), p.get("name")) if x))
    if item_id and match and match["score"] >= STRONG_MATCH:
        return {"item": get_item(conn, item_id), "upc": upc, "suggestion": None, "image_path": None}

    valid_cats = {c["id"] for c in cats}
    suggestion = {"name": (p.get("name") or "").strip(), "brand": (p.get("brand") or "").strip() or None,
                  "size": (p.get("size") or "").strip() or None,
                  "category_id": p.get("category_id") if p.get("category_id") in valid_cats else None,
                  "confidence": p.get("confidence"), "source": "Claude"}
    return {"item": None, "upc": upc, "suggestion": suggestion, "image_path": save_upload(jpeg)}


@router.get("/uploads/{name}")
def get_upload(name: str):
    if not UPLOAD_RE.match(name):
        raise HTTPException(404, "Not found")
    path = settings.uploads_dir / name
    if not path.is_file():
        raise HTTPException(404, "Not found")
    return FileResponse(path, media_type="image/jpeg")
