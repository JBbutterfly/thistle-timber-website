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
