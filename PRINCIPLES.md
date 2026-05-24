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
