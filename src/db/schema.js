import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../../data/fane.db');
export function getDb() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  return db;
}
export function initDb() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS market_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      sp500_close REAL,
      tsx_close REAL,
      vix REAL,
      sector_leaders TEXT,
      sector_laggards TEXT,
      briefing_text TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fired_at TEXT NOT NULL,
      ticker TEXT NOT NULL,
      signal_type TEXT,
      direction TEXT,
      trigger_reason TEXT,
      market_snapshot_id INTEGER,
      acted_on INTEGER DEFAULT 0,
      acted_on_at TEXT,
      FOREIGN KEY (market_snapshot_id) REFERENCES market_snapshots(id)
    );
    CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      signal_id INTEGER,
      ticker TEXT NOT NULL,
      direction TEXT,
      entry_date TEXT,
      entry_price REAL,
      position_size REAL,
      exit_date TEXT,
      exit_price REAL,
      pnl REAL,
      thesis TEXT,
      post_mortem TEXT,
      outcome TEXT,
      FOREIGN KEY (signal_id) REFERENCES signals(id)
    );
    CREATE TABLE IF NOT EXISTS journal_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_type TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      content TEXT,
      market_snapshot_id INTEGER,
      FOREIGN KEY (market_snapshot_id) REFERENCES market_snapshots(id)
    );
    CREATE TABLE IF NOT EXISTS performance_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      calculated_at TEXT DEFAULT (datetime('now')),
      period TEXT,
      total_trades INTEGER,
      win_rate REAL,
      avg_win REAL,
      avg_loss REAL,
      expected_value REAL
    );
    CREATE TABLE IF NOT EXISTS agent_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_at TEXT DEFAULT (datetime('now')),
      run_type TEXT,
      status TEXT,
      notes TEXT,
      error TEXT
    );
    CREATE TABLE IF NOT EXISTS annotations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      briefing_date TEXT NOT NULL,
      selected_text TEXT NOT NULL,
      note TEXT NOT NULL,
      ai_response TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (briefing_date) REFERENCES market_snapshots(date)
    );
  `);
  console.log('Fane database initialized.');
  db.close();
}