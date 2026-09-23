-- Homebook schema. Idempotent: safe to run on every start.
-- Money is integer cents. Dates are 'YYYY-MM-DD' text. Timestamps are ISO-8601 UTC.

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  is_admin      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS categories (
  id        INTEGER PRIMARY KEY,
  name      TEXT NOT NULL,
  parent_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
  kind      TEXT NOT NULL DEFAULT 'expense' CHECK (kind IN ('expense', 'income', 'savings')),
  sort      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS categories_parent ON categories(parent_id);

CREATE TABLE IF NOT EXISTS accounts (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE
);

-- month = '' means "every month"; 'YYYY-MM' overrides one month.
CREATE TABLE IF NOT EXISTS budgets (
  id           INTEGER PRIMARY KEY,
  category_id  INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  month        TEXT NOT NULL DEFAULT '',
  amount_cents INTEGER NOT NULL,
  UNIQUE (category_id, month)
);

CREATE TABLE IF NOT EXISTS recurring (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  frequency    TEXT NOT NULL CHECK (frequency IN ('weekly', 'biweekly', 'semimonthly', 'monthly', 'quarterly', 'semiannual', 'annual')),
  category_id  INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  account_id   INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  next_due     TEXT,
  fixed        INTEGER NOT NULL DEFAULT 1,
  essential    INTEGER NOT NULL DEFAULT 1,
  active       INTEGER NOT NULL DEFAULT 1,
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS debts (
  id                  INTEGER PRIMARY KEY,
  name                TEXT NOT NULL,
  balance_cents       INTEGER NOT NULL DEFAULT 0,
  apr                 REAL NOT NULL DEFAULT 0,
  min_payment_cents   INTEGER NOT NULL DEFAULT 0,
  extra_payment_cents INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS items (
  id              INTEGER PRIMARY KEY,
  name            TEXT NOT NULL,
  brand           TEXT,
  upc             TEXT UNIQUE,
  category_id     INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  unit            TEXT NOT NULL DEFAULT 'each',
  track_inventory INTEGER NOT NULL DEFAULT 1,
  reorder_days    INTEGER NOT NULL DEFAULT 7,
  min_qty         REAL NOT NULL DEFAULT 0,
  notes           TEXT,
  image_path      TEXT,
  created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Receipt spellings ("GV SHMP 12OZ") learned for an item, stored normalized.
CREATE TABLE IF NOT EXISTS item_aliases (
  alias   TEXT PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS transactions (
  id           INTEGER PRIMARY KEY,
  tx_date      TEXT NOT NULL,
  merchant     TEXT,
  amount_cents INTEGER NOT NULL,
  category_id  INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  account_id   INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  source       TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'barcode', 'receipt', 'photo', 'recurring', 'import')),
  planned      INTEGER NOT NULL DEFAULT 1,
  note         TEXT,
  image_path   TEXT,
  recurring_id INTEGER REFERENCES recurring(id) ON DELETE SET NULL,
  user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at   TEXT
);
CREATE INDEX IF NOT EXISTS transactions_date ON transactions(tx_date);

CREATE TABLE IF NOT EXISTS transaction_lines (
  id             INTEGER PRIMARY KEY,
  transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  item_id        INTEGER REFERENCES items(id) ON DELETE SET NULL,
  description    TEXT,
  raw            TEXT,
  qty            REAL NOT NULL DEFAULT 1,
  amount_cents   INTEGER NOT NULL,
  category_id    INTEGER REFERENCES categories(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS lines_tx ON transaction_lines(transaction_id);
CREATE INDEX IF NOT EXISTS lines_item ON transaction_lines(item_id);

-- Inventory ledger: on hand = SUM(delta). Purchase events belong to a line.
CREATE TABLE IF NOT EXISTS inventory_events (
  id         INTEGER PRIMARY KEY,
  item_id    INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  line_id    INTEGER REFERENCES transaction_lines(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('purchase', 'use', 'count', 'adjust')),
  delta      REAL NOT NULL,
  event_date TEXT NOT NULL,
  note       TEXT,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS events_item ON inventory_events(item_id, event_date);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
