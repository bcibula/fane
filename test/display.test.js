/**
 * test/display.test.js
 *
 * Focused coverage for the presentation-only helpers in src/web/display.js
 * behind the Trades page's learner-friendly order type labels, date-only
 * timestamps, the Briefing page's weekday-aware market dates, the shared
 * full timestamp used by Positions/Home, and Home's briefing excerpt. Pure
 * functions, no DB.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatOrderType, formatDateOnly, formatMarketDate,
  formatTimestamp, briefingExcerpt,
  attentionCheckedAtMessage, attentionUndeterminedMessage, attentionPartialCaveat, attentionRenderState
} from '../src/web/display.js';

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

test('formatTimestamp renders a full UTC timestamp as its Eastern date and time', () => {
  // Regression case: order-31 fill / paired portfolio snapshot timestamp.
  assert.equal(formatTimestamp('2026-08-10T18:11:45.412Z'), 'Aug 10, 2026 at 2:11 PM ET');
});

test('formatTimestamp returns an em dash for missing input', () => {
  assert.equal(formatTimestamp(null), '—');
  assert.equal(formatTimestamp(undefined), '—');
  assert.equal(formatTimestamp(''), '—');
});

test('formatTimestamp hardens invalid input to an em dash rather than echoing it raw', () => {
  assert.equal(formatTimestamp('not-a-date'), '—');
});

test('briefingExcerpt strips leading title/heading/rule lines down to the first prose', () => {
  const md = '# Morning Market Briefing | Monday, August 10, 2026\n\n---\n\n## 1. What Happened\n\nUS equities opened with modest gains.';
  assert.equal(briefingExcerpt(md, 200), 'US equities opened with modest gains.');
});

test('briefingExcerpt returns only the first prose paragraph — later headings and paragraphs are excluded', () => {
  // Required regression: the later heading and later paragraph are outside
  // the excerpt because the first prose paragraph has already ended.
  const md = '# Title\n\nFirst para.\n\n## Later section\n\nSecond para.';
  assert.equal(briefingExcerpt(md), 'First para.');
});

test('briefingExcerpt stops at the first blank line even without a later heading', () => {
  const md = '# Title\n\nFirst para., still going.\n\nSecond para. should not appear.';
  assert.equal(briefingExcerpt(md), 'First para., still going.');
});

test('briefingExcerpt strips simple inline Markdown markers from the paragraph', () => {
  const md = '# Title\n\nThis has **bold**, _em_, `code`, and ~strike~ markers.';
  assert.equal(briefingExcerpt(md), 'This has bold, em, code, and strike markers.');
});

test('briefingExcerpt truncates long prose at a word boundary and appends an ellipsis only when truncation occurs', () => {
  const md = '# Title\n\nAAAA BBBB CCCC DDDD EEEE FFFF GGGG HHHH IIII JJJJ';
  assert.equal(briefingExcerpt(md, 20), 'AAAA BBBB CCCC DDDD…');
  // Exactly at the limit — no truncation, no ellipsis.
  const short = '# Title\n\nAAAA BBBB';
  assert.equal(briefingExcerpt(short, 9), 'AAAA BBBB');
});

test('briefingExcerpt returns an empty string for missing input', () => {
  assert.equal(briefingExcerpt(null), '');
  assert.equal(briefingExcerpt(''), '');
});

test('attentionCheckedAtMessage renders the Eastern checked-at empty-state copy', () => {
  assert.equal(
    attentionCheckedAtMessage('2026-08-10T18:11:45.412Z'),
    'Checked at Aug 10, 2026 at 2:11 PM ET. Nothing needs your attention.'
  );
});

test('attentionCheckedAtMessage still reads sensibly when the timestamp is unavailable', () => {
  assert.equal(attentionCheckedAtMessage(null), 'Checked at —. Nothing needs your attention.');
});

test('attentionUndeterminedMessage never claims "Nothing needs your attention"', () => {
  const msg = attentionUndeterminedMessage('2026-08-10T18:11:45.412Z');
  assert.equal(msg, 'Checked at Aug 10, 2026 at 2:11 PM ET. Fane could not determine whether anything needs your attention.');
  assert.ok(!msg.includes('Nothing needs your attention'), `must not overclaim, got: ${msg}`);
});

test('attentionPartialCaveat flags an incomplete list without asserting "Nothing needs your attention"', () => {
  const msg = attentionPartialCaveat('2026-08-10T18:11:45.412Z');
  assert.equal(msg, 'Checked at Aug 10, 2026 at 2:11 PM ET. One or more Attention checks could not be completed — this list may be incomplete.');
  assert.ok(!msg.includes('Nothing needs your attention'), `must not overclaim, got: ${msg}`);
});

test('attentionRenderState: no items, no failed checks -> ok (positive assertion state)', () => {
  assert.equal(attentionRenderState({ items: [], failedChecks: [] }), 'ok');
});

test('attentionRenderState: no items, a failed check -> undetermined (never "ok")', () => {
  assert.equal(
    attentionRenderState({ items: [], failedChecks: [{ type: 'briefing_completion', error: 'boom' }] }),
    'undetermined'
  );
});

test('attentionRenderState: items present, no failed checks -> items (plain list)', () => {
  assert.equal(
    attentionRenderState({ items: [{ type: 'pending_signals', message: 'x', href: '/signals' }], failedChecks: [] }),
    'items'
  );
});

test('attentionRenderState: items present AND a failed check -> items_partial (known items survive, per the approved Attention contract)', () => {
  assert.equal(
    attentionRenderState({
      items: [{ type: 'pending_signals', message: 'x', href: '/signals' }],
      failedChecks: [{ type: 'briefing_completion', error: 'boom' }]
    }),
    'items_partial'
  );
});
