# The Margin

A writing tool for thought. You write freeform prose in a plain manuscript
editor; on demand, it asks Claude to read the draft the way a sharp, skeptical
margin annotator would — and return 1–3 provocations, each anchored to an exact
quoted phrase, challenging an assumption, a gap in the reasoning, or a place the
writing is coasting on a familiar idea. It never completes sentences, never
rewrites, never praises. If nothing in the draft warrants a challenge, it says
so and returns nothing.

Each provocation appears as a handwritten-style note in the margin next to the
sentence it quotes. You can dismiss a note, or expand it to write a private
response — that response is saved and is **never** sent back to Claude. It's
for your own reflection, not a reply to the model.

Before writing, you pick what kind of piece this is — academic, business,
fiction, journalism, personal essay, or general — from the dropdown in the
topbar. That choice tunes what the annotator pushes on (evidence and rigor for
academic writing, whether a decision is actually clear for a business memo,
earned stakes for fiction, and so on) instead of one generic critique style
for everything. It's saved per draft and can be changed anytime before
pressing Provoke.

Each person signs in with their own email — every draft, note, and private
response is scoped to their account and invisible to anyone else.

## How it's built

- `server/` — a small Express server. It's the only thing that talks to the
  Anthropic API (so the API key never touches the browser). Every request
  carries a Firebase ID token; the server verifies it and reads/writes only
  that user's own drafts in Firestore.
- `client/` — a Vite + React frontend. Signed-out visitors see an email
  sign-up/sign-in screen (Firebase Auth); everything past that is the
  manuscript editor. The manuscript itself is a plain `<textarea>` (native
  cursor, undo/redo, selection), with margin notes positioned alongside the
  exact passage they quote by measuring the wrapped text against a hidden
  mirror element. Notes re-locate their quote in the live text on every
  render, so they reposition correctly as you edit — including a fuzzy
  fallback if the quoted phrase has drifted or a paragraph-level fallback if a
  sentence match can't be found.

## Setup

You'll need Node 18+ and a (free) Firebase project.

### 1. Get an Anthropic API key

Create one at [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)
(requires an Anthropic Console account with billing configured).

### 2. Create a Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) → **Add project** → name it anything → skip Google Analytics (not needed).
2. **Build → Authentication → Get started → Email/Password** → enable it (Sign-in method tab).
3. **Build → Firestore Database → Create database** → start in **production mode** → pick any region.
4. Get the **web app config** (for the frontend): Project settings (gear icon) → General → scroll to "Your apps" → click the `</>` (web) icon → register an app (no Hosting needed) → copy the `firebaseConfig` values shown.
5. Get a **service account key** (for the server): Project settings → **Service accounts** → **Generate new private key** → save the downloaded JSON file somewhere outside version control, e.g. `server/firebase-service-account.json` (already gitignored).

### 3. Configure the server

```bash
cd server
cp .env.example .env
```

Edit `.env`:
- `ANTHROPIC_API_KEY` — the key from step 1.
- `GOOGLE_APPLICATION_CREDENTIALS` — path to the service-account JSON from step 2.5 (the default in `.env.example` already points at `./firebase-service-account.json`).

```bash
npm install
```

### 4. Configure the frontend

```bash
cd ../client
cp .env.example .env
```

Edit `.env` and fill in the four `VITE_FIREBASE_*` values from step 2.4 (these are public by design — the real security boundary is the server verifying each request's token, not secrecy of these values).

```bash
npm install
```

### 5. Run both

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

Open http://localhost:5174, create an account with any email/password, and start writing. The Vite dev server proxies `/api/*` to the Express server, so the browser never sees your Anthropic key.

## Notes on persistence

Drafts and notes live in Firestore under `users/<your-uid>/drafts/<draftId>`,
each holding the draft's text, its audience, and its full set of margin notes
— including dismissed ones and any private responses. Nothing is deleted when
you dismiss a note; it's just hidden from the margin. The **History** view in
the sidebar reads across every one of your drafts' notes and lists every
provocation you've actually expanded and written back to, oldest first, so you
can look back at what you argued with over time.

To change which model generates provocations, set `CLAUDE_MODEL` in
`server/.env` (defaults to `claude-opus-5`).

## Deploying somewhere real

In production the Express server also serves the built frontend, so the whole
app is one process and one URL. This works on any Node host; here's the
free-tier path on [Render](https://render.com):

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
   - `ANTHROPIC_API_KEY` — your key.
   - `FIREBASE_SERVICE_ACCOUNT_JSON` — paste the **entire contents** of the
     service-account JSON file as one value (Render doesn't support uploading
     a file, so this replaces `GOOGLE_APPLICATION_CREDENTIALS` for hosted
     deploys).
5. In the Firebase console, add your Render URL under **Authentication →
   Settings → Authorized domains**, or sign-in will be rejected from there.
6. **Create Web Service.** First build takes a few minutes; after that you
   get a `https://something.onrender.com` URL.

Because drafts live in Firestore now (not on the server's local disk), they
survive redeploys and restarts. Render's free tier does still spin the
service down after inactivity — the first request after a while takes
~30–50s to wake back up — but your data isn't affected by that.
