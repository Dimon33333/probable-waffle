import { RateLimiter } from './rateLimiter';
import { CircuitBreaker } from './circuitBreaker';
import { ExchangeUnavailableError, RateLimitedError } from './http';
import type { HealthStatus } from './types';

/**
 * Bundles rate limiting, a circuit breaker, and health bookkeeping for one
 * exchange so each adapter doesn't reimplement it. A dead exchange degrades
 * the scan (routes through it reject with EXCHANGE_UNAVAILABLE); it never
 * throws out of the scan loop.
 */
export class ExchangeResilience {
  private readonly limiter: RateLimiter;
  private readonly breaker: CircuitBreaker;
  private lastSuccessAt: string | null = null;
  private lastErrorAt: string | null = null;
  private lastReason: string | undefined;
  private lastLatencyMs: number | null = null;

  constructor(
    public readonly id: string,
    ratePerSecond: number,
    failureThreshold = 5,
    cooldownMs = 30_000,
  ) {
    this.limiter = new RateLimiter(ratePerSecond);
    this.breaker = new CircuitBreaker(failureThreshold, cooldownMs);
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.breaker.canRequest()) {
      throw new ExchangeUnavailableError(`${this.id}: circuit open`);
    }
    await this.limiter.acquire();
    const start = Date.now();
    try {
      const result = await fn();
      this.lastLatencyMs = Date.now() - start;
      this.lastSuccessAt = new Date().toISOString();
      this.breaker.recordSuccess();
      return result;
    } catch (err) {
      this.lastLatencyMs = Date.now() - start;
      this.lastErrorAt = new Date().toISOString();
      this.lastReason = err instanceof Error ? err.message : String(err);
      this.breaker.recordFailure();
      throw err;
    }
  }

  health(): HealthStatus {
    const state = this.breaker.getState();
    let status: HealthStatus['status'] = 'ok';
    if (state === 'open') status = 'circuit_open';
    else if (state === 'half_open' || this.breaker.getConsecutiveFailures() > 0) status = 'degraded';

    return {
      id: this.id,
      status,
      reason: status === 'ok' ? undefined : this.lastReason,
      lastSuccessAt: this.lastSuccessAt,
      lastErrorAt: this.lastErrorAt,
      lastLatencyMs: this.lastLatencyMs,
      consecutiveFailures: this.breaker.getConsecutiveFailures(),
    };
  }
}

export { ExchangeUnavailableError, RateLimitedError };
