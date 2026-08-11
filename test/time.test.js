/**
 * test/time.test.js
 *
 * Coverage for easternNow() (src/utils/time.js), the Eastern wall-clock
 * breakdown Home's Attention rule uses to decide whether today's briefing
 * is expected yet. Time-dependent, so assertions check structural validity
 * and cross-check against an independent Eastern-timezone computation
 * rather than hardcoding a wall-clock value.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { easternNow } from '../src/utils/time.js';

test('easternNow returns a well-formed Eastern date/time breakdown', () => {
  const en = easternNow();
  assert.match(en.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(en.hour >= 0 && en.hour <= 23, `hour out of range: ${en.hour}`);
  assert.ok(en.minute >= 0 && en.minute <= 59, `minute out of range: ${en.minute}`);
  assert.ok(en.weekday >= 0 && en.weekday <= 6, `weekday out of range: ${en.weekday}`);
  assert.equal(en.isWeekday, en.weekday >= 1 && en.weekday <= 5);
});

test('easternNow date matches an independent Eastern-timezone computation', () => {
  const en = easternNow();
  const expected = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  assert.equal(en.date, expected);
});
