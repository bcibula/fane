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
    this._clearReconnectTimer();
    if (this._api) {
      try {
        this._api.disconnect();
      } catch (err) {
        // Disconnect on an already-broken socket can throw — that's fine.
        console.log(`[${now()}] IBKR: Disconnect threw (likely already down):`, err.message);
      }
    }
    this._connected = false;
    this._api = null;
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

  /** True if the connection is currently live. */
  get isConnected() {
    return this._connected && !this._killed;
  }

  /** True if the kill token has been fired this session. */
  get isKilled() {
    return this._killed;
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
    this._api = new IBApi({ host: HOST, port: PORT, clientId: CLIENT_ID });

    // ── connected ──
    this._api.on(EventName.connected, () => {
      this._connected   = true;
      this._reconnectCount = 0;
      console.log(`[${now()}] IBKR: Connected to IB Gateway at ${HOST}:${PORT}.`);
      logToDb('connected', `${HOST}:${PORT} clientId=${CLIENT_ID}`);
      this._emit('connected', { host: HOST, port: PORT, at: now() });
    });

    // ── disconnected ──
    this._api.on(EventName.disconnected, () => {
      const wasConnected = this._connected;
      this._connected = false;

      if (wasConnected) {
        console.log(`[${now()}] IBKR: Disconnected from IB Gateway.`);
        logToDb('disconnected', 'Connection lost');
        this._emit('disconnected', { at: now() });
      }

      // Don't reconnect if killed or if this was a deliberate disconnect()
      // (deliberate: _api will have been nulled before this fires — but the
      // event may fire after, so check the killed flag only).
      if (!this._killed) {
        this._scheduleReconnect();
      }
    });

    // ── error ──
    this._api.on(EventName.error, (err, code, reqId) => {
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
      this._api.connect();
    } catch (err) {
      console.error(`[${now()}] IBKR: connect() threw:`, err.message);
      logToDb('error', 'connect() threw on startup', err.message);
      this._scheduleReconnect();
    }
  }

  _scheduleReconnect() {
    if (this._killed) return;
    if (this._reconnectCount >= MAX_RECONNECT_ATTEMPTS) {
      const msg = `Reconnect limit reached (${MAX_RECONNECT_ATTEMPTS} attempts). Giving up.`;
      console.error(`[${now()}] IBKR: ${msg}`);
      logToDb('error', msg);
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

const ibkr = new IBKRConnection();
export default ibkr;