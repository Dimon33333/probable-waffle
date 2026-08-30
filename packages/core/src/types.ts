import type { Decimal } from './rounding';
import type { RejectionReason } from './rejections';

/** Every piece of fetched data carries where it came from and when. */
export type DataSource = 'ccxt' | 'native' | 'assumed';

export interface Timestamped<T> {
  data: T;
  fetchedAt: string; // ISO 8601 UTC
  source: DataSource;
}

export const ageSeconds = (fetchedAt: string, now: Date = new Date()): number =>
  Math.max(0, (now.getTime() - new Date(fetchedAt).getTime()) / 1000);

export interface Level {
  price: Decimal;
  amount: Decimal;
}

export interface Fill {
  price: Decimal;
  amount: Decimal;
  quote: Decimal;
}

export interface OrderBook {
  symbol: string;
  bids: Level[]; // descending by price
  asks: Level[]; // ascending by price
}

/** Which currency the venue charges a trading fee in — this changes the arithmetic. */
export interface FeeSpec {
  rate: Decimal | null; // null = unknown; never coalesce to zero
  chargedIn: 'base' | 'quote';
  source: DataSource;
}

export interface NetworkTransferInfo {
  network: string; // canonical network id
  withdrawFeeFixed: Decimal | null;
  withdrawFeePercent: Decimal | null;
  depositFee: Decimal | null;
  minWithdraw: Decimal;
  maxWithdraw: Decimal | null;
  withdrawPrecisionStep: Decimal; // step size, e.g. 0.00000001
  withdrawEnabled: boolean | null; // null = unknown, never assumed true
  depositEnabled: boolean | null;
  requiresMemo: boolean;
  contractAddress: string | null;
  source: DataSource;
  fetchedAt: string;
}

export interface MarketLimits {
  amountPrecisionStep: Decimal;
  pricePrecisionStep: Decimal;
  minAmount: Decimal;
  minNotional: Decimal;
}

export interface LegInput {
  exchange: string;
  symbol: string; // e.g. BTC/USDT
  limits: MarketLimits;
  takerFee: FeeSpec;
  fetchedAt: string;
  marketUrl: string;
}

export interface BuyLegInput extends LegInput {
  asks: Level[];
}

export interface SellLegInput extends LegInput {
  bids: Level[];
}

export interface RouteOptions {
  adverseBufferBps: Decimal;
  maxDataAgeSec: number;
  minNetProfitPct: Decimal;
  strictMode: boolean; // reject FEE_UNKNOWN / STATUS_UNKNOWN routes instead of downgrading confidence
}

export interface QuoteConversionInput {
  /** Present when buy quote currency != sell quote currency, e.g. buy in USDC, sell in USDT. */
  bookSymbol: string;
  fromCurrency: string; // sell-leg quote currency (what the route holds after selling)
  toCurrency: string; // buy-leg quote currency (what the budget was denominated in)
  /** Which side of `bookSymbol` to walk to go from fromCurrency to toCurrency. */
  side: 'buy' | 'sell';
  asks: Level[]; // populated when side === 'buy'
  bids: Level[]; // populated when side === 'sell'
  fee: FeeSpec;
  fetchedAt: string;
}

export interface RouteInput {
  asset: {
    canonicalId: string;
    buyCode: string;
    sellCode: string;
    identityEvidence: 'contract-match' | 'allowlist' | 'name-and-network';
  };
  network: {
    id: string;
    displayName: string;
  };
  buy: BuyLegInput;
  sell: SellLegInput;
  transferBuySide: NetworkTransferInfo; // withdrawal from the buy exchange
  transferSellSide: NetworkTransferInfo; // deposit at the sell exchange (status/fee)
  quoteConversion: QuoteConversionInput | null;
  budget: Decimal; // in buy.symbol's quote currency
  options: RouteOptions;
  now: Date;
}

export type Confidence = 'high' | 'medium' | 'low';

export interface ConfidenceResult {
  level: Confidence;
  reasons: string[];
}

export interface RouteResult {
  buyVWAP: Decimal;
  sellVWAP: Decimal;
  grossSpreadPct: Decimal;

  buyFee: Decimal;
  buyFeeCurrency: 'base' | 'quote';
  withdrawFeeFixed: Decimal;
  withdrawFeePercent: Decimal;
  withdrawFeeTotal: Decimal;
  depositFee: Decimal;
  sellFee: Decimal;
  sellFeeCurrency: 'base' | 'quote';
  quoteConversionCost: Decimal;

  adverseBufferBps: Decimal;

  baseAcquired: Decimal;
  baseWithdrawn: Decimal;
  baseArriving: Decimal;
  baseSold: Decimal;
  dust: Decimal;

  netProceeds: Decimal;
  netProfit: Decimal;
  netProfitPct: Decimal;

  maxCapacity: Decimal | null;

  buyFills: Fill[];
  sellFills: Fill[];

  dataAges: {
    buyBookSec: number;
    sellBookSec: number;
    transferBuySideSec: number;
    transferSellSideSec: number;
  };

  confidence: ConfidenceResult;
  warnings: string[];
}

export interface PricedOpportunity {
  id: string;
  asset: RouteInput['asset'];
  network: RouteInput['network'];
  buyExchange: string;
  sellExchange: string;
  buySymbol: string;
  sellSymbol: string;
  buyMarketUrl: string;
  sellMarketUrl: string;
  budget: Decimal;
  result: RouteResult;
  scannedAt: string;
}

export interface RejectedRoute {
  asset: string;
  network: string | null;
  buyExchange: string;
  sellExchange: string;
  reason: RejectionReason;
  detail: string;
  partial?: Record<string, unknown>;
}
