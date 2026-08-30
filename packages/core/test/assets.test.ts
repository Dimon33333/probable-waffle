import { describe, it, expect } from 'vitest';
import { resolveAssetIdentity } from '../src/assets';

describe('resolveAssetIdentity', () => {
  it('resolves a major asset present on the allowlist with matching tickers', () => {
    const id = resolveAssetIdentity('BTC', 'BTC');
    expect(id).not.toBeNull();
    expect(id?.canonicalId).toBe('bitcoin');
    expect(id?.identityEvidence).toBe('allowlist');
  });

  it('rejects (returns null) when the tickers do not match — never assumed to be the same asset', () => {
    expect(resolveAssetIdentity('BTC', 'ETH')).toBeNull();
  });

  it('rejects (returns null) a matching ticker that is not on the curated allowlist', () => {
    // A ticker collision candidate: not every exchange-listed symbol is verified.
    expect(resolveAssetIdentity('SOME_UNLISTED_TOKEN', 'SOME_UNLISTED_TOKEN')).toBeNull();
  });
});
