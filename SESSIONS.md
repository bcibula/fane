# Sessions

## 2026-05-24
What changed: Established SESSIONS.md as session handoff document with lean format (what changed / open / next). Caught up three missing session entries. PRINCIPLES.md $(date) placeholders flagged for fix. Repo confirmed clean for public access (no secrets in history, all via process.env).
Open: code 399 fix in orders.js attachFillListener, AAPL fill confirmation, $(date) placeholders in PRINCIPLES.md, repo not yet made public
Next: make repo public, apply code 399 fix in orders.js, confirm AAPL fill, begin Stage 3 signal detection design

## 2026-05-23
What changed: IB Gateway 10.45 running headless on VPS via Xvfb + IBC as systemd services, socket API on port 4002. Stage 2 complete — connection.js (singleton, kill token, reconnect), account.js (positions, summary), orders.js (submit, fill tracking). Signal approval UI at /signals. First test order: AAPL BUY 1 share submitted after hours, queued as PreSubmitted.
Open: code 399 must not trigger onOrderError in attachFillListener — fix pending. AAPL fill expected Monday 9:30am ET, needs confirmation.
Next: confirm AAPL fill, apply code 399 fix, begin Stage 3 signal detection design

## 2026-05-22
What changed: OpenClaw heartbeat was burning credits silently every 30min (~20K tokens/poll); fixed with thinkingDefault off. HEARTBEAT.md must contain only # comments — markdown headings count as content and trigger polls. OpenClaw config lessons: schema is strict, always use `openclaw config patch`, never edit openclaw.json directly.
Open: none
Next: Stage 2 IBKR connectivity

## 2026-05-20
What changed: MEMORY.md authored for OpenClaw injection layer. fane-openclaw repo created, workspace backed up. openclaw.json.template created with secrets redacted. README.md added with rebuild guide. SESSIONS.md created as append-only development log.
Open: OpenClaw filesystem permissions not yet applied (agents.defaults.permissions.filesystem)
Next: Stage 2 IBKR connectivity, dedicated session on Claude.ai project configuration as context injection layer