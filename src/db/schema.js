/**
 * src/db/schema.js
 *
 * Database schema and connection for Fane.
 *
 * initDb()   — creates all tables (CREATE TABLE IF NOT EXISTS). Safe to run
 *              on any existing DB. New tables appear; existing tables are
 *              untouched.
 *
 * migrateDb() — adds columns to existing tables via ALTER TABLE. SQLite has
 *               no IF NOT EXISTS clause for ALTER TABLE, so each addition
 *               is guarded by a PRAGMA table_info() check. Safe to run
 *               repeatedly.
 *
 * Both are called from src/db/init.js at startup.
 *
 * Table inventory:
 *   Stage 1 (existing):
 *     market_snapshots    — daily market data and briefing text
 *     signals             — detected signals (extended in Stage 2 migration)
 *     trades              — completed position lifecycle (entry → exit → P&L)
 *     journal_entries     — free-form journal
 *     performance_metrics — calculated win rate, EV, etc.
 *     agent_log           — all agent run records and IBKR connection events
 *     annotations         — briefing text annotations with AI responses
 *
 *   Stage 2 (new):
 *     positions           — point-in-time IBKR position snapshots
 *     account_snapshots   — point-in-time account-level values (net liq, cash, P&L)
 *     orders              — IBKR order execution lifecycle
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH   = path.join(__dirname, '../../data/fane.db');

// ── Connection ─────────────────────────────────────────────────────────────────

export function getDb() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  return db;
}

// ── initDb ─────────────────────────────────────────────────────────────────────

export function initDb() {
  const db = getDb();

  db.exec(`

    -- ── Stage 1 tables (unchanged) ───────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS market_snapshots (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      date           TEXT NOT NULL UNIQUE,
      sp500_close    REAL,
      tsx_close      REAL,
      vix            REAL,
      sector_leaders TEXT,
      sector_laggards TEXT,
      briefing_text  TEXT,
      created_at     TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS signals (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      fired_at            TEXT NOT NULL,
      ticker              TEXT NOT NULL,
      signal_type         TEXT,
      direction           TEXT,
      trigger_reason      TEXT,
      market_snapshot_id  INTEGER,
      acted_on            INTEGER DEFAULT 0,
      acted_on_at         TEXT,
      FOREIGN KEY (market_snapshot_id) REFERENCES market_snapshots(id)
    );

    CREATE TABLE IF NOT EXISTS trades (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      signal_id      INTEGER,
      ticker         TEXT NOT NULL,
      direction      TEXT,
      entry_date     TEXT,
      entry_price    REAL,
      position_size  REAL,
      exit_date      TEXT,
      exit_price     REAL,
      pnl            REAL,
      thesis         TEXT,
      post_mortem    TEXT,
      outcome        TEXT,
      FOREIGN KEY (signal_id) REFERENCES signals(id)
    );

    CREATE TABLE IF NOT EXISTS journal_entries (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_type          TEXT NOT NULL,
      created_at          TEXT DEFAULT (datetime('now')),
      content             TEXT,
      market_snapshot_id  INTEGER,
      FOREIGN KEY (market_snapshot_id) REFERENCES market_snapshots(id)
    );

    CREATE TABLE IF NOT EXISTS performance_metrics (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      calculated_at  TEXT DEFAULT (datetime('now')),
      period         TEXT,
      total_trades   INTEGER,
      win_rate       REAL,
      avg_win        REAL,
      avg_loss       REAL,
      expected_value REAL
    );

    CREATE TABLE IF NOT EXISTS agent_log (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      run_at   TEXT DEFAULT (datetime('now')),
      run_type TEXT,
      status   TEXT,
      notes    TEXT,
      error    TEXT
    );

    CREATE TABLE IF NOT EXISTS annotations (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      briefing_date  TEXT NOT NULL,
      selected_text  TEXT NOT NULL,
      note           TEXT NOT NULL,
      ai_response    TEXT,
      created_at     TEXT NOT NULL,
      FOREIGN KEY (briefing_date) REFERENCES market_snapshots(date)
    );

    -- ── Stage 2 tables (new) ─────────────────────────────────────────────────

    -- Point-in-time position snapshots fetched from IB Gateway.
    -- Not upserted — every fetch creates new rows tagged with snapshot_at.
    -- This gives Stage 5 analytics a position history, not just current state.
    -- Query for current state: WHERE snapshot_at = (SELECT MAX(snapshot_at) FROM positions)
    CREATE TABLE IF NOT EXISTS positions (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_at    TEXT NOT NULL,   -- timestamp of the IBKR fetch (from time.js)
      account        TEXT,            -- IB account ID (e.g. "DU1234567")
      symbol         TEXT NOT NULL,
      sec_type       TEXT,            -- STK, ETF, etc.
      currency       TEXT,
      exchange       TEXT,
      con_id         INTEGER,         -- IB contract ID (stable unique identifier)
      position       REAL NOT NULL,   -- shares held; positive = long
      avg_cost       REAL,            -- average cost basis per share
      market_value   REAL,            -- market value at snapshot time (if available)
      unrealized_pnl REAL             -- unrealized P&L at snapshot time (if available)
    );

    CREATE INDEX IF NOT EXISTS idx_positions_snapshot_at
      ON positions(snapshot_at DESC);

    CREATE INDEX IF NOT EXISTS idx_positions_symbol
      ON positions(symbol);

    -- Account-level values fetched alongside positions.
    -- One row per fetch, paired with positions by snapshot_at.
    CREATE TABLE IF NOT EXISTS account_snapshots (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_at          TEXT NOT NULL,
      net_liquidation      REAL,   -- total account value (cash + open positions)
      total_cash           REAL,   -- cash on hand
      buying_power         REAL,   -- available buying power
      available_funds      REAL,   -- funds available for new positions
      unrealized_pnl       REAL,   -- total unrealized P&L across all positions
      realized_pnl         REAL,   -- realized P&L for the session
      gross_position_value REAL,   -- gross market value of all open positions
      currency             TEXT DEFAULT 'USD'
    );

    CREATE INDEX IF NOT EXISTS idx_account_snapshots_at
      ON account_snapshots(snapshot_at DESC);

    -- IBKR order execution lifecycle.
    -- Sits between signal approval and the trades table.
    -- Flow: signal approved → order row created (pending) →
    --       submitted to IBKR (submitted, ibkr_order_id set) →
    --       filled (filled, filled_price set) →
    --       trade row written in trades table.
    --
    -- counter_argument is NOT NULL — mandatory at approval time per PRINCIPLES.md.
    -- An order cannot exist without a recorded counter-argument.
    CREATE TABLE IF NOT EXISTS orders (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,

      -- Signal linkage
      signal_id        INTEGER,        -- FK to signals (nullable for future manual orders)

      -- Order parameters
      ticker           TEXT NOT NULL,
      direction        TEXT NOT NULL,  -- BUY | SELL
      order_type       TEXT NOT NULL DEFAULT 'MKT', -- MKT | LMT (LMT required for limit_price)
      quantity         REAL NOT NULL,  -- number of shares
      limit_price      REAL,           -- null for MKT orders

      -- Human approval metadata — all required at approval time
      counter_argument TEXT NOT NULL,  -- why this signal might be wrong (MANDATORY)
      conviction_level TEXT,           -- low | medium | high
      human_note       TEXT,           -- what the human typed at the approval moment
      approved_at      TEXT NOT NULL,  -- timestamp of human approval (from time.js)

      -- IBKR execution state
      ibkr_order_id    INTEGER,        -- order ID assigned by IB Gateway after submission
      status           TEXT NOT NULL DEFAULT 'pending',
                                       -- pending | submitted | filled | cancelled | error
      submitted_at     TEXT,           -- when the order was sent to IBKR
      filled_at        TEXT,           -- when IB confirmed the fill
      filled_price     REAL,           -- actual fill price (may differ from limit_price)
      filled_quantity  REAL,           -- shares actually filled (partial fills possible)

      -- Error tracking
      error_code       INTEGER,
      error_message    TEXT,

      -- Audit
      created_at       TEXT NOT NULL,

      FOREIGN KEY (signal_id) REFERENCES signals(id)
    );

    CREATE INDEX IF NOT EXISTS idx_orders_signal_id
      ON orders(signal_id);

    CREATE INDEX IF NOT EXISTS idx_orders_status
      ON orders(status);

    CREATE INDEX IF NOT EXISTS idx_orders_ibkr_order_id
      ON orders(ibkr_order_id);

  `);

  console.log('Fane database initialized.');
  db.close();
}

// ── migrateDb ──────────────────────────────────────────────────────────────────

/**
 * Safely adds columns to existing tables.
 *
 * SQLite does not support ALTER TABLE ... ADD COLUMN IF NOT EXISTS.
 * Each addition is guarded by a PRAGMA table_info() check — safe to run
 * on any database state, including a fresh one just created by initDb().
 *
 * Stage 2 additions to signals:
 *
 *   status           — replaces the binary acted_on (0/1) with a proper
 *                      state machine: pending | approved | passed | expired | killed
 *                      acted_on is preserved for backward compatibility.
 *
 *   counter_argument — the bear case for the signal. Mandatory before approval
 *                      per PRINCIPLES.md. Stored at the signal level so it
 *                      exists even if the human passes (inaction is also logged).
 *
 *   conviction_level — low | medium | high, set by the human at decision time.
 *
 *   human_note       — free-form note written at the moment of approval or pass.
 *                      The thought-to-disk path (Principle 6).
 */
export function migrateDb() {
  const db = getDb();

  const additions = [
    // table, column, definition
    ['signals', 'status',           "TEXT NOT NULL DEFAULT 'pending'"],
    ['signals', 'counter_argument', 'TEXT'],
    ['signals', 'conviction_level', 'TEXT'],
    ['signals', 'human_note',       'TEXT'],
  ];

  for (const [table, column, definition] of additions) {
    const cols = db.pragma(`table_info(${table})`);
    const exists = cols.some(c => c.name === column);
    if (!exists) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      console.log(`Fane migration: added ${table}.${column}`);
    }
  }

  console.log('Fane database migration complete.');
  db.close();
}