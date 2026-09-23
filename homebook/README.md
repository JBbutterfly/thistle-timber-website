# Homebook

A private, self-hosted household **budget + inventory** app. You run it on your own computer, and household members use it from their phones as an installable web app (PWA). Your data stays in a single SQLite file on your machine.

**Ways to add things**

| Method | What happens | Leaves your network? |
|---|---|---|
| Manual | Type one amount + category, or itemize lines | No |
| Barcode | Photo or live scan, decoded on your server; known items come up instantly | Only the barcode number, and only for *unknown* codes if product lookup is on |
| Receipt photo | Claude reads every line, matches them to your item library, you review before saving | Yes: the photo, only when you tap it |
| Product photo | Tries the barcode locally first; falls back to Claude to identify brand/size | Only if no known barcode is found |

**What it tracks**

- **Budget:** monthly budgets per category, actual vs. budget, pace for the month, day-to-day cost per day and week, and what's left to invest.
- **Bills and subscriptions:** mortgage, car, student loans, Amazon membership and so on. Each is shown per year, month, week and day. Tap "Paid" to record a payment and roll the due date forward.
- **Debts:** balance, APR, and payoff timeline using the same math as Excel's NPER. Also shows how many months an extra payment saves.
- **Item library:** every product you buy, keyed by barcode. Receipt spellings like "GV SHMP 12OZ" are learned as aliases, so the next receipt matches automatically.
- **Inventory forecasting:** on hand, burn rate, days left, reorder date, and true cost per month for things like supplements and shampoo.
- **Gaps and opportunities:** over-budget categories, spending pace, category creep vs. your 3-month average, share of unplanned spending, discretionary subscription total, bills due this week, low stock, highest-cost consumables, and highest-rate debt.
- **Household:** separate logins, and every entry shows who added it.

## Quick start

Needs Python 3.10+.

```bash
# macOS / Linux
./run.sh

# Windows (PowerShell)
.\run.ps1
```

Open http://127.0.0.1:8420. The first screen creates the admin account. Add family members under **Settings → Household**.

Or with Docker:

```bash
cp .env.example .env
docker compose up -d --build
```

## Using it from your phone

By default the app listens only on the computer it runs on (`HOMEBOOK_HOST=127.0.0.1`). To use it from phones:

1. **Home Wi-Fi only (simple):** set `HOMEBOOK_HOST=0.0.0.0` in `.env`, restart, then open `http://<computer's-LAN-IP>:8420` on your phone. Everything works except *live* camera scanning. Photo-based barcode scanning works fine.
2. **Anywhere, with HTTPS (recommended):** install [Tailscale](https://tailscale.com) on the computer and the phones, then run `tailscale serve --bg 8420` on the computer. You get a private `https://<machine>.<tailnet>.ts.net` address that only your devices can reach. Set `HOMEBOOK_SECURE_COOKIES=true`. HTTPS also enables live scanning on Android Chrome and lets the app install cleanly.

To install it as an app on your phone: in Safari choose Share → Add to Home Screen, or in Chrome choose ⋮ → Install app.

**Do not** port-forward this app on your router or put it on the open internet. It's built for a trusted household network.

## Turning on receipt and product recognition

1. Create an API key at https://console.anthropic.com.
2. Put it in `.env` as `ANTHROPIC_API_KEY=...` and restart.

Photos go to Claude only when you tap Receipt photo or Product photo, and nothing is saved until you review the draft. Cost is per photo and small, but check current pricing on Anthropic's site. The model is set with `HOMEBOOK_AI_MODEL` (default `claude-sonnet-5`).

## How the forecast works

Each item has a ledger: purchases add stock, "used one up" taps and physical counts subtract it.

- **On hand** is the sum of the ledger.
- **Burn rate** is the higher of two numbers over the last 180 days:
  - logged use per day
  - buying cadence (units bought ÷ days between first and latest purchase)

  Taking the higher rate means a forgotten "used one up" tap makes it suggest reordering early rather than let you run out.
- **Days left** is on hand ÷ burn rate. The item is flagged **Low** when days left falls under its "warn at" setting, or when stock falls below its minimum quantity.
- **Cost per month** is burn rate × your average price paid × 30.4.

It needs about two purchases, or a purchase plus a few taps, before it starts forecasting. Until then the item shows "Learning".

Fixed bills (anything with an active *fixed* recurring bill in that category, or posted with "Paid") are **not** extrapolated when projecting the month. Only day-to-day spending is scaled by pace.

## Data, backups, export

- Everything lives in `data/`: `homebook.db` plus `uploads/` for photos. Back up that folder.
- **Settings → Back up now** writes a consistent snapshot to `data/backups/`.
- **Export CSV** gives one row per line item, and opens cleanly in Excel or Power Query.
- Money is stored as integer cents, so there are no rounding surprises.

## Development

```bash
pip install -r requirements-dev.txt
pytest -q                     # 33 tests: budget math, NPER, forecasting, API flows, barcode decode
python -m uvicorn app.main:app --reload --port 8420
```

API docs are at `/api/docs`. The endpoints themselves still require signing in. See `CLAUDE.md` for architecture notes and the roadmap, written for continuing the build with Claude Code.
