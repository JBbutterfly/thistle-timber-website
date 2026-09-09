# NorthRidge Field Ops

An installable, offline-first PWA for field crews to browse SOPs, policies,
and onboarding checklists, and acknowledge documents at job sites with no
signal. This is a prototype for one test organization, built so the data
model and data layer can serve multiple client organizations from a single
codebase once a real backend is wired up.

## Stack

- **React + Vite**, built as an installable PWA via `vite-plugin-pwa`
  (web app manifest + generated service worker, precaches the app shell).
- **IndexedDB** (via the `idb` helper) as the local, offline-first store
  for cached content, the sync queue, users, and viewed/read state.
- **Mock data source** standing in for the eventual Firebase backend
  (Firestore + Auth + Hosting) — see `src/data/`.

## Data layer

Everything reads and writes through the `DataSource` interface
(`src/data/DataSource.js`). Screens and hooks only ever talk to that
interface — never to IndexedDB or the mock backend directly — so swapping
in a real `FirestoreDataSource` later is a matter of writing one new class
and changing a single import in `src/data/index.js`.

- `MockDataSource` (`src/data/MockDataSource.js`) implements the interface
  against IndexedDB, seeded from `src/data/mockSeed.js` on first run.
- `mockRemote.js` simulates the future backend: realistic network latency,
  and it fails outright when `navigator.onLine` is false — the same shape
  a real Firestore call would have.
- `events.js` is a tiny pub/sub so any screen showing queue-derived state
  (a status badge, a "recorded offline" panel) updates live the moment the
  queue changes anywhere in the app — including a background flush that
  completes after the user has already moved on.

### Content items, sync queue, users

The three record types match the spec: `content_items` (org-scoped, with
`requires_ack`, `version`, `last_updated`), `sync_queue` (client-generated
UUIDs, written the instant an action happens, `pending` → `synced`), and
`users` (role + org + assigned items). See `src/data/schema.js` for the
full shape.

### Offline behavior

- Content is cached locally and read from the cache first, always.
  `refreshStaleContent` pulls from the backend in the background and
  overwrites only what's actually stale by `last_updated` — it never
  blocks or interrupts the screen that's open.
- Every acknowledgment or checklist tap writes to `sync_queue` immediately
  or the local timestamp is captured on-device, whether the crew member is
  online or not. Flushing happens automatically on reconnect
  (`useSyncQueue`); last-write-wins, no conflict resolution — this data is
  single-user and append-only, so that's all it needs.

## Screens

- **Library home** (`src/screens/LibraryHome.jsx`) — every content item
  assigned to the current user, with a computed status: new, in progress,
  needs acknowledgment, or completed.
- **Document detail** (`src/screens/DocumentDetail.jsx`) — the document
  body, and either an acknowledge/mark-complete action, or a completed
  panel showing who acknowledged it, when, and whether it's still pending
  a sync or already synced.

## Running it

```bash
npm install
npm run dev      # dev server, PWA enabled in dev via devOptions
npm run build     # production build + service worker
npm run preview   # serve the production build locally
```

## Follow-ups (not in this pass)

- Wire up real Firebase: Firestore for `content_items`/`sync_queue`/`users`,
  Firebase Auth for sign-in, Firebase Hosting for deploy. `FirestoreDataSource`
  should be the only new file needed on the data side.
- Self-host Source Serif 4 / Source Sans 3 (currently loaded from Google
  Fonts) so type doesn't depend on a network call on first launch.
- PDF-backed content items (`pdf_url`) are represented in the schema but
  not yet rendered inline — currently just a link out.
- Real auth-derived `user_id` instead of the single hardcoded test user.
