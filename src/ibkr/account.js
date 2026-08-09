/**
 * src/ibkr/account.js
 *
 * Pulls current paper account state from IB Gateway:
 *  - getPositions()             — open positions (non-zero) via reqPositions()
 *  - getAccountSummary()        — key account values via reqAccountSummary()
 *  - getAccountSnapshot()       — both in parallel (legacy; see caveat below)
 *  - getAccountPortfolioSnapshot() — one-shot reqAccountUpdates() snapshot with
 *                                    live price/value/P&L; used by /positions.
 *
 * Caveat that motivated getAccountPortfolioSnapshot(): IBKR's documented
 * Account Summary tags (reqAccountSummary) do not include UnrealizedPnL or
 * RealizedPnL — despite those tag names being accepted without error, IB
 * never sends accountSummary events for them, so getAccountSummary()'s
 * UnrealizedPnL/RealizedPnL always come back empty. IBKR exposes P&L through
 * account/portfolio updates (reqAccountUpdates) or the dedicated P&L API
 * (reqPnL) instead. getAccountPortfolioSnapshot() uses reqAccountUpdates,
 * whose updateAccountValue event does carry UnrealizedPnL/RealizedPnL, and
 * whose updatePortfolio event carries live per-position price/value/P&L.
 *
 * All IB calls here are event-based (fire-and-forget + async events). Each is
 * wrapped in a Promise that resolves on the completion event and rejects on
 * timeout or a real error (code < 1000). Listener cleanup is guaranteed on
 * every exit path — resolve, reject, and timeout — to prevent listener
 * accumulation on the IBApi EventEmitter across repeated calls.
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
  'RealizedPnL',        // Realized P&L (IBKR resets this once per day)
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
 * Legacy: getAccountSummary()'s tags do not include a working
 * UnrealizedPnL/RealizedPnL (see file header), and this shape has no live
 * price/market-value per position. /positions now uses
 * getAccountPortfolioSnapshot() instead. Kept here as the plain
 * summary+positions read for any future caller that only needs cost-basis
 * positions and cash/buying-power figures, not live valuation.
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

// ── getAccountPortfolioSnapshot ─────────────────────────────────────────────

// How long to wait for reqManagedAccts()'s managedAccounts event.
const MANAGED_ACCOUNTS_TIMEOUT_MS = 10_000;

// How long to wait for reqAccountUpdates()'s accountDownloadEnd event.
// Generous relative to the other timeouts here: the initial download
// includes every account value and every portfolio row, not a single tag.
const ACCOUNT_UPDATES_TIMEOUT_MS = 20_000;

// Account value keys this module cares about, from the updateAccountValue
// event stream. IBKR sends many more keys (currency-segmented duplicates,
// margin figures, etc.) that Fane doesn't currently use — filtered out here
// rather than stored, to keep the returned shape stable and predictable.
const ACCOUNT_VALUE_KEYS = new Set([
  'NetLiquidation',
  'TotalCashValue',
  'BuyingPower',
  'AvailableFunds',
  'UnrealizedPnL',
  'RealizedPnL',
  'GrossPositionValue',
]);

// IBKR's updateAccountValue key that flags an in-progress account-server
// reset. When it arrives as "false", every other value in this update (and
// any already received in this same one-shot download) can be stale or
// wrong — the snapshot must be rejected outright rather than returned
// partially. Handled separately from ACCOUNT_VALUE_KEYS because it's a
// control signal, not a value to store.
const ACCOUNT_READY_KEY = 'AccountReady';

// IBKR sends AccountReady's value as the string "true" or "false". Anything
// else (including the key never arriving at all) is treated as ready, so a
// live account that has never sent this key keeps working exactly as
// before — only an explicit "false" fails the snapshot closed.
function isAccountReadyFalse(value) {
  return String(value).trim().toLowerCase() === 'false';
}

// IBKR represents "no value" for a double field as a sentinel near
// Number.MAX_VALUE rather than null/undefined (confirmed against this
// library's own decoder fixtures, e.g. 1.7976931348623157e308 for unset
// order fields). Treat anything at that magnitude, plus actual null/
// undefined/NaN, as missing rather than as a real, gigantic number.
const UNSET_DOUBLE_THRESHOLD = 1e300;

function safeNumber(n) {
  if (n == null) return null;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  if (Math.abs(n) >= UNSET_DOUBLE_THRESHOLD) return null;
  return n;
}

/**
 * Resolve the active IBKR managed account ID without hard-coding it.
 * Paper trading is expected to return exactly one account; if IBKR ever
 * returns more (e.g. a Financial Advisor setup), the first is used.
 *
 * @returns {Promise<string>} Account ID, e.g. "DU1234567".
 */
function getManagedAccount() {
  const api = ibkr.getApi();

  return new Promise((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      cleanup();
      reject(new Error('getManagedAccount: timed out waiting for managedAccounts'));
    }, MANAGED_ACCOUNTS_TIMEOUT_MS);

    function onManagedAccounts(accountsList) {
      if (settled) return;
      cleanup();
      const accounts = (accountsList || '').split(',').map(a => a.trim()).filter(Boolean);
      if (accounts.length === 0) {
        reject(new Error('getManagedAccount: managedAccounts event returned no accounts'));
        return;
      }
      resolve(accounts[0]);
    }

    function onError(err, code, reqId) {
      if (settled) return;
      if (code >= 1000) return;
      cleanup();
      reject(new Error(`getManagedAccount: IB error [${code}] reqId=${reqId}: ${err?.message ?? err}`));
    }

    function cleanup() {
      settled = true;
      clearTimeout(timer);
      api.removeListener(EventName.managedAccounts, onManagedAccounts);
      api.removeListener(EventName.error, onError);
    }

    api.on(EventName.managedAccounts, onManagedAccounts);
    api.on(EventName.error, onError);

    api.reqManagedAccts();
  });
}

/**
 * One-shot account + portfolio snapshot via reqAccountUpdates(), the IBKR
 * path that actually carries live per-position price/value/P&L and a
 * working account-level UnrealizedPnL/RealizedPnL (see file header for why
 * getAccountSummary() cannot provide these).
 *
 * Sequence: resolve the managed account → subscribe → collect
 * updateAccountValue + updatePortfolio events → accountDownloadEnd →
 * unsubscribe immediately → resolve. Listener cleanup and unsubscribe are
 * guaranteed on every exit path (resolve, reject, timeout) — this never
 * leaves a continuous account subscription running after the page load
 * that triggered it.
 *
 * A missing/unset numeric field for one position (e.g. no live price
 * because market data isn't subscribed) does not fail the whole snapshot —
 * it comes back as `null` on that field only, via safeNumber().
 *
 * Fails closed on an in-progress account-server reset: if AccountReady
 * arrives as "false" for the target account, the whole snapshot is
 * rejected — unsubscribed, listeners cleaned up, nothing returned — rather
 * than resolving with values that IBKR itself says may be stale or wrong.
 *
 * @returns {Promise<Object>}
 *   {
 *     account:       string,   // resolved managed account ID
 *     positions:     Array,    // see shape below
 *     accountValues: Object,   // tag → { value: number|null, currency }
 *     fetchedAt:     string,   // timestamp from time.js
 *   }
 *
 * Position shape:
 *   {
 *     account:       string,
 *     symbol:        string,
 *     secType:       string,        // IBKR SecType, e.g. "STK"
 *     currency:      string,
 *     exchange:      string,        // primaryExch, falling back to exchange
 *     conId:         number,
 *     position:      number,        // shares held; positive = long
 *     avgCost:       number|null,
 *     marketPrice:   number|null,   // IBKR live market price
 *     marketValue:   number|null,   // IBKR live market value
 *     unrealizedPnl: number|null,
 *     realizedPnl:   number|null,   // IBKR resets this once per day — not lifetime profit
 *   }
 */
export async function getAccountPortfolioSnapshot() {
  const account = await getManagedAccount();
  const api = ibkr.getApi();

  console.log(`[${now()}] IBKR: Fetching account portfolio snapshot for ${account}...`);

  const positionsByConId = new Map();
  const accountValues = {};

  return new Promise((resolve, reject) => {
    let settled = false;

    const unsubscribe = () => {
      try { api.reqAccountUpdates(false, account); } catch (_) {}
    };

    const timer = setTimeout(() => {
      if (settled) return;
      cleanup();
      unsubscribe();
      reject(new Error('getAccountPortfolioSnapshot: timed out waiting for accountDownloadEnd'));
    }, ACCOUNT_UPDATES_TIMEOUT_MS);

    function onAccountValue(key, value, currency, accountName) {
      if (accountName !== account) return; // stale/unrelated event — ignore

      if (key === ACCOUNT_READY_KEY) {
        if (settled) return;
        if (isAccountReadyFalse(value)) {
          cleanup();
          unsubscribe();
          reject(new Error('IBKR account data not ready; account server is resetting. Retry shortly.'));
        }
        // "true" (or anything else) — normal processing continues.
        return;
      }

      if (!ACCOUNT_VALUE_KEYS.has(key)) return;
      const parsed = parseFloat(value);
      accountValues[key] = { value: isNaN(parsed) ? null : parsed, currency };
    }

    function onPortfolio(contract, position, marketPrice, marketValue, averageCost, unrealizedPNL, realizedPNL, accountName) {
      if (accountName !== account) return; // stale/unrelated event — ignore
      // IBKR sends pos=0 rows for recently closed positions — skip them,
      // matching getPositions()'s existing filter.
      if (position === 0) return;
      positionsByConId.set(contract.conId, {
        account:       accountName,
        symbol:        contract.symbol,
        secType:       contract.secType,
        currency:      contract.currency,
        exchange:      contract.primaryExch || contract.exchange || '',
        conId:         contract.conId,
        position,
        avgCost:       safeNumber(averageCost),
        marketPrice:   safeNumber(marketPrice),
        marketValue:   safeNumber(marketValue),
        unrealizedPnl: safeNumber(unrealizedPNL),
        realizedPnl:   safeNumber(realizedPNL),
      });
    }

    function onDownloadEnd(accountName) {
      if (accountName !== account) return; // stale/unrelated event — ignore
      if (settled) return;
      cleanup();
      unsubscribe();
      resolve({
        account,
        positions: Array.from(positionsByConId.values()),
        accountValues,
        fetchedAt: now(),
      });
    }

    function onError(err, code, reqId) {
      if (settled) return;
      if (code >= 1000) return;
      cleanup();
      unsubscribe();
      reject(new Error(`getAccountPortfolioSnapshot: IB error [${code}] reqId=${reqId}: ${err?.message ?? err}`));
    }

    function cleanup() {
      settled = true;
      clearTimeout(timer);
      api.removeListener(EventName.updateAccountValue, onAccountValue);
      api.removeListener(EventName.updatePortfolio,    onPortfolio);
      api.removeListener(EventName.accountDownloadEnd,  onDownloadEnd);
      api.removeListener(EventName.error,               onError);
    }

    api.on(EventName.updateAccountValue,  onAccountValue);
    api.on(EventName.updatePortfolio,     onPortfolio);
    api.on(EventName.accountDownloadEnd,  onDownloadEnd);
    api.on(EventName.error,               onError);

    api.reqAccountUpdates(true, account);
  });
}
