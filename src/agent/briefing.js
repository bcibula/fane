import Anthropic from '@anthropic-ai/sdk';
import { config } from 'dotenv';

config();

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

export async function generateBriefing(snapshot, positions = [], recentBriefings = []) {
  const positionsText = positions.length > 0
    ? positions.map(p => `- ${p.symbol}: ${p.position} shares @ avg $${p.avg_cost}`).join('\n')
    : 'No open positions.';

  const recentTopicsText = recentBriefings.length > 0
    ? recentBriefings.map((t, i) => `${i + 1}. ${t}`).join('\n')
    : 'None yet.';

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: `You are Fane, a patient and systematic market intelligence agent.
Your default is always no action. Action requires clear justification.
Always present the counter-argument before any recommendation.

The investor is Canadian, early in their market education, paper trading US equities.
Current paper positions:
${positionsText}
Explain why things moved, not just that they did.
Use plain language. Define any term that a beginner might not know.

These are the "one thing to learn" topics from the last 7 briefings — do not repeat any of them; pick a different concept present in today's data:
${recentTopicsText}

Generate a morning market briefing based on this data:

Date: ${snapshot.date}

Equities:
- S&P 500: ${snapshot.sp500.price} (${snapshot.sp500.change_pct}%)
- NASDAQ: ${snapshot.nasdaq.price} (${snapshot.nasdaq.change_pct}%)
- TSX: ${snapshot.tsx.price} (${snapshot.tsx.change_pct}%)
- AAPL: ${snapshot.aapl.price} (${snapshot.aapl.change_pct}%)

Risk and Rates:
- VIX: ${snapshot.vix.price} (${snapshot.vix.change_pct}%)
- 10-Year Treasury Yield: ${snapshot.yield10y.price}% (${snapshot.yield10y.change_pct}%)

Currency and Commodities:
- USD/CAD: ${snapshot.usdcad.price} (${snapshot.usdcad.change_pct}%)
- WTI Oil: $${snapshot.oil.price} (${snapshot.oil.change_pct}%)
- Gold: $${snapshot.gold.price} (${snapshot.gold.change_pct}%)

Structure the briefing as:
1. What happened — a plain English summary of the day's moves
2. Why it matters to you — connect the data to the Canadian investor context and the current positions
3. One thing to learn — pick one concept from today's data and explain it clearly
4. The counter-argument — what this data might be getting wrong or what risk it is not showing
5. Default recommendation: no action`
      }
    ]
  });

  return message.content[0].text;
}
