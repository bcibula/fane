/**
 * test/home.test.js
 *
 * Coverage for evaluateHomeAttention() (src/web/home.js), Home's Attention
 * evaluator. Runs against an isolated in-memory better-sqlite3 database —
 * never ~/fane/data/fane.db — and never imports src/web/server.js, which
 * has app.listen()/ibkr.connect() side effects at import time.
 *
 * The approved Attention contract's "known item survives another failed
 * check" case matters most here: the inability to establish one fact (a
 * thrown predicate) must not erase another fact already established (an
 * item a different, successful predicate already found).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { evaluateHomeAttention } from '../src/web/home.js';

function makeDb({ withSignals = true, withAgentLog = true } = {}) {
  const db = new Database(':memory:');
  if (withSignals) {
    db.exec(`CREATE TABLE signals (id INTEGER PRIMARY KEY, status TEXT NOT NULL)`);
  }
  if (withAgentLog) {
    db.exec(`CREATE TABLE agent_log (
      id INTEGER PRIMARY KEY, run_at TEXT, run_type TEXT, status TEXT, notes TEXT, error TEXT
    )`);
  }
  return db;
}

function insertPendingSignal(db) {
  db.prepare(`INSERT INTO signals (status) VALUES ('pending')`).run();
}

function insertBriefingSuccess(db, dateOnly) {
  db.prepare(`
    INSERT INTO agent_log (run_at, run_type, status, notes)
    VALUES (?, 'daily_brief', 'success', ?)
  `).run('irrelevant', `Briefing saved and emailed for ${dateOnly}`);
}

const WEEKDAY_AFTER_10 = { date: '2026-08-10', hour: 14, isWeekday: true };  // Monday, 2pm ET
const WEEKDAY_BEFORE_10 = { date: '2026-08-10', hour: 9, isWeekday: true };  // Monday, 9am ET
const SATURDAY_AFTER_10 = { date: '2026-08-08', hour: 14, isWeekday: false }; // Saturday, 2pm ET

test('1. Empty: no pending signals, weekday after 10, matching daily_brief success — no items, no failed checks', () => {
  const db = makeDb();
  insertBriefingSuccess(db, WEEKDAY_AFTER_10.date);

  const result = evaluateHomeAttention(db, WEEKDAY_AFTER_10);

  assert.deepEqual(result.items, []);
  assert.deepEqual(result.failedChecks, []);
  assert.equal(result.briefingSkipped, false);
  db.close();
});

test('2. Pending signal: result contains the decision-required item', () => {
  const db = makeDb();
  insertPendingSignal(db);
  insertBriefingSuccess(db, WEEKDAY_AFTER_10.date); // keep the briefing predicate quiet

  const result = evaluateHomeAttention(db, WEEKDAY_AFTER_10);

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].type, 'pending_signals');
  assert.match(result.items[0].message, /1 pending signal awaiting a decision/);
  assert.equal(result.items[0].href, '/signals');
  assert.deepEqual(result.failedChecks, []);
  db.close();
});

test('3. Missing expected briefing: weekday after 10, no matching success row — briefing item present', () => {
  const db = makeDb(); // no agent_log rows inserted at all

  const result = evaluateHomeAttention(db, WEEKDAY_AFTER_10);

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].type, 'briefing_missing');
  assert.equal(result.items[0].message, "Today's briefing has not completed successfully");
  assert.equal(result.items[0].href, '/briefing');
  assert.deepEqual(result.failedChecks, []);
  assert.equal(result.briefingSkipped, false);
  db.close();
});

test('4. Weekend skip: Saturday, no success row — no item, not a failed check, predicate marked skipped', () => {
  const db = makeDb(); // no agent_log rows

  const result = evaluateHomeAttention(db, SATURDAY_AFTER_10);

  assert.deepEqual(result.items, []);
  assert.deepEqual(result.failedChecks, []);
  assert.equal(result.briefingSkipped, true);
  db.close();
});

test('5. Before-10 skip: weekday before 10, no success row — same as weekend skip', () => {
  const db = makeDb(); // no agent_log rows

  const result = evaluateHomeAttention(db, WEEKDAY_BEFORE_10);

  assert.deepEqual(result.items, []);
  assert.deepEqual(result.failedChecks, []);
  assert.equal(result.briefingSkipped, true);
  db.close();
});

test('6. Undetermined: a predicate that throws is reported as a failed check, not treated as empty', () => {
  // No `signals` table at all — the pending-signals predicate's query throws.
  const db = makeDb({ withSignals: false });
  insertBriefingSuccess(db, WEEKDAY_AFTER_10.date);

  const result = evaluateHomeAttention(db, WEEKDAY_AFTER_10);

  assert.deepEqual(result.items, []);
  assert.equal(result.failedChecks.length, 1);
  assert.equal(result.failedChecks[0].type, 'pending_signals');
  assert.ok(result.failedChecks[0].error, 'expected an error message on the failed check');
  db.close();
});

test('7. Known item survives another failed check (approved Attention contract)', () => {
  // signals table present with a pending row (known fact); agent_log table
  // absent so the briefing predicate throws (undetermined fact). The known
  // item must still come back even though the other predicate failed.
  const db = makeDb({ withAgentLog: false });
  insertPendingSignal(db);

  const result = evaluateHomeAttention(db, WEEKDAY_AFTER_10);

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].type, 'pending_signals');
  assert.equal(result.failedChecks.length, 1);
  assert.equal(result.failedChecks[0].type, 'briefing_completion');
  assert.ok(result.failedChecks[0].error, 'expected an error message on the failed check');
  db.close();
});
