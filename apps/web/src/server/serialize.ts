import { Decimal } from '@scanner/core';

/** Decimal isn't natively JSON-serializable in a lossless way — stringify explicitly everywhere it appears. */
export function toJsonSafe(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (v instanceof Decimal ? v.toString() : v));
}

export function jsonResponse(value: unknown, init?: ResponseInit): Response {
  return new Response(toJsonSafe(value), {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
}
