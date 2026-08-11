import { getMarketSnapshot } from '../agent/market.js';
import { generateBriefing } from '../agent/briefing.js';
import { saveMarketSnapshot } from '../db/market.js';
import { saveBriefing } from '../db/briefing.js';
import { today, now } from '../utils/time.js';
import { sendBriefingEmail } from '../agent/email.js';
import { getDb } from '../db/schema.js';
import { getCachedInstrumentMetadataBySymbols } from '../ibkr/instruments.js';

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

  let instrumentMetadata = new Map();
  try {
    const symbols = [...new Set([...positions.map(p => p.symbol), 'AAPL'])];
    instrumentMetadata = getCachedInstrumentMetadataBySymbols(symbols);
  } catch (err) {
    console.log(`[${now()}] Instruments: cached metadata lookup failed, falling back to tickers: ${err.message}`);
  }

  const snapshot = await getMarketSnapshot();
  await saveMarketSnapshot(snapshot);
  const briefing = await generateBriefing(snapshot, positions, recentBriefings, instrumentMetadata);
  saveBriefing(today(), briefing);
  await sendBriefingEmail(today(), briefing);

  // This exact notes literal is consumed by Home's briefing-completion
  // predicate (evaluateHomeAttention() in src/web/home.js), which matches
  // on 'Briefing saved and emailed for ' + <today's Eastern date> to decide
  // whether today's scheduled briefing reached a successful outcome. Keep
  // the literal in sync with that match if it ever changes here.
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
