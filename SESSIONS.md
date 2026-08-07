> Source of truth: github.com/bcibula/fane — any mounted or copied
> version is a stale snapshot. Fetch fresh per BOOTSTRAP.md.

# Sessions

## 2026-08-06

### What changed
- READING.md foundation improvements completed, committed, and pushed
  (commit 0ae699e).
- Uncommitted July 28 BOOTSTRAP.md and PROMPTS.md drafts investigated and
  found unfinished and overly complex.
- Those drafts preserved at
  ~/fane-bootstrap-prompts-local-2026-08-06.patch; both working files
  restored to the committed baseline.
- BOOTSTRAP.md redesigned from first principles as a short,
  tool-independent procedure for establishing a known-good session state.
- PROMPT 2 is now the sole session entry point: confirms the date,
  retrieves and executes the canonical BOOTSTRAP.md, then summarizes
  current Fane state.
- Removed: duplicated fetch instructions, Claude-specific bash_tool
  requirements, circular PROMPT 2/BOOTSTRAP invocation, FANE_RAW_FETCH
  speculation, and unnecessary protocol expansion.
- Required bootstrap file set remains unconditional: BOOTSTRAP.md,
  SESSIONS.md, PRINCIPLES.md, PROMPTS.md, YEAR1.md, and READING.md.
- Bootstrap self-verification and fail-closed behaviour retained in
  simplified form.

### Open
- Redesigned bootstrap not yet committed, pushed, or tested from a fresh
  ChatGPT and Claude session.
- PROMPT 1 intentionally left unchanged and not reviewed as part of this
  redesign.

### Next
- Review the complete three-file diff.
- Commit and push BOOTSTRAP.md, PROMPTS.md, and SESSIONS.md together.
- Test PROMPT 2 from a fresh ChatGPT chat and a fresh Claude Code session
  against the pushed canonical files.
- Change the design again only in response to a demonstrated failure or
  clear unnecessary complexity.

## 2026-07-27

### What changed
- No code or config changes. Session was a ledger audit.
- Six sessions occurred 2026-07-15 to 2026-07-17 with no SESSIONS.md entry
  for any of them. Two produced committed repo changes: BOOTSTRAP.md created
  and PROMPTS.md edited (07-16), and the "View full briefing online" link
  moved to the top of the email in src/agent/email.js (07-16, verified
  present at line 27). Both are in the repo. Neither was recorded.
- Two independent leak paths identified:
  (1) Items captured only in Claude memory, never written to the repo.
  (2) Items present in earlier SESSIONS.md entries silently absent from
      later open lists. An omission reads identically to a completion when
      moving forward through the file. The 2026-07-13 open list carried 8
      items; earlier entries carried 12-14, with no closures recorded for
      the difference.
- Open list below is reconstructed. Provenance marked where an item did not
  come from the 2026-07-13 entry.
- FIX/CTCI protocol deep dive: held in memory as a longer-horizon item,
  unsourceable in repo or chat history, not recognized by Brad. Deleted.
- Trial: run the deliberate-thinking layer on ChatGPT instead of Claude.ai
  for an evaluation period. Claude Code remains the execution layer on the
  VPS either way. Motivation is the AI provider concentration risk in
  PRINCIPLES.md — four Anthropic layers to three — and a controlled
  comparison of the two on the same work. Not a commitment. Revert is
  free: the repo is the authority and nothing about Fane depends on which
  tool does the thinking. Revisit at Stage 3 open or sooner if the
  bootstrap can't be made reliable on ChatGPT.

### Open

Carried from 2026-07-13:
- IBC auth-state watchdog gap (port 4002 up ≠ IBC authenticated)
- Market snapshot dynamic price feed — designed, not executed
- Morning question engine — designed, not built
- extractLearnSection() regex unverified
- Briefing page left-margin alignment bug
- Nav/signal card inline styles → CSS custom properties
- Hash-chained audit trail — evaluate at Stage 5
- PRINCIPLES.md catch-up pass — dedicated session

Recovered — in earlier entries, absent from 2026-07-13:
- IBKR health check / Telegram alert on sustained gateway disconnect
- IBKR forced password rotation monitoring (IBC fails login silently)
- Annotations page build — pending Stage 3 + schema verification
- Annotation markdown bug — escHtml instead of marked.parse in
  renderAnnotationThread and appendThread
- Annotation cleanup — delete, highlight spans, short-text selection
- Annotation API model review — claude-opus-4-5
- Working model dedicated session
- OTEX + comparables + FAANG watchlist

Recovered from memory — no repo record:
- Position tracking page — current price and up/down from cost basis for
  each of the 30 curriculum positions, plus aggregated portfolio total.
  Own tab vs. integration with signals/portfolio/briefing — design pending.
  (2026-07-17, re-confirmed 2026-07-27)
- Annotation open-thread design — "Keep thinking about this" human flag;
  briefing page is reading mode, annotations page is reflection mode.
  SESSIONS.md records the decision was made; content is memory-only.
- OpenClaw — how LLM humor works mechanically (Track 2)
- Confidence calibration / tracing layer as a product concept

Status unknown:
- Email link change (07-16) — code present, live-briefing verification
  never recorded

Structural:
- BOOTSTRAP.md specifies Claude-specific tooling (bash_tool curl,
  prohibitions on web_fetch and the GitHub API). Does not port to another
  tool. Needs restating so the requirement survives per-tool.
- Nothing prevents open-list items from being dropped between entries.

### Next
- Decide whether the ledger gets a mechanical integrity check or whether
  audit-on-suspicion stays the method.

## 2026-07-13

### Completed
- IBKR error code filter fixed: code >= 1000 → code >= 1100 && code <= 2999; 10000+ order errors now reach onOrderError (commit fec52ab)
- Code 399 block indentation cleaned up
- Restart=on-failure confirmed already present in fane.service — removed from open list
- Briefing failure notifier: infra/briefing-failure-notify.sh + fane-briefing-failure.service + OnFailure= confirmed working via Telegram
- Watchdog 90s grace period: IBKR ~3:50pm ET session reset identified as false-positive source; watchdog now waits before acting
- sudoers entry for Claude Code: /etc/sudoers.d/claude-code (mode 0440)
- IBKR read-only session state detection — parked, revisit pre-Stage 3
- Anti-.md-creep rule and vocabulary gloss rule established
- Morning question engine designed: retrieval-based, top of briefing, variable reward, 24hr curiosity gap
- Market snapshot dynamic price feed designed: IBKR-first + DB fallback + position_prices table
- Track 2 working model substantially expanded

### Open
- IBC auth-state watchdog gap (port 4002 up ≠ authenticated) — open, untouched
- Market snapshot AAPL-only — design agreed, not executed
- Morning question engine — designed, not built
- extractLearnSection regex unverified
- Briefing page left-margin alignment bug
- Nav/signal card inline styles → CSS custom properties
- Hash-chained audit trail — evaluate at Stage 5
- PRINCIPLES.md catch-up pass — dedicated session needed

### Next
- Morning question engine implementation (top of queue)
- Market snapshot dynamic price feed (Claude Code prompt ready)


## 2026-07-09

### What changed
- Diagnosed recurring session-open fetch failure: web_fetch permanently blocked
  for repo raw URLs (security guard requires URL in prior search results);
  GitHub API rate-limited unauthenticated. Fix: bash_tool curl to
  raw.githubusercontent.com — works reliably, no auth, no limits
- PROMPTS.md restructured and pushed (a676a46): PROMPT 2 fetches via curl,
  date confirmation restored, next-chat prompt reduced to lean format —
  PROMPT 2 owns the ritual, next-chat prompt carries only session state,
  the two can no longer drift
- OneNote duplicate of prompts deleted — repo is sole authority
- Track 2 session (deepest yet): flinch-fired-wrong specimen captured
  (hesitation before deleting the stale OneNote copy — protecting the
  liability, not the asset); Claude working model gained close-pressure,
  topic-triggered register shift, first pushback (mechanism unresolved),
  "a good mirror with a lag"
- Recirculation gap named: records are write-optimized, read-neglected

### Open
- Write insight log entry to PRINCIPLES.md (drafted, below)
- Restart=on-failure on fane.service — carried again, still first in queue
- Review/recirculation ritual — undesigned
- Hash-chained audit trail — evaluate at Stage 5
- Watchdog doesn't verify IBC auth state (port up ≠ logged in)
- Briefing timer failure silent — no alert on generation failure
- IBKR read-only session state undetected
- extractLearnSection regex unverified
- Market snapshot AAPL-only — 29 positions without price feed
- Code 399 fix in orders.js attachFillListener
- Briefing page left-margin alignment bug
- Nav/signal card inline styles → CSS custom properties
- PRINCIPLES.md catch-up pass (dedicated session)

### Next
- Add Restart=on-failure to fane.service



## 2026-07-06

### What changed
- Diagnosed IBKR disconnect: IBC session failure showing "UNRECOGNIZED USERNAME OR PASSWORD"
  dialog — not a password rotation. Manual `sudo systemctl restart ibgateway` recovers it.
  Fane reconnected automatically on next slow retry cycle.
- Built and installed fane-gateway-watchdog: systemd timer running every 5 minutes,
  checks if port 4002 is listening, restarts ibgateway.service if not.
- Watchdog sends Telegram notification on action (success or failure) with EST timestamp.
  Silent when gateway is healthy — logs and notifies only on restart.
- Source files in ~/fane/infra/ (watchdog script, service unit, timer unit, install script).
  Installed via `sudo bash ~/fane/infra/install-watchdog.sh`.
- Tested end-to-end: manual stop of ibgateway → watchdog fired → restart → Telegram confirmed.

### Open
- Watchdog port check does not verify IBC is logged in — gateway could be listening
  but stuck on auth dialog (port 4002 up but API not accessible)
- fane.service has no auto-restart on failure — add Restart=on-failure to service unit
- Briefing timer failure is silent — no alert if briefing generation fails
- IBKR session read-only state undetected — connected and heartbeating but orders rejected
- extractLearnSection regex unverified — topic rotation may not extract cleanly
- Market snapshot AAPL-only — 29 positions have no daily price feed
- Code 399 fix in orders.js attachFillListener
- Briefing page left-margin alignment bug
- Nav bar and signal card inline styles not migrated to CSS custom properties

### Next
- Add Restart=on-failure to fane.service unit (small, low-risk, high value)
- Verify topic rotation by checking recent briefing_text in DB
- Market snapshot expansion (29 positions without price data)


## 2026-06-26

### What changed
- Diagnosed recurring IBKR disconnects: two bugs in connection.js identified
  and fixed via Claude Code
- Bug 1 (generation guard): _createAndConnect() now captures `const api = new IBApi()`
  as a local; every event handler starts with `if (this._api !== api) return` —
  prevents stale old-instance disconnected events from poisoning new connections
- Bug 2 (disconnect ordering): this._api nulled before api.disconnect() call,
  so deliberate disconnects no longer trigger spurious reconnects
- Added 60s heartbeat (reqCurrentTime) to keep IB Gateway from dropping idle connections
- Committed: "ibkr: generation guard, disconnect ordering fix, 60s heartbeat"
- Established working pattern: Claude Code for execution, Claude.ai chat for planning

### Open
- Gateway "UNRECOGNIZED USERNAME OR PASSWORD" dialog = stale IBC session, NOT
  password rotation — restart ibgateway first, update config.ini only if restart fails
- extractLearnSection regex: still unverified whether topic rotation is working cleanly
- Market snapshot still AAPL-only; other 29 positions have no daily price feed
- IBKR health check + Telegram alert on sustained gateway disconnect
- Code 399 fix in orders.js attachFillListener
- Briefing page left-margin alignment bug
- Nav bar and signal card inline styles not yet migrated to CSS custom properties

### Next
- Verify briefing topic rotation by checking recent briefing_text in DB
- Market snapshot expansion (29 positions without price data)
- IBKR health check / Telegram alert


## 2026-06-22

### What changed
- Fixed VS Code Remote SSH: was connecting to raw Hetzner IP (blocked by firewall);
  updated Windows SSH config to route through Tailscale (100.105.182.112). Permanent fix.
- Updated Hetzner firewall rule to current home IP (173.206.174.170) as true backup.
- Diagnosed IBKR gateway login failure (stale session, not password rotation);
  restarted ibgateway, Fane reconnected automatically.
- Fixed briefing agent: positions were hardcoded as single AAPL entry;
  now queries all 30 positions from DB at generation time.
- Fixed briefing topic rotation: "one thing to learn" was VIX every day;
  now passes last 7 briefing topics to prompt with explicit do-not-repeat instruction.

### Open
- extractLearnSection regex may not be extracting topics cleanly from markdown briefings;
  monitor whether rotation holds over next few days
- Briefing market data still AAPL-only; other 29 positions have no daily price feed
- IBKR health check + Telegram alert on gateway disconnect (open from Stage 2.5)
- Briefing page left-margin alignment bug
- Nav bar and signal card inline styles not yet migrated to CSS custom properties
- Code 399 fix in orders.js attachFillListener

### Next
- Monitor tomorrow's briefing for topic rotation correctness
- Consider expanding market snapshot to cover more held symbols
- Stage 3 design discussion when ready to open it


2026-06-17
What changed:

Resolved staged-but-uncommitted SESSIONS.md from previous session — committed and pushed to clean state
Built macro learning watchlist of 29 positions across 9 segments: Energy (SU, XOM, SLB), Defense (LMT, RTX, NOC), Financials (RY, JPM, GS), Gold (ABX, AEM, FNV), Agriculture (NTR, BG, DE), Consumer Staples (WMT, COST, L), Semiconductors (NVDA, TSM, INTC), Utilities (FTS, NEE, DUK), Healthcare (JNJ, WELL), Fixed Income (TLT, XBB), Commodities (TECK)
Created insert_watchlist_signals.sh — bulk signal insert script, run on VPS
Approved all 29 signals through Fane UI with counter-arguments, Low conviction, 10 shares each
All 29 orders submitted to IBKR, queued for market open 2026-06-18 9:30 ET
Canadian names (SU, RY, ABX, AEM, FNV, NTR, FTS, L, XBB, TECK) on TSX in CAD; all others on US exchanges in USD

Open:

Confirm 29 fills tomorrow after 9:30 ET — watch for error states on Canadian names
Code 399 fix still pending — orders.js attachFillListener must not trigger onOrderError on 399
OTEX + comparables + FAANG watchlist — deferred to next session
WATCHLIST.md not yet created in repo — segment/macro thread mapping still undocumented
(carry forward) Move "View full briefing online" link to top of email
(carry forward) Briefing page left-margin alignment bug
(carry forward) Dark mode migration to CSS custom properties for nav and signal cards
(carry forward) IBKR health check / Telegram alert on disconnect
(carry forward) Annotations page build — pending Stage 3 + schema verification

Next:

Confirm fills, then OTEX watchlist session
Consider drafting WATCHLIST.md to formally document the macro lens mapping for each segment


## 2026-06-17

### What changed
- Diagnosed IBKR disconnection: Fane had exhausted 10 reconnect attempts on
  2026-06-13 when ibgateway was down; gave up permanently; gateway was healthy
  but Fane never retried
- Fixed by restarting fane.service — reconnected immediately
- Fixed root cause in src/ibkr/connection.js: added _scheduleSlowRetry() —
  after MAX_RECONNECT_ATTEMPTS exhausted, waits 5 min, resets count, resumes
  normal backoff; timer stored in _reconnectTimer so kill/disconnect clear it
- Committed: "ibkr: slow retry after reconnect limit"

### Open
- Code 399 fix in orders.js attachFillListener (after-hours queue warning must
  not trigger onOrderError)
- Briefing page left-margin alignment bug
- Nav bar and signal card inline styles not migrated to CSS custom properties
  (dark mode incomplete)
- IBKR health check — Telegram alert if gateway disconnected for sustained period
- Monitor for IBKR forced password rotation (IBC fails silently)
- Annotations page build (pending Stage 3 + schema verification)
- Move "View full briefing online" link to top of email (src/agent/email.js)
- Working model dedicated session (post-CC review ritual, collaboration log, etc.)

### Next
- Stage 3: signal detection architecture
  Start with skills/signal-detection.md — read it, discuss schema and flinch
  capture design before any code
  

## 2026-06-12

**What changed:**
- Diagnosed and fixed iOS Safari annotation bug: float "Annotate" button
  only listened for `mouseup`, which doesn't fire on touch text selection.
  Claude Code added a `selectionchange`-based trigger (debounced ~150-200ms),
  shared selection-check logic between both events. Confirmed working on
  iPhone Safari after `sudo systemctl restart fane` + hard reload.

**Open:**
- (carry forward) Move "View full briefing online" link to top of email
- (carry forward) Code 399 fix in orders.js attachFillListener
- (carry forward) Briefing page left-margin alignment bug
- (carry forward) Dark mode migration to CSS custom properties
- (carry forward) IBKR health check / Telegram alert on disconnect
- (carry forward) Annotations page build — pending Stage 3 + schema verification

**Next:**
- Stage 3 signal detection prep — not yet open per Brad's confirmation.
  Continue Phase 1 markets/AI/plumbing curriculum work.


## 2026-06-01

**Changed**
- Introduced Stage 2.5 — fix things stage — between Stage 2 and Stage 3. Scope: known open items + structured UI walkthrough to surface all failures before Stage 3 signal detection begins.
- Dark mode implemented via CSS custom properties throughout `src/web/server.js` (Claude Code, 7m43s). All pages verified. Committed and pushed.
- Post-CC review ritual performed — Claude Code did not auto-commit; caught uncommitted changes via `git status`, reviewed diff before committing. Established this as mandatory practice.
- Annotation markdown bug confirmed — `renderAnnotationThread` and `appendThread` both use `escHtml` on AI responses instead of `marked.parse`. Raw asterisks visible in thread.
- Annotation open thread design decisions made — human flags open threads via "Keep thinking about this" button. Not AI auto-detection. Briefing page shows open thread count indicator. Annotations page is reflection mode, briefing page is reading mode. Schema verification required before building. Captured in memory.
- Working model review — identified action items: post-CC ritual, working model log, counter-argument on build decisions, before/after screenshots, open item priority/age/owner, capture corrections as data. Captured in memory.
- Brad preference noted: more colour and depth in conversation, less compression.

**Open**
- UI walkthrough incomplete — Signals, Positions, Trades flows not yet actively tested
- Annotation markdown rendering bug — `renderAnnotationThread` and `appendThread` need `marked.parse` instead of `escHtml`
- Briefing page left-margin alignment bug
- IBKR health check — Telegram alert if gateway disconnected
- Annotations page build — design decisions captured, schema verification required first
- Dark mode aesthetic pass — colours and fonts refinement deferred
- Annotation API model is `claude-opus-4-5` — needs review for cost/quality alignment
- Working model action items — dedicated session needed

**Next**
- Continue UI walkthrough — actively test Signals, Positions, Trades
- Fix annotation markdown rendering bug (quick win — two line change)
- Briefing page left-margin alignment bug
- Verify IBKR reconnects cleanly after service restart


## 2026-05-27

### What changed
- Annotation panel UX: removed auto-close, added "Saved ✓" state, "Annotate another passage →" reset link, closeBtn cleanup
- Dark mode: CSS custom properties added to pageShell and annotationStyles — covers all styled components except inline nav/signal card styles
- Claude Code installed and configured (v2.1.153, Pro, ~/fane)
- CLAUDE.md created via /init — covers commands, architecture, data flows, critical constraints, infrastructure
- PRINCIPLES.md: added "AI provider concentration" Known Risk State with four layers, two hard constraints, stateless prompts note
- PRINCIPLES.md: insight log entry 2026-05-27 added
- server copy.js deleted (temp file, origin unknown)

### Open
- server.js dark mode changes — committed? confirm
- nav bar and signal card inline styles not covered by dark mode — follow-up pass
- Confirm git add setting from accidentally selecting option 2 in Claude Code
- IBKR code 399 fix still pending
- Briefing page left-margin alignment bug
- IBKR health check / Telegram alert on disconnect

### Next
- Start Claude Code fresh session for nav dark mode follow-up
- Stage 3 signal detection work — skills/signal-detection.md


## 2026-05-26
**Changed**
- Fixed briefing email failure: db/market.js expected flat named params (@sp500_close, @tsx_close, @vix) but market.js returns nested objects (snapshot.sp500.price) — explicit mapping added to saveMarketSnapshot()
- GITHUB_TOKEN (read-only fine-grained PAT, public repos, no expiry set — calendar reminder needed for 2027-05-26) added to .env
- PROMPTS.md updated to use GitHub API for SESSIONS.md fetch (raw.githubusercontent.com blocked by Claude network policy; api.github.com works)
- PRINCIPLES.md: added principle — data shape changes must be traced to all consumers

**Open**
- AAPL BUY 1 fill expected 2026-05-27 09:30 ET (was PreSubmitted over Memorial Day weekend)
- Code 399 fix in orders.js (confirmed already present per May 25 session)
- DB fix: UPDATE orders SET status='submitted', error_code=NULL, error_message=NULL WHERE ibkr_order_id=1
- Stage 3: signal detection (skills/signal-detection.md, flinch capture)
- IBKR health check / Telegram alert for gateway disconnect
- Briefing page left-margin alignment bug

**Next**
- Confirm AAPL fill and DB order record
- Begin Stage 3: signal detection design


## 2026-05-25

**Changed**
- IB Gateway diagnosed as disconnected — IBKR 2FA was blocking IBC auto-login after session expiry
- Added VPS IP (62.238.13.86) and home network IP as trusted IPs in IBKR account management — gateway reconnected cleanly, no 2FA prompt
- AAPL BUY 1 confirmed still alive in IBKR as PreSubmitted — markets closed today (Memorial Day), fill expected Tuesday 2026-05-27 at 9:30am ET
- Code 399 fix confirmed already in orders.js (was flagged as pending in prior session, had been applied)
- DB state of order 1 confirmed clean via sqlite3 (status=submitted, error_code=null, error_message=null)
- Flagged IBKR health check (Telegram alert on disconnect) and password rotation monitoring as open items alongside Stage 3
- Briefing quality diagnosed: 3 data points, 1024 tokens, generic prompt — produces identical output daily
- Switched briefing model from claude-opus-4-5 to claude-haiku-4-5-20251001 (cost constraint: $5 API budget)
- Bumped max_tokens from 1024 to 2048
- Enriched market.js — 9 symbols (S&P 500, NASDAQ, TSX, VIX, 10yr yield, USD/CAD, oil, gold, AAPL) with price + change_pct
- Rewrote briefing prompt — Canadian investor context, AAPL position, Phase 1 learner framing, 5-section structure (what happened / why it matters / one thing to learn / counter-argument / recommendation)
- Discussed parallel learning gap: market mechanics vocabulary needed before Stage 3 signal detection design

**Open**
- AAPL fill confirmation Tuesday 2026-05-27 at 9:30am ET — verify fill price writes to orders table and appears in Closed Trades
- IBKR health check — Telegram alert if gateway disconnected >few minutes (alongside Stage 3)
- IBC password rotation monitoring — symptom: disconnected + "unrecognized username/password" in IBC log; fix: update IbPassword in /opt/ibc/config.ini, restart ibgateway
- Stage 3 (signal detection + flinch capture) — deferred until Phase 1 market foundations established
- Briefing page left-margin alignment bug
- Migrate historical fane.db from old VM to VPS
- Annotation cleanup (delete, highlight spans, short-text selection sensitivity)

**Next**
- Tuesday 9:30am ET: confirm AAPL fill — check /trades in Fane UI and sqlite3 trades table
- Let new briefing run for a few weeks before further tuning
- Continue Phase 1 reading — market mechanics vocabulary before Stage 3 design
- Stage 3 design when Phase 1 foundations land


## 2026-05-24

**Changed**
- YEAR1.md created and pushed — Year 1 learning curriculum, three tracks (markets, AI/LLM, infrastructure) + two parallel threads (macro foundations, market history). Phases not quarters. Flinch capture required from first trade.
- READING.md created and pushed — initial curated reading list grouped by track/thread, plus podcasts, newsletters, primary sources, philosophical foundations (Fan Li).
- PRINCIPLES.md updated — added Principle 10 (documentation must be operationally close to behavior), Documentation decay risk state, 2026-05-24 insight log entry.
- Project files in Claude project memory now include YEAR1.md and READING.md alongside PRINCIPLES.md and PROMPTS.md.
- Chat model switched to Claude Opus 4.7 (released 2026-04-16).
- AAPL test order from 2026-05-23 verified clean — `status='submitted'`, no error code. Code 399 fix in `orders.js` already prevents error path. No DB update was needed.
- Stage 3 design paused pending Phase 1 markets foundations research.

**Open**
- AAPL fill expected Monday 2026-05-26 at 9:30am ET. Verify trade record writes correctly on first real fill.
- Stage 3 (signal detection + flinch capture) — design deferred until Phase 1 foundations are established. Reframed as learning vehicle, not production screener.
- Operationalizing Principle 10 — briefing layer needs to surface principles, Year 1 topics, and reading recommendations. Agent prompts need to load PRINCIPLES.md / YEAR1.md skill-file style (anthropics/financial-services pattern).
- Briefing prompt refinement per anthropics/financial-services Morning Note structure.
- Briefing page left-margin alignment bug.
- Migrate historical fane.db data from old VM to VPS.
- Annotation delete + highlight spans + short-text selection sensitivity (Stage 1 cleanup).

**Next**
- Confirm AAPL fill on Monday 2026-05-26 morning.
- Begin Phase 1 markets foundations research: how a stock actually works, exchanges, order types, bid/ask, market hours, TSX structure, CAD/USD dynamics. No code — just understanding.
- Once Phase 1 foundations land, design Stage 3 as the paper trading learning vehicle.


## 2026-05-24
What changed: Repo made public. SESSIONS.md restructured to lean format (what changed / open / next, latest at top) and caught up with three missing entries. PRINCIPLES.md updated — $(date) placeholders fixed to 2026-05-07, new insights added, VM references corrected to VPS. PROMPTS.md added to repo with both session prompts. Session close ritual established. VS Code git GUI walkthrough completed.
Open: code 399 fix in orders.js attachFillListener, AAPL fill confirmation (expected Monday 9:30am ET)
Next: confirm AAPL fill via journalctl -u fane.service and /trades, apply code 399 fix in orders.js, begin Stage 3 signal detection design


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
