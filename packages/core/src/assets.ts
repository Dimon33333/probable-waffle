import type { CanonicalNetwork } from './networks';

/**
 * Curated, hand-verified asset identities. Per references/asset-identity.md,
 * an explicit allowlist beats a clever heuristic for v1: every entry here was
 * picked because the ticker is unambiguous across major venues and the listed
 * networks are the ones actually shared. Anything not listed is
 * ASSET_IDENTITY_AMBIGUOUS — rejected, never guessed.
 */
export interface AssetAllowlistEntry {
  canonicalId: string;
  name: string;
  /** The exchange's own ticker for this asset, keyed by exchange id. Same for all in this table today. */
  code: string;
  /** Canonical networks this asset is verified to run on and that we support for transfer. */
  networks: CanonicalNetwork[];
}

export const ASSET_ALLOWLIST: AssetAllowlistEntry[] = [
  { canonicalId: 'bitcoin', name: 'Bitcoin', code: 'BTC', networks: ['BTC'] },
  { canonicalId: 'ethereum', name: 'Ethereum', code: 'ETH', networks: ['ETH', 'ARBITRUM', 'OPTIMISM', 'BASE'] },
  { canonicalId: 'solana', name: 'Solana', code: 'SOL', networks: ['SOL'] },
  { canonicalId: 'ripple', name: 'XRP', code: 'XRP', networks: ['XRP'] },
  { canonicalId: 'litecoin', name: 'Litecoin', code: 'LTC', networks: ['LTC'] },
  { canonicalId: 'dogecoin', name: 'Dogecoin', code: 'DOGE', networks: ['DOGE'] },
  { canonicalId: 'cardano', name: 'Cardano', code: 'ADA', networks: ['ADA'] },
  { canonicalId: 'tron', name: 'TRON', code: 'TRX', networks: ['TRON', 'ETH', 'BSC'] },
  { canonicalId: 'polkadot', name: 'Polkadot', code: 'DOT', networks: ['DOT'] },
  { canonicalId: 'cosmos', name: 'Cosmos Hub', code: 'ATOM', networks: ['ATOM'] },
  { canonicalId: 'avalanche', name: 'Avalanche', code: 'AVAX', networks: ['AVAX_C'] },
  { canonicalId: 'chainlink', name: 'Chainlink', code: 'LINK', networks: ['ETH', 'BSC', 'ARBITRUM'] },
  { canonicalId: 'polygon-ecosystem-token', name: 'Polygon', code: 'POL', networks: ['POLYGON', 'ETH'] },
  { canonicalId: 'the-open-network', name: 'Toncoin', code: 'TON', networks: ['TON'] },
  { canonicalId: 'near-protocol', name: 'NEAR Protocol', code: 'NEAR', networks: ['NEAR'] },
  { canonicalId: 'sui', name: 'Sui', code: 'SUI', networks: ['SUI'] },
  { canonicalId: 'ethereum-classic', name: 'Ethereum Classic', code: 'ETC', networks: ['ETC'] },
  { canonicalId: 'binancecoin', name: 'BNB', code: 'BNB', networks: ['BSC'] },
  { canonicalId: 'shiba-inu', name: 'Shiba Inu', code: 'SHIB', networks: ['ETH'] },
  { canonicalId: 'uniswap', name: 'Uniswap', code: 'UNI', networks: ['ETH', 'ARBITRUM'] },
];

const BY_CODE = new Map<string, AssetAllowlistEntry>(ASSET_ALLOWLIST.map((e) => [e.code, e]));

export interface ResolvedAssetIdentity {
  canonicalId: string;
  name: string;
  buyCode: string;
  sellCode: string;
  identityEvidence: 'allowlist';
  sharedNetworks: CanonicalNetwork[];
}

/**
 * Identity resolution for v1: both exchanges must list the same ticker, and
 * that ticker must be on the curated allowlist. Anything else — a symbol
 * reused by an unrelated project, an unlisted asset — resolves to null and
 * the caller must reject the route with ASSET_IDENTITY_AMBIGUOUS.
 */
export function resolveAssetIdentity(buyCode: string, sellCode: string): ResolvedAssetIdentity | null {
  if (buyCode.toUpperCase() !== sellCode.toUpperCase()) return null;
  const entry = BY_CODE.get(buyCode.toUpperCase());
  if (!entry) return null;
  return {
    canonicalId: entry.canonicalId,
    name: entry.name,
    buyCode: entry.code,
    sellCode: entry.code,
    identityEvidence: 'allowlist',
    sharedNetworks: entry.networks,
  };
}
