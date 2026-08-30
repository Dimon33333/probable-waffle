import { describe, it, expect } from 'vitest';
import { Decimal } from '../src/rounding';
import { calculateRoute } from '../src/engine';
import { baseRouteInput, baseTransfer, lvl } from './fixtures';

describe('calculateRoute — happy path', () => {
  it('prices a simple positive route: buy 10 BTC @100, sell @105, no fees', () => {
    const outcome = calculateRoute(baseRouteInput());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.buyVWAP.toString()).toBe('100');
    expect(outcome.value.sellVWAP.toString()).toBe('105');
    expect(outcome.value.baseAcquired.toString()).toBe('10');
    expect(outcome.value.netProceeds.toString()).toBe('1050');
    expect(outcome.value.netProfit.toString()).toBe('50');
    expect(outcome.value.netProfitPct.toString()).toBe('5');
    expect(outcome.value.grossSpreadPct.toString()).toBe('5');
    expect(outcome.value.netProfit).toBeInstanceOf(Decimal);
    expect(outcome.value.buyVWAP).toBeInstanceOf(Decimal);
  });
});

describe('calculateRoute — the withdrawal-fee test', () => {
  it('turns a positive gross spread into NEGATIVE_NET_RETURN via a flat withdrawal fee', () => {
    // Same +5% gross spread as the happy path (buy@100, sell@105), but a
    // withdrawal fee of 0.6 BTC on a 10 BTC position (6% of the position)
    // consumes more than the entire gross spread.
    const input = baseRouteInput();
    input.transferBuySide = baseTransfer({ withdrawFeeFixed: new Decimal('0.6') });
    const outcome = calculateRoute(input);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe('NEGATIVE_NET_RETURN');
    // baseArriving = 10 - 0.6 = 9.4; proceeds = 9.4 * 105 = 987; net = 987 - 1000 = -13
    expect(outcome.partial?.netProfit).toBe('-13');
  });
});

describe('calculateRoute — trading fees', () => {
  it('buy fee charged in quote reduces spendable budget, not the base amount', () => {
    const input = baseRouteInput();
    input.budget = new Decimal(1250);
    input.buy.takerFee = { rate: new Decimal('0.25'), chargedIn: 'quote', source: 'native' };
    input.sell.bids = [lvl(1000, 100)]; // avoid negative-profit rejection so we can read baseAcquired
    const outcome = calculateRoute(input);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    // spendable = 1250 / 1.25 = 1000; baseGross = 1000/100 = 10; base-charged? no, quote-charged
    // so baseAcquired = baseGross = 10, and buyFee (in quote) = 1250 - 1000 = 250.
    expect(outcome.value.baseAcquired.toString()).toBe('10');
    expect(outcome.value.buyFee.toString()).toBe('250');
    expect(outcome.value.buyFeeCurrency).toBe('quote');
  });

  it('buy fee charged in base reduces the base amount received, not the spend', () => {
    const input = baseRouteInput();
    input.budget = new Decimal(1250);
    input.buy.takerFee = { rate: new Decimal('0.25'), chargedIn: 'base', source: 'native' };
    input.sell.bids = [lvl(1000, 100)];
    const outcome = calculateRoute(input);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    // spendable = full 1250 (fee taken from base); baseGross = 1250/100 = 12.5
    // buyFee = 12.5 * 0.25 = 3.125; baseAcquired = 12.5 - 3.125 = 9.375
    expect(outcome.value.buyFee.toString()).toBe('3.125');
    expect(outcome.value.baseAcquired.toString()).toBe('9.375');
    expect(outcome.value.buyFeeCurrency).toBe('base');
  });

  it('sell fee charged in quote is taken from gross proceeds', () => {
    const input = baseRouteInput();
    input.sell.bids = [lvl(150, 100)]; // wider spread so the fee doesn't flip the route negative
    input.sell.takerFee = { rate: new Decimal('0.1'), chargedIn: 'quote', source: 'native' };
    const outcome = calculateRoute(input);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    // grossProceeds = 10 * 150 = 1500; sellFee = 1500 * 0.1 = 150; netProceeds = 1350
    expect(outcome.value.sellFee.toString()).toBe('150');
    expect(outcome.value.netProceeds.toString()).toBe('1350');
  });

  it('sell fee charged in base is converted to quote at the sell VWAP', () => {
    const input = baseRouteInput();
    input.sell.bids = [lvl(150, 100)];
    input.sell.takerFee = { rate: new Decimal('0.1'), chargedIn: 'base', source: 'native' };
    const outcome = calculateRoute(input);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    // baseToSell = 10; fee in base = 10 * 0.1 = 1 BTC, valued at sellVWAP 150 = 150 quote
    // netProceeds = 1500 - 150 = 1350 (same total cost as the quote-charged case on a flat book)
    expect(outcome.value.sellFee.toString()).toBe('150');
    expect(outcome.value.netProceeds.toString()).toBe('1350');
  });

  it('an unknown (null) trading fee never resolves to zero — it rejects FEE_UNKNOWN', () => {
    const input = baseRouteInput();
    input.buy.takerFee = { rate: null, chargedIn: 'quote', source: 'native' };
    const outcome = calculateRoute(input);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe('FEE_UNKNOWN');
  });

  it('strict mode treats an assumed (not fetched) fee as unknown', () => {
    const input = baseRouteInput();
    input.buy.takerFee = { rate: new Decimal('0.001'), chargedIn: 'quote', source: 'assumed' };
    input.options.strictMode = true;
    const outcome = calculateRoute(input);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe('FEE_UNKNOWN');
  });

  it('non-strict mode allows an assumed fee through, priced', () => {
    const input = baseRouteInput();
    input.buy.takerFee = { rate: new Decimal('0.001'), chargedIn: 'quote', source: 'assumed' };
    input.options.strictMode = false;
    const outcome = calculateRoute(input);
    expect(outcome.ok).toBe(true);
  });
});

describe('calculateRoute — withdrawal and deposit fees', () => {
  it('fixed withdrawal fee alone reduces baseArriving by exactly that amount', () => {
    const input = baseRouteInput();
    input.transferBuySide = baseTransfer({ withdrawFeeFixed: new Decimal('0.1') });
    const outcome = calculateRoute(input);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.withdrawFeeTotal.toString()).toBe('0.1');
    expect(outcome.value.baseArriving.toString()).toBe('9.9'); // 10 - 0.1
  });

  it('percentage withdrawal fee alone scales with the withdrawn amount', () => {
    const input = baseRouteInput();
    input.sell.bids = [lvl(110, 100)]; // wider spread so the fee doesn't flip the route negative
    input.transferBuySide = baseTransfer({ withdrawFeePercent: new Decimal('0.05') }); // 5%
    const outcome = calculateRoute(input);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.withdrawFeeTotal.toString()).toBe('0.5'); // 10 * 0.05
    expect(outcome.value.baseArriving.toString()).toBe('9.5');
  });

  it('fixed and percentage withdrawal fees combine additively', () => {
    const input = baseRouteInput();
    input.sell.bids = [lvl(110, 100)];
    input.transferBuySide = baseTransfer({
      withdrawFeeFixed: new Decimal('0.1'),
      withdrawFeePercent: new Decimal('0.05'),
    });
    const outcome = calculateRoute(input);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    // fixed 0.1 + (10 * 0.05) = 0.6
    expect(outcome.value.withdrawFeeTotal.toString()).toBe('0.6');
    expect(outcome.value.baseArriving.toString()).toBe('9.4');
  });

  it('deposit fee at the destination further reduces baseArriving', () => {
    const input = baseRouteInput();
    input.transferSellSide = baseTransfer({ depositFee: new Decimal('0.05') });
    const outcome = calculateRoute(input);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.depositFee.toString()).toBe('0.05');
    expect(outcome.value.baseArriving.toString()).toBe('9.95'); // 10 - 0 - 0.05
  });

  it('unknown withdrawal fee (null) rejects FEE_UNKNOWN, never coalesces to zero', () => {
    const input = baseRouteInput();
    input.transferBuySide = baseTransfer({ withdrawFeeFixed: null });
    const outcome = calculateRoute(input);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe('FEE_UNKNOWN');
  });
});

describe('calculateRoute — limits and precision', () => {
  it('rejects BELOW_MIN_ORDER when the fill is below the exchange minimum amount', () => {
    const input = baseRouteInput();
    input.buy.limits.minAmount = new Decimal(50); // fill is only 10 BTC
    const outcome = calculateRoute(input);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe('BELOW_MIN_ORDER');
  });

  it('rejects BELOW_MIN_WITHDRAWAL when the withdrawn amount is below the network minimum', () => {
    const input = baseRouteInput();
    input.transferBuySide = baseTransfer({ minWithdraw: new Decimal(50) });
    const outcome = calculateRoute(input);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe('BELOW_MIN_WITHDRAWAL');
  });

  it('floors base quantities to the exchange step size', () => {
    const input = baseRouteInput();
    input.buy.asks = [lvl(3, 1000)]; // 1000 / 3 = 333.333...
    input.buy.limits.amountPrecisionStep = new Decimal('0.01');
    input.sell.bids = [lvl(4, 1000)]; // wider spread so the route stays profitable
    const outcome = calculateRoute(input);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.baseAcquired.toString()).toBe('333.33'); // floored, not rounded to 333.34
  });

  it('ceils fees to the relevant step instead of truncating them away', () => {
    const input = baseRouteInput();
    input.buy.asks = [lvl(3, 1000)];
    input.buy.takerFee = { rate: new Decimal('0.001'), chargedIn: 'base', source: 'native' };
    input.buy.limits.amountPrecisionStep = new Decimal('0.01');
    input.sell.bids = [lvl(4, 1000)];
    const outcome = calculateRoute(input);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    // baseGross = 333.333...; raw fee = 0.333333...; ceil to 0.01 step => 0.34
    expect(outcome.value.buyFee.toString()).toBe('0.34');
  });

  it('reports dust left over after flooring to the sell exchange precision, and excludes it from proceeds', () => {
    const input = baseRouteInput();
    input.sell.limits.amountPrecisionStep = new Decimal('1'); // whole units only
    const outcome = calculateRoute(input);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.dust.toString()).toBe('0'); // 10 is already a whole number here
    // Force a fractional arrival to exercise real dust:
    const input2 = baseRouteInput();
    input2.sell.bids = [lvl(115, 100)]; // wider spread so the withdrawal fee doesn't flip it negative
    input2.transferBuySide = baseTransfer({ withdrawFeeFixed: new Decimal('0.25') });
    input2.sell.limits.amountPrecisionStep = new Decimal('1');
    const outcome2 = calculateRoute(input2);
    expect(outcome2.ok).toBe(true);
    if (!outcome2.ok) return;
    // baseArriving = 9.75, floored to whole units = 9, dust = 0.75
    expect(outcome2.value.baseArriving.toString()).toBe('9.75');
    expect(outcome2.value.baseSold.toString()).toBe('9');
    expect(outcome2.value.dust.toString()).toBe('0.75');
  });

  it('applies withdrawal precision coarser than trading precision', () => {
    const input = baseRouteInput();
    input.buy.limits.amountPrecisionStep = new Decimal('0.00000001'); // 1 satoshi
    input.transferBuySide = baseTransfer({ withdrawPrecisionStep: new Decimal('0.001') }); // coarser
    input.buy.asks = [lvl(3, 1000)]; // 1000/3 = 333.33333333 BTC before withdraw-step flooring
    input.sell.bids = [lvl(4, 1000)]; // wider spread so the route stays profitable
    const outcome = calculateRoute(input);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.baseAcquired.toString()).toBe('333.33333333');
    expect(outcome.value.baseWithdrawn.toString()).toBe('333.333'); // floored to the coarser network step
  });
});

describe('calculateRoute — capacity limits on depth', () => {
  it('rejects INSUFFICIENT_BUY_DEPTH when the ask side cannot fill the budget', () => {
    const input = baseRouteInput();
    input.buy.asks = [lvl(100, 1)]; // only 100 quote worth of depth, budget is 1000
    const outcome = calculateRoute(input);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe('INSUFFICIENT_BUY_DEPTH');
  });

  it('rejects INSUFFICIENT_SELL_DEPTH when the bid side cannot absorb the acquired base', () => {
    const input = baseRouteInput();
    input.sell.bids = [lvl(105, 1)]; // only 1 BTC of depth, 10 BTC to sell
    const outcome = calculateRoute(input);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe('INSUFFICIENT_SELL_DEPTH');
  });
});

describe('calculateRoute — status and freshness gates', () => {
  it('rejects WITHDRAW_DISABLED when withdrawals are confirmed off', () => {
    const input = baseRouteInput();
    input.transferBuySide = baseTransfer({ withdrawEnabled: false });
    const outcome = calculateRoute(input);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe('WITHDRAW_DISABLED');
  });

  it('rejects DEPOSIT_DISABLED when deposits are confirmed off', () => {
    const input = baseRouteInput();
    input.transferSellSide = baseTransfer({ depositEnabled: false });
    const outcome = calculateRoute(input);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe('DEPOSIT_DISABLED');
  });

  it('treats an unknown (null) withdrawal status as STATUS_UNKNOWN, not a pass', () => {
    const input = baseRouteInput();
    input.transferBuySide = baseTransfer({ withdrawEnabled: null });
    const outcome = calculateRoute(input);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe('STATUS_UNKNOWN');
  });

  it('treats an unknown (null) deposit status as STATUS_UNKNOWN, not a pass', () => {
    const input = baseRouteInput();
    input.transferSellSide = baseTransfer({ depositEnabled: null });
    const outcome = calculateRoute(input);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe('STATUS_UNKNOWN');
  });

  it('flags a memo/tag requirement as a warning on a priced route', () => {
    const input = baseRouteInput();
    input.transferBuySide = baseTransfer({ requiresMemo: true });
    const outcome = calculateRoute(input);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.warnings.some((w) => /memo/i.test(w))).toBe(true);
  });

  it('rejects STALE_DATA when an input is older than the max age, computed at calculation time', () => {
    const input = baseRouteInput();
    input.buy.fetchedAt = '2025-12-31T23:00:00.000Z'; // 1 hour before `now`
    input.options.maxDataAgeSec = 90;
    const outcome = calculateRoute(input);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe('STALE_DATA');
  });
});

describe('calculateRoute — quote conversion', () => {
  it('prices a USDC-buy / USDT-sell route through the real conversion book, not 1:1', () => {
    const input = baseRouteInput();
    input.sell.bids = [lvl(121, 100)]; // grossProceeds = 1210 USDT
    input.quoteConversion = {
      bookSymbol: 'USDC/USDT',
      fromCurrency: 'USDT',
      toCurrency: 'USDC',
      side: 'buy',
      asks: [lvl('1.1', 1_000_000)], // 1 USDC costs 1.1 USDT — deliberately not 1:1
      bids: [],
      fee: { rate: new Decimal(0), chargedIn: 'quote', source: 'native' },
      fetchedAt: '2026-01-01T00:00:00.000Z',
    };
    const outcome = calculateRoute(input);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    // 1210 USDT / 1.1 = 1100 USDC; profit vs 1000 USDC budget = 100 (10%)
    expect(outcome.value.netProceeds.toString()).toBe('1100');
    expect(outcome.value.netProfit.toString()).toBe('100');
    expect(outcome.value.netProfitPct.toString()).toBe('10');
    expect(outcome.value.quoteConversionCost.toString()).toBe('110'); // 1210 - 1100
  });
});

describe('calculateRoute — decimal integrity', () => {
  it('keeps 8-decimal quantities at 6-figure prices exact, no float drift', () => {
    const input = baseRouteInput();
    input.buy.asks = [lvl('123456.78', '5')];
    input.budget = new Decimal('617283.9'); // exactly buys 5 BTC at that price
    input.sell.bids = [lvl('123456.79', '10')];
    const outcome = calculateRoute(input);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.baseAcquired.toString()).toBe('5');
    // netProfit = 5 * (123456.79 - 123456.78) = 0.05 — a value that float math
    // (0.1 + 0.2-style drift) would not reproduce exactly.
    expect(outcome.value.netProfit.toString()).toBe('0.05');
  });
});
