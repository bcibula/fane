# Fane Design Principles

## Foundational Rules

### 1. Default is no action
The null hypothesis is always inaction. Action requires explicit human approval
and documented justification. The agent surfaces. The human decides.

### 2. Forward pressure is a risk
AI agents bias toward action by design. Fane must counteract this explicitly
at every layer — schema, prompts, logic, and review cadence.

### 3. Justification requires context
A reason to act is not enough. Every decision must capture:
- Market context at decision time (VIX, trend, sector)
- Human internal state (confidence, hesitation, recent losses)
- Conviction level (low/medium/high)
- The counter-argument — why this signal might be wrong

### 4. Inaction is a decision
Passing on a signal is logged the same as acting on one.
Quality of no is measured alongside quality of yes.

### 5. The counter-argument is mandatory
Fane must always present the bear case before human approval.
An agent that only argues for action is a biased agent.

### 6. Minimum distance between thought and persistence
Every human touchpoint in Fane must minimize friction between
the moment of insight and the moment it is recorded.
- One sentence thesis before entry — no forms, no navigation
- One keystroke approval or pass on signals
- One paragraph weekly reflection — prompted, captured, logged
- The longer the path from thought to disk, the more the thought degrades

### 7. The kill token speaks every language Fane speaks
A kill signal must have complete awareness of everything it is stopping.
A partial kill is worse than no kill — it creates the feeling of control
without the reality of it. The kill token scope is defined by the full
set of languages Fane monitors: price, volume, volatility, sentiment,
indicators, human intent. As Fane grows, the kill token grows with it.

### 8. Ride the market, don't fight it
Fane does not attempt to beat the market. Fane rides it.
Beating the market is an ego game against participants with more
data, compute, experience, and capital. Riding it is a capital game
that requires only discipline, patience, and consistency.

The strategy is micro gains — small, repeatable, systematic extraction
of pennies from patterns that exist in the noise. High frequency of
opportunity. Small position sizes. Capital preservation first.
Compound interest does the heavy lifting over time.

This is Fan Li. Not a conqueror. A rider.

Implications for signal design:
- Signals should identify repeatable small patterns, not home runs
- Position sizes stay small — preservation over aggression
- No heroic calls — the null hypothesis protects against them
- Staying in the market long enough is the edge

### 9. One source of truth for time
All timestamps in Fane flow through src/utils/time.js.
No component constructs its own timestamp.
No human provides a timestamp manually.
No AI fabricates a timestamp.
The VPS clock is the only authority.

### 10. Documentation must be operationally close to behavior
A principle that does not govern the system is not a principle.
A curriculum that does not appear in the briefing is not a curriculum.
A reading list that is not surfaced is not a reading list.

Documented intent and system behavior must be mechanically connected,
not held together by human memory. The fact that something is written
down is not evidence that it influences anything.

Implications:
- Principles must be readable by the agents they govern (prompt injection)
- Curriculum content must appear in the daily briefing
- Reading list must surface recommendations regularly
- Every documented commitment needs a mechanical path to influence

### 11. Automatic recovery without notification is incomplete
A system that recovers silently has not recovered — it has hidden the failure.
Every automatic intervention must be reported: what failed, what was done,
and whether it succeeded. The notification is the audit trail for the recovery,
not a substitute for it.

Detect the failure close to the source. Recover automatically where possible.
Report every time action is taken. These three layers are only robust together.

Implications:
- Watchdogs must notify on every restart attempt, success or failure
- Silent auto-recovery creates false confidence in system health
- The log and the notification are both required — one for machines, one for humans

## Known Risk States

### Forward pressure bias
- Risk: agent frames signals to favor action
- Mitigation: explicit null hypothesis in every prompt
- Status: open — needs encoding in agent prompt layer

### Justification quality decay
- Risk: human approvals become rubber stamps over time
- Mitigation: periodic review of justification quality
- Mitigation: mandatory counter-argument field
- Status: open — needs review cadence design

### Data feed anomaly
- Risk: bad data triggers false signals
- Mitigation: agent flags anomalies rather than acting on them
- Status: open — needs anomaly detection layer

### Capital risk from overtrading
- Risk: too many signals, too much exposure
- Mitigation: maximum concurrent positions hard limit
- Mitigation: weekly trade count review
- Status: open — needs position sizing rules

### Known Risk: VPS clock manipulation
Single source of time is single point of failure.
If the VPS clock is compromised the entire audit trail is untrustworthy.

Mitigations:
- Cross-reference VPS time against external NTP on every agent run
- Log the delta between local and NTP time
- If delta exceeds threshold — kill token fires automatically
- Local time is never treated as ground truth alone

### Documentation decay
- Risk: principles, curriculum, and reference docs accumulate but stop influencing behavior
- Mitigation: project file integration so docs are in every Claude session
- Mitigation: daily briefing surfaces principles, Year 1 topics, reading recommendations
- Mitigation: agent skill files inject relevant docs at runtime
- Status: open — needs implementation in briefing layer and Stage 3 design

### AI provider concentration
Fane depends on Anthropic at four layers:
1. Briefing agent — `src/agent/briefing.js` (Claude Haiku, daily market briefing)
2. Annotation responses — `src/web/server.js` (Claude Opus, inline Q&A on briefing text)
3. OpenClaw orchestration — agent memory, identity, and session management
4. Development tooling — Claude Code used to build and maintain Fane itself

A single provider outage, pricing change, policy shift, or API deprecation affects all four simultaneously.

Constraints:
- Core logic (DB schema, order lifecycle, signal state machine, kill token) must remain AI-free and portable
- AI must never touch the order execution path — signal approval writes to the DB; `orders.js` reads from the DB and submits to IBKR without any AI involvement
- Prompts must be stateless and replaceable — no logic should live only inside a prompt

- Status: open


## Open Questions
- What is the maximum number of concurrent paper trades?
- How do we measure justification quality over time?
- How does Fane handle conflicting signals?
- What constitutes an anomaly in market data?

## Insight Log
- 2026-05-02: AI forward pressure identified as capital and security risk
- 2026-05-02: Justification needs metadata not just reason
- 2026-05-02: Counter-argument must be mandatory, not optional
- 2026-05-02: Inaction must be logged and measured same as action
- 2026-05-02: Principles not in the foundation get lost — bake into clay
- 2026-05-02: Heredoc pattern surfaced Principle 6 — thought to disk with nothing in between
- 2026-05-02: Kill only works if we understand everything being killed
- 2026-05-02: Partial kills create false sense of control — architectural risk
- 2026-05-02: Micro gains compound. Ego trades blow up. Fan Li didn't conquer. He rode.
- 2026-05-07: Fabricated timestamps are worse than no timestamps
- 2026-05-07: Time is the axis everything else is plotted on
- 2026-05-07: A lying audit trail is more dangerous than no audit trail
- 2026-05-07: Time is load-bearing infrastructure, not a detail
- 2026-05-07: A manipulated clock manipulates everything built on it
- 2026-05-22: AI infrastructure costs must be audited, not assumed. Default configs are not safe configs
- 2026-05-23: Confident tokens look identical whether grounded or constructed — LLM confidence is not a signal of actual knowledge
- 2026-05-24: SESSIONS.md is the session handoff document — one commit closes the loop
- 2026-05-24: A principle that does not govern the system is not a principle — documentation must be mechanically connected to behavior
- 2026-05-27: Anthropic dependency spans four layers simultaneously — briefing, annotation, orchestration, and tooling — concentration risk is real
- 2026-07-06: Silent auto-recovery is deceptive — a system that fixes itself without reporting has hidden the failure, not resolved it. Notification is load-bearing, not optional.
- 2026-07-09: Found the session prompts living in two places — OneNote and the repo — because I'd forgotten the repo copy existed. Deleting the OneNote copy felt like stepping onto a ledge. But the ledge was backwards: the danger wasn't losing the copy, it was keeping it. A stale copy you still trust is the only one that can hurt you. The flinch fired to protect the wrong thing — logged as flinch calibration data, not just an infrastructure note.

## Operational Notes

### package.json is the source of truth for dependencies
All dependencies must be properly declared in package.json.
Installing packages individually without verifying package.json
leads to silent failures after reboots or clean installs.
Always verify with `cat package.json` after installing packages.

- 2026-05-04: Missing packages caused Fane to crash after restart.
  Root cause: package.json out of sync with node_modules.
  Fix: always run npm install after any dependency changes.

### IB Gateway runs headless on the VPS
Stack: Xvfb (xvfb.service) + IBC 3.23.0 (/opt/ibc) + IB Gateway 10.45 (/usr/local/ibgateway),
managed by ibgateway.service. Socket API on port 4002, paper trading, Read-Only API OFF.

- 2026-05-23: GTK3 (libgtk-3-0) required for JavaFX — missing library is a silent failure
- 2026-05-23: Socket API port set via GUI (Configure→API→Settings), not jts.ini
- 2026-05-23: SSH reverse tunnels on same port block Java from binding — check ss -tlnp with sudo
- 2026-05-23: Use xdotool + scrot for headless GUI interaction on DISPLAY=:1

### Data shape changes must be traced to all consumers
When the shape of a data structure changes (nested vs flat, renamed keys,
added or removed fields), every consumer of that structure must be updated
in the same commit. A change to the producer that is not reflected in the
consumer fails silently until runtime — and in Fane's case, that means a
missed briefing with no alert.

- 2026-05-26: market.js returned nested objects (sp500.price) but db/market.js
  expected flat keys (@sp500_close). Briefing failed silently at 13:00 UTC.
  Caught by journal log inspection. Fix: explicit mapping at the DB layer.

- 2026-06-01: Injected date in Claude's context is not verified and cannot be trusted for session records. A confidently stated wrong date silently corrupts the audit trail. The human confirms the date at session open. Claude never uses its injected date for records.