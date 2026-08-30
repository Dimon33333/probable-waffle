import type { Decimal, DataSource, FeeSpec, Level, MarketLimits, Timestamped } from '@scanner/core';

export interface Market {
  symbol: string; // e.g. "BTC/USDT"
  base: string; // exchange's own ticker, e.g. "BTC"
  quote: string; // "USDT" | "USDC"
  active: boolean;
  limits: MarketLimits;
}

export interface RawNetworkEntry {
  rawNetworkCode: string; // the exchange's own spelling, normalized downstream
  withdrawEnabled: boolean | null;
  depositEnabled: boolean | null;
  withdrawFeeFixed: Decimal | null;
  withdrawFeePercent: Decimal | null;
  depositFee: Decimal | null;
  minWithdraw: Decimal;
  maxWithdraw: Decimal | null;
  withdrawPrecisionStep: Decimal;
  requiresMemo: boolean;
  contractAddress: string | null;
}

export interface CurrencyInfo {
  code: string;
  networks: RawNetworkEntry[];
  source: DataSource;
}

export interface OrderBookData {
  symbol: string;
  bids: Level[];
  asks: Level[];
}

export type HealthState = 'ok' | 'degraded' | 'circuit_open' | 'unavailable';

export interface HealthStatus {
  id: string;
  status: HealthState;
  reason?: string;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastLatencyMs: number | null;
  consecutiveFailures: number;
}

export interface ExchangeAdapter {
  readonly id: string;
  readonly displayName: string;
  readonly enabled: boolean; // false = architecturally wired but not implemented ("coming soon")
  loadMarkets(): Promise<Timestamped<Market[]>>;
  /**
   * `codes`, when given, restricts which assets to fetch network/fee data
   * for. Adapters that only expose a bulk "all coins" endpoint (Binance,
   * KuCoin) ignore it; adapters with a per-coin endpoint (Bybit) require it.
   */
  loadCurrencies(codes?: string[]): Promise<Timestamped<CurrencyInfo[]>>;
  fetchOrderBook(symbol: string, depth: number): Promise<Timestamped<OrderBookData>>;
  /** Public-endpoint default taker fee. Always `source: 'assumed'` until account-tier keys are wired. */
  getTakerFee(symbol: string): FeeSpec;
  health(): HealthStatus;
  marketUrl(symbol: string): string;
}
