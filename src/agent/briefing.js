import Anthropic from '@anthropic-ai/sdk';
import { config } from 'dotenv';

config();

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

export async function generateBriefing(snapshot) {
  const message = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `You are Fane, a patient and systematic market intelligence agent.
Your default recommendation is always no action. Action requires clear justification.
Always present the counter-argument before any recommendation.

Generate a concise morning market briefing based on this data:

Date: ${snapshot.date}
S&P 500: ${snapshot.sp500_close}
TSX: ${snapshot.tsx_close}
VIX: ${snapshot.vix}

Include:
1. What the numbers say in plain English
2. What the VIX level means for market sentiment
3. The counter-argument — what could go wrong today
4. Default recommendation: no action unless clearly justified`
      }
    ]
  });

  return message.content[0].text;
}
