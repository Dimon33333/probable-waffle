// Client-side mirror of the server's JSON shape. Every Decimal on the server
// crosses the wire as a plain string — never re-parsed to a JS number here,
// since this layer only ever formats for display.

export interface FillDTO {
  price: string;
  amount: string;
  quote: string;
}

export interface ConfidenceDTO {
  level: 'high' | 'medium' | 'low';
  reasons: string[];
}

export interface RouteResultDTO {
  buyVWAP: string;
  sellVWAP: string;
  grossSpreadPct: string;
  buyFee: string;
  buyFeeCurrency: 'base' | 'quote';
  withdrawFeeFixed: string;
  withdrawFeePercent: string;
  withdrawFeeTotal: string;
  depositFee: string;
  sellFee: string;
  sellFeeCurrency: 'base' | 'quote';
  quoteConversionCost: string;
  adverseBufferBps: string;
  baseAcquired: string;
  baseWithdrawn: string;
  baseArriving: string;
  baseSold: string;
  dust: string;
  netProceeds: string;
  netProfit: string;
  netProfitPct: string;
  maxCapacity: string | null;
  buyFills: FillDTO[];
  sellFills: FillDTO[];
  dataAges: {
    buyBookSec: number;
    sellBookSec: number;
    transferBuySideSec: number;
    transferSellSideSec: number;
  };
  confidence: ConfidenceDTO;
  warnings: string[];
}

export interface OpportunityDTO {
  id: string;
  asset: { canonicalId: string; buyCode: string; sellCode: string; identityEvidence: string };
  network: { id: string; displayName: string };
  buyExchange: string;
  sellExchange: string;
  buySymbol: string;
  sellSymbol: string;
  buyMarketUrl: string;
  sellMarketUrl: string;
  budget: string;
  result: RouteResultDTO;
  scannedAt: string;
}

export interface RejectedRouteDTO {
  asset: string;
  network: string | null;
  buyExchange: string;
  sellExchange: string;
  reason: string;
  detail: string;
}

export interface SnapshotDTO {
  opportunities: OpportunityDTO[];
  rejections: { total: number; counts: Record<string, number>; samples: Record<string, RejectedRouteDTO[]> };
  candidatesEvaluated: number;
  startedAt: string | null;
  finishedAt: string | null;
  oldestInputAgeSec: number | null;
  unmappedNetworkAliases: string[];
}

export interface HealthDTO {
  id: string;
  status: 'ok' | 'degraded' | 'circuit_open' | 'unavailable';
  reason?: string;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastLatencyMs: number | null;
  consecutiveFailures: number;
}

export interface ExchangeMetaDTO {
  id: string;
  displayName: string;
  enabled: boolean;
}

export interface ResultsResponse {
  snapshot: SnapshotDTO;
  health: HealthDTO[];
}
