/**
 * test/display.test.js
 *
 * Focused coverage for formatOrderType()/formatDateOnly()/formatMarketDate()
 * (src/web/display.js), the presentation-only helpers behind the Trades
 * page's learner-friendly order type labels, date-only timestamps, and the
 * Briefing page's weekday-aware market dates. Pure functions, no DB.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatOrderType, formatDateOnly, formatMarketDate } from '../src/web/display.js';

test('formatOrderType expands known codes with a human-readable label', () => {
  assert.equal(formatOrderType('MKT'), 'MKT (Market)');
  assert.equal(formatOrderType('LMT'), 'LMT (Limit)');
});

test('formatOrderType falls back to the raw stored code for unknown types', () => {
  assert.equal(formatOrderType('STP'), 'STP');
});

test('formatOrderType defaults missing/empty values to Market', () => {
  assert.equal(formatOrderType(null), 'MKT (Market)');
  assert.equal(formatOrderType(''), 'MKT (Market)');
});

test('formatDateOnly renders a UTC timestamp as its Eastern calendar date', () => {
  // Just after midnight UTC — should resolve to the prior evening in ET.
  assert.equal(formatDateOnly('2026-06-18T02:30:00.000Z'), 'Jun 17, 2026');
});

test('formatDateOnly returns an em dash for missing input', () => {
  assert.equal(formatDateOnly(null), '—');
  assert.equal(formatDateOnly(undefined), '—');
});

test('formatDateOnly falls back to the raw string for unparseable input', () => {
  assert.equal(formatDateOnly('not-a-date'), 'not-a-date');
});

test('formatMarketDate renders a YYYY-MM-DD market date with its weekday', () => {
  assert.equal(formatMarketDate('2026-08-07'), 'Friday, August 7, 2026');
});

test('formatMarketDate is not hard-coded to a single weekday/date', () => {
  assert.equal(formatMarketDate('2026-08-03'), 'Monday, August 3, 2026');
});

test('formatMarketDate never day-shifts across the UTC/Eastern boundary', () => {
  // A naive `new Date('2026-08-07')` formatted in America/New_York would
  // resolve to Aug 6 (prior evening) under EDT. UTC-anchored parsing must not.
  assert.equal(formatMarketDate('2026-08-07'), 'Friday, August 7, 2026');
});

test('formatMarketDate returns an em dash for missing input', () => {
  assert.equal(formatMarketDate(null), '—');
  assert.equal(formatMarketDate(undefined), '—');
});

test('formatMarketDate falls back to the raw string for unparseable input', () => {
  assert.equal(formatMarketDate('not-a-date'), 'not-a-date');
  assert.equal(formatMarketDate('2026-08-07T00:00:00Z'), '2026-08-07T00:00:00Z');
});
