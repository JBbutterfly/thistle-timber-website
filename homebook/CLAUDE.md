# CLAUDE.md: working on Homebook

Context for Claude Code sessions continuing this project.

## What this is
A self-hosted household budget + inventory PWA for one family. Privacy is the product: data stays local, and cloud AI is opt-in per photo. Keep it simple enough to run with `./run.sh` on a home machine.

## Stack
- **Backend:** FastAPI + stdlib `sqlite3` (no ORM on purpose; SQL stays readable). Python 3.10+.
- **Frontend:** vanilla JS ES module (`static/app.js`), no build step. DOM is built with `h()`, and **never** `innerHTML` with data (receipt text is untrusted).
- **Barcodes:** `zxing-cpp` decodes on the server from photos. The browser's `BarcodeDetector` is used for live scanning when available (Android Chrome over HTTPS).
- **Recognition:** Anthropic SDK in `app/services/recognize.py`. It returns *drafts* only; nothing is saved without user review.
- **Product names for unknown barcodes:** Open Food / Beauty / Products Facts (`app/services/barcode.py`). Toggle with `HOMEBOOK_PRODUCT_LOOKUP`.

## Layout
```
app/
  main.py            app factory, static/PWA routes, backup endpoint
  config.py          env settings (safe defaults: 127.0.0.1, AI off without key)
  schema.sql         all tables; money = integer cents, dates = YYYY-MM-DD
  db.py              per-request connection dependency, seed categories
  auth.py            scrypt hashes, cookie sessions, admin guard
  routers/           auth, core (categories/accounts/budgets/recurring/debts),
                     items (library, barcode, inventory), transactions, reports, recognize,
                     common (shared validation + helpers)
  services/
    budget.py        normalize(), month_summary(), trend(), payoff_months() (NPER)
    forecast.py      daily_rate(), item_forecast(), inventory(), shopping_list()
    matching.py      receipt line / product name -> library item (UPC, alias, fuzzy)
    barcode.py       decode + Open*Facts lookup, UPC normalization (12-digit -> EAN-13)
    recognize.py     Claude prompts + JSON parsing
static/              index.html, app.js, styles.css, sw.js (shell cache only, never API),
                     manifest.webmanifest, icons/
tests/               pytest; run `pytest -q`
```

## Core rules (don't break these)
1. **Cents everywhere.** API fields are `*_cents` ints. The UI converts with `toCents`/`fmt`.
2. **One spend resolver.** `SPEND_SQL` in `budget.py` resolves each dollar's category as line → item → transaction. All reports go through it.
3. **Inventory is a ledger.** On hand = `SUM(inventory_events.delta)`. Purchase lines create `purchase` events (cascade-deleted with the line). Edits to a transaction delete and recreate its lines and events.
4. **Fixed bills aren't extrapolated.** `month_summary` splits fixed vs. variable. Keep pace math on variable only.
5. **AI output is a draft.** Recognition endpoints never write transactions or items.
6. **Bind safely.** The default host is 127.0.0.1. Never add features that assume internet exposure.
7. Add a test with every behavior change. `tests/conftest.py` gives a logged-in `client` on a temp DB.

## Roadmap (suggested order)
1. **Bank/card CSV import** with a column-mapping screen and keyword → category rules (`source='import'`). Dedupe on date+amount+merchant.
2. **Split transactions** across household members and "who paid".
3. **Sinking funds:** monthly set-asides for annual bills (registration, Prime, property tax), shown on the dashboard.
4. **Shopping list actions:** check off items in-store, then turn the checked list into a pre-filled itemized transaction.
5. **Price tracking:** per-item price history chart, "cheapest store" hint, alert when the price jumps more than 15%.
6. **Local recognition option:** a provider interface in `recognize.py` with an Ollama/vision-model implementation behind `HOMEBOOK_AI_PROVIDER=local`.
7. **Offline entry:** queue POSTs in IndexedDB when the server is unreachable, and sync on reconnect.
8. **Schema migrations:** a `schema_version` setting plus ordered migration functions in `db.py` before the first breaking change. (Today `schema.sql` is idempotent `CREATE IF NOT EXISTS` only.)
9. Nightly automatic backup with retention.
10. Power BI / Excel: a read-only `/api/export/*.csv` for items, inventory and budgets.

## Known limits
- Receipt recognition quality depends on the photo. Always show the total-mismatch warning.
- Open*Facts coverage is strongest for food and cosmetics; household goods are hit-or-miss.
- Live scanning needs HTTPS plus the BarcodeDetector API (not iOS Safari). Photo scanning is the universal path.
- The forecast uses the higher of logged use vs. buying cadence (see `daily_rate`). It's conservative by design.
