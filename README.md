# Fane

Personal AI-powered market intelligence and paper trading system.
Named after Fan Li — patient, systematic, rides the market rather 
than fighting it.

## Companion repositories

- **[fane-openclaw](https://github.com/bcibula/fane-openclaw)** — 
  OpenClaw agent workspace: memory, identity, and configuration files. 
  Required alongside this repo for a full working installation.

## Key dependencies

- Node.js v24 via nvm
- OpenClaw (agent layer)
- SQLite via better-sqlite3
- Hetzner VPS, Ubuntu, Helsinki

## Key paths

| What | Where |
|------|-------|
| Application | `~/fane/` |
| Database | `~/fane/data/fane.db` |
| Schema | `~/fane/src/db/schema.js` |
| OpenClaw config | `~/.openclaw/openclaw.json` |
| OpenClaw workspace | `~/.openclaw/workspace/` |
| Systemd timer | `fane-briefing.timer` (13:00 UTC weekdays) |

## Rebuilding

1. Clone this repo to `~/fane/`
2. Clone `fane-openclaw` to `~/.openclaw/workspace/`
3. Copy `openclaw.json.template` → `openclaw.json`, fill in secrets
4. Run `npm install`
5. Restore `fane.db` from backup
6. Re-enable systemd timer

See `PRINCIPLES.md` for design principles and agent operating rules.
