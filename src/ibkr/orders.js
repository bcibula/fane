/**
 * src/ibkr/orders.js
 *
 * Order submission layer — the final gate between human approval and IBKR execution.
 *
 * The only public export is submitOrder(dbOrderId). It is called by server.js
 * immediately after a human approves a signal. The order row already exists in
 * the DB with status='pending' — this module submits it to IB Gateway and
 * tracks it through to fill.
 *
 * Design contract:
 *  - Human approval is a prerequisite. This module never initiates orders.
 *  - Counter-argument was recorded at approval time. This module does not re-check it.
 *  - IBKR is the execution authority. If IBKR rejects the order, the DB reflects that.
 *  - Fill listener is global — one handler covers all active orders, re-attached on reconnect.
 *  - Inaction and action are both logged (Principle 4). Errors are logged the same way.
 *
 * Flow:
 *   human approves → server.js creates order row (pending) → calls submitOrder()
 *   submitOrder() → reqIds → placeOrder → DB: submitted
 *   orderStatus Filled → DB: filled → trades row written
 *   orderStatus Cancelled / error → DB: cancelled / error
 */

import { EventName, SecType, OrderAction, OrderType, TimeInForce } from '@stoqey/ib';
import ibkr from './connection.js';
import { getDb } from '../db/schema.js';
import { now } from '../utils/time.js';

// ── Configuration ─────────────────────────────────────────────────────────────

const TIMEOUT_MS = 10_000;

// Default contract parameters for paper trading.
// Exchange: SMART routes to the best available venue automatically.
// Currency: USD — paper account trades US-listed equities.
const DEFAULT_EXCHANGE  = 'SMART';
const DEFAULT_CURRENCY  = 'USD';
const DEFAULT_TIME_IN_FORCE = TimeInForce.DAY;

// ── Logging ───────────────────────────────────────────────────────────────────

function logToDb(status, notes, error = null) {
  let db;
  try {
    db = getDb();
    db.prepare(`
      INSERT INTO agent_log (run_at, run_type, status, notes, error)
      VALUES (?, 'order_submission', ?, ?, ?)
    `).run(now(), status, notes, error);
  } catch (err) {
    console.error(`[${now()}] Orders: log write failed:`, err.message);
  } finally {
    db?.close();
  }
}

// ── getNextOrderId ────────────────────────────────────────────────────────────

/**
 * Request the next valid order ID from IB Gateway.
 * IBKR requires all order IDs to be >= the value it last issued.
 * Wraps the reqIds() / nextValidId event pair in a Promise.
 *
 * @returns {Promise<number>} Next valid integer order ID.
 */
function getNextOrderId() {
  const api = ibkr.getApi();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      api.removeListener(EventName.nextValidId, onId);
      reject(new Error('getNextOrderId: timed out waiting for nextValidId'));
    }, TIMEOUT_MS);

    function onId(orderId) {
      clearTimeout(timer);
      api.removeListener(EventName.nextValidId, onId);
      resolve(orderId);
    }

    // Register before calling reqIds to avoid a race condition where
    // the event fires before the listener is attached.
    api.on(EventName.nextValidId, onId);
    api.reqIds(-1);
  });
}

// ── submitOrder ───────────────────────────────────────────────────────────────

/**
 * Submit a pending order to IB Gateway.
 *
 * Called by server.js immediately after a human approves a signal.
 * The order row must exist in the DB with status='pending'.
 *
 * @param {number} dbOrderId  Row ID from the orders table.
 * @returns {Promise<{ibkrOrderId: number}>}
 */
export async function submitOrder(dbOrderId) {
  // ── 1. Read order from DB ──────────────────────────────────────────────────
  let db = getDb();
  let order;
  try {
    order = db.prepare('SELECT * FROM orders WHERE id = ?').get(dbOrderId);
  } finally {
    db.close();
  }

  if (!order) {
    throw new Error(`submitOrder: order ${dbOrderId} not found in DB.`);
  }
  if (order.status !== 'pending') {
    throw new Error(`submitOrder: order ${dbOrderId} is already ${order.status}.`);
  }

  // ── 2. Guard: IBKR must be connected ──────────────────────────────────────
  if (!ibkr.isConnected) {
    throw new Error('submitOrder: IBKR not connected. Cannot submit order.');
  }
  if (ibkr.isKilled) {
    throw new Error('submitOrder: Kill token is active. Cannot submit order.');
  }

  const api = ibkr.getApi();

  // ── 3. Get next valid IBKR order ID ───────────────────────────────────────
  const ibkrOrderId = await getNextOrderId();
  console.log(`[${now()}] Orders: next valid IBKR order ID = ${ibkrOrderId}`);

  // ── 4. Build contract ──────────────────────────────────────────────────────
  // For paper trading US stocks via SMART routing.
  // primaryExch is left unset — SMART handles routing automatically.
  const contract = {
    symbol:   order.ticker,
    secType:  SecType.STK,
    exchange: DEFAULT_EXCHANGE,
    currency: DEFAULT_CURRENCY,
  };

  // ── 5. Build order ─────────────────────────────────────────────────────────
  const ibkrOrder = {
    action:        order.direction === 'BUY' ? OrderAction.BUY : OrderAction.SELL,
    orderType:     order.order_type === 'LMT' ? OrderType.LMT : OrderType.MKT,
    totalQuantity: order.quantity,
    tif:           DEFAULT_TIME_IN_FORCE,
    transmit:      true,  // false = stage order without transmitting; true = live submission
  };

  // Add limit price for LMT orders
  if (order.order_type === 'LMT' && order.limit_price != null) {
    ibkrOrder.lmtPrice = order.limit_price;
  }

  // ── 6. Update DB to 'submitted' before placing ────────────────────────────
  // Write before the API call so a crash mid-flight leaves an auditable record.
  const submittedAt = now();
  db = getDb();
  try {
    db.prepare(`
      UPDATE orders
      SET status = 'submitted', ibkr_order_id = ?, submitted_at = ?
      WHERE id = ?
    `).run(ibkrOrderId, submittedAt, dbOrderId);
  } finally {
    db.close();
  }

  // ── 7. Place the order ─────────────────────────────────────────────────────
  console.log(
    `[${now()}] Orders: placing ${order.direction} ${order.quantity} ${order.ticker}` +
    ` (${order.order_type}) — IBKR order ID ${ibkrOrderId}`
  );

  try {
    api.placeOrder(ibkrOrderId, contract, ibkrOrder);
  } catch (err) {
    // placeOrder() is synchronous and throws only on immediate validation errors.
    // IBKR async rejections come through the error event, handled by the fill listener.
    const msg = `placeOrder threw: ${err.message}`;
    console.error(`[${now()}] Orders: ${msg}`);

    db = getDb();
    try {
      db.prepare(`
        UPDATE orders SET status = 'error', error_message = ? WHERE id = ?
      `).run(msg, dbOrderId);
    } finally {
      db.close();
    }

    logToDb('error', `Order ${dbOrderId} (IBKR ${ibkrOrderId}) — ${msg}`, msg);
    throw err;
  }

  logToDb(
    'submitted',
    `Order ${dbOrderId} submitted — ${order.ticker} ${order.direction} x${order.quantity} — IBKR ID ${ibkrOrderId}`
  );

  console.log(`[${now()}] Orders: submitted — IBKR order ID ${ibkrOrderId}`);
  return { ibkrOrderId };
}

// ── Fill listener ─────────────────────────────────────────────────────────────

/**
 * Global order status listener. Handles fills, cancellations, and errors
 * for all active orders. Re-attached to the new IBApi instance on each reconnect.
 *
 * IB order status strings: PreSubmitted | Submitted | Filled | Cancelled | Inactive
 *
 * orderStatus event signature:
 *   (orderId, status, filled, remaining, avgFillPrice, permId, parentId,
 *    lastFillPrice, clientId, whyHeld, mktCapPrice)
 */
function attachFillListener(api) {
  api.on(EventName.orderStatus, (
    ibkrOrderId, status, filled, remaining, avgFillPrice
  ) => {
    console.log(
      `[${now()}] Orders: status update — IBKR ID ${ibkrOrderId} → ${status}` +
      ` (filled: ${filled}, remaining: ${remaining}, avgPrice: ${avgFillPrice})`
    );

    if (status === 'Filled') {
      onOrderFilled(ibkrOrderId, filled, avgFillPrice);
    } else if (status === 'Cancelled' || status === 'Inactive') {
      onOrderCancelled(ibkrOrderId, status);
    }
    // PreSubmitted / Submitted: informational — no DB update needed beyond what submitOrder wrote.
  });

  // Order-scoped errors arrive via the main error event with the order ID as reqId.
  api.on(EventName.error, (err, code, reqId) => {
    if (code >= 1000) return;  // informational — ignore
    if (reqId == null || reqId < 0) return;  // not order-scoped
    if (code === 399) {
      console.log(`[${now()}] Orders: warning [399] for order ${reqId} (order queued, not rejected): ${err?.message ?? err}`);
      return;
}

    const msg = err?.message ?? String(err);
    console.error(`[${now()}] Orders: IBKR error [${code}] for order ${reqId}: ${msg}`);
    onOrderError(reqId, code, msg);
  });
}

function onOrderFilled(ibkrOrderId, filledQty, avgFillPrice) {
  const filledAt = now();
  let db;
  try {
    db = getDb();
    const order = db.prepare(
      `SELECT * FROM orders WHERE ibkr_order_id = ?`
    ).get(ibkrOrderId);

    if (!order) {
      console.log(`[${now()}] Orders: fill event for unknown IBKR order ID ${ibkrOrderId} — ignored`);
      return;
    }
    if (order.status === 'filled') {
      return;  // duplicate event — already handled
    }

    // Update order record
    db.prepare(`
      UPDATE orders
      SET status = 'filled', filled_at = ?, filled_price = ?, filled_quantity = ?
      WHERE id = ?
    `).run(filledAt, avgFillPrice, filledQty, order.id);

    // Write trade record — entry side only; exit and P&L populated when position closes
    db.prepare(`
      INSERT INTO trades
        (signal_id, ticker, direction, entry_date, entry_price, position_size, thesis)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      order.signal_id,
      order.ticker,
      order.direction,
      filledAt,
      avgFillPrice,
      filledQty,
      order.human_note || null
    );

    logToDb(
      'filled',
      `Order ${order.id} filled — ${order.ticker} ${order.direction}` +
      ` x${filledQty} @ $${avgFillPrice} — IBKR ID ${ibkrOrderId}`
    );

    console.log(
      `[${now()}] Orders: FILLED — ${order.ticker} ${order.direction}` +
      ` x${filledQty} @ $${avgFillPrice}`
    );
  } catch (err) {
    console.error(`[${now()}] Orders: onOrderFilled error:`, err.message);
  } finally {
    db?.close();
  }
}

function onOrderCancelled(ibkrOrderId, status) {
  let db;
  try {
    db = getDb();
    const order = db.prepare(
      `SELECT * FROM orders WHERE ibkr_order_id = ?`
    ).get(ibkrOrderId);

    if (!order || order.status === 'cancelled') return;

    db.prepare(`
      UPDATE orders SET status = 'cancelled' WHERE id = ?
    `).run(order.id);

    logToDb(
      'cancelled',
      `Order ${order.id} cancelled (${status}) — ${order.ticker} — IBKR ID ${ibkrOrderId}`
    );

    console.log(`[${now()}] Orders: CANCELLED — IBKR ID ${ibkrOrderId} (${status})`);
  } catch (err) {
    console.error(`[${now()}] Orders: onOrderCancelled error:`, err.message);
  } finally {
    db?.close();
  }
}

function onOrderError(ibkrOrderId, code, message) {
  let db;
  try {
    db = getDb();
    const order = db.prepare(
      `SELECT * FROM orders WHERE ibkr_order_id = ?`
    ).get(ibkrOrderId);

    if (!order) return;
    if (order.status === 'error') return;  // already recorded

    db.prepare(`
      UPDATE orders
      SET status = 'error', error_code = ?, error_message = ?
      WHERE id = ?
    `).run(code, message, order.id);

    logToDb(
      'error',
      `Order ${order.id} error [${code}] — ${order.ticker} — IBKR ID ${ibkrOrderId}`,
      message
    );

    console.error(`[${now()}] Orders: ERROR on order ${order.id} [${code}]: ${message}`);
  } catch (err) {
    console.error(`[${now()}] Orders: onOrderError handler error:`, err.message);
  } finally {
    db?.close();
  }
}

// ── Initialise fill listener ──────────────────────────────────────────────────

// Re-attach to the new IBApi instance on each connection (including the first).
// connection.js recreates IBApi on every reconnect, so listeners must be
// re-registered here rather than held on a stale instance.
ibkr.on('connected', () => {
  console.log(`[${now()}] Orders: attaching fill listener to new IBKR connection.`);
  try {
    attachFillListener(ibkr.getApi());
  } catch (err) {
    // getApi() can throw if something races. Log and continue — next reconnect will retry.
    console.error(`[${now()}] Orders: failed to attach fill listener:`, err.message);
  }
});