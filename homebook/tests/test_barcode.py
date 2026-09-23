import io

import barcode as pybarcode
from barcode.writer import ImageWriter

from app.routers import recognize as recognize_router
from app.services.barcode import decode, normalize_upc


def ean13_png(digits: str) -> bytes:
    out = io.BytesIO()
    pybarcode.get("ean13", digits, writer=ImageWriter()).write(out, options={"write_text": False})
    return out.getvalue()


def test_normalize_upc():
    assert normalize_upc("036000291452") == "0036000291452"
    assert normalize_upc(" 4006381333931 ") == "4006381333931"
    assert normalize_upc("ABC-123") == "ABC-123"
    assert normalize_upc("") is None


def test_decodes_a_photo_on_the_server():
    codes = decode(ean13_png("400638133393"))
    assert codes and codes[0]["text"] == "4006381333931"


def test_decode_endpoint_finds_library_item(client):
    client.post("/api/items", json={"name": "Pencils", "upc": "4006381333931"})
    r = client.post("/api/barcode/decode", files={"image": ("b.png", ean13_png("400638133393"), "image/png")}).json()
    assert r["result"]["item"]["name"] == "Pencils"
    blank = client.post("/api/barcode/decode", files={"image": ("x.png", _blank_png(), "image/png")}).json()
    assert blank == {"codes": [], "result": None}
    assert client.post("/api/barcode/decode", files={"image": ("x.png", b"nope", "image/png")}).status_code == 422


def test_product_photo_uses_claude_only_without_a_known_barcode(client, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "anthropic_api_key", "test-key")
    calls = []

    def fake_identify(jpeg, cats):
        calls.append(len(jpeg))
        return {"name": "Daily Moisture Shampoo", "brand": "Acme", "size": "12 fl oz", "barcode": "",
                "category_id": 0, "confidence": "high"}

    monkeypatch.setattr(recognize_router, "identify_product", fake_identify)

    # A known barcode never reaches Claude.
    client.post("/api/items", json={"name": "Pencils", "upc": "4006381333931"})
    r = client.post("/api/recognize/product", files={"image": ("b.png", ean13_png("400638133393"), "image/png")}).json()
    assert r["item"]["name"] == "Pencils" and calls == []

    # No barcode: Claude suggests, and nothing is saved until the user confirms.
    r = client.post("/api/recognize/product", files={"image": ("p.png", _blank_png(), "image/png")}).json()
    assert calls and r["item"] is None
    assert r["suggestion"]["brand"] == "Acme" and r["suggestion"]["category_id"] is None
    assert len(client.get("/api/items").json()) == 1
    assert client.get(f"/api/uploads/{r['image_path']}").status_code == 200


def _blank_png() -> bytes:
    from PIL import Image

    out = io.BytesIO()
    Image.new("RGB", (400, 300), "white").save(out, format="PNG")
    return out.getvalue()
