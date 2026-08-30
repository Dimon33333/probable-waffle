import { Decimal } from './rounding';
import { calculateRoute } from './engine';
import type { RouteInput } from './types';

/**
 * The largest starting budget for which the route still clears the user's
 * minimum net profit percentage — bounded by buy depth, sell depth, and any
 * withdrawal maximum. Found by binary search over the cached books, which is
 * cheap and exact enough (the books don't change mid-search).
 */
export function computeCapacity(input: RouteInput, iterations = 20): Decimal {
  const passesAt = (budget: Decimal): boolean => {
    const outcome = calculateRoute({ ...input, budget });
    return outcome.ok;
  };

  if (!passesAt(input.budget)) return new Decimal(0);

  // Establish an upper bound the route can no longer clear.
  let lo = input.budget;
  let hi = input.budget;
  const withdrawCap = input.transferBuySide.maxWithdraw;
  for (let i = 0; i < iterations; i++) {
    const next = hi.mul(2);
    if (!passesAt(next)) {
      hi = next;
      break;
    }
    hi = next;
    if (withdrawCap && hi.gt(withdrawCap.mul(1_000_000))) break; // avoid runaway growth
  }

  for (let i = 0; i < iterations; i++) {
    const mid = lo.plus(hi).div(2);
    if (passesAt(mid)) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  return lo;
}
