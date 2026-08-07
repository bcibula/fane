import { getMarketSnapshot } from './market.js';
import { generateBriefing } from './briefing.js';
import { saveMarketSnapshot } from '../db/market.js';
import { saveBriefing, getBriefingByDate } from '../db/briefing.js';
import { today } from '../utils/time.js';

const snapshot = await getMarketSnapshot();
await saveMarketSnapshot(snapshot);

const briefing = await generateBriefing(snapshot);
console.log(briefing);

saveBriefing(today(), briefing);
console.log('\nSaved to database.');

const retrieved = getBriefingByDate(today());
console.log('Verified in DB — date:', retrieved.date);
console.log('Briefing length:', retrieved.briefing_text.length, 'characters');
