import type { CurrencyInfo, ExchangeAdapter, HealthStatus, Market, OrderBookData } from '@scanner/adapters';
import type { Timestamped } from '@scanner/core';
import type { PricedOpportunity, RejectedRoute } from '@scanner/core';

export interface RejectionSummary {
  total: number;
  counts: Record<string, number>;
  samples: Record<string, RejectedRoute[]>;
}

export interface ScanSnapshot {
  opportunities: PricedOpportunity[];
  rejections: RejectionSummary;
  candidatesEvaluated: number;
  startedAt: string | null;
  finishedAt: string | null;
  oldestInputAgeSec: number | null;
  unmappedNetworkAliases: string[];
}

export interface ScanProgress {
  running: boolean;
  phase: string;
  exchange: string | null;
  evaluated: number;
  total: number;
}

interface ScannerState {
  adapters: ExchangeAdapter[];
  markets: Map<string, Timestamped<Market[]>>;
  currencies: Map<string, Timestamped<CurrencyInfo[]>>;
  books: Map<string, Timestamped<OrderBookData>>;
  lastSnapshot: ScanSnapshot;
  progress: ScanProgress;
  scanTimer: ReturnType<typeof setInterval> | null;
  scanInFlight: Promise<void> | null;
}

const EMPTY_SNAPSHOT: ScanSnapshot = {
  opportunities: [],
  rejections: { total: 0, counts: {}, samples: {} },
  candidatesEvaluated: 0,
  startedAt: null,
  finishedAt: null,
  oldestInputAgeSec: null,
  unmappedNetworkAliases: [],
};

declare global {
  // eslint-disable-next-line no-var
  var __scannerState: ScannerState | undefined;
}

/**
 * Module state must survive across requests — the scan loop is a long-lived
 * background process, not something a request handler re-runs. Stashing it
 * on `globalThis` also survives Next.js dev-mode module re-evaluation.
 */
export function getState(): ScannerState {
  if (!globalThis.__scannerState) {
    globalThis.__scannerState = {
      adapters: [],
      markets: new Map(),
      currencies: new Map(),
      books: new Map(),
      lastSnapshot: EMPTY_SNAPSHOT,
      progress: { running: false, phase: 'idle', exchange: null, evaluated: 0, total: 0 },
      scanTimer: null,
      scanInFlight: null,
    };
  }
  return globalThis.__scannerState;
}

export function bookKey(exchangeId: string, symbol: string): string {
  return `${exchangeId}:${symbol}`;
}

export function getAllHealth(): HealthStatus[] {
  return getState().adapters.map((a) => a.health());
}
