# The Margin

A local writing tool for thought. You write freeform prose in a plain manuscript
editor; on demand, it asks Claude to read the draft the way a sharp, skeptical
margin annotator would — and return 1–3 provocations, each anchored to an exact
quoted phrase, challenging an assumption, a gap in the reasoning, or a place the
writing is coasting on a familiar idea. It never completes sentences, never
rewrites, never praises. If nothing in the draft warrants a challenge, it says
so and returns nothing.

Each provocation appears as a handwritten-style note in the margin next to the
sentence it quotes. You can dismiss a note, or expand it to write a private
response — that response is saved locally and is **never** sent back to Claude.
It's for your own reflection, not a reply to the model.

Before writing, you pick what kind of piece this is — academic, business,
fiction, journalism, personal essay, or general — from the dropdown in the
topbar. That choice tunes what the annotator pushes on (evidence and rigor for
academic writing, whether a decision is actually clear for a business memo,
earned stakes for fiction, and so on) instead of one generic critique style
for everything. It's saved per draft and can be changed anytime before
pressing Provoke.

## How it's built

- `server/` — a small Express server. It's the only thing that talks to the
  Anthropic API (so the API key never touches the browser), and it persists
  drafts as JSON files under `server/data/drafts/`.
- `client/` — a Vite + React frontend. The manuscript is a plain `<textarea>`
  (native cursor, undo/redo, selection), with margin notes positioned
  alongside the exact passage they quote by measuring the wrapped text against
  a hidden mirror element. Notes re-locate their quote in the live text on
  every render, so they reposition correctly as you edit — including a fuzzy
  fallback if the quoted phrase has drifted or a paragraph-level fallback if a
  sentence match can't be found.

## Setup

You'll need Node 18+.

### 1. Get an Anthropic API key

Create one at [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)
(requires an Anthropic Console account with billing configured).

### 2. Configure the server

```bash
cd server
cp .env.example .env
# edit .env and paste your key into ANTHROPIC_API_KEY
npm install
```

### 3. Install the frontend

```bash
cd ../client
npm install
```

### 4. Run both

In one terminal:

```bash
cd server
npm run dev      # http://localhost:5175
```

In another:

```bash
cd client
npm run dev      # http://localhost:5174
```

Open http://localhost:5174. The Vite dev server proxies `/api/*` to the
Express server, so the browser never sees your API key.

## Notes on persistence

Drafts live as individual JSON files in `server/data/drafts/<id>.json`, each
holding the draft's text and its full set of margin notes — including
dismissed ones and any private responses you wrote. Nothing is deleted when
you dismiss a note; it's just hidden from the margin. The **History** view in
the sidebar reads across every draft's notes and lists every provocation
you've actually expanded and written back to, oldest first, so you can look
back at what you argued with over time.

To change which model generates provocations, set `CLAUDE_MODEL` in
`server/.env` (defaults to `claude-opus-5`).

## Deploying somewhere real (e.g. to test on your phone)

In production the Express server also serves the built frontend, so the whole
app is one process and one URL — no separate dev servers. This works on any
Node host; here's the free-tier path on [Render](https://render.com), doable
entirely from a phone browser:

1. **Sign up / log in at [render.com](https://render.com)** — GitHub login is
   fastest.
2. **New → Web Service**, then connect the `thistle-timber-website` repo
   (grant Render access to it if asked).
3. Fill in:
   - **Branch:** `claude/margin-writing-app-bpv7ky` (or whatever branch you're
     deploying)
   - **Root Directory:** `the-margin`
   - **Runtime:** Node
   - **Build Command:**
     `npm install --prefix server && npm install --prefix client && npm run build --prefix client`
   - **Start Command:** `node server/index.js`
   - **Instance Type:** Free
4. Add environment variables (Render's dashboard, not in any file you commit):
   - `ANTHROPIC_API_KEY` — your key
   - `APP_USER` and `APP_PASSWORD` — pick any username/password. Since this
     URL is reachable by anyone who has it, this puts a login prompt in front
     of the whole app so a stray link can't run up your API bill. Leave both
     unset only if you don't mind the URL being open.
5. **Create Web Service.** First build takes a few minutes; after that you
   get a `https://something.onrender.com` URL — open it on your phone.

Caveats for this path: Render's free tier spins the service down after
inactivity (the first request after a while takes ~30–50s to wake back up),
and its disk isn't guaranteed to survive a redeploy — so treat drafts saved
there as disposable while testing, not a permanent home. For real day-to-day
use, running it locally (above) or deploying with a persistent disk/database
is the better fit.
