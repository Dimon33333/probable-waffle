import { describe, it, expect } from 'vitest';
import { RateLimiter } from '../src/rateLimiter';

describe('RateLimiter', () => {
  it('allows immediate acquisition up to the burst size', async () => {
    const limiter = new RateLimiter(10, 3);
    const start = Date.now();
    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();
    expect(Date.now() - start).toBeLessThan(50); // no waiting within burst
  });

  it('delays once the burst is exhausted', async () => {
    const limiter = new RateLimiter(20, 1); // 20/sec, burst of 1
    await limiter.acquire(); // consumes the only token immediately
    const start = Date.now();
    await limiter.acquire(); // must wait ~1000/20 = 50ms for a refill
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(30);
  });
});
