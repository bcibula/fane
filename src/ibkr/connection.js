/**
 * src/ibkr/connection.js
 *
 * Singleton IBApi connection manager for Fane.
 *
 * Design contract:
 *  - One connection shared across the entire process. Import `ibkr` and call
 *    ibkr.connect() once at startup (e.g. in server.js or run-briefing.js).
 *  - All other modules call ibkr.getApi() to get the live IBApi handle.
 *  - Kill token (ibkr.kill()) is absolute. No reconnect. No override.
 *    Requires process restart to restore connectivity.
 *  - Inaction default: this module never submits orders. It only manages
 *    the connection. Order logic lives in src/ibkr/orders.js behind the
 *    human approval gate.
 *
 * Reconnect strategy: linear backoff, max 10 attempts.
 * A new IBApi instance is created on each attempt — reusing a disconnected
 * instance is unsafe (broken socket state, accumulated listeners).
 *
 * IB error code triage:
 *  - Codes >= 2000: informational (data farm notices, TWS version info).
 *    Logged to console only.
 *  - Codes 1000–1999: system warnings. Logged to console only.
 *  - Codes < 1000: real errors. Written to agent_log.
 *  - Code 1100 (connectivity lost): triggers disconnect → reconnect path.
 *  - Code 1102 (connectivity restored): normal recovery, no action needed.
 *
 * Transport state vs. API responsiveness:
 *  - `isConnected` reflects only the IBApi library's connected/disconnected
 *    events — i.e. the socket session exists. It does NOT prove IB Gateway
 *    is actually answering requests.
 *  - `isApiResponsive` / `apiResponseState` reflect a response-verified
 *    probe: every heartbeat tick issues reqCurrentTime() and requires the
 *    `currentTime` event back within a bounded timeout. A connected-but-
 *    silent Gateway (observed live 2026-08-07 — connected, heartbeating,
 *    but getPositions() never received positionEnd) shows up here as
 *    isConnected=true, apiResponseState='unresponsive'.
 *  - This proves only that a currentTime round trip completed. It does NOT
 *    prove reqPositions works, account-summary works, market-data
 *    permissions are in place, or that the session is order-capable rather
 *    than read-only/restricted. Treat it as a narrow liveness signal, not a
 *    general API-health guarantee.
 *  - Responsiveness is reset to 'unknown' whenever the heartbeat stops
 *    (disconnect, kill, or a fresh reconnect) — it is never assumed good
 *    just because a new transport session opened.
 */

import { IBApi, EventName } from '@stoqey/ib';
import { now } from '../utils/time.js';
import { getDb } from '../db/schema.js';

// ── Configuration ─────────────────────────────────────────────────────────────

const HOST              = '127.0.0.1';
const PORT              = 4002;
const CLIENT_ID         = 1;
const RECONNECT_DELAY_BASE_MS = 5_000;   // 5s base — multiplied by attempt#
const MAX_RECONNECT_ATTEMPTS  = 10;

// Heartbeat: keeps IB Gateway from dropping an idle connection (unchanged
// cadence) and, since 2026-08-07, verifies the round trip actually
// completes rather than just issuing the write.
const HEARTBEAT_INTERVAL_MS         = 60_000;
const HEARTBEAT_RESPONSE_TIMEOUT_MS = 10_000; // well under the 60s cadence and
                                               // the 15s data-request timeout in
                                               // account.js, so a stall surfaces
                                               // here before/around the same time
                                               // a real request would time out

// ── Internal logging ──────────────────────────────────────────────────────────

function logToDb(status, notes, error = null) {
  let db;
  try {
    db = getDb();
    db.prepare(`
      INSERT INTO agent_log (run_at, run_type, status, notes, error)
      VALUES (?, ?, ?, ?, ?)
    `).run(now(), 'ibkr_connection', status, notes, error);
  } catch (err) {
    // Never let logging crash the connection manager.
    console.error(`[${now()}] IBKR log write failed:`, err.message);
  } finally {
    db?.close();
  }
}

// ── IBKRConnection class ──────────────────────────────────────────────────────

class IBKRConnection {
  constructor() {
    this._api             = null;   // Current IBApi instance
    this._connected       = false;
    this._killed          = false;
    this._reconnectTimer  = null;
    this._reconnectCount  = 0;
    this._heartbeatTimer  = null;

    // Response-verified API responsiveness. null = unknown (no probe has
    // completed since the heartbeat last (re)started), true = last probe's
    // currentTime round trip succeeded, false = last probe timed out or
    // reqCurrentTime() threw. Distinct from `_connected` — see file header.
    this._apiResponsive          = null;
    this._heartbeatProbeInFlight = false;
    this._heartbeatProbeCleanup  = null; // cancels the pending probe, if any

    // External subscribers wanting to know when connection state changes.
    // Key: event name ('connected' | 'disconnected' | 'killed')
    // Value: Set of callback functions
    this._listeners = {
      connected:    new Set(),
      disconnected: new Set(),
      killed:       new Set(),
    };
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Initiate connection to IB Gateway.
   * Safe to call multiple times — no-ops if already connected or killed.
   */
  connect() {
    if (this._killed) {
      console.log(`[${now()}] IBKR: Kill token is active. Connection refused.`);
      return;
    }
    if (this._connected) {
      console.log(`[${now()}] IBKR: Already connected. Skipping.`);
      return;
    }

    this._createAndConnect();
  }

  /**
   * Graceful disconnect. Does not set killed flag — reconnect is still possible
   * after a manual disconnect (e.g. scheduled maintenance window).
   */
  disconnect() {
    this._clearHeartbeat();
    this._clearReconnectTimer();
    const api = this._api;
    this._api = null;
    this._connected = false;
    if (api) {
      try {
        api.disconnect();
      } catch (err) {
        // Disconnect on an already-broken socket can throw — that's fine.
        console.log(`[${now()}] IBKR: Disconnect threw (likely already down):`, err.message);
      }
    }
  }

  /**
   * Kill token — absolute stop. No reconnect. Requires process restart.
   *
   * Call from:
   *  - POST /api/kill  (UI kill button)
   *  - NTP delta threshold breach (Principle 9 / time risk)
   *  - Any anomaly detection layer (Stage 3+)
   *
   * @param {string} reason  Human-readable reason for the kill.
   */
  kill(reason = 'Kill token activated.') {
    console.error(`[${now()}] *** IBKR KILL TOKEN FIRED ***`);
    console.error(`[${now()}] Reason: ${reason}`);

    logToDb('killed', reason);

    this._killed = true;
    this.disconnect();
    this._emit('killed', { reason, at: now() });
  }

  /**
   * Returns the live IBApi handle for use by account.js and orders.js.
   * Throws if not connected — callers must check ibkr.isConnected() first
   * or handle the thrown error gracefully.
   */
  getApi() {
    if (this._killed) {
      throw new Error('IBKR: Kill token is active. No API access.');
    }
    if (!this._connected || !this._api) {
      throw new Error('IBKR: Not connected. Call ibkr.connect() at startup.');
    }
    return this._api;
  }

  /** True if the connection is currently live. Transport state only —
   *  does not imply IB Gateway is responding to requests. See isApiResponsive. */
  get isConnected() {
    return this._connected && !this._killed;
  }

  /** True if the kill token has been fired this session. */
  get isKilled() {
    return this._killed;
  }

  /** True only when the response-verified heartbeat's most recent probe
   *  completed with a confirmed currentTime round trip. Proves a narrow
   *  liveness signal only — not reqPositions, account summary, market-data
   *  permissions, or order-capability. See file header. */
  get isApiResponsive() {
    return this._apiResponsive === true;
  }

  /** 'unknown' before the first probe completes (or right after the
   *  heartbeat stops), 'responsive', or 'unresponsive'. */
  get apiResponseState() {
    if (this._apiResponsive === true)  return 'responsive';
    if (this._apiResponsive === false) return 'unresponsive';
    return 'unknown';
  }

  /**
   * Subscribe to connection lifecycle events.
   * @param {'connected'|'disconnected'|'killed'} event
   * @param {Function} fn  Callback receives an info object.
   * @returns {Function}   Unsubscribe function.
   */
  on(event, fn) {
    if (!this._listeners[event]) {
      throw new Error(`IBKR: Unknown connection event '${event}'.`);
    }
    this._listeners[event].add(fn);
    return () => this._listeners[event].delete(fn);
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  _createAndConnect() {
    // Always start fresh — never reuse a disconnected instance.
    const api = new IBApi({ host: HOST, port: PORT, clientId: CLIENT_ID });
    this._api = api;

    // ── connected ──
    api.on(EventName.connected, () => {
      if (this._api !== api) return;
      this._connected   = true;
      this._reconnectCount = 0;
      console.log(`[${now()}] IBKR: Connected to IB Gateway at ${HOST}:${PORT}.`);
      logToDb('connected', `${HOST}:${PORT} clientId=${CLIENT_ID}`);
      this._emit('connected', { host: HOST, port: PORT, at: now() });
      this._startHeartbeat(api);
    });

    // ── disconnected ──
    api.on(EventName.disconnected, () => {
      // Generation guard first: a late disconnected event from a superseded
      // instance must never clear heartbeat state belonging to the current
      // active generation.
      if (this._api !== api) return;
      this._clearHeartbeat();
      const wasConnected = this._connected;
      this._connected = false;

      if (wasConnected) {
        console.log(`[${now()}] IBKR: Disconnected from IB Gateway.`);
        logToDb('disconnected', 'Connection lost');
        this._emit('disconnected', { at: now() });
      }

      if (!this._killed) {
        this._scheduleReconnect();
      }
    });

    // ── error ──
    api.on(EventName.error, (err, code, reqId) => {
      if (this._api !== api) return;
      const msg = err?.message ?? String(err);

      // Informational — console only.
      if (code >= 1000) {
        console.log(`[${now()}] IBKR info [${code}] reqId=${reqId}: ${msg}`);
        return;
      }

      // Real error — console + DB.
      console.error(`[${now()}] IBKR ERROR [${code}] reqId=${reqId}: ${msg}`);
      logToDb('error', `code=${code} reqId=${reqId}`, msg);

      // Code 1100: IB reports connectivity to TWS/Gateway lost.
      // The disconnected event should also fire, but belt-and-suspenders.
      if (code === 1100 && !this._killed) {
        this._connected = false;
        this._scheduleReconnect();
      }
    });

    // Initiate the connection.
    try {
      api.connect();
    } catch (err) {
      console.error(`[${now()}] IBKR: connect() threw:`, err.message);
      logToDb('error', 'connect() threw on startup', err.message);
      this._scheduleReconnect();
    }
  }

  _scheduleReconnect() {
    if (this._killed) return;
    if (this._reconnectCount >= MAX_RECONNECT_ATTEMPTS) {
      const msg = `Reconnect limit reached (${MAX_RECONNECT_ATTEMPTS} attempts). Entering slow retry (every 5 min).`;
      console.error(`[${now()}] IBKR: ${msg}`);
      logToDb('error', msg);
      this._scheduleSlowRetry();
      return;
    }

    this._clearReconnectTimer();

    this._reconnectCount++;
    const delayMs = RECONNECT_DELAY_BASE_MS * this._reconnectCount;  // linear backoff
    console.log(
      `[${now()}] IBKR: Scheduling reconnect in ${delayMs / 1000}s ` +
      `(attempt ${this._reconnectCount}/${MAX_RECONNECT_ATTEMPTS})...`
    );

    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      if (!this._killed && !this._connected) {
        this._createAndConnect();
      }
    }, delayMs);
  }

  _scheduleSlowRetry() {
    if (this._killed || this._connected) return;
    const SLOW_RETRY_MS = 5 * 60 * 1000; // 5 minutes
    console.log(`[${now()}] IBKR: Slow retry scheduled in 5 min.`);
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      if (!this._killed && !this._connected) {
        console.log(`[${now()}] IBKR: Slow retry attempt — resetting reconnect count.`);
        this._reconnectCount = 0;
        this._createAndConnect();
      }
    }, SLOW_RETRY_MS);
  }

  _startHeartbeat(api) {
    this._clearHeartbeat();
    this._heartbeatTimer = setInterval(() => this._onHeartbeatTick(api), HEARTBEAT_INTERVAL_MS);
  }

  /**
   * One heartbeat interval tick. Split out from _startHeartbeat so the
   * generation-guard ordering is directly testable.
   *
   * A tick belonging to a superseded IBApi generation is a pure no-op — it
   * must never clear heartbeat state that now belongs to a newer active
   * generation. Only a tick from the currently active generation may clear
   * its own heartbeat, and only because transport is no longer connected.
   */
  _onHeartbeatTick(api) {
    if (this._api !== api) return;
    if (!this._connected) {
      this._clearHeartbeat();
      return;
    }
    this._probeApiResponsiveness(api);
  }

  /**
   * One response-verified heartbeat probe: issues reqCurrentTime() and
   * requires the `currentTime` event back within HEARTBEAT_RESPONSE_TIMEOUT_MS.
   * Guarded against overlap — a tick that fires while a probe is still
   * pending is skipped rather than stacking a second listener/timer.
   *
   * Proves only that this one round trip completed — see file header for
   * what this does and does not demonstrate about IBKR API capability.
   */
  _probeApiResponsiveness(api) {
    if (this._heartbeatProbeInFlight) {
      console.log(`[${now()}] IBKR: Heartbeat probe still pending — skipping this tick.`);
      return;
    }
    this._heartbeatProbeInFlight = true;

    let settled = false;
    let responseTimer;

    const cleanupProbe = () => {
      clearTimeout(responseTimer);
      api.removeListener(EventName.currentTime, onCurrentTime);
      this._heartbeatProbeInFlight = false;
      this._heartbeatProbeCleanup  = null;
    };

    const finish = (responsive, detail) => {
      if (settled) return;
      settled = true;
      cleanupProbe();
      this._setApiResponsive(responsive, api, detail);
    };

    function onCurrentTime() {
      finish(true);
    }

    responseTimer = setTimeout(() => {
      finish(false, 'heartbeat response timeout');
    }, HEARTBEAT_RESPONSE_TIMEOUT_MS);

    this._heartbeatProbeCleanup = cleanupProbe;

    api.on(EventName.currentTime, onCurrentTime);

    try {
      api.reqCurrentTime();
    } catch (err) {
      console.log(`[${now()}] IBKR: Heartbeat reqCurrentTime failed:`, err.message);
      finish(false, `reqCurrentTime threw: ${err.message}`);
    }
  }

  /**
   * Applies a probe result. Generation-guarded — a result tied to an old
   * IBApi instance (superseded by a reconnect) is ignored, never allowed to
   * restore or override the responsiveness of the currently active
   * connection. Logs only on an actual state transition, to keep
   * steady-state quiet, with wording that distinguishes first-time
   * verification from recovery from a known-unresponsive state.
   */
  _setApiResponsive(responsive, api, detail) {
    if (this._api !== api) return;
    const prev = this._apiResponsive;
    this._apiResponsive = responsive;
    if (prev === responsive) return;
    if (responsive) {
      const verb = prev === null ? 'verified' : 'recovered';
      console.log(`[${now()}] IBKR: API responsiveness ${verb} — currentTime round trip succeeded.`);
    } else {
      console.log(
        `[${now()}] IBKR: API responsiveness degraded — ${detail} ` +
        `(transport connected=${this._connected}).`
      );
    }
  }

  _clearHeartbeat() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
    if (this._heartbeatProbeCleanup) {
      this._heartbeatProbeCleanup();
      this._heartbeatProbeCleanup = null;
    }
    this._heartbeatProbeInFlight = false;
    if (this._apiResponsive !== null) {
      console.log(
        `[${now()}] IBKR: API responsiveness reset to unknown ` +
        `(heartbeat stopped; transport connected=${this._connected}).`
      );
    }
    this._apiResponsive = null;
  }

  _clearReconnectTimer() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }

  _emit(event, payload) {
    for (const fn of this._listeners[event]) {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[${now()}] IBKR: Listener error for '${event}':`, err.message);
      }
    }
  }
}

// ── Singleton export ──────────────────────────────────────────────────────────

// Named export of the class itself is test-only — application code always
// uses the default singleton below.
export { IBKRConnection };

const ibkr = new IBKRConnection();
export default ibkr;