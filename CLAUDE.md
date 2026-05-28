# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Fane is a personal AI-powered market intelligence and paper trading system. It is **not** a trading bot — the human decides everything. Fane surfaces signals; action requires explicit human approval with documented counter-argument.

Named after Fan Li: patient, systematic, rides the market rather than fighting it.

## Commands

```bash
npm start          # Start the web server (port 3000) + initializes DB
npm run init-db    # Initialize/migrate the database only
npm run brief      # Run a briefing manually against live market data
node index.js      # Same as npm start
```

Inspect the database directly:
```bash
sqlite3 ~/fane/data/fane.db
```

Check logs (production):
```bash
journalctl -u fane.service -f
```

There is no test suite. The verify loop is manual: run the relevant script, check console output and DB state.

## Architecture

### Entry point

`index.js` imports two things: `src/db/init.js` (runs `initDb()` + `migrateDb()` at startup) and `src/web/server.js` (Express on port 3000, also connects to IB Gateway via the singleton).

### Data flow — daily briefing

```
src/scheduler/daily.js (cron 9am ET, weekdays)
  → src/agent/market.js        (yahoo-finance2: fetches 9 symbols)
  → src/db/market.js           (saveMarketSnapshot → market_snapshots table)
  → src/agent/briefing.js      (Claude Haiku: generates 5-section briefing)
  → src/db/briefing.js         (saveBriefing → updates briefing_text column)
  → src/agent/email.js         (nodemailer: delivers email)
```

The scheduler is **not** started by `npm start` — it runs separately. The systemd timer calls `fane-briefing.timer` at 13:00 UTC weekdays (9am ET).

### Data flow — signal approval → IBKR order

```
signals table (status='pending')
  → GET /signals (human reviews)
  → POST /api/signals/:id/approve (counter_argument + conviction + qty required)
  → orders table (status='pending')
  → src/ibkr/orders.js submitOrder() (non-blocking, async)
  → IBKR socket API (port 4002, paper trading)
  → orders table updated (submitted → filled)
```

Passing a signal is logged identically to approving one (Principle 4: inaction is a decision).

### IBKR connection

`src/ibkr/connection.js` exports a singleton `ibkr`. It is imported by `server.js` and called `ibkr.connect()` once at startup. All other IBKR modules (`account.js`, `orders.js`) call `ibkr.getApi()`.

Kill token (`ibkr.kill(reason)`) is absolute — no reconnect without process restart. Accessible from the UI via the Kill button in the nav.

### Web UI routes

| Route | Purpose |
|-------|---------|
| `GET /` | Latest briefing with annotation panel |
| `GET /briefing/:date` | Historical briefing |
| `GET /signals` | Pending signal approval queue |
| `GET /positions` | Live IBKR position snapshot (fetches + persists on each load) |
| `GET /trades` | Orders lifecycle + closed trades |
| `POST /annotations` | Saves annotation + calls Claude for AI response |
| `POST /api/signals/:id/approve` | Approve a signal, create order, submit to IBKR |
| `POST /api/signals/:id/pass` | Pass on a signal (logged same as approve) |
| `POST /api/kill` | Fire the kill token |

### Database

SQLite at `~/fane/data/fane.db`. Schema is in `src/db/schema.js`. `initDb()` creates tables (idempotent). `migrateDb()` adds columns via `PRAGMA table_info()` guard (idempotent, safe to re-run).

Key tables: `market_snapshots`, `signals`, `orders`, `trades`, `positions`, `account_snapshots`, `annotations`, `agent_log`.

The `orders` table sits between signal approval and `trades`. The lifecycle is: `pending → submitted → filled`, with the filled record eventually becoming a `trades` row.

### Time

All timestamps flow through `src/utils/time.js`. No component constructs its own timestamp. The VPS clock is the authority (Principle 9).

## Critical constraints

**Data shape changes must be traced to all consumers.** When a data structure changes (nested vs flat, renamed keys), every consumer must be updated in the same commit. The briefing failed silently at 13:00 UTC (2026-05-26) because `market.js` returned nested objects but `db/market.js` expected flat keys — missed briefing with no alert.

**Counter-argument is mandatory.** The `orders.counter_argument` column is `NOT NULL`. Signal approval is rejected at the API level without a counter-argument. This is enforced in both the UI and the route handler.

**`package.json` is the source of truth for dependencies.** Always verify after installing packages — a missing entry causes silent failures after restarts.

**No AI timestamps.** Claude must never fabricate timestamps; `now()` from `time.js` is the only valid source.

## Infrastructure (production)

- Hetzner VPS, Ubuntu, Helsinki
- IB Gateway 10.45 runs headless via Xvfb (`:1`) + IBC 3.23.0 at `/opt/ibc`
- Socket API on port 4002, paper trading, Read-Only API OFF
- Systemd: `fane.service` (web), `ibgateway.service`, `xvfb.service`
- Network: Hetzner Cloud Firewall handles external access; server binds `0.0.0.0:3000` by design
- Companion repo: `fane-openclaw` at `~/.openclaw/workspace/` (agent memory/identity layer)

## Session handoff

See `SESSIONS.md` (latest entry at top) for current state, open items, and next steps. `PRINCIPLES.md` contains design principles that govern agent prompts and schema decisions — read it before changing any prompt or approval flow.
