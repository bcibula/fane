import { getMarketSnapshot } from '../agent/market.js';
import { generateBriefing } from '../agent/briefing.js';
import { saveMarketSnapshot } from '../db/market.js';
import { saveBriefing } from '../db/briefing.js';
import { today, now } from '../utils/time.js';
import { sendBriefingEmail } from '../agent/email.js';
import { getDb } from '../db/schema.js';

function extractLearnSection(text) {
  const match = text.match(/3\.\s+(?:One thing to learn|The one thing)[^\n]*\n+([\s\S]{0,300})/i);
  if (match) return match[1].trim().slice(0, 200);
  return text.slice(0, 150);
}

try {
  const contextDb = getDb();
  const positions = contextDb.prepare(
    'SELECT symbol, position, avg_cost FROM positions WHERE snapshot_at = (SELECT MAX(snapshot_at) FROM positions)'
  ).all();
  const recentBriefingRows = contextDb.prepare(
    'SELECT briefing_text FROM market_snapshots WHERE briefing_text IS NOT NULL ORDER BY date DESC LIMIT 7'
  ).all();
  contextDb.close();

  const recentBriefings = recentBriefingRows.map(r => extractLearnSection(r.briefing_text));

  const snapshot = await getMarketSnapshot();
  await saveMarketSnapshot(snapshot);
  const briefing = await generateBriefing(snapshot, positions, recentBriefings);
  saveBriefing(today(), briefing);
  await sendBriefingEmail(today(), briefing);

  const logDb = getDb();
  logDb.prepare('INSERT INTO agent_log (run_at, run_type, status, notes) VALUES (?, ?, ?, ?)').run(now(), 'daily_brief', 'success', 'Briefing saved and emailed for ' + today());
  logDb.close();
  console.log('Done.');
} catch (err) {
  const db = getDb();
  db.prepare('INSERT INTO agent_log (run_at, run_type, status, notes, error) VALUES (?, ?, ?, ?, ?)').run(now(), 'daily_brief', 'error', null, err.message);
  db.close();
  console.error('Error:', err.message);
  process.exit(1);
}
