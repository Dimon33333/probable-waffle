export type CircuitState = 'closed' | 'open' | 'half_open';

/**
 * Per-exchange circuit breaker. After `failureThreshold` consecutive
 * failures the breaker opens and callers should treat the exchange as
 * EXCHANGE_UNAVAILABLE without attempting a request. After `cooldownMs` it
 * moves to half-open and allows exactly one probe through; success closes it,
 * failure re-opens it (with the same cooldown, no backoff growth needed here
 * since the HTTP layer already backs off within a single request).
 */
export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private consecutiveFailures = 0;
  private openedAt = 0;
  private halfOpenProbeInFlight = false;

  constructor(
    private readonly failureThreshold: number = 5,
    private readonly cooldownMs: number = 30_000,
  ) {}

  canRequest(): boolean {
    if (this.state === 'closed') return true;
    if (this.state === 'open') {
      if (Date.now() - this.openedAt >= this.cooldownMs) {
        this.state = 'half_open';
        this.halfOpenProbeInFlight = false;
      } else {
        return false;
      }
    }
    if (this.state === 'half_open') {
      if (this.halfOpenProbeInFlight) return false;
      this.halfOpenProbeInFlight = true;
      return true;
    }
    return false;
  }

  recordSuccess(): void {
    this.state = 'closed';
    this.consecutiveFailures = 0;
    this.halfOpenProbeInFlight = false;
  }

  recordFailure(): void {
    this.consecutiveFailures += 1;
    this.halfOpenProbeInFlight = false;
    if (this.state === 'half_open' || this.consecutiveFailures >= this.failureThreshold) {
      this.state = 'open';
      this.openedAt = Date.now();
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  getConsecutiveFailures(): number {
    return this.consecutiveFailures;
  }
}
