import { createAdapterRegistry, type ExchangeAdapter } from '@scanner/adapters';
import { ASSET_ALLOWLIST, Decimal, ageSeconds, type RejectionReason } from '@scanner/core';
import { getState, bookKey, type ScanSnapshot } from './state';
import { buildAndPriceRoute, oldestAgeAcrossCache, type CandidateParams } from './routeBuilder';
import { notifyOpportunities } from './telegram';
import {
  MARKETS_TTL_MS,
  CURRENCIES_TTL_MS,
  ORDER_BOOK_DEPTH,
  SCAN_INTERVAL_MS,
  MAX_DATA_AGE_SEC_DEFAULT,
  MAX_TRANSFER_DATA_AGE_SEC_DEFAULT,
} from './config';

const QUOTES = ['USDT', 'USDC'] as const;

function ensureAdapters(): ExchangeAdapter[] {
  const state = getState();
  if (state.adapters.length === 0) {
    state.adapters = createAdapterRegistry();
  }
  return state.adapters;
}

export interface AdapterMeta {
  id: string;
  displayName: string;
  enabled: boolean;
}

/** Every known adapter (including disabled ones like OKX) for the UI's exchange picker. */
export function ensureAdaptersMeta(): AdapterMeta[] {
  return ensureAdapters().map((a) => ({ id: a.id, displayName: a.displayName, enabled: a.enabled }));
}

function isStale(fetchedAt: string | undefined, ttlMs: number): boolean {
  if (!fetchedAt) return true;
  return ageSeconds(fetchedAt) * 1000 > ttlMs;
}

async function refreshMarkets(adapter: ExchangeAdapter): Promise<void> {
  const state = getState();
  const cached = state.markets.get(adapter.id);
  if (!isStale(cached?.fetchedAt, MARKETS_TTL_MS)) return;
  try {
    const fresh = await adapter.loadMarkets();
    state.markets.set(adapter.id, fresh);
  } catch {
    // Health already recorded by the adapter's resilience wrapper. Keep the
    // previous cache (if any) rather than wiping out working data.
  }
}

async function refreshCurrencies(adapter: ExchangeAdapter, candidateCodes: string[]): Promise<void> {
  const state = getState();
  const cached = state.currencies.get(adapter.id);
  if (!isStale(cached?.fetchedAt, CURRENCIES_TTL_MS)) return;
  try {
    const fresh = await adapter.loadCurrencies(candidateCodes);
    state.currencies.set(adapter.id, fresh);
  } catch {
    // Same reasoning as refreshMarkets: degrade gracefully, keep old cache.
  }
}

/** Assets on the curated allowlist listed as active on at least two enabled exchanges, per quote currency. */
function computeCandidatePairs(adapters: ExchangeAdapter[]): Map<string, { code: string; quote: 'USDT' | 'USDC'; exchanges: string[] }> {
  const state = getState();
  const result = new Map<string, { code: string; quote: 'USDT' | 'USDC'; exchanges: string[] }>();

  for (const entry of ASSET_ALLOWLIST) {
    for (const quote of QUOTES) {
      const exchanges: string[] = [];
      for (const adapter of adapters) {
        const markets = state.markets.get(adapter.id);
        if (!markets) continue;
        const hasIt = markets.data.some((m) => m.base === entry.code && m.quote === quote && m.active);
        if (hasIt) exchanges.push(adapter.id);
      }
      if (exchanges.length >= 2) {
        result.set(`${entry.code}:${quote}`, { code: entry.code, quote, exchanges });
      }
    }
  }
  return result;
}

async function refreshOrderBooks(adapters: ExchangeAdapter[], pairs: Map<string, { code: string; quote: string; exchanges: string[] }>): Promise<void> {
  const state = getState();
  const byAdapter = new Map<string, ExchangeAdapter>(adapters.map((a) => [a.id, a]));

  const jobs: Array<Promise<void>> = [];
  const needed = new Set<string>(); // `${exchangeId}:${symbol}`
  for (const { code, quote, exchanges } of pairs.values()) {
    for (const exId of exchanges) needed.add(`${exId}::${code}/${quote}`);
  }

  for (const key of needed) {
    const [exId, symbol] = key.split('::');
    const adapter = byAdapter.get(exId!);
    if (!adapter || !symbol) continue;
    jobs.push(
      adapter
        .fetchOrderBook(symbol, ORDER_BOOK_DEPTH)
        .then((book) => {
          state.books.set(bookKey(exId!, symbol), book);
        })
        .catch(() => {
          // Leave any previous book in place; the candidate will reject
          // EXCHANGE_UNAVAILABLE this cycle if there is none cached at all.
        }),
    );
  }

  await Promise.all(jobs);
}

/**
 * Refreshes raw exchange data (markets/currencies/order books) respecting
 * each data type's own TTL. This is the only part of the app that talks to
 * exchanges — pricing itself is computed on demand from this cache, which is
 * what lets user filters (budget, min profit) change instantly without
 * re-hitting rate limits. Runs on a timer; never inside a request handler.
 */
export async function refreshMarketData(): Promise<void> {
  const state = getState();
  const adapters = ensureAdapters().filter((a) => a.enabled);

  state.progress = { running: true, phase: 'markets', exchange: null, evaluated: 0, total: adapters.length };
  await Promise.all(adapters.map((a) => refreshMarkets(a)));

  const pairs = computeCandidatePairs(adapters);
  const codesByExchange = new Map<string, Set<string>>();
  for (const { code, exchanges } of pairs.values()) {
    for (const exId of exchanges) {
      if (!codesByExchange.has(exId)) codesByExchange.set(exId, new Set());
      codesByExchange.get(exId)!.add(code);
    }
  }

  state.progress = { ...state.progress, phase: 'currencies' };
  await Promise.all(adapters.map((a) => refreshCurrencies(a, [...(codesByExchange.get(a.id) ?? [])])));

  state.progress = { ...state.progress, phase: 'order books', total: pairs.size };
  await refreshOrderBooks(adapters, pairs);

  state.progress = { running: false, phase: 'idle', exchange: null, evaluated: 0, total: 0 };
}

export interface ComputeSnapshotParams {
  budget: Decimal;
  enabledExchangeIds: string[];
  quotes: Array<'USDT' | 'USDC'>;
  minNetProfitPct: Decimal;
  adverseBufferBps: Decimal;
  strictMode: boolean;
  maxDataAgeSec: number;
  maxTransferDataAgeSec: number;
}

/**
 * Pure(ish) computation over the current cache: builds every candidate route
 * for the requested exchanges/quotes and prices it. Cheap enough to run on
 * every filter change — no network I/O happens here.
 */
export function computeSnapshot(params: ComputeSnapshotParams): ScanSnapshot {
  const adapters = ensureAdapters().filter((a) => a.enabled && params.enabledExchangeIds.includes(a.id));
  const byId = new Map(adapters.map((a) => [a.id, a]));
  const pairs = computeCandidatePairs(adapters);

  const candidateParams: CandidateParams = {
    budget: params.budget,
    minNetProfitPct: params.minNetProfitPct,
    adverseBufferBps: params.adverseBufferBps,
    strictMode: params.strictMode,
    maxDataAgeSec: params.maxDataAgeSec,
    maxTransferDataAgeSec: params.maxTransferDataAgeSec,
  };

  const opportunities: ScanSnapshot['opportunities'] = [];
  const counts: Record<string, number> = {};
  const samples: Record<string, ScanSnapshot['rejections']['samples'][string]> = {};
  let evaluated = 0;

  for (const { code, quote, exchanges } of pairs.values()) {
    if (!params.quotes.includes(quote)) continue;
    for (const buyId of exchanges) {
      for (const sellId of exchanges) {
        if (buyId === sellId) continue;
        const buyAdapter = byId.get(buyId);
        const sellAdapter = byId.get(sellId);
        if (!buyAdapter || !sellAdapter) continue;
        evaluated += 1;
        const outcome = buildAndPriceRoute(code, quote, buyAdapter, sellAdapter, candidateParams);
        if (outcome.ok) {
          opportunities.push(outcome.opportunity);
        } else {
          const reason: RejectionReason = outcome.rejected.reason;
          counts[reason] = (counts[reason] ?? 0) + 1;
          if (!samples[reason]) samples[reason] = [];
          if (samples[reason]!.length < 5) samples[reason]!.push(outcome.rejected);
        }
      }
    }
  }

  opportunities.sort((a, b) => b.result.netProfitPct.comparedTo(a.result.netProfitPct));

  void notifyOpportunities(opportunities);

  const state = getState();
  return {
    opportunities,
    rejections: { total: evaluated - opportunities.length, counts, samples },
    candidatesEvaluated: evaluated,
    startedAt: state.lastSnapshot.startedAt,
    finishedAt: new Date().toISOString(),
    oldestInputAgeSec: oldestAgeAcrossCache(),
    unmappedNetworkAliases: [],
  };
}

export function defaultCandidateParams(): ComputeSnapshotParams {
  return {
    budget: new Decimal(100),
    enabledExchangeIds: ensureAdapters()
      .filter((a) => a.enabled)
      .map((a) => a.id),
    quotes: ['USDT', 'USDC'],
    minNetProfitPct: new Decimal(0),
    adverseBufferBps: new Decimal(10),
    strictMode: true,
    maxDataAgeSec: MAX_DATA_AGE_SEC_DEFAULT,
    maxTransferDataAgeSec: MAX_TRANSFER_DATA_AGE_SEC_DEFAULT,
  };
}

let loopStarted = false;

/** Starts the background refresh timer exactly once per process. */
export function ensureScanLoopStarted(): void {
  if (loopStarted) return;
  loopStarted = true;
  const state = getState();

  const tick = async () => {
    if (state.scanInFlight) return; // never overlap a refresh with itself
    state.lastSnapshot = { ...state.lastSnapshot, startedAt: new Date().toISOString() };
    state.scanInFlight = refreshMarketData()
      .catch(() => {
        /* per-exchange failures are already isolated inside refreshMarketData */
      })
      .finally(() => {
        state.scanInFlight = null;
      });
    await state.scanInFlight;
  };

  void tick();
  state.scanTimer = setInterval(tick, SCAN_INTERVAL_MS);
}

export function triggerImmediateRefresh(): Promise<void> {
  const state = getState();
  if (state.scanInFlight) return state.scanInFlight;
  state.lastSnapshot = { ...state.lastSnapshot, startedAt: new Date().toISOString() };
  state.scanInFlight = refreshMarketData().finally(() => {
    state.scanInFlight = null;
  });
  return state.scanInFlight;
}
