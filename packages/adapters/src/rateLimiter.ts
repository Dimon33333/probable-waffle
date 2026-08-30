/**
 * Simple token-bucket limiter, one instance per exchange. `enableRateLimit`
 * style helpers in libraries like CCXT are a floor, not a ceiling — this is
 * deliberately conservative (leaves headroom) rather than tuned to the
 * documented limit exactly.
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill = Date.now();

  constructor(
    private readonly ratePerSecond: number,
    private readonly burst: number = Math.max(1, Math.ceil(ratePerSecond)),
  ) {
    this.tokens = burst;
  }

  private refill(): void {
    const now = Date.now();
    const elapsedSec = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.burst, this.tokens + elapsedSec * this.ratePerSecond);
    this.lastRefill = now;
  }

  async acquire(): Promise<void> {
    for (;;) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      const waitMs = ((1 - this.tokens) / this.ratePerSecond) * 1000;
      await sleep(Math.max(10, waitMs));
    }
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
