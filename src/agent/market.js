import YahooFinance from 'yahoo-finance2';
import { today } from '../utils/time.js';

const yahooFinance = new YahooFinance();

const SYMBOLS = {
  sp500:    '^GSPC',
  nasdaq:   '^IXIC',
  tsx:      '^GSPTSE',
  vix:      '^VIX',
  yield10y: '^TNX',
  usdcad:   'CAD=X',
  oil:      'CL=F',
  gold:     'GC=F',
  aapl:     'AAPL',
};

function extract(quote) {
  return {
    price: quote.regularMarketPrice,
    change_pct: quote.regularMarketChangePercent?.toFixed(2),
  };
}

export async function getMarketSnapshot() {
  const entries = Object.entries(SYMBOLS);
  const results = await Promise.all(entries.map(([, sym]) => yahooFinance.quote(sym)));

  const snapshot = { date: today() };
  entries.forEach(([key], i) => {
    snapshot[key] = extract(results[i]);
  });

  return snapshot;
}
