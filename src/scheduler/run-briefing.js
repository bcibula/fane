import { getMarketSnapshot } from '../agent/market.js';
import { generateBriefing } from '../agent/briefing.js';
import { saveMarketSnapshot } from '../db/market.js';
import { saveBriefing } from '../db/briefing.js';
import { today, now } from '../utils/time.js';
import { sendBriefingEmail } from '../agent/email.js';
import { getDb } from '../db/schema.js';

try {
  const snapshot = await getMarketSnapshot();
  await saveMarketSnapshot(snapshot);
  const briefing = await generateBriefing(snapshot);
  saveBriefing(today(), briefing);
  await sendBriefingEmail(today(), briefing);
  const db = getDb();
  db.prepare('INSERT INTO agent_log (run_at, run_type, status, notes) VALUES (?, ?, ?, ?)').run(now(), 'daily_brief', 'success', 'Briefing saved and emailed for ' + today());
  db.close();
  console.log('Done.');
} catch (err) {
  const db = getDb();
  db.prepare('INSERT INTO agent_log (run_at, run_type, status, notes, error) VALUES (?, ?, ?, ?, ?)').run(now(), 'daily_brief', 'error', null, err.message);
  db.close();
  console.error('Error:', err.message);
  process.exit(1);
}
