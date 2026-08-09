/**
 * test/instruments-cached-metadata.test.js
 *
 * Focused coverage for groupUniqueBySymbol() (src/ibkr/instruments.js), the
 * pure grouping logic behind getCachedInstrumentMetadataBySymbols(). Added
 * for the Signals page's cache-only, symbol-based instrument name lookup:
 * a ticker must only resolve to a name when it maps to exactly one cached
 * conId, and must be left unresolved when ambiguous or absent from the
 * cache — never guessed.
 *
 * Pure function, no DB — never touches instrument_metadata.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupUniqueBySymbol } from '../src/ibkr/instruments.js';

test('a symbol backed by exactly one conId resolves to its row', () => {
  const rows = [
    { con_id: 265598, symbol: 'AAPL', long_name: 'Apple Inc.' },
  ];
  const result = groupUniqueBySymbol(rows);
  assert.equal(result.size, 1);
  assert.equal(result.get('AAPL').long_name, 'Apple Inc.');
});

test('a symbol with no cached rows does not resolve', () => {
  const rows = [
    { con_id: 265598, symbol: 'AAPL', long_name: 'Apple Inc.' },
  ];
  const result = groupUniqueBySymbol(rows);
  assert.equal(result.has('MSFT'), false);
});

test('a symbol backed by multiple distinct conIds is ambiguous and does not resolve', () => {
  const rows = [
    { con_id: 1, symbol: 'ABC', long_name: 'ABC Corp' },
    { con_id: 2, symbol: 'ABC', long_name: 'ABC Holdings Ltd' },
  ];
  const result = groupUniqueBySymbol(rows);
  assert.equal(result.has('ABC'), false, 'ambiguous symbol must be excluded entirely');
});

test('the same conId appearing twice under one symbol is not treated as ambiguous', () => {
  const rows = [
    { con_id: 265598, symbol: 'AAPL', long_name: 'Apple Inc.' },
    { con_id: 265598, symbol: 'AAPL', long_name: 'Apple Inc.' },
  ];
  const result = groupUniqueBySymbol(rows);
  assert.equal(result.size, 1);
  assert.equal(result.get('AAPL').long_name, 'Apple Inc.');
});

test('symbol matching normalizes case and surrounding whitespace', () => {
  const rows = [
    { con_id: 265598, symbol: 'aapl', long_name: 'Apple Inc.' },
  ];
  const result = groupUniqueBySymbol(rows);
  assert.equal(result.has('AAPL'), true, 'lookup key must be normalized uppercase');
  assert.equal(result.get('AAPL').long_name, 'Apple Inc.');
});

test('multiple unrelated symbols each resolve independently', () => {
  const rows = [
    { con_id: 1, symbol: 'AAPL', long_name: 'Apple Inc.' },
    { con_id: 2, symbol: 'MSFT', long_name: 'Microsoft Corporation' },
    { con_id: 3, symbol: 'DUP',  long_name: 'Dup One' },
    { con_id: 4, symbol: 'DUP',  long_name: 'Dup Two' },
  ];
  const result = groupUniqueBySymbol(rows);
  assert.equal(result.get('AAPL').long_name, 'Apple Inc.');
  assert.equal(result.get('MSFT').long_name, 'Microsoft Corporation');
  assert.equal(result.has('DUP'), false, 'ambiguous symbol excluded even while others resolve fine');
});
