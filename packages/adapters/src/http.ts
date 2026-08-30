export class RateLimitedError extends Error {
  constructor(public readonly retryAfterMs: number | null, message = 'rate limited') {
    super(message);
    this.name = 'RateLimitedError';
  }
}

export class ExchangeUnavailableError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'ExchangeUnavailableError';
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const jitteredBackoff = (attempt: number): number => {
  const base = Math.min(4000, 250 * 2 ** attempt);
  return base / 2 + Math.random() * (base / 2);
};

export interface FetchJsonOptions {
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
}

/**
 * A public-endpoint GET with a timeout, and retry limited to transient
 * failures — network errors, 5xx, 429. A 4xx that means "this symbol doesn't
 * exist" is never retried; that just burns quota for nothing.
 */
export async function fetchJson<T = unknown>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  const { timeoutMs = 8000, retries = 2, headers } = options;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal, headers });
      clearTimeout(timer);

      if (res.status === 429) {
        const retryAfterHeader = res.headers.get('retry-after');
        const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : null;
        if (attempt < retries) {
          await sleep(retryAfterMs ?? jitteredBackoff(attempt));
          continue;
        }
        throw new RateLimitedError(retryAfterMs, `${url} rate limited`);
      }

      if (res.status >= 500) {
        if (attempt < retries) {
          await sleep(jitteredBackoff(attempt));
          continue;
        }
        throw new ExchangeUnavailableError(`${url} returned ${res.status}`);
      }

      if (!res.ok) {
        // 4xx other than 429: not transient, don't retry.
        throw new ExchangeUnavailableError(`${url} returned ${res.status}`);
      }

      return (await res.json()) as T;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      if (err instanceof RateLimitedError) throw err;
      const isAbort = err instanceof Error && err.name === 'AbortError';
      const isTransient = isAbort || err instanceof TypeError; // TypeError: fetch network failure
      if (isTransient && attempt < retries) {
        await sleep(jitteredBackoff(attempt));
        continue;
      }
      if (err instanceof ExchangeUnavailableError) throw err;
      throw new ExchangeUnavailableError(`${url} unreachable: ${(err as Error)?.message ?? String(err)}`, err);
    }
  }

  throw new ExchangeUnavailableError(`${url} exhausted retries`, lastError);
}
