/**
 * src/ibkr/account.js
 *
 * Pulls current paper account state from IB Gateway:
 *  - getPositions()      — open positions (non-zero) via reqPositions()
 *  - getAccountSummary() — key account values via reqAccountSummary()
 *  - getAccountSnapshot()— both in parallel; this is what server routes use
 *
 * Both IB calls are event-based (fire-and-forget + async events). Each is
 * wrapped in a Promise that resolves on the *End event and rejects on timeout
 * or a real error (code < 1000). Listener cleanup is guaranteed on every
 * exit path — resolve, reject, and timeout — to prevent listener accumulation
 * on the IBApi EventEmitter across repeated calls.
 *
 * This module reads only. It never submits orders. Order logic lives in
 * src/ibkr/orders.js behind the human approval gate.
 */

import { EventName } from '@stoqey/ib';
import ibkr from './connection.js';
import { now } from '../utils/time.js';

// ── Configuration ─────────────────────────────────────────────────────────────

// Fixed reqId for account summary. IB requires a unique reqId per active
// subscription. We cancel before each new call so reuse is safe.
const ACCOUNT_SUMMARY_REQ_ID = 1001;

// Account summary tags to request. Covers everything needed for the
// positions UI and Stage 5 performance analytics.
const SUMMARY_TAGS = [
  'NetLiquidation',     // Total account value (cash + positions)
  'TotalCashValue',     // Cash on hand
  'BuyingPower',        // Available buying power (paper = same as cash for stocks)
  'AvailableFunds',     // Funds available for new positions
  'UnrealizedPnL',      // Unrealized P&L across all open positions
  'RealizedPnL',        // Realized P&L for the session
  'GrossPositionValue', // Gross market value of all open positions
].join(',');

// How long to wait for IB to respond before giving up.
const TIMEOUT_MS = 15_000;

// ── getPositions ──────────────────────────────────────────────────────────────

/**
 * Fetch all open (non-zero) positions from IB Gateway.
 *
 * IB also sends positions with pos=0 for recently closed trades.
 * Those are filtered out — they have no bearing on current exposure.
 *
 * @returns {Promise<Array>} Array of position objects.
 *
 * Position shape:
 *   {
 *     account:    string,   // IB account ID (e.g. "DU1234567")
 *     symbol:     string,   // Ticker symbol (e.g. "AAPL")
 *     secType:    string,   // Security type (e.g. "STK")
 *     currency:   string,   // Currency (e.g. "USD")
 *     exchange:   string,   // Primary exchange
 *     conId:      number,   // IB contract ID (unique identifier)
 *     position:   number,   // Number of shares held (positive = long)
 *     avgCost:    number,   // Average cost basis per share
 *   }
 */
export function getPositions() {
  const api = ibkr.getApi();
  const positions = [];

  return new Promise((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      cleanup();
      try { api.cancelPositions(); } catch (_) {}
      reject(new Error('getPositions: timed out waiting for positionEnd'));
    }, TIMEOUT_MS);

    function onPosition(account, contract, pos, avgCost) {
      // IB sends pos=0 for closed positions — skip them.
      if (pos === 0) return;
      positions.push({
        account,
        symbol:   contract.symbol,
        secType:  contract.secType,
        currency: contract.currency,
        exchange: contract.primaryExch || contract.exchange || '',
        conId:    contract.conId,
        position: pos,
        avgCost,
      });
    }

    function onEnd() {
      if (settled) return;
      cleanup();
      // Cancel the subscription — we don't want continuous position updates,
      // just a one-shot read. IB will continue streaming without this cancel.
      try { api.cancelPositions(); } catch (_) {}
      resolve(positions);
    }

    function onError(err, code, reqId) {
      if (settled) return;
      // Informational codes (>= 1000) are noise — let them through.
      // Only real errors (< 1000) should reject the promise.
      if (code >= 1000) return;
      // reqId for position errors is typically -1. We don't filter by reqId
      // here because position errors aren't scoped to a request ID.
      cleanup();
      try { api.cancelPositions(); } catch (_) {}
      reject(new Error(`getPositions: IB error [${code}] reqId=${reqId}: ${err?.message ?? err}`));
    }

    function cleanup() {
      settled = true;
      clearTimeout(timer);
      api.removeListener(EventName.position,    onPosition);
      api.removeListener(EventName.positionEnd, onEnd);
      api.removeListener(EventName.error,       onError);
    }

    api.on(EventName.position,    onPosition);
    api.on(EventName.positionEnd, onEnd);
    api.on(EventName.error,       onError);

    api.reqPositions();
  });
}

// ── getAccountSummary ─────────────────────────────────────────────────────────

/**
 * Fetch account-level summary values from IB Gateway.
 *
 * IB fires one accountSummary event per tag, then accountSummaryEnd.
 * Numeric values are parsed to floats. Non-numeric values (rare) are kept
 * as strings.
 *
 * @returns {Promise<Object>} Map of tag → { value, currency }.
 *
 * Example output:
 *   {
 *     NetLiquidation:     { value: 100000.00, currency: 'USD' },
 *     TotalCashValue:     { value: 97500.00,  currency: 'USD' },
 *     BuyingPower:        { value: 97500.00,  currency: 'USD' },
 *     AvailableFunds:     { value: 97500.00,  currency: 'USD' },
 *     UnrealizedPnL:      { value: 2500.00,   currency: 'USD' },
 *     RealizedPnL:        { value: 0.00,      currency: 'USD' },
 *     GrossPositionValue: { value: 2500.00,   currency: 'USD' },
 *   }
 */
export function getAccountSummary() {
  const api = ibkr.getApi();
  const summary = {};

  return new Promise((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      cleanup();
      try { api.cancelAccountSummary(ACCOUNT_SUMMARY_REQ_ID); } catch (_) {}
      reject(new Error('getAccountSummary: timed out waiting for accountSummaryEnd'));
    }, TIMEOUT_MS);

    function onSummary(reqId, account, tag, value, currency) {
      // Filter to our request — other callers could have active subscriptions.
      if (reqId !== ACCOUNT_SUMMARY_REQ_ID) return;
      const parsed = parseFloat(value);
      summary[tag] = {
        value:    isNaN(parsed) ? value : parsed,
        currency,
      };
    }

    function onSummaryEnd(reqId) {
      if (settled) return;
      if (reqId !== ACCOUNT_SUMMARY_REQ_ID) return;
      cleanup();
      // Cancel the subscription to free the IB Gateway slot.
      try { api.cancelAccountSummary(ACCOUNT_SUMMARY_REQ_ID); } catch (_) {}
      resolve(summary);
    }

    function onError(err, code, reqId) {
      if (settled) return;
      // Only handle errors scoped to our request ID.
      if (reqId !== ACCOUNT_SUMMARY_REQ_ID) return;
      if (code >= 1000) return;
      cleanup();
      try { api.cancelAccountSummary(ACCOUNT_SUMMARY_REQ_ID); } catch (_) {}
      reject(new Error(`getAccountSummary: IB error [${code}]: ${err?.message ?? err}`));
    }

    function cleanup() {
      settled = true;
      clearTimeout(timer);
      api.removeListener(EventName.accountSummary,    onSummary);
      api.removeListener(EventName.accountSummaryEnd, onSummaryEnd);
      api.removeListener(EventName.error,             onError);
    }

    api.on(EventName.accountSummary,    onSummary);
    api.on(EventName.accountSummaryEnd, onSummaryEnd);
    api.on(EventName.error,             onError);

    api.reqAccountSummary(ACCOUNT_SUMMARY_REQ_ID, 'All', SUMMARY_TAGS);
  });
}

// ── getAccountSnapshot ────────────────────────────────────────────────────────

/**
 * Combined account snapshot: positions + summary in one await.
 *
 * Runs both requests in parallel via Promise.all — they use separate
 * reqIds and separate event streams, so parallel execution is safe.
 *
 * This is the primary export used by the /positions route in server.js.
 * It never writes to the database — that's the caller's responsibility.
 *
 * @returns {Promise<Object>}
 *   {
 *     positions: Array,   // from getPositions()
 *     summary:   Object,  // from getAccountSummary()
 *     fetchedAt: string,  // timestamp from time.js
 *   }
 */
export async function getAccountSnapshot() {
  console.log(`[${now()}] IBKR: Fetching account snapshot...`);

  const [positions, summary] = await Promise.all([
    getPositions(),
    getAccountSummary(),
  ]);

  const snapshot = { positions, summary, fetchedAt: now() };

  console.log(
    `[${now()}] IBKR: Snapshot complete — ` +
    `${positions.length} open position(s), ` +
    `net liq ${summary.NetLiquidation?.value?.toLocaleString() ?? 'n/a'} ` +
    `${summary.NetLiquidation?.currency ?? ''}`
  );

  return snapshot;
}