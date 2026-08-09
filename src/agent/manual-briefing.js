import { getMarketSnapshot } from './market.js';
import { generateBriefing } from './briefing.js';
import { saveMarketSnapshot } from '../db/market.js';
import { saveBriefing, getBriefingByDate } from '../db/briefing.js';
import { today, now } from '../utils/time.js';
import { getDb } from '../db/schema.js';
import { getCachedInstrumentMetadataBySymbols } from '../ibkr/instruments.js';

const contextDb = getDb();
const positions = contextDb.prepare(
  'SELECT symbol, position, avg_cost FROM positions WHERE snapshot_at = (SELECT MAX(snapshot_at) FROM positions)'
).all();
contextDb.close();

let instrumentMetadata = new Map();
try {
  const symbols = [...new Set([...positions.map(p => p.symbol), 'AAPL'])];
  instrumentMetadata = getCachedInstrumentMetadataBySymbols(symbols);
} catch (err) {
  console.log(`[${now()}] Instruments: cached metadata lookup failed, falling back to tickers: ${err.message}`);
}

const snapshot = await getMarketSnapshot();
await saveMarketSnapshot(snapshot);

const briefing = await generateBriefing(snapshot, positions, [], instrumentMetadata);
console.log(briefing);

saveBriefing(today(), briefing);
console.log('\nSaved to database.');

const retrieved = getBriefingByDate(today());
console.log('Verified in DB — date:', retrieved.date);
console.log('Briefing length:', retrieved.briefing_text.length, 'characters');
