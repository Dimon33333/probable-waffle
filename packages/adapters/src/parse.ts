import { Decimal } from '@scanner/core';

/** Parses an exchange's numeric string straight into Decimal — never via parseFloat. */
export function toDecimal(v: string | number | null | undefined): Decimal | null {
  if (v === null || v === undefined || v === '') return null;
  try {
    const d = new Decimal(v);
    return d.isFinite() ? d : null;
  } catch {
    return null;
  }
}

export function toDecimalOrZero(v: string | number | null | undefined): Decimal {
  return toDecimal(v) ?? new Decimal(0);
}

/** Converts a decimal-places integer (e.g. KuCoin's `withdrawPrecision: 6`) into a step size. */
export function precisionToStep(decimalPlaces: number | null | undefined): Decimal {
  if (decimalPlaces === null || decimalPlaces === undefined || decimalPlaces < 0) return new Decimal(0);
  return new Decimal(1).div(new Decimal(10).pow(decimalPlaces));
}
