import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CircuitBreaker } from '../src/circuitBreaker';

describe('CircuitBreaker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('stays closed while failures are below the threshold', () => {
    const cb = new CircuitBreaker(3, 10_000);
    expect(cb.canRequest()).toBe(true);
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.canRequest()).toBe(true);
    expect(cb.getState()).toBe('closed');
  });

  it('opens after the failure threshold and blocks requests during the cooldown', () => {
    const cb = new CircuitBreaker(3, 10_000);
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState()).toBe('open');
    expect(cb.canRequest()).toBe(false);
  });

  it('moves to half-open after the cooldown and allows exactly one probe', () => {
    const cb = new CircuitBreaker(1, 5_000);
    cb.recordFailure();
    expect(cb.canRequest()).toBe(false);

    vi.advanceTimersByTime(5_001);
    expect(cb.canRequest()).toBe(true); // the one probe
    expect(cb.canRequest()).toBe(false); // no second concurrent probe
  });

  it('closes on a successful half-open probe', () => {
    const cb = new CircuitBreaker(1, 5_000);
    cb.recordFailure();
    vi.advanceTimersByTime(5_001);
    expect(cb.canRequest()).toBe(true);
    cb.recordSuccess();
    expect(cb.getState()).toBe('closed');
    expect(cb.getConsecutiveFailures()).toBe(0);
  });

  it('re-opens on a failed half-open probe', () => {
    const cb = new CircuitBreaker(1, 5_000);
    cb.recordFailure();
    vi.advanceTimersByTime(5_001);
    expect(cb.canRequest()).toBe(true);
    cb.recordFailure();
    expect(cb.getState()).toBe('open');
    expect(cb.canRequest()).toBe(false);
  });
});
