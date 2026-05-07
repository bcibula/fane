import { getDb } from './schema.js';
import { now } from '../utils/time.js';

export function saveMarketSnapshot(snapshot) {
  const db = getDb();
  
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO market_snapshots 
    (date, sp500_close, tsx_close, vix, created_at)
    VALUES (@date, @sp500_close, @tsx_close, @vix, @created_at)
  `);

  const result = stmt.run({
    ...snapshot,
    created_at: now()
  });

  db.close();
  return result;
}

export function getSnapshotByDate(date) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM market_snapshots WHERE date = ?').get(date);
  db.close();
  return row;
}
