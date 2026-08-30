import { Decimal } from './rounding';
import type { Level, Fill } from './types';

export interface WalkResult {
  baseFilled: Decimal;
  quoteSpent: Decimal;
  fills: Fill[];
  unfilled: Decimal;
  exhausted: boolean;
  vwap: Decimal;
}

/**
 * Spend `quoteBudget` up the ask side. Levels must be ascending by price.
 * VWAP is strictly worse than the best ask whenever more than one level is consumed.
 */
export function walkAsks(levels: Level[], quoteBudget: Decimal): WalkResult {
  let remaining = quoteBudget;
  let baseFilled = new Decimal(0);
  let quoteSpent = new Decimal(0);
  const fills: Fill[] = [];

  for (const lvl of levels) {
    if (remaining.lte(0)) break;
    const levelQuote = lvl.price.mul(lvl.amount);
    const spendHere = Decimal.min(remaining, levelQuote);
    const baseHere = spendHere.div(lvl.price);
    fills.push({ price: lvl.price, amount: baseHere, quote: spendHere });
    baseFilled = baseFilled.plus(baseHere);
    quoteSpent = quoteSpent.plus(spendHere);
    remaining = remaining.minus(spendHere);
  }

  return {
    baseFilled,
    quoteSpent,
    fills,
    unfilled: remaining,
    exhausted: remaining.gt(0),
    vwap: baseFilled.isZero() ? new Decimal(0) : quoteSpent.div(baseFilled),
  };
}

export interface SellWalkResult {
  baseSold: Decimal;
  quoteReceived: Decimal;
  fills: Fill[];
  unfilled: Decimal;
  exhausted: boolean;
  vwap: Decimal;
}

/** Sell `baseAmount` down the bid side. Levels must be descending by price. */
export function walkBids(levels: Level[], baseAmount: Decimal): SellWalkResult {
  let remaining = baseAmount;
  let baseSold = new Decimal(0);
  let quoteReceived = new Decimal(0);
  const fills: Fill[] = [];

  for (const lvl of levels) {
    if (remaining.lte(0)) break;
    const baseHere = Decimal.min(remaining, lvl.amount);
    const quoteHere = baseHere.mul(lvl.price);
    fills.push({ price: lvl.price, amount: baseHere, quote: quoteHere });
    baseSold = baseSold.plus(baseHere);
    quoteReceived = quoteReceived.plus(quoteHere);
    remaining = remaining.minus(baseHere);
  }

  return {
    baseSold,
    quoteReceived,
    fills,
    unfilled: remaining,
    exhausted: remaining.gt(0),
    vwap: baseSold.isZero() ? new Decimal(0) : quoteReceived.div(baseSold),
  };
}
