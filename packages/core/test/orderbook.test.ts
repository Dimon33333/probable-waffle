import { describe, it, expect } from 'vitest';
import { Decimal } from '../src/rounding';
import { walkAsks, walkBids } from '../src/orderbook';

const lvl = (price: number, amount: number) => ({ price: new Decimal(price), amount: new Decimal(amount) });

describe('walkAsks', () => {
  it('fully covers the order from a single level', () => {
    const r = walkAsks([lvl(100, 10)], new Decimal(500));
    expect(r.exhausted).toBe(false);
    expect(r.baseFilled.toString()).toBe('5');
    expect(r.quoteSpent.toString()).toBe('500');
    expect(r.vwap.toString()).toBe('100');
  });

  it('partially fills the last level across multiple levels, VWAP worse than best price', () => {
    // Best ask 100 for 5 units (=500 quote), next 110 for 10 units. Spend 1000:
    // first level takes all 500, remaining 500 buys 500/110 = 4.5454... units.
    const r = walkAsks([lvl(100, 5), lvl(110, 10)], new Decimal(1000));
    expect(r.exhausted).toBe(false);
    expect(r.quoteSpent.toString()).toBe('1000');
    const expectedBase = new Decimal(5).plus(new Decimal(500).div(110));
    expect(r.baseFilled.toString()).toBe(expectedBase.toString());
    expect(r.vwap.gt(100)).toBe(true); // strictly worse than best ask once >1 level consumed
    expect(r.fills).toHaveLength(2);
  });

  it('reports exhaustion when depth runs out before the budget is spent', () => {
    const r = walkAsks([lvl(100, 1)], new Decimal(1000)); // only 100 quote worth of depth
    expect(r.exhausted).toBe(true);
    expect(r.quoteSpent.toString()).toBe('100');
    expect(r.unfilled.toString()).toBe('900');
  });

  it('VWAP equals best price when only one level is consumed', () => {
    const r = walkAsks([lvl(50, 100), lvl(60, 100)], new Decimal(1000));
    expect(r.vwap.toString()).toBe('50');
  });
});

describe('walkBids', () => {
  it('fully covers the order from a single level', () => {
    const r = walkBids([lvl(100, 10)], new Decimal(5));
    expect(r.exhausted).toBe(false);
    expect(r.quoteReceived.toString()).toBe('500');
    expect(r.vwap.toString()).toBe('100');
  });

  it('partially fills the last level across multiple levels, VWAP worse than best price', () => {
    // Best bid 100 for 5 units, next 90 for 10 units. Sell 10 units:
    // first 5 at 100 = 500, remaining 5 at 90 = 450, total 950 for 10 units -> vwap 95.
    const r = walkBids([lvl(100, 5), lvl(90, 10)], new Decimal(10));
    expect(r.exhausted).toBe(false);
    expect(r.baseSold.toString()).toBe('10');
    expect(r.quoteReceived.toString()).toBe('950');
    expect(r.vwap.toString()).toBe('95');
    expect(r.vwap.lt(100)).toBe(true); // strictly worse than best bid
  });

  it('reports exhaustion when depth runs out before the amount is sold', () => {
    const r = walkBids([lvl(100, 1)], new Decimal(10));
    expect(r.exhausted).toBe(true);
    expect(r.baseSold.toString()).toBe('1');
    expect(r.unfilled.toString()).toBe('9');
  });
});
