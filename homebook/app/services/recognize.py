"""Claude reads receipts and identifies products. Output is always a draft for the user to review."""
from __future__ import annotations

import base64
import io
import json
import logging

from PIL import Image

from ..config import settings
from .barcode import open_image

log = logging.getLogger("homebook.recognize")

MAX_EDGE = 1568  # Claude's recommended long edge; larger images are downscaled anyway.


class RecognitionError(Exception):
    pass


def prepare_image(data: bytes) -> bytes:
    """Upright, RGB, JPEG, at most MAX_EDGE on the long side."""
    img = open_image(data).convert("RGB")
    img.thumbnail((MAX_EDGE, MAX_EDGE), Image.Resampling.LANCZOS)
    out = io.BytesIO()
    img.save(out, format="JPEG", quality=88)
    return out.getvalue()


def category_menu(categories: list[dict]) -> str:
    lines = []
    for c in categories:
        label = f"{c['parent_name']} > {c['name']}" if c.get("parent_name") else c["name"]
        lines.append(f"{c['id']}: {label} ({c['kind']})")
    return "\n".join(lines)


RECEIPT_SCHEMA = {
    "type": "object",
    "properties": {
        "merchant": {"type": "string"},
        "date": {"type": "string"},
        "total_cents": {"type": "integer"},
        "tax_cents": {"type": "integer"},
        "lines": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "raw": {"type": "string"},
                    "description": {"type": "string"},
                    "brand": {"type": "string"},
                    "qty": {"type": "number"},
                    "amount_cents": {"type": "integer"},
                    "category_id": {"type": "integer"},
                },
                "required": ["raw", "description", "brand", "qty", "amount_cents", "category_id"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["merchant", "date", "total_cents", "tax_cents", "lines"],
    "additionalProperties": False,
}

RECEIPT_PROMPT = """This is a photo of a shopping receipt for a household budget app. Extract it.

- merchant: the store name as a person would say it ("Walmart", not "WAL*MART SUPERCENTER #1234").
- date: the purchase date as YYYY-MM-DD, or "" if you can't read it.
- total_cents: the final total paid, in integer cents. 0 if unreadable.
- tax_cents: total sales tax in cents, 0 if none. Don't include tax as a line.
- lines: one entry per purchased product, in receipt order.
  - raw: the line text exactly as printed.
  - description: a plain-English product name ("Great Value shampoo 12 oz" for "GV SHMP 12OZ").
  - brand: the brand if you can tell, else "".
  - qty: the quantity bought (1 unless the receipt shows more; use the weight for items sold by weight).
  - amount_cents: what was paid for the line after any coupon or discount printed under it. Fold discounts into the line they apply to rather than listing them separately.
  - category_id: the best id from the list below, or 0 if nothing fits.

Skip subtotal, tax, total, payment, change and loyalty-points lines.

Categories:
{categories}"""

PRODUCT_SCHEMA = {
    "type": "object",
    "properties": {
        "name": {"type": "string"},
        "brand": {"type": "string"},
        "size": {"type": "string"},
        "barcode": {"type": "string"},
        "category_id": {"type": "integer"},
        "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
    },
    "required": ["name", "brand", "size", "barcode", "category_id", "confidence"],
    "additionalProperties": False,
}

PRODUCT_PROMPT = """This is a photo of a household product. Identify it for a home inventory app.

- name: the product name without the brand ("Daily Moisture Shampoo").
- brand: the brand, or "" if you can't tell.
- size: the package size as printed ("12 fl oz"), or "".
- barcode: the barcode digits only if they're printed legibly in the photo, else "".
- category_id: the best id from the list below, or 0 if nothing fits.
- confidence: how sure you are of the name and brand.

Categories:
{categories}"""


def _client():
    import anthropic

    return anthropic.Anthropic(api_key=settings.anthropic_api_key, timeout=120.0, max_retries=2)


def _ask(image_jpeg: bytes, prompt: str, schema: dict) -> dict:
    import anthropic

    if not settings.ai_enabled:
        raise RecognitionError("Photo recognition is off. Set ANTHROPIC_API_KEY on the server.")
    try:
        response = _client().messages.create(
            model=settings.ai_model,
            max_tokens=16000,
            output_config={"format": {"type": "json_schema", "schema": schema}},
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg",
                                                 "data": base64.standard_b64encode(image_jpeg).decode("ascii")}},
                    {"type": "text", "text": prompt},
                ],
            }],
        )
    except anthropic.AuthenticationError as e:
        raise RecognitionError("The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.") from e
    except anthropic.RateLimitError as e:
        raise RecognitionError("Recognition is rate limited right now. Try again in a minute.") from e
    except anthropic.APIStatusError as e:
        log.warning("recognition failed: %s %s", e.status_code, e.message)
        raise RecognitionError(f"Recognition failed ({e.status_code}). Try again or enter it manually.") from e
    except anthropic.APIConnectionError as e:
        raise RecognitionError("Couldn't reach the recognition service. Check the server's internet connection.") from e

    if response.stop_reason == "refusal":
        raise RecognitionError("The photo couldn't be read. Enter it manually.")
    if response.stop_reason == "max_tokens":
        raise RecognitionError("The receipt was too long to read in one pass. Try photographing it in parts.")
    text = next((b.text for b in response.content if b.type == "text"), "")
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        raise RecognitionError("Recognition returned an unreadable answer. Try again.") from e


def read_receipt(image_jpeg: bytes, categories: list[dict]) -> dict:
    return _ask(image_jpeg, RECEIPT_PROMPT.format(categories=category_menu(categories)), RECEIPT_SCHEMA)


def identify_product(image_jpeg: bytes, categories: list[dict]) -> dict:
    return _ask(image_jpeg, PRODUCT_PROMPT.format(categories=category_menu(categories)), PRODUCT_SCHEMA)
