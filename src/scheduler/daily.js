import cron from 'node-cron';
import { getMarketSnapshot } from '../agent/market.js';
import { generateBriefing } from '../agent/briefing.js';
import { saveMarketSnapshot } from '../db/market.js';
import { saveBriefing } from '../db/briefing.js';
import { getDb } from '../db/schema.js';
import { now, today } from '../utils/time.js';
import { sendBriefingEmail } from '../agent/email.js';

function logRun(type, status, notes, error = null) {
  const db = getDb();
  db.prepare(`
    INSERT INTO agent_log (run_at, run_type, status, notes, error)
    VALUES (?, ?, ?, ?, ?)
  `).run(now(), type, status, notes, error);
  db.close();
}

async function runDailyBriefing() {
  console.log(`[${now()}] Fane daily briefing starting...`);
  
  try {
    const snapshot = await getMarketSnapshot();
    await saveMarketSnapshot(snapshot);
    
    const briefing = await generateBriefing(snapshot);

    saveBriefing(today(), briefing);

    
    console.log(briefing);

    await sendBriefingEmail(today(), briefing);
    console.log(`[${now()}] Email delivered.`);

    logRun('daily_brief', 'success', `Briefing saved and emailed for ${today()}`);
    console.log(`[${now()}] Done.`);

    
  } catch (error) {
    console.error(`[${now()}] Error:`, error.message);
    logRun('daily_brief', 'error', null, error.message);
  }
}

cron.schedule('0 9 * * 1-5', runDailyBriefing, {
  timezone: 'America/New_York'
});

console.log('Fane scheduler running. Daily briefing at 9am ET, Monday-Friday.');
console.log('Press Ctrl+C to stop.');
