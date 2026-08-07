/**
 * test/ibkr-connection.test.js
 *
 * Focused coverage for the response-verified API-responsiveness heartbeat
 * added to src/ibkr/connection.js on 2026-08-07 (live incident: UI showed
 * "IBKR: Connected" while getPositions() silently timed out waiting for
 * positionEnd — transport state alone was not sufficient evidence of a
 * working API), plus the stale-generation heartbeat-clearing fix found
 * during review of that patch.
 *
 * These tests exercise IBKRConnection's internal probe methods directly
 * against a fake EventEmitter standing in for IBApi. They never construct a
 * real IBApi and never connect to IB Gateway — clientId 1 is shared with
 * the live fane.service process, so a real second connection here would be
 * unsafe.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { EventName } from '@stoqey/ib';
import { IBKRConnection } from '../src/ibkr/connection.js';

const RESPONSE_TIMEOUT_MS = 10_000; // must match HEARTBEAT_RESPONSE_TIMEOUT_MS in connection.js

function makeFakeApi() {
  const api = new EventEmitter();
  api.reqCurrentTime = () => {}; // tests override per scenario
  return api;
}

function makeConnectedConnection(api) {
  const conn = new IBKRConnection();
  conn._api = api;
  conn._connected = true;
  return conn;
}

test('successful currentTime response marks API responsive', () => {
  const api = makeFakeApi();
  api.reqCurrentTime = () => api.emit(EventName.currentTime, 1_700_000_000);
  const conn = makeConnectedConnection(api);

  conn._probeApiResponsiveness(api);

  assert.equal(conn.isApiResponsive, true);
  assert.equal(conn.apiResponseState, 'responsive');
});

test('heartbeat response timeout marks API unresponsive while transport remains connected', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const api = makeFakeApi();
  api.reqCurrentTime = () => {}; // never responds
  const conn = makeConnectedConnection(api);

  conn._probeApiResponsiveness(api);
  assert.equal(conn.apiResponseState, 'unknown', 'unresolved until the response timeout fires');

  t.mock.timers.tick(RESPONSE_TIMEOUT_MS);

  assert.equal(conn.apiResponseState, 'unresponsive');
  assert.equal(conn.isApiResponsive, false);
  assert.equal(conn._connected, true, 'transport state must not be touched by an API-responsiveness failure');
});

test('a later successful probe recovers API responsiveness after a timeout', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const api = makeFakeApi();
  api.reqCurrentTime = () => {}; // first probe: never responds
  const conn = makeConnectedConnection(api);

  conn._probeApiResponsiveness(api);
  t.mock.timers.tick(RESPONSE_TIMEOUT_MS);
  assert.equal(conn.apiResponseState, 'unresponsive');

  api.reqCurrentTime = () => api.emit(EventName.currentTime, 1_700_000_100); // second probe: responds
  conn._probeApiResponsiveness(api);
  assert.equal(conn.apiResponseState, 'responsive');
});

test('a currentTime response from a superseded (stale) IBApi instance cannot restore responsiveness', () => {
  const oldApi = makeFakeApi();
  oldApi.reqCurrentTime = () => {}; // deliberately does not respond synchronously
  const conn = makeConnectedConnection(oldApi);

  conn._probeApiResponsiveness(oldApi);
  assert.equal(conn.apiResponseState, 'unknown');

  // Simulate a reconnect: a new IBApi instance becomes the active one before
  // the old instance's response arrives.
  const newApi = makeFakeApi();
  conn._api = newApi;
  conn._apiResponsive = false; // new connection's own heartbeat has reported unresponsive

  // The stale instance's response finally arrives.
  oldApi.emit(EventName.currentTime, 1_700_000_200);

  assert.equal(conn.apiResponseState, 'unresponsive', 'stale response must not overwrite the active instance\'s state');
});

test('overlapping heartbeat ticks do not stack probes or accumulate listeners', () => {
  const api = makeFakeApi();
  api.reqCurrentTime = () => {}; // never responds within this test
  const conn = makeConnectedConnection(api);

  conn._probeApiResponsiveness(api);
  const afterFirst = api.listenerCount(EventName.currentTime);

  conn._probeApiResponsiveness(api); // a second tick while the first is still pending
  const afterSecond = api.listenerCount(EventName.currentTime);

  assert.equal(afterFirst, 1);
  assert.equal(afterSecond, 1, 'a probe already in flight must not register a second listener');

  conn._clearHeartbeat(); // cancel the still-pending real timer so the suite exits promptly
});

test('_clearHeartbeat cancels an in-flight probe, removes its listener, and resets state to unknown', () => {
  const api = makeFakeApi();
  api.reqCurrentTime = () => {};
  const conn = makeConnectedConnection(api);

  conn._probeApiResponsiveness(api);
  assert.equal(api.listenerCount(EventName.currentTime), 1);

  conn._clearHeartbeat();

  assert.equal(api.listenerCount(EventName.currentTime), 0, 'stale probe listener must be removed');
  assert.equal(conn.apiResponseState, 'unknown');
});

test('reqCurrentTime throwing synchronously is treated as an unresponsive probe, not a crash', () => {
  const api = makeFakeApi();
  api.reqCurrentTime = () => { throw new Error('socket write failed'); };
  const conn = makeConnectedConnection(api);

  assert.doesNotThrow(() => conn._probeApiResponsiveness(api));
  assert.equal(conn.apiResponseState, 'unresponsive');
});

// ── Stale-generation heartbeat-clearing regression (found in review) ────────

test('a stale-generation heartbeat tick is a no-op and does not clear the active generation\'s state', () => {
  const oldApi = makeFakeApi();
  const conn = makeConnectedConnection(oldApi);

  // The active generation is a different, newer instance with its own
  // confirmed-responsive state.
  const newApi = makeFakeApi();
  newApi.reqCurrentTime = () => newApi.emit(EventName.currentTime, 1);
  conn._api = newApi;
  conn._connected = true;
  conn._probeApiResponsiveness(newApi);
  assert.equal(conn.apiResponseState, 'responsive');

  // A tick belonging to the superseded generation must be a complete no-op —
  // it must not touch the active generation's responsiveness, timer, or
  // in-flight probe state.
  conn._onHeartbeatTick(oldApi);

  assert.equal(conn.apiResponseState, 'responsive', 'a stale-generation tick must not reset the active generation\'s state');
  assert.equal(conn._connected, true);
});

test('a current-generation tick still clears its own heartbeat when transport is no longer connected', () => {
  const api = makeFakeApi();
  const conn = makeConnectedConnection(api);
  conn._probeApiResponsiveness(api); // pretend a probe already completed
  conn._connected = false; // transport dropped without the interval having fired yet

  conn._onHeartbeatTick(api); // same (active) generation as the pending timer

  assert.equal(conn.apiResponseState, 'unknown', 'the active generation may legitimately clear its own heartbeat state');
});
