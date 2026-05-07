import { getDb } from './schema.js';
import { now } from '../utils/time.js';

export function saveBriefing(date, briefingText) {
  const db = getDb();
  
  const stmt = db.prepare(`
    UPDATE market_snapshots 
    SET briefing_text = ?, created_at = ?
    WHERE date = ?
  `);

  const result = stmt.run(briefingText, now(), date);
  
  db.close();
  return result;
}

export function getBriefingByDate(date) {
  const db = getDb();
  const row = db.prepare(`
    SELECT date, briefing_text, created_at 
    FROM market_snapshots 
    WHERE date = ?
  `).get(date);
  db.close();
  return row;
}
