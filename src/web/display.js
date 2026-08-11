/**
 * src/web/display.js
 *
 * Pure, presentation-only formatting helpers shared across pages (Signals,
 * Trades, Positions, Home, ...). Extracted out of server.js so they can be
 * unit tested without pulling in server.js's top-level side effects
 * (app.listen(), ibkr.connect()). These never touch stored data — display
 * only.
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

// "Aug 10, 2026 at 2:11 PM ET" — full date + time, Eastern. Shared by
// Positions (fetchedAt) and Home (account/briefing snapshot timestamps).
// Invalid input is hardened to an em dash rather than falling back to the
// raw string, since a timestamp label with no parseable date is more
// misleading displayed raw than as "—".
export function formatTimestamp(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const datePart = d.toLocaleDateString('en-US', {
    timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric'
  });
  const timePart = d.toLocaleTimeString('en-US', {
    timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true
  });
  return `${datePart} at ${timePart} ET`;
}

// Home's fully-successful-and-empty Attention copy: every predicate ran
// and none found anything. Semantic, not decorative — distinguishes
// "Fane checked and found nothing" from a bare absence of items.
export function attentionCheckedAtMessage(iso) {
  return `Checked at ${formatTimestamp(iso)}. Nothing needs your attention.`;
}

// Home's undetermined-Attention copy: no items were found, but at least
// one predicate failed to complete, so Fane cannot positively assert
// nothing needs attention. Deliberately distinct wording from
// attentionCheckedAtMessage() above — the two must never be conflated.
export function attentionUndeterminedMessage(iso) {
  return `Checked at ${formatTimestamp(iso)}. Fane could not determine whether anything needs your attention.`;
}

// Home's partial-Attention caveat: known items exist (rendered separately,
// never suppressed) alongside one or more failed checks. This line only
// ever accompanies the item list — it never stands in for it.
export function attentionPartialCaveat(iso) {
  return `Checked at ${formatTimestamp(iso)}. One or more Attention checks could not be completed — this list may be incomplete.`;
}

// Which of Home's four Attention rendering states applies, given an
// evaluateHomeAttention() result ({ items, failedChecks }). Pure branch
// selection only — no HTML, no I/O — so it can be tested without
// importing server.js or home.js's DB-backed evaluator.
export function attentionRenderState({ items, failedChecks }) {
  const hasItems = items.length > 0;
  const hasFailed = failedChecks.length > 0;
  if (!hasItems && !hasFailed) return 'ok';
  if (!hasItems && hasFailed) return 'undetermined';
  if (hasItems && !hasFailed) return 'items';
  return 'items_partial';
}

// Plain-text lead-in for the Home briefing card: the first prose paragraph
// only, not the whole remainder of the document.
//
// 1) Skip the leading run of blank lines, Markdown heading lines
//    (e.g. "# Morning Market Briefing | ..." then "## 1. What Happened"),
//    and horizontal rules ("---") — a generated briefing typically opens
//    with a title heading, a rule, and a numbered section heading before
//    any prose begins. This only ever trims from the front.
// 2) Once a genuine prose line is found, collect lines only up to the next
//    blank line — the first paragraph's boundary. Later paragraphs and
//    later headings are never touched or scanned.
// 3) Strip simple inline Markdown markers (*, _, `, ~) from that paragraph
//    and collapse whitespace.
// 4) Truncate on a word boundary if longer than maxLength, appending "…"
//    only when truncation actually happened.
//
// Plain text out — the caller (Home) is responsible for HTML-escaping.
export function briefingExcerpt(markdown, maxLength = 220) {
  if (!markdown) return '';

  const lines = markdown.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    const isBlank = line === '';
    const isHeading = /^#{1,6}\s/.test(line);
    const isRule = /^-{3,}$/.test(line);
    if (isBlank || isHeading || isRule) {
      i++;
    } else {
      break;
    }
  }

  const paragraphLines = [];
  while (i < lines.length && lines[i].trim() !== '') {
    paragraphLines.push(lines[i].trim());
    i++;
  }

  const paragraph = paragraphLines.join(' ')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (paragraph.length <= maxLength) return paragraph;

  const truncated = paragraph.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  return `${truncated.slice(0, lastSpace > 0 ? lastSpace : maxLength)}…`;
}
