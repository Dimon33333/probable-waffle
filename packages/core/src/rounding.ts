import Decimal from 'decimal.js';

Decimal.set({ precision: 40, toExpNeg: -30, toExpPos: 40, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };

/** Round down to the nearest multiple of `step` (or return `v` unchanged if step is 0/unknown). */
export const floorToStep = (v: Decimal, step: Decimal): Decimal =>
  step.isZero() ? v : v.div(step).floor().mul(step);

/** Round up to the nearest multiple of `step` (or return `v` unchanged if step is 0/unknown). */
export const ceilToStep = (v: Decimal, step: Decimal): Decimal =>
  step.isZero() ? v : v.div(step).ceil().mul(step);

/** For quote-currency amounts with no exchange-defined step: round to a fixed, generous precision. */
export const DEFAULT_QUOTE_DP = 12;
export const ceilDp = (v: Decimal, dp: number = DEFAULT_QUOTE_DP): Decimal => v.toDecimalPlaces(dp, Decimal.ROUND_CEIL);
export const floorDp = (v: Decimal, dp: number = DEFAULT_QUOTE_DP): Decimal => v.toDecimalPlaces(dp, Decimal.ROUND_FLOOR);
