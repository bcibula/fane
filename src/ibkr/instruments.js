/**
 * src/ibkr/instruments.js
 *
 * Shared instrument-metadata mechanism: descriptive names and learner-facing
 * security-type labels, resolved from IBKR contract details and cached in
 * the `instrument_metadata` table (src/db/schema.js).
 *
 * Intended to be reusable by any page that renders IBKR contracts — currently
 * /positions, with Signals/Trades/briefing as future consumers — rather than
 * duplicating ticker → name maps or hard-coding them in server.js.
 *
 * Design:
 *  - Lookup key is conId, IBKR's stable contract identity. Symbols alone are
 *    ambiguous across exchanges/security types; conId is not.
 *  - Cache-first: resolveInstrumentMetadata() only issues a reqContractDetails
 *    call for conIds missing from the cache, and only one at a time
 *    (sequential, not concurrent) — deliberately conservative about pacing
 *    against IB Gateway.
 *  - A failed or missing lookup for one conId never throws for the whole
 *    batch — callers fall back to the ticker symbol for that one instrument.
 */

import { EventName } from '@stoqey/ib';
import ibkr from './connection.js';
import { getDb } from '../db/schema.js';
import { now } from '../utils/time.js';

// ── Configuration ─────────────────────────────────────────────────────────────

const CONTRACT_DETAILS_TIMEOUT_MS = 10_000;

// reqId namespace for contract-details lookups — distinct from the reqIds
// used elsewhere (account.js's ACCOUNT_SUMMARY_REQ_ID=1001, orders.js's
// reqIds(-1)-assigned order IDs) so a stray late event can't be mistaken
// for one of ours.
let nextReqId = 9001;

// Learner-facing labels for IBKR SecType codes. Falls back to the raw code
// for anything not listed here.
const SEC_TYPE_LABELS = {
  STK:    'Stock',
  ETF:    'ETF',
  OPT:    'Option',
  FUT:    'Future',
  CONTFUT:'Future',
  CASH:   'Forex',
  BOND:   'Bond',
  CFD:    'CFD',
  FOP:    'Futures Option',
  WAR:    'Warrant',
  IOPT:   'Warrant',
  FWD:    'Forward',
  BAG:    'Combo',
  IND:    'Index',
  FUND:   'Mutual Fund',
  CMDTY:  'Commodity',
  CRYPTO: 'Cryptocurrency',
};

// ── describeSecurityType ─────────────────────────────────────────────────────

/**
 * Learner-facing "<code> (<label>)" description for a security type, e.g.
 * "STK (Stock)" or "ETF (ETF)".
 *
 * IBKR reports ETFs as secType STK with stockType "ETF" — there is no
 * separate ETF SecType — so this is the only place that distinction
 * surfaces for display purposes.
 *
 * Pure function, no IBKR dependency — safe to reuse from any page.
 *
 * @param {string} secType    IBKR SecType, e.g. "STK".
 * @param {string} [stockType] IBKR ContractDetails.stockType, e.g. "ETF".
 */
export function describeSecurityType(secType, stockType) {
  const isEtf = secType === 'STK' && (stockType || '').toUpperCase() === 'ETF';
  const code  = isEtf ? 'ETF' : secType;
  const label = SEC_TYPE_LABELS[code] || code || 'Unknown';
  return `${code || '—'} (${label})`;
}

// ── DB cache ──────────────────────────────────────────────────────────────────

function readCached(conIds) {
  if (conIds.length === 0) return new Map();
  const db = getDb();
  try {
    const placeholders = conIds.map(() => '?').join(',');
    const rows = db.prepare(
      `SELECT * FROM instrument_metadata WHERE con_id IN (${placeholders})`
    ).all(...conIds);
    return new Map(rows.map(r => [r.con_id, r]));
  } finally {
    db.close();
  }
}

function writeCached(record) {
  const db = getDb();
  try {
    db.prepare(`
      INSERT INTO instrument_metadata (con_id, symbol, long_name, sec_type, stock_type, currency, exchange, updated_at)
      VALUES (@conId, @symbol, @longName, @secType, @stockType, @currency, @exchange, @updatedAt)
      ON CONFLICT(con_id) DO UPDATE SET
        symbol     = excluded.symbol,
        long_name  = excluded.long_name,
        sec_type   = excluded.sec_type,
        stock_type = excluded.stock_type,
        currency   = excluded.currency,
        exchange   = excluded.exchange,
        updated_at = excluded.updated_at
    `).run(record);
  } finally {
    db.close();
  }
}

// ── IBKR contract-details lookup ─────────────────────────────────────────────

/**
 * One-shot reqContractDetails() lookup by conId, the unambiguous IBKR
 * contract identity. Resolves to the ContractDetails object, or null if
 * IBKR returns no match (contractDetailsEnd with nothing received).
 */
function getContractDetails(conId) {
  const api = ibkr.getApi();
  const reqId = nextReqId++;
  let details = null;

  return new Promise((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      cleanup();
      reject(new Error(`getContractDetails: timed out waiting for contractDetailsEnd (conId=${conId})`));
    }, CONTRACT_DETAILS_TIMEOUT_MS);

    function onDetails(rid, contractDetails) {
      if (rid !== reqId) return; // stale/unrelated event — ignore
      details = contractDetails;
    }

    function onEnd(rid) {
      if (rid !== reqId) return; // stale/unrelated event — ignore
      if (settled) return;
      cleanup();
      resolve(details);
    }

    function onError(err, code, rid) {
      if (rid !== reqId) return; // stale/unrelated event — ignore
      if (settled) return;
      if (code >= 1000) return;
      cleanup();
      reject(new Error(`getContractDetails: IB error [${code}] conId=${conId}: ${err?.message ?? err}`));
    }

    function cleanup() {
      settled = true;
      clearTimeout(timer);
      api.removeListener(EventName.contractDetails,    onDetails);
      api.removeListener(EventName.contractDetailsEnd, onEnd);
      api.removeListener(EventName.error,               onError);
    }

    api.on(EventName.contractDetails,    onDetails);
    api.on(EventName.contractDetailsEnd, onEnd);
    api.on(EventName.error,              onError);

    api.reqContractDetails(reqId, { conId });
  });
}

// ── resolveInstrumentMetadata ────────────────────────────────────────────────

/**
 * Resolve descriptive metadata (long name, stock type) for a set of
 * positions, cache-first and keyed by conId.
 *
 * Only conIds missing from the cache trigger a live reqContractDetails
 * call, one at a time. A failed lookup for one conId is logged and skipped
 * — it never fails the batch or the caller's page render.
 *
 * @param {Array<{conId: number, symbol: string}>} positions
 * @returns {Promise<Map<number, {longName: string|null, secType: string|null, stockType: string|null}>>}
 */
export async function resolveInstrumentMetadata(positions) {
  const conIds = [...new Set(
    positions.map(p => p.conId).filter(id => id != null)
  )];

  const cached = readCached(conIds);
  const result = new Map();
  for (const [conId, row] of cached) {
    result.set(conId, { longName: row.long_name, secType: row.sec_type, stockType: row.stock_type });
  }

  const missing = conIds.filter(id => !cached.has(id));

  for (const conId of missing) {
    const position = positions.find(p => p.conId === conId);
    try {
      const details = await getContractDetails(conId);
      if (!details) {
        console.log(`[${now()}] Instruments: no contract details returned for conId=${conId}`);
        continue;
      }
      const record = {
        conId,
        symbol:    details.contract?.symbol   ?? position?.symbol ?? '',
        longName:  details.longName ?? null,
        secType:   details.contract?.secType  ?? position?.secType ?? null,
        stockType: details.stockType ?? null,
        currency:  details.contract?.currency ?? position?.currency ?? null,
        exchange:  details.contract?.primaryExch || details.contract?.exchange || position?.exchange || null,
        updatedAt: now(),
      };
      writeCached(record);
      result.set(conId, { longName: record.longName, secType: record.secType, stockType: record.stockType });
    } catch (err) {
      console.log(`[${now()}] Instruments: contract details lookup failed for conId=${conId}: ${err.message}`);
      // Not cached, not in result — caller falls back to ticker symbol.
    }
  }

  return result;
}

// ── getCachedInstrumentMetadataBySymbols ─────────────────────────────────────

/**
 * Cache-only, symbol-keyed metadata lookup for pages that have only a ticker
 * (no conId) — currently Signals, with Trades/briefing as future consumers.
 * Never issues a live IBKR call; reads whatever resolveInstrumentMetadata()
 * has already cached in instrument_metadata.
 *
 * A symbol resolves only when it maps to exactly one cached conId. Real
 * ticker symbols are reused across exchanges/security types, so a symbol
 * backed by more than one cached conId is ambiguous and is deliberately
 * left unresolved — callers fall back to the ticker. This does not weaken
 * the conId-keyed authoritative model above; it's a strictly read-only,
 * best-effort layer on top of the same cache.
 *
 * @param {Array<string>} symbols
 * @returns {Map<string, {longName: string|null, secType: string|null, stockType: string|null}>}
 *   keyed by the normalized (trimmed, uppercased) symbol
 */
export function getCachedInstrumentMetadataBySymbols(symbols) {
  const normalized = [...new Set(
    (symbols || [])
      .filter(s => s != null && String(s).trim() !== '')
      .map(s => String(s).trim().toUpperCase())
  )];
  if (normalized.length === 0) return new Map();

  const db = getDb();
  let rows;
  try {
    const placeholders = normalized.map(() => '?').join(',');
    rows = db.prepare(
      `SELECT con_id, symbol, long_name, sec_type, stock_type
       FROM instrument_metadata WHERE UPPER(symbol) IN (${placeholders})`
    ).all(...normalized);
  } finally {
    db.close();
  }

  const uniqueBySymbol = groupUniqueBySymbol(rows);
  const result = new Map();
  for (const [symbol, row] of uniqueBySymbol) {
    result.set(symbol, { longName: row.long_name, secType: row.sec_type, stockType: row.stock_type });
  }
  return result;
}

// ── formatInstrumentLabel ────────────────────────────────────────────────────

/**
 * Prose label for a ticker, e.g. "Apple Inc. (AAPL)" when a descriptive name
 * is available, falling back to the bare ticker ("AAPL") otherwise. Used for
 * the first meaningful mention of an instrument in generated text (briefing).
 *
 * Pure function — no DB or IBKR dependency, never guesses a name.
 *
 * @param {string} symbol
 * @param {{longName?: string|null}} [metadata]
 * @returns {string}
 */
export function formatInstrumentLabel(symbol, metadata) {
  const ticker = String(symbol ?? '').trim().toUpperCase();
  const longName = metadata?.longName ? String(metadata.longName).trim() : '';
  return longName ? `${longName} (${ticker})` : ticker;
}

/**
 * Pure grouping helper: given instrument_metadata-shaped rows (each with a
 * `symbol` and `con_id`), returns a Map of normalized-symbol -> row for
 * symbols backed by exactly one distinct conId. Symbols backed by more than
 * one conId are ambiguous and excluded entirely. Exported so this logic can
 * be unit tested without touching the database.
 *
 * @param {Array<{symbol: string, con_id: number}>} rows
 * @returns {Map<string, object>}
 */
export function groupUniqueBySymbol(rows) {
  const conIdsBySymbol = new Map(); // normalized symbol -> Set<conId>
  const rowByKey = new Map();       // `${symbol}|${conId}` -> row

  for (const row of rows) {
    const key = String(row.symbol).trim().toUpperCase();
    if (!conIdsBySymbol.has(key)) conIdsBySymbol.set(key, new Set());
    conIdsBySymbol.get(key).add(row.con_id);
    rowByKey.set(`${key}|${row.con_id}`, row);
  }

  const result = new Map();
  for (const [symbol, conIds] of conIdsBySymbol) {
    if (conIds.size === 1) {
      const [conId] = conIds;
      result.set(symbol, rowByKey.get(`${symbol}|${conId}`));
    }
  }
  return result;
}
