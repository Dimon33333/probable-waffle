import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchJson, RateLimitedError, ExchangeUnavailableError } from '../src/http';

describe('fetchJson', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns parsed JSON on a 200 response', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ hello: 'world' }) }) as never;
    const result = await fetchJson('https://example.com/api');
    expect(result).toEqual({ hello: 'world' });
  });

  it('throws RateLimitedError after exhausting retries on 429', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers({ 'retry-after': '0' }),
      json: async () => ({}),
    }) as never;
    await expect(fetchJson('https://example.com/api', { retries: 1, timeoutMs: 500 })).rejects.toBeInstanceOf(
      RateLimitedError,
    );
  });

  it('throws ExchangeUnavailableError on a persistent 5xx', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503, headers: new Headers(), json: async () => ({}) }) as never;
    await expect(fetchJson('https://example.com/api', { retries: 1, timeoutMs: 500 })).rejects.toBeInstanceOf(
      ExchangeUnavailableError,
    );
  });

  it('does not retry a non-429 4xx — that quota is not worth burning', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404, headers: new Headers(), json: async () => ({}) });
    global.fetch = fetchMock as never;
    await expect(fetchJson('https://example.com/api', { retries: 3, timeoutMs: 500 })).rejects.toBeInstanceOf(
      ExchangeUnavailableError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a transient network failure then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('network error'))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true }) });
    global.fetch = fetchMock as never;
    const result = await fetchJson('https://example.com/api', { retries: 1, timeoutMs: 500 });
    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
