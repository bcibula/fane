import YahooFinance from 'yahoo-finance2';
import { today } from '../utils/time.js';

const yahooFinance = new YahooFinance();

export async function getMarketSnapshot() {
  const symbols = ['^GSPC', '^GSPTSE', '^VIX'];
  
  const results = await Promise.all(
    symbols.map(s => yahooFinance.quote(s))
  );

  return {
    date: today(),
    sp500_close: results[0].regularMarketPrice,
    tsx_close: results[1].regularMarketPrice,
    vix: results[2].regularMarketPrice,
  };
}
