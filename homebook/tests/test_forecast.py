from datetime import date, timedelta

import pytest

from app.services.forecast import daily_rate, item_forecast, shopping_list

TODAY = date(2026, 9, 23)


def ev(kind, delta, days_ago):
    return {"kind": kind, "delta": delta, "event_date": (TODAY - timedelta(days=days_ago)).isoformat()}


def make_item(conn, **kw):
    cols = {"name": "Vitamin D", "reorder_days": 7, "min_qty": 0, **kw}
    item_id = conn.execute(f"INSERT INTO items ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})", list(cols.values())).lastrowid
    conn.commit()
    return dict(conn.execute("SELECT * FROM items WHERE id = ?", (item_id,)).fetchone())


def add_event(conn, item, kind, delta, days_ago):
    conn.execute("INSERT INTO inventory_events (item_id, kind, delta, event_date) VALUES (?,?,?,?)",
                 (item["id"], kind, delta, (TODAY - timedelta(days=days_ago)).isoformat()))
    conn.commit()


def test_single_purchase_is_still_learning():
    assert daily_rate([ev("purchase", 2, 5)], TODAY) == (None, None)


def test_buying_cadence():
    rate, method = daily_rate([ev("purchase", 1, 60), ev("purchase", 1, 30)], TODAY)
    assert method == "cadence"
    assert rate == pytest.approx(2 / 30)


def test_takes_the_higher_of_usage_and_cadence():
    events = [ev("purchase", 1, 60), ev("purchase", 1, 30), ev("use", -1, 20), ev("use", -1, 10), ev("use", -1, 1)]
    rate, method = daily_rate(events, TODAY)
    assert method == "cadence"  # 2/30 beats 3 uses over 60 days
    rate, method = daily_rate([ev("purchase", 4, 10), ev("use", -1, 8), ev("use", -1, 4)], TODAY)
    assert method == "usage" and rate == pytest.approx(2 / 10)


def test_old_events_fall_out_of_the_window():
    assert daily_rate([ev("purchase", 1, 400), ev("purchase", 1, 300)], TODAY) == (None, None)


def test_forecast_low_stock_reorder_and_cost(conn):
    item = make_item(conn, reorder_days=14)
    tx = conn.execute("INSERT INTO transactions (tx_date, amount_cents) VALUES ('2026-08-24', 2400)").lastrowid
    conn.execute("INSERT INTO transaction_lines (transaction_id, item_id, qty, amount_cents) VALUES (?,?,2,2400)", (tx, item["id"]))
    add_event(conn, item, "purchase", 1, 60)
    add_event(conn, item, "purchase", 1, 30)
    add_event(conn, item, "use", -1, 5)
    f = item_forecast(conn, item, TODAY)
    assert f["on_hand"] == 1
    assert f["rate_method"] == "cadence"
    assert f["days_left"] == pytest.approx(15)
    assert f["runs_out_on"] == "2026-10-08"
    assert f["reorder_on"] == "2026-09-24"
    assert f["unit_cost"] == 1200
    assert f["monthly_cost"] == round(2 / 30 * 1200 * 30.4)
    assert f["status"] == "ok"
    assert [x["id"] for x in shopping_list(conn, 7, TODAY)] == [item["id"]]


def test_status_out_and_min_qty(conn):
    out = make_item(conn, name="Coffee")
    add_event(conn, out, "purchase", 1, 10)
    add_event(conn, out, "use", -1, 2)
    assert item_forecast(conn, out, TODAY)["status"] == "out"

    low = make_item(conn, name="Paper towels", min_qty=4)
    add_event(conn, low, "purchase", 3, 1)
    assert item_forecast(conn, low, TODAY)["status"] == "low"
    assert {x["name"] for x in shopping_list(conn, 0, TODAY)} == {"Coffee", "Paper towels"}
