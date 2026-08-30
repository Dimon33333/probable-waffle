import { describe, it, expect } from 'vitest';
import { normalizeNetwork } from '../src/networks';

describe('normalizeNetwork', () => {
  it('maps every known per-exchange spelling for a shared chain to the same canonical id', () => {
    expect(normalizeNetwork('binance', 'BEP20')).toBe('BSC');
    expect(normalizeNetwork('bybit', 'BEP20')).toBe('BSC');
    expect(normalizeNetwork('kucoin', 'BEP20')).toBe('BSC');
    expect(normalizeNetwork('binance', 'TRX')).toBe('TRON');
    expect(normalizeNetwork('kucoin', 'TRC20')).toBe('TRON');
  });

  it('is case- and whitespace-insensitive against the table', () => {
    expect(normalizeNetwork('binance', ' bep20 ')).toBe('BSC');
    expect(normalizeNetwork('binance', 'bsc')).toBe('BSC');
  });

  it('returns null for an unmapped alias rather than guessing', () => {
    expect(normalizeNetwork('binance', 'SOME_MADE_UP_CHAIN')).toBeNull();
  });

  it('returns null for an unknown exchange id', () => {
    expect(normalizeNetwork('not-a-real-exchange', 'ETH')).toBeNull();
  });
});
