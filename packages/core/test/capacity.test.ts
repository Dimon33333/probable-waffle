import { describe, it, expect } from 'vitest';
import { Decimal } from '../src/rounding';
import { computeCapacity } from '../src/capacity';
import { calculateRoute } from '../src/engine';
import { baseRouteInput, baseTransfer, lvl } from './fixtures';

describe('computeCapacity', () => {
  it('is bounded by buy-side depth when the sell side and withdrawal are unconstrained', () => {
    const input = baseRouteInput();
    input.budget = new Decimal(1000);
    input.buy.asks = [lvl(100, 50)]; // total depth = 5000 quote
    input.sell.bids = [lvl(110, 1_000_000)]; // effectively unlimited
    const capacity = computeCapacity(input);
    expect(capacity.gt(4990)).toBe(true);
    expect(capacity.lte(5000)).toBe(true);
    // just above capacity should fail; just at/below should still pass
    expect(calculateRoute({ ...input, budget: capacity }).ok).toBe(true);
    expect(calculateRoute({ ...input, budget: new Decimal(5001) }).ok).toBe(false);
  });

  it('is bounded by sell-side depth when the buy side is unconstrained', () => {
    const input = baseRouteInput();
    input.budget = new Decimal(1000);
    input.buy.asks = [lvl(100, 1_000_000)]; // effectively unlimited
    input.sell.bids = [lvl(110, 45)]; // can only absorb 45 BTC -> budget cap ~= 45*100 = 4500
    const capacity = computeCapacity(input);
    expect(capacity.gt(4490)).toBe(true);
    expect(capacity.lte(4500)).toBe(true);
  });

  it('is bounded by the network withdrawal maximum', () => {
    const input = baseRouteInput();
    input.budget = new Decimal(1000);
    input.buy.asks = [lvl(100, 1_000_000)];
    input.sell.bids = [lvl(110, 1_000_000)];
    input.transferBuySide = baseTransfer({ maxWithdraw: new Decimal(20) }); // 20 BTC -> budget cap ~= 2000
    const capacity = computeCapacity(input);
    expect(capacity.gt(1990)).toBe(true);
    expect(capacity.lte(2000)).toBe(true);
  });

  it('returns zero when the route does not clear even at the starting budget', () => {
    const input = baseRouteInput();
    input.transferBuySide = baseTransfer({ withdrawFeeFixed: new Decimal('0.6') }); // makes the base route negative
    const capacity = computeCapacity(input);
    expect(capacity.toString()).toBe('0');
  });

  it('net profit percentage decreases as the route size grows through a multi-level book', () => {
    const input = baseRouteInput();
    // Ask side gets progressively worse: 100 for the first 10, then 200 for the next 10.
    input.buy.asks = [lvl(100, 10), lvl(200, 100)];
    input.sell.bids = [lvl(300, 1000)];

    const small = calculateRoute({ ...input, budget: new Decimal(500) }); // stays in the cheap level
    const large = calculateRoute({ ...input, budget: new Decimal(3000) }); // spills into the expensive level
    expect(small.ok).toBe(true);
    expect(large.ok).toBe(true);
    if (!small.ok || !large.ok) return;
    expect(large.value.netProfitPct.lt(small.value.netProfitPct)).toBe(true);
  });
});
