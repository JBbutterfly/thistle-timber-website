from datetime import date

from app.config import settings
from app.routers.recognize import build_receipt_draft
from app.routers.common import categories
from app.services.matching import Library

from .conftest import ADMIN

TODAY = date.today().isoformat()


def cat_id(client, name):
    return next(c["id"] for c in client.get("/api/categories").json() if c["name"] == name)


def test_setup_login_and_session(anon):
    assert anon.get("/api/setup-status").json() == {"needs_setup": True}
    assert anon.get("/api/me").status_code == 401
    assert anon.post("/api/setup", json=ADMIN).status_code == 200
    assert anon.post("/api/setup", json={**ADMIN, "username": "other"}).status_code == 409
    me = anon.get("/api/me").json()
    assert me["is_admin"] is True and me["ai_enabled"] is False
    anon.post("/api/logout")
    assert anon.get("/api/me").status_code == 401
    assert anon.post("/api/login", json={"username": "alex", "password": "wrong password"}).status_code == 401
    assert anon.post("/api/login", json={"username": "ALEX", "password": ADMIN["password"]}).status_code == 200
    assert anon.get("/api/categories").status_code == 200


def test_members_are_not_admins(client):
    assert client.post("/api/users", json={"name": "Sam", "username": "sam", "password": "short"}).status_code == 422
    assert client.post("/api/users", json={"name": "Sam", "username": "sam", "password": "sam-password"}).status_code == 200
    assert client.post("/api/users", json={"name": "Sam", "username": "SAM", "password": "sam-password"}).status_code == 409
    client.post("/api/logout")
    client.post("/api/login", json={"username": "sam", "password": "sam-password"})
    assert client.post("/api/users", json={"name": "X", "username": "x1", "password": "12345678"}).status_code == 403
    assert client.post("/api/backup").status_code == 403
    assert len(client.get("/api/users").json()) == 2


def test_password_change_signs_out(client):
    assert client.post("/api/me/password", json={"current": "nope", "new": "new-password"}).status_code == 403
    assert client.post("/api/me/password", json={"current": ADMIN["password"], "new": "new-password"}).status_code == 200
    assert client.get("/api/me").status_code == 401
    assert client.post("/api/login", json={"username": "alex", "password": "new-password"}).status_code == 200


def test_simple_transaction_and_summary(client):
    groceries = cat_id(client, "Groceries")
    assert client.post("/api/transactions", json={"tx_date": TODAY, "amount_cents": 4250}).status_code == 422
    r = client.post("/api/transactions", json={"tx_date": TODAY, "merchant": "Aldi", "amount_cents": 4250, "category_id": groceries})
    assert r.status_code == 200
    tx = r.json()
    assert tx["amount_cents"] == 4250 and tx["user_name"] == "Alex" and tx["lines"] == []
    listed = client.get("/api/transactions?q=ald").json()
    assert [t["id"] for t in listed] == [tx["id"]]
    s = client.get(f"/api/reports/summary?month={TODAY[:7]}").json()
    assert s["expenses"] == 4250
    assert next(c for c in s["categories"] if c["name"] == "Food")["actual"] == 4250


def test_itemized_purchase_builds_stock_and_edits_rebuild_it(client):
    body = {"tx_date": TODAY, "merchant": "Target", "source": "receipt", "lines": [
        {"description": "Shampoo", "raw": "GV SHMP 12OZ", "qty": 2, "amount_cents": 998,
         "new_item": {"name": "Shampoo", "brand": "Great Value", "category_id": cat_id(client, "Toiletries & personal care")}},
        {"description": "Bananas", "qty": 1, "amount_cents": 150, "category_id": cat_id(client, "Groceries")},
    ]}
    tx = client.post("/api/transactions", json=body).json()
    assert tx["amount_cents"] == 1148
    item_id = tx["lines"][0]["item_id"]
    assert item_id and tx["lines"][1]["item_id"] is None
    assert client.get(f"/api/items/{item_id}").json()["forecast"]["on_hand"] == 2

    # Editing recreates the lines and their purchase events.
    body["lines"][0] = {"item_id": item_id, "description": "Shampoo", "qty": 3, "amount_cents": 1497}
    client.put(f"/api/transactions/{tx['id']}", json=body)
    detail = client.get(f"/api/items/{item_id}").json()
    assert detail["forecast"]["on_hand"] == 3
    assert detail["prices"][0]["amount_cents"] == 1497

    client.delete(f"/api/transactions/{tx['id']}")
    assert client.get(f"/api/items/{item_id}").json()["forecast"]["on_hand"] == 0


def test_receipt_spellings_are_learned(client, conn):
    client.post("/api/transactions", json={"tx_date": TODAY, "lines": [
        {"description": "Oat milk", "raw": "OATLY OAT BEV 64", "amount_cents": 499, "new_item": {"name": "Oat milk"}}]})
    item_id, match = Library(conn).match(description="something else", raw="OATLY OAT BEV 64")
    assert item_id and match["how"] == "alias"


def test_use_and_count(client):
    item = client.post("/api/items", json={"name": "Coffee beans"}).json()
    client.post("/api/transactions", json={"tx_date": TODAY, "lines": [{"item_id": item["id"], "qty": 3, "amount_cents": 3600}]})
    f = client.post("/api/inventory/events", json={"item_id": item["id"], "delta": 1, "kind": "use"}).json()
    assert f["on_hand"] == 2
    f = client.post("/api/inventory/count", json={"item_id": item["id"], "on_hand": 0.5}).json()
    assert f["on_hand"] == 0.5
    kinds = [h["kind"] for h in client.get(f"/api/items/{item['id']}").json()["history"]]
    assert sorted(kinds) == ["count", "purchase", "use"]


def test_duplicate_barcodes_are_rejected(client):
    assert client.post("/api/items", json={"name": "A", "upc": "012345678905"}).json()["upc"] == "0012345678905"
    assert client.post("/api/items", json={"name": "B", "upc": "0012345678905"}).status_code == 409
    r = client.get("/api/barcode/012345678905").json()
    assert r["item"]["name"] == "A"


def test_paying_a_bill_records_it_and_rolls_forward(client):
    rec = client.post("/api/recurring", json={"name": "Netflix", "amount_cents": 1549, "frequency": "monthly",
                                              "category_id": cat_id(client, "Streaming"), "next_due": "2026-09-05",
                                              "essential": False}).json()
    assert rec["annual"] == 18588 and rec["essential"] is False
    r = client.post(f"/api/recurring/{rec['id']}/post").json()
    assert r["next_due"] == "2026-10-05"
    tx = client.get(f"/api/transactions/{r['transaction_id']}").json()
    assert tx["source"] == "recurring" and tx["amount_cents"] == 1549
    s = client.get("/api/reports/summary").json()
    assert s["recurring_discretionary_annual"] == 18588


def test_debts_sorted_by_rate_with_payoff(client):
    client.post("/api/debts", json={"name": "Car", "balance_cents": 1_000_000, "apr": 5, "min_payment_cents": 20_000})
    client.post("/api/debts", json={"name": "Visa", "balance_cents": 300_000, "apr": 24.9, "min_payment_cents": 10_000,
                                    "extra_payment_cents": 5_000})
    debts = client.get("/api/debts").json()
    assert [d["name"] for d in debts] == ["Visa", "Car"]
    assert round(debts[1]["payoff_months"], 2) == 56.18
    assert debts[0]["months_saved_by_extra"] > 0
    assert debts[0]["monthly_interest_cents"] == 6225


def test_insights_flag_overspend(client):
    groceries = cat_id(client, "Groceries")
    client.put("/api/budgets", json={"category_id": groceries, "amount_cents": 10000})
    client.post("/api/transactions", json={"tx_date": TODAY, "amount_cents": 15000, "category_id": groceries, "planned": False})
    texts = [i["text"] for i in client.get("/api/reports/insights").json()]
    assert any("Food is $50 over its $100 budget" in t for t in texts)
    assert any("unplanned" in t for t in texts)
    assert client.get("/api/budgets").json() == [{"category_id": groceries, "month": None, "amount_cents": 10000}]


def test_csv_export_has_one_row_per_line(client):
    client.post("/api/transactions", json={"tx_date": TODAY, "amount_cents": 500, "category_id": cat_id(client, "Coffee & snacks")})
    client.post("/api/transactions", json={"tx_date": TODAY, "lines": [
        {"description": "A", "amount_cents": 100}, {"description": "B", "amount_cents": 200}]})
    r = client.get("/api/export/transactions.csv")
    assert r.headers["content-type"].startswith("text/csv")
    rows = r.text.lstrip("﻿").strip().splitlines()
    assert len(rows) == 4 and rows[0].startswith("transaction_id,date")


def test_receipt_draft_matches_library_and_adds_tax(client, conn):
    item = client.post("/api/items", json={"name": "Paper towels", "category_id": cat_id(client, "Cleaning & paper")}).json()
    cats = categories(conn)
    parsed = {"merchant": "Costco", "date": "2026-09-20", "total_cents": 2600, "tax_cents": 150, "lines": [
        {"raw": "KS PAPER TWL", "description": "Paper towels", "brand": "Kirkland", "qty": 1, "amount_cents": 1999, "category_id": 0},
        {"raw": "BANANAS", "description": "Bananas", "brand": "", "qty": 1, "amount_cents": 399, "category_id": cat_id(client, "Groceries")},
    ]}
    d = build_receipt_draft(conn, parsed, cats)
    lines = d["draft"]["lines"]
    assert lines[0]["item_id"] == item["id"] and lines[0]["match"]["how"] == "name"
    assert lines[1]["category_id"] == cat_id(client, "Groceries")
    assert lines[2]["description"] == "Sales tax" and lines[2]["category_id"] == cat_id(client, "Cleaning & paper")
    assert d["mismatch_cents"] == 1999 + 399 + 150 - 2600
    # Drafts never write anything.
    assert client.get("/api/transactions").json() == []


def test_recognition_is_off_without_a_key(client):
    files = {"image": ("r.jpg", b"not really an image", "image/jpeg")}
    assert client.post("/api/recognize/receipt", files=files).status_code == 503


def test_backup_and_upload_paths(client, data_dir):
    r = client.post("/api/backup").json()
    assert (settings.data_dir / r["path"]).is_file() and r["bytes"] > 0
    assert client.get("/api/uploads/..%2Fhomebook.db").status_code == 404
    assert client.get("/api/uploads/" + "a" * 24 + ".jpg").status_code == 404


def test_app_shell_is_served(anon):
    assert "Homebook" in anon.get("/").text
    assert anon.get("/manifest.webmanifest").json()["short_name"] == "Homebook"
    assert anon.get("/sw.js").headers["content-type"].startswith("application/javascript")
    for path in ("/static/app.js", "/static/styles.css", "/static/icons/icon.svg", "/static/icons/icon-192.png", "/static/icons/icon-512.png"):
        assert anon.get(path).status_code == 200, path
