/**
 * test/ibkr-account-snapshot.test.js
 *
 * Focused coverage for getAccountPortfolioSnapshot() (src/ibkr/account.js),
 * added to fix the Positions page's Unrealized/Realized P&L cards: IBKR's
 * documented Account Summary tags (reqAccountSummary) do not carry
 * UnrealizedPnL/RealizedPnL, so those cards always showed "$—". This
 * snapshot instead uses reqAccountUpdates(), whose updateAccountValue and
 * updatePortfolio events do carry live price/value/P&L.
 *
 * These tests exercise the exported function against a fake EventEmitter
 * standing in for IBApi, attached directly to the real connection.js
 * singleton's private fields (same technique test/ibkr-connection.test.js
 * uses on its own IBKRConnection instances) — never a real IBApi, never a
 * real socket to IB Gateway. Read-only account/portfolio events only; no
 * order-related event is ever emitted here.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { EventName } from '@stoqey/ib';
import ibkr from '../src/ibkr/connection.js';
import { getAccountPortfolioSnapshot } from '../src/ibkr/account.js';

const ACCOUNT = 'DU1234567';
const ACCOUNT_UPDATES_TIMEOUT_MS = 20_000; // must match ACCOUNT_UPDATES_TIMEOUT_MS in account.js
const UNSET_DOUBLE = 1.7976931348623157e308; // IBKR's unset-double sentinel

function makeFakeApi() {
  const api = new EventEmitter();
  api.reqManagedAccts = () => api.emit(EventName.managedAccounts, ACCOUNT);
  api.reqAccountUpdates = () => {}; // overridden per test
  return api;
}

function attach(api) {
  ibkr._api = api;
  ibkr._connected = true;
  ibkr._killed = false;
}

function detach() {
  ibkr._api = null;
  ibkr._connected = false;
}

function assertNoListenersLeft(api) {
  assert.equal(api.listenerCount(EventName.updateAccountValue), 0);
  assert.equal(api.listenerCount(EventName.updatePortfolio), 0);
  assert.equal(api.listenerCount(EventName.accountDownloadEnd), 0);
  assert.equal(api.listenerCount(EventName.error), 0);
  assert.equal(api.listenerCount(EventName.managedAccounts), 0);
}

test('successful snapshot resolves with account values and live position price/value/P&L, then unsubscribes and cleans up listeners', async () => {
  const api = makeFakeApi();
  const unsubscribeCalls = [];
  api.reqAccountUpdates = (subscribe, acctCode) => {
    if (!subscribe) { unsubscribeCalls.push(acctCode); return; }
    api.emit(EventName.updateAccountValue, 'NetLiquidation', '100000.00', 'USD', ACCOUNT);
    api.emit(EventName.updateAccountValue, 'UnrealizedPnL', '2500.00', 'USD', ACCOUNT);
    api.emit(EventName.updateAccountValue, 'RealizedPnL', '0.00', 'USD', ACCOUNT);
    api.emit(
      EventName.updatePortfolio,
      { conId: 265598, symbol: 'AAPL', secType: 'STK', currency: 'USD', primaryExch: 'NASDAQ' },
      10, 230.50, 2305.00, 200.00, 305.00, 0, ACCOUNT
    );
    api.emit(EventName.accountDownloadEnd, ACCOUNT);
  };
  attach(api);

  const snapshot = await getAccountPortfolioSnapshot();

  assert.equal(snapshot.account, ACCOUNT);
  assert.equal(snapshot.positions.length, 1);
  const pos = snapshot.positions[0];
  assert.equal(pos.symbol, 'AAPL');
  assert.equal(pos.conId, 265598);
  assert.equal(pos.position, 10);
  assert.equal(pos.avgCost, 200.00);
  assert.equal(pos.marketPrice, 230.50);
  assert.equal(pos.marketValue, 2305.00);
  assert.equal(pos.unrealizedPnl, 305.00);
  assert.equal(pos.exchange, 'NASDAQ');

  assert.equal(snapshot.accountValues.NetLiquidation.value, 100000.00);
  assert.equal(snapshot.accountValues.UnrealizedPnL.value, 2500.00);
  assert.equal(snapshot.accountValues.RealizedPnL.value, 0.00);

  assert.deepEqual(unsubscribeCalls, [ACCOUNT], 'must unsubscribe exactly once, immediately after accountDownloadEnd');
  assertNoListenersLeft(api);

  detach();
});

test('positions with pos=0 are excluded; unset-sentinel numeric fields become null, not gigantic numbers', async () => {
  const api = makeFakeApi();
  api.reqAccountUpdates = (subscribe) => {
    if (!subscribe) return;
    // Closed position — must not appear in the result.
    api.emit(
      EventName.updatePortfolio,
      { conId: 999, symbol: 'CLOSED', secType: 'STK', currency: 'USD' },
      0, 10, 0, 10, 0, 0, ACCOUNT
    );
    // Open position with no live market data — price/value/PNL unset.
    api.emit(
      EventName.updatePortfolio,
      { conId: 1, symbol: 'XYZ', secType: 'STK', currency: 'USD' },
      5, UNSET_DOUBLE, UNSET_DOUBLE, 10.00, UNSET_DOUBLE, 0, ACCOUNT
    );
    api.emit(EventName.accountDownloadEnd, ACCOUNT);
  };
  attach(api);

  const snapshot = await getAccountPortfolioSnapshot();

  assert.equal(snapshot.positions.length, 1, 'pos=0 rows must be filtered out');
  const pos = snapshot.positions[0];
  assert.equal(pos.symbol, 'XYZ');
  assert.equal(pos.avgCost, 10.00);
  assert.equal(pos.marketPrice, null, 'unset sentinel must render as missing, not as a huge literal number');
  assert.equal(pos.marketValue, null);
  assert.equal(pos.unrealizedPnl, null);

  detach();
});

test('events scoped to an unrelated account are ignored, including a premature accountDownloadEnd', async () => {
  const api = makeFakeApi();
  api.reqAccountUpdates = (subscribe) => {
    if (!subscribe) return;
    api.emit(EventName.updateAccountValue, 'NetLiquidation', '1.00', 'USD', 'DU_OTHER');
    api.emit(
      EventName.updatePortfolio,
      { conId: 2, symbol: 'OTHER', secType: 'STK', currency: 'USD' },
      1, 1, 1, 1, 1, 0, 'DU_OTHER'
    );
    api.emit(EventName.accountDownloadEnd, 'DU_OTHER'); // must not resolve the snapshot
    api.emit(EventName.updateAccountValue, 'NetLiquidation', '100000.00', 'USD', ACCOUNT);
    api.emit(EventName.accountDownloadEnd, ACCOUNT);
  };
  attach(api);

  const snapshot = await getAccountPortfolioSnapshot();

  assert.equal(snapshot.positions.length, 0, 'the unrelated-account position must not appear');
  assert.equal(snapshot.accountValues.NetLiquidation.value, 100000.00, 'must resolve on the correct account, not the unrelated one');

  detach();
});

test('accountDownloadEnd timeout rejects, unsubscribes, and cleans up listeners', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const api = makeFakeApi();
  const unsubscribeCalls = [];
  api.reqAccountUpdates = (subscribe, acctCode) => {
    if (!subscribe) unsubscribeCalls.push(acctCode);
    // subscribe branch: never emits accountDownloadEnd
  };
  attach(api);

  const pending = getAccountPortfolioSnapshot();
  const rejection = assert.rejects(pending, /timed out waiting for accountDownloadEnd/);

  // getAccountPortfolioSnapshot() awaits getManagedAccount() before creating
  // its own timer, so the setTimeout(ACCOUNT_UPDATES_TIMEOUT_MS) call lands a
  // microtask after this function returns. Flush via a real macrotask (not
  // mocked — only 'setTimeout' is) before advancing the mocked clock, or
  // tick() fires before the timer it's meant to trigger even exists.
  await new Promise((resolve) => setImmediate(resolve));

  t.mock.timers.tick(ACCOUNT_UPDATES_TIMEOUT_MS);
  await rejection;

  assert.deepEqual(unsubscribeCalls, [ACCOUNT], 'a timeout must still unsubscribe the one-shot request');
  assertNoListenersLeft(api);

  detach();
});

test('an IB error scoped to the account-updates request rejects and unsubscribes; informational codes (>=1000) do not', async () => {
  const api = makeFakeApi();
  const unsubscribeCalls = [];
  api.reqAccountUpdates = (subscribe, acctCode) => {
    if (!subscribe) { unsubscribeCalls.push(acctCode); return; }
    api.emit(EventName.error, new Error('data farm notice'), 2104, -1); // informational — must not reject
    api.emit(EventName.error, new Error('account updates rejected'), 322, -1);
  };
  attach(api);

  await assert.rejects(
    getAccountPortfolioSnapshot(),
    /IB error \[322\]/
  );

  assert.deepEqual(unsubscribeCalls, [ACCOUNT]);
  assertNoListenersLeft(api);

  detach();
});
