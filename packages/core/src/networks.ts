/**
 * Canonical chain ids and the explicit alias table that maps each exchange's
 * own spelling onto them. Deliberately not fuzzy-matched: a fuzzy match that
 * pairs two different chains sends a customer's funds nowhere recoverable.
 * An unmapped alias resolves to `null`, never a guess.
 */
export type CanonicalNetwork =
  | 'BTC' | 'ETH' | 'BSC' | 'TRON' | 'SOL' | 'POLYGON' | 'ARBITRUM' | 'OPTIMISM'
  | 'AVAX_C' | 'TON' | 'XRP' | 'ADA' | 'DOGE' | 'LTC' | 'DOT' | 'ATOM' | 'NEAR'
  | 'BASE' | 'SUI' | 'ETC' | 'BNB_BEACON';

export const NETWORK_DISPLAY_NAME: Record<CanonicalNetwork, string> = {
  BTC: 'Bitcoin',
  ETH: 'Ethereum (ERC20)',
  BSC: 'BNB Smart Chain (BEP20)',
  TRON: 'Tron (TRC20)',
  SOL: 'Solana',
  POLYGON: 'Polygon',
  ARBITRUM: 'Arbitrum One',
  OPTIMISM: 'Optimism',
  AVAX_C: 'Avalanche C-Chain',
  TON: 'TON',
  XRP: 'XRP Ledger',
  ADA: 'Cardano',
  DOGE: 'Dogecoin',
  LTC: 'Litecoin',
  // As of the exchange data checked while building this, neither Binance nor
  // KuCoin exposes withdrawal for plain relay-chain DOT any more — both have
  // moved to the Polkadot Asset Hub (formerly "Statemint"). Binance's own
  // network code is literally "STATEMINT"; KuCoin's is "Asset Hub(Polkadot)".
  // Both name the same chain, so this canonical id represents that path.
  DOT: 'Polkadot Asset Hub',
  ATOM: 'Cosmos Hub',
  NEAR: 'NEAR',
  BASE: 'Base',
  SUI: 'Sui',
  ETC: 'Ethereum Classic',
  BNB_BEACON: 'BNB Beacon Chain (BEP2)',
};

/** Networks that require a memo/destination tag on the receiving side. */
export const NETWORKS_REQUIRING_MEMO = new Set<CanonicalNetwork>(['XRP', 'ATOM', 'TON']);

// Per-exchange spelling -> canonical id. Keys are matched case-insensitively
// after trimming, against the exchange's own network code.
const ALIASES: Record<string, Record<string, CanonicalNetwork>> = {
  binance: {
    BTC: 'BTC',
    ETH: 'ETH',
    BSC: 'BSC',
    BEP20: 'BSC',
    TRX: 'TRON',
    TRC20: 'TRON',
    SOL: 'SOL',
    MATIC: 'POLYGON',
    POLYGON: 'POLYGON',
    ARBITRUM: 'ARBITRUM',
    OPTIMISM: 'OPTIMISM',
    AVAXC: 'AVAX_C',
    TON: 'TON',
    XRP: 'XRP',
    ADA: 'ADA',
    DOGE: 'DOGE',
    LTC: 'LTC',
    DOT: 'DOT',
    STATEMINT: 'DOT', // Binance's code for Polkadot Asset Hub
    ATOM: 'ATOM',
    NEAR: 'NEAR',
    BASE: 'BASE',
    SUI: 'SUI',
    ETC: 'ETC',
    BNB: 'BNB_BEACON',
  },
  bybit: {
    BTC: 'BTC',
    ETH: 'ETH',
    BSC: 'BSC',
    BEP20: 'BSC',
    TRX: 'TRON',
    TRC20: 'TRON',
    SOL: 'SOL',
    MATIC: 'POLYGON',
    POLYGON: 'POLYGON',
    ARBI: 'ARBITRUM',
    ARBITRUM: 'ARBITRUM',
    OP: 'OPTIMISM',
    OPTIMISM: 'OPTIMISM',
    AVAX: 'AVAX_C',
    AVAXC: 'AVAX_C',
    TON: 'TON',
    XRP: 'XRP',
    ADA: 'ADA',
    DOGE: 'DOGE',
    LTC: 'LTC',
    DOT: 'DOT',
    ATOM: 'ATOM',
    NEAR: 'NEAR',
    BASE: 'BASE',
    SUI: 'SUI',
    ETC: 'ETC',
  },
  kucoin: {
    BTC: 'BTC',
    BTC_NATIVE_SEGWIT: 'BTC',
    ETH: 'ETH',
    ERC20: 'ETH',
    BSC: 'BSC',
    BEP20: 'BSC',
    TRX: 'TRON',
    TRC20: 'TRON',
    SOL: 'SOL',
    MATIC: 'POLYGON',
    'POLYGON(MATIC)': 'POLYGON',
    ARBITRUM: 'ARBITRUM',
    OPTIMISM: 'OPTIMISM',
    AVAXC: 'AVAX_C',
    'AVALANCHE C-CHAIN': 'AVAX_C',
    'AVAX C-CHAIN': 'AVAX_C',
    TON: 'TON',
    XRP: 'XRP',
    ADA: 'ADA',
    DOGE: 'DOGE',
    LTC: 'LTC',
    DOT: 'DOT',
    'ASSET HUB(POLKADOT)': 'DOT', // KuCoin's code for Polkadot Asset Hub
    'POLYGON POS': 'POLYGON',
    ATOM: 'ATOM',
    'ATOM COSMOS': 'ATOM',
    NEAR: 'NEAR',
    BASE: 'BASE',
    SUI: 'SUI',
    ETC: 'ETC',
  },
  okx: {
    BTC: 'BTC',
    ETH: 'ETH',
    'BSC': 'BSC',
    TRX: 'TRON',
    SOL: 'SOL',
    POLYGON: 'POLYGON',
    ARBITRUM_ONE: 'ARBITRUM',
    OPTIMISM: 'OPTIMISM',
    'AVAX C-CHAIN': 'AVAX_C',
    TON: 'TON',
    XRP: 'XRP',
    ADA: 'ADA',
    DOGE: 'DOGE',
    LTC: 'LTC',
    DOT: 'DOT',
    ATOM: 'ATOM',
    NEAR: 'NEAR',
    BASE: 'BASE',
    SUI: 'SUI',
    ETC: 'ETC',
  },
};

const unmappedLog = new Set<string>();

/**
 * Normalize one exchange's own network spelling to a canonical chain id.
 * Returns null for anything not in the explicit table (never guesses), and
 * logs the miss once so the table can be grown from real data.
 */
export function normalizeNetwork(exchangeId: string, rawNetworkCode: string): CanonicalNetwork | null {
  const table = ALIASES[exchangeId.toLowerCase()];
  if (!table) return null;
  const key = rawNetworkCode.trim().toUpperCase();
  const hit = table[key];
  if (hit) return hit;
  const logKey = `${exchangeId}:${key}`;
  if (!unmappedLog.has(logKey)) {
    unmappedLog.add(logKey);
    // eslint-disable-next-line no-console
    console.warn(`[networks] unmapped network alias "${rawNetworkCode}" on ${exchangeId}`);
  }
  return null;
}

export function getUnmappedAliases(): string[] {
  return Array.from(unmappedLog);
}
