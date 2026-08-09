/**
 * test/display.test.js
 *
 * Focused coverage for formatOrderType()/formatDateOnly() (src/web/display.js),
 * the presentation-only helpers behind the Trades page's learner-friendly
 * order type labels and date-only timestamps. Pure functions, no DB.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatOrderType, formatDateOnly } from '../src/web/display.js';

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
