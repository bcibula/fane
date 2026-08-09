/**
 * src/web/display.js
 *
 * Pure, presentation-only formatting helpers shared across pages (Signals,
 * Trades, ...). Extracted out of server.js so they can be unit tested
 * without pulling in server.js's top-level side effects (app.listen(),
 * ibkr.connect()). These never touch stored data — display only.
 */

// Known order_type codes (see src/db/schema.js orders.order_type). Anything
// else falls back to the raw stored code rather than guessing a label.
const ORDER_TYPE_LABELS = {
  MKT: 'MKT (Market)',
  LMT: 'LMT (Limit)',
};

export function formatOrderType(orderType) {
  if (!orderType) return 'MKT (Market)';
  return ORDER_TYPE_LABELS[orderType] || orderType;
}

// "Jun 17, 2026" instead of a raw ISO timestamp — display only, the
// underlying stored value is untouched. Eastern Time so a UTC timestamp
// near midnight doesn't roll into the wrong local calendar date.
export function formatDateOnly(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('en-US', {
    timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric'
  });
}

// "Friday, August 7, 2026" from a stored YYYY-MM-DD market date. Parses the
// date-only string by hand and renders it in the UTC calendar (not
// America/New_York) so the weekday/day can never shift across a timezone
// boundary the way `new Date('2026-08-07')` would under an Eastern offset.
export function formatMarketDate(dateOnly) {
  if (!dateOnly) return '—';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOnly);
  if (!match) return String(dateOnly);
  const [, year, month, day] = match;
  const d = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (isNaN(d.getTime())) return String(dateOnly);
  return d.toLocaleDateString('en-US', {
    timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });
}
