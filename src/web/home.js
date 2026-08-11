/**
 * src/web/home.js
 *
 * Narrow, testable extraction of Home's Attention evaluation. Kept out of
 * server.js so it can be unit tested against an isolated DB fixture —
 * importing server.js directly would pull in its top-level side effects
 * (app.listen(), ibkr.connect()), which a test must never trigger.
 *
 * Read-only: every query here is a SELECT. No writes, no IBKR calls.
 *
 * Approved Attention contract: inability to establish one fact must not
 * erase another fact already established. Each predicate below is evaluated
 * independently inside its own try/catch — a thrown predicate is recorded
 * as a failed check, not silently treated as "nothing to report," and it
 * never suppresses an item a different, successful predicate already
 * found.
 */

// Must exactly match the notes literal src/scheduler/run-briefing.js and
// src/scheduler/daily.js write on a successful daily_brief run — see the
// comments at both producer sites.
function expectedBriefingNotes(dateOnly) {
  return `Briefing saved and emailed for ${dateOnly}`;
}

// db: an open better-sqlite3 database handle (caller owns open/close).
// easternState: the shape returned by easternNow() — { date, hour, isWeekday, ... }.
export function evaluateHomeAttention(db, easternState) {
  const items = [];
  const failedChecks = [];
  let briefingSkipped = false;

  // ── Pending signals ──────────────────────────────────────────────────
  try {
    const n = db.prepare(`SELECT COUNT(*) AS n FROM signals WHERE status = 'pending'`).get().n;
    if (n > 0) {
      items.push({
        type: 'pending_signals',
        message: `${n} pending signal${n === 1 ? '' : 's'} awaiting a decision`,
        href: '/signals'
      });
    }
  } catch (err) {
    failedChecks.push({ type: 'pending_signals', error: err.message });
  }

  // ── Briefing completion ──────────────────────────────────────────────
  // Process-outcome check, not a data-existence check: this asks whether
  // today's scheduled run reached its recorded successful outcome
  // (agent_log daily_brief/success), not merely whether briefing content
  // exists in market_snapshots — those are different questions, and only
  // the Morning Briefing card (in server.js) answers the latter.
  const briefingExpected = easternState.isWeekday && easternState.hour >= 10;
  if (!briefingExpected) {
    briefingSkipped = true;
  } else {
    try {
      const row = db.prepare(`
        SELECT 1 FROM agent_log
        WHERE run_type = 'daily_brief' AND status = 'success' AND notes = ?
        LIMIT 1
      `).get(expectedBriefingNotes(easternState.date));
      if (!row) {
        items.push({
          type: 'briefing_missing',
          message: "Today's briefing has not completed successfully",
          href: '/briefing'
        });
      }
    } catch (err) {
      failedChecks.push({ type: 'briefing_completion', error: err.message });
    }
  }

  return { items, failedChecks, briefingSkipped };
}
