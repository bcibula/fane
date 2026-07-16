> Source of truth: github.com/bcibula/fane — any mounted or copied
> version is a stale snapshot. Fetch fresh per BOOTSTRAP.md.

# Fane Year 1 — Learning Curriculum

**Start: May 24, 2026**
**End: approximately May 24, 2027**

## Purpose

Year 1 is not about making money. It is about building the foundation
to make money carefully in Year 2.

Three tracks and two parallel threads run for roughly twelve months.
Fane is the vehicle for all of them. The daily briefing delivers
content. The annotation layer captures learning. Paper trading
provides controlled exposure to how the system actually behaves.

At the end of Year 1, the question to answer is not *how much did
the paper portfolio return.* It is *do I understand enough to risk
real capital, and is Fane reliable enough to support that decision.*

## The Guiding Principle

**A bad Year 1 with a good record is a successful Year 1.**
**A good Year 1 with no record is not.**

Every decision about what to build, what to record, and what to
study follows from this. Annotation quality matters more than
trade count. A documented loss is worth more than an undocumented
win. The system that generates the record is more important than
the outcomes it records.

## Existing Foundation

Year 1 builds on existing skills, not from zero. Systems thinking,
architecture, troubleshooting, risk analysis, vendor evaluation,
and evidence-based decision making transfer directly. Markets are
unfamiliar terrain but the analytical methods are not.

The curriculum is calibrated for someone who can already debug a
service, reason about failure modes, and recognize bad data when
they see it. The unfamiliar parts are the market vocabulary, the
instruments, the participants, and the dynamics — not the
underlying habits of mind.

## The Three Tracks

### Track 1 — Financial markets
How the global financial system works, learned in concentric circles
outward from the markets closest to home.

- Equities (Canadian → US → global indexes)
- Fixed income (government bonds, yield curves)
- Commodities (gold, silver, oil)
- Alternatives (crypto, prediction markets)

The goal is structural understanding. Not stock tips. Not strategies.
The actual mechanics — how a limit order fills, what an index measures,
why correlations break down in stress.

### Track 2 — AI and LLMs as financial tools
How language models help and how they fail in market contexts.

- Capability mapping — what Claude can and cannot reliably tell you
- Confidence calibration — recognizing constructed tokens vs grounded ones
- Prompt design for financial framing
- Forward pressure as a model-level risk
- Multi-model comparison and disagreement

The goal is to know when to trust the model and when to ignore it.

### Track 3 — Infrastructure and plumbing
Deep familiarity with everything Fane runs on.

- Fane codebase end-to-end
- OpenClaw memory architecture, with sophistication increasing as
  operational confidence grows
- VPS administration and security
- Data pipelines and API integration
- Monitoring, alerting, failure modes

The goal is to trust the system because you understand it — and
to know immediately when it is lying to you.

## Parallel Thread — Macro Foundations

The cross-cutting forces that act on every market simultaneously.
The tracks teach *what* is being traded. This thread teaches *why
prices move the way they do regardless of what you are trading.*

- Inflation — what it is, how it is measured, real vs nominal returns
- Interest rates — the price of money, the foundation everything else is priced against
- Foreign exchange — USD reserve status, currency dynamics, petrodollar system
- Debt cycles — short and long, the explanatory model for crises
- Banking and monetary plumbing — how money is actually created, repo markets, shadow banking
- Geopolitics — sanctions, trade wars, military conflict, the layer above markets
- Demographics — slow-moving, long-arc, eventually dominant
- Market microstructure — HFT, dark pools, payment for order flow, manipulation patterns
- Energy — the physical layer the rest of the economy runs on
- Reflexivity — markets create the reality they observe

Topics distribute across the phases below. The goal is not mastery
of any single one in Year 1. The goal is to recognize them when they
appear in real market behavior and to have the conceptual frame ready.

## Parallel Thread — Market history

A handful of major events studied not for prediction but for pattern
recognition in human behavior, incentives, fear, and optimism.

- 1929 Wall Street Crash
- 1987 Black Monday
- Dot-com bubble (2000-2002)
- 2008 financial crisis
- COVID crash (March 2020)
- 2022 rate shock

Roughly one per phase. Markets do not repeat but human nature does.

## Phases

Phases are units of progress, not calendar quarters. Infrastructure,
market understanding, and AI calibration will not move at the same
rate. Approximate date ranges below are scaffolding, not deadlines.

### Phase 1 — Foundations (approximately months 1-3)

**Markets:**
- How a stock actually works (shares, voting, dividends, splits)
- Exchanges, order types, bid/ask, market hours
- Canadian market structure — TSX, major sectors, CAD/USD dynamics
- First paper trades on Canadian equities

**AI:**
- What Claude knows vs what Claude fabricates about specific stocks
- Reading the briefing critically — where does it sound confident
  without being grounded
- Annotation layer as a confidence-calibration tool

**Plumbing:**
- Walk every file in `~/fane/src/` and understand what it does
- VPS security baseline (firewall, SSH hardening, fail2ban review)
- systemd timer behavior under failure conditions

**Macro Foundations:**
- Inflation — what it is, how it is measured (CPI, PCE, core vs headline),
  the difference between official numbers and lived experience
- Interest rates as the price of money — BoC overnight rate, risk-free rate,
  why every asset price discounts against this number
- Real vs nominal — the distinction that, once internalized, changes how
  you read every financial number forever

**History:** 2008 financial crisis (most recent in lived memory)

**Required paper trade record format — from day one:**
- Thesis (1-2 sentences)
- Counter-argument (mandatory)
- Confidence level (low / medium / high)
- Flinch (the involuntary pre-rational hesitation, if present)
- Outcome
- Post-mortem (regardless of outcome)

The flinch capture is non-negotiable from the first trade. The
data set only becomes valuable if it is collected from the start.

**Phase 1 markers:**
- Can explain how a TSX limit order fills, step by step
- Can name the major Canadian sectors and a representative ticker in each
- Can articulate the difference between real and nominal returns
- Can debug a Fane component failure without help
- Every paper trade has the full record format

### Phase 2 — US market and signal patterns (approximately months 3-6)

**Markets:**
- US market structure (NYSE, NASDAQ, ETFs, futures briefly)
- S&P 500, NASDAQ 100, Russell 2000 — what each measures
- Reading a 10-K with comprehension
- Technical indicators as *concepts* — moving averages, RSI, volume —
  not as trade triggers

**AI:**
- Prompt engineering for financial framing
- Confidence calibration in practice — mark briefing claims as
  *grounded / inferred / fabricated* and track over time
- Counter-argument quality as a metric

**Plumbing:**
- OpenClaw memory upgrade work, as operational confidence supports it
- Data source diversification beyond Yahoo Finance
- Backup and recovery drill

**Macro Foundations:**
- Foreign exchange — USD as reserve currency, the petrodollar system,
  CAD/USD dynamics that every Canadian holding US stocks is exposed to
  whether they notice or not
- Market microstructure — how trades actually execute, dark pools,
  high-frequency trading, payment for order flow
- Common manipulation patterns — spoofing, layering, pump and dumps,
  how to recognize when you are the exit liquidity

**History:** Dot-com bubble (recognizing speculation patterns)

**Phase 2 markers:**
- Can read a US 10-K and summarize the business in one paragraph
- Can identify specific LLM hallucination patterns in past briefings
- Can explain the mechanics of how a US market buy order actually executes
- Annotation depth increasing — post-mortems revealing genuine learning

### Phase 3 — Global and fixed income (approximately months 6-9)

**Markets:**
- Global indexes — FTSE 100, Nikkei 225, DAX, Hang Seng, MSCI World
- How macro conditions transmit across markets
- Government bonds — what yield actually means
- Yield curves and what they signal

**AI:**
- Multi-model comparison — where do different models disagree
- Agentic workflows beyond single-prompt responses

**Plumbing:**
- Data pipeline robustness (retry logic, anomaly detection)
- Monitoring and alerting (when to wake Brad up)
- Performance and cost telemetry

**Macro Foundations:**
- Central bank policy — Fed, BoC, ECB, BoJ — and why it matters
- Debt cycles (Dalio framework) — short-term business cycles and
  long-term debt cycles, the explanatory model for systemic crises
- Banking and monetary plumbing — how money is created, fractional
  reserve, central bank balance sheets, repo markets, shadow banking,
  what happens when liquidity disappears

**History:** 1987 Black Monday (mechanics of crashes, circuit breakers)

**Phase 3 markers:**
- Can explain what an inverted yield curve signals and why
- Can articulate how a Fed rate decision propagates to TSX
- Can describe how a commercial bank actually creates money when it lends
- Fane infrastructure has not silently failed for 30+ days
- Annotations beginning to reference cross-market dynamics

### Phase 4 — Commodities, alternatives, integration (approximately months 9-12)

**Markets:**
- Gold and silver — store of value vs industrial demand
- Oil — supply, demand
- Crypto market structure (BTC, ETH) — 24/7 trading, custody, on-chain data
- Prediction markets — Kalshi, Polymarket — as information sources

**AI:**
- Year-in-review of LLM contributions — where was Fane genuinely useful
- Where did Fane mislead, and why
- What capabilities are missing for Year 2

**Plumbing:**
- Performance analytics layer (Stage 5) operational
- Full audit trail review — every paper trade traceable to its briefing
- Year-end backup and archival

**Macro Foundations:**
- Energy as the physical layer — oil shocks transmitting into inflation,
  trade balances, geopolitical conflict
- Geopolitics — sanctions, trade wars, military conflict, how
  geopolitical events propagate through commodities and currencies
- Demographics — aging populations, productivity, long-arc forces that
  take decades to play out and then dominate everything
- Reflexivity (Soros) — markets do not just observe reality, they
  create it; the philosophical close to the year

**History:** 1929 and COVID crash (panic and recovery dynamics)
**History closing study:** 2022 rate shock (most recent regime change)

**Phase 4 markers:**
- Can articulate a thesis for a trade in 1-2 sentences
- Can explain how an oil price shock propagates through inflation,
  currencies, and equities
- Can explain how macro conditions affect each major asset class
- Confident extending Fane's architecture independently
- Year 1 review document complete

## What Year 1 Is Not

- It is not about making money on paper
- It is not about beating any benchmark
- It is not about being right
- It is not about generating signals to act on automatically
- It is not about scaling up trade frequency

## What Year 1 Produces

- A trained operator — Brad
- A trusted system — Fane
- A documented record — annotations, paper trades, briefing critiques,
  post-mortems, flinch data
- A clear-eyed decision about Year 2

## Month 12 Review

At approximately month 12, the review happens. The review is not a
pass/fail gate. It is an honest assessment of three questions:

1. Does Brad understand enough to risk real capital
2. Is Fane reliable enough to support that decision
3. Has the process demonstrated repeatable insight

If yes to all three — Principle 8 original applies. Real money,
micro gains, small positions, capital preservation first.

If no to any — Year 1 simply continues. Extending to 14 or 18 months
is not a failure. It is the curriculum doing its job. The review
itself is the deliverable, not a pass result.

The only thing the calendar enforces is the review.

## The Role of Failure

Paper losses in Year 1 are not setbacks. They are the highest-value
data points the system generates. A loss with a complete annotation —
thesis, counter-argument, confidence level, flinch, outcome,
post-mortem — is worth more than ten gains without one.

The annotation layer exists for this. The flinch capture exists
for this. The principle of inaction logged equal to action exists
for this.

**A bad Year 1 with a good record is a successful Year 1.**
**A good Year 1 with no record is not.**

## Related Documents

- `PRINCIPLES.md` — production philosophy (applies in Year 2)
- `READING.md` — curated reading list, evolves over time
- `SESSIONS.md` — session handoff record
- `PROMPTS.md` — prompt library