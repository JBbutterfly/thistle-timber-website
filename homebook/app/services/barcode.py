"""Barcode decoding on this server (zxing-cpp) and product-name lookup on Open*Facts."""
from __future__ import annotations

import io
import logging

import httpx
from PIL import Image, ImageOps

log = logging.getLogger("homebook.barcode")

# Open Food Facts and its sister databases. Only the barcode number is sent.
LOOKUP_SOURCES = [
    ("Open Food Facts", "https://world.openfoodfacts.org"),
    ("Open Beauty Facts", "https://world.openbeautyfacts.org"),
    ("Open Products Facts", "https://world.openproductsfacts.org"),
]
USER_AGENT = "Homebook/0.1 (self-hosted household app)"


def normalize_upc(code: str | None) -> str | None:
    """Canonical form for storage and lookup: 12-digit UPC-A becomes 13-digit EAN-13."""
    if code is None:
        return None
    code = "".join(str(code).split())
    if not code:
        return None
    if code.isdigit() and len(code) == 12:
        return "0" + code
    return code


def open_image(data: bytes) -> Image.Image:
    img = Image.open(io.BytesIO(data))
    return ImageOps.exif_transpose(img)


def decode(data: bytes) -> list[dict]:
    """All barcodes found in a photo, trying a few variants that help phone pictures."""
    import zxingcpp

    img = open_image(data).convert("L")
    variants = [img]
    if max(img.size) > 1600:
        small = img.copy()
        small.thumbnail((1600, 1600))
        variants.append(small)
    variants.append(img.rotate(90, expand=True))
    variants.append(ImageOps.autocontrast(img))

    seen: dict[str, dict] = {}
    for v in variants:
        for r in zxingcpp.read_barcodes(v):
            if r.text and r.text not in seen:
                seen[r.text] = {"text": r.text, "format": r.format.name}
        if seen:
            break
    return list(seen.values())


def lookup_product(upc: str, timeout: float = 4.0) -> dict | None:
    """Name, brand and size for an unknown barcode, or None when no database knows it."""
    codes = [upc]
    if len(upc) == 13 and upc.startswith("0"):
        codes.append(upc[1:])
    with httpx.Client(timeout=timeout, headers={"User-Agent": USER_AGENT}) as client:
        for source, base in LOOKUP_SOURCES:
            for code in codes:
                try:
                    r = client.get(f"{base}/api/v2/product/{code}.json", params={"fields": "product_name,brands,quantity"})
                    if r.status_code != 200:
                        continue
                    data = r.json()
                except (httpx.HTTPError, ValueError) as e:
                    log.info("lookup failed on %s: %s", source, e)
                    continue
                p = data.get("product") or {}
                if data.get("status") == 1 and p.get("product_name"):
                    brand = (p.get("brands") or "").split(",")[0].strip()
                    return {"name": p["product_name"].strip(), "brand": brand or None,
                            "size": (p.get("quantity") or "").strip() or None, "source": source}
    return None
