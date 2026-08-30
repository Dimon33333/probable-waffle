import {
  Decimal,
  ageSeconds,
  calculateRoute,
  computeCapacity,
  normalizeNetwork,
  NETWORKS_REQUIRING_MEMO,
  resolveAssetIdentity,
  type CanonicalNetwork,
  type NetworkTransferInfo,
  type PricedOpportunity,
  type RejectedRoute,
  type RouteInput,
} from '@scanner/core';
import type { CurrencyInfo, ExchangeAdapter, Market, RawNetworkEntry } from '@scanner/adapters';
import { getState, bookKey } from './state';

export interface CandidateParams {
  budget: Decimal;
  minNetProfitPct: Decimal;
  adverseBufferBps: Decimal;
  strictMode: boolean;
  maxDataAgeSec: number;
  maxTransferDataAgeSec: number;
}

export type CandidateOutcome =
  | { ok: true; opportunity: PricedOpportunity }
  | { ok: false; rejected: RejectedRoute };

function findMarket(markets: Market[], base: string, quote: string): Market | undefined {
  return markets.find((m) => m.base === base && m.quote === quote && m.active);
}

function toTransferInfo(raw: RawNetworkEntry, canonical: CanonicalNetwork, source: CurrencyInfo['source'], fetchedAt: string): NetworkTransferInfo {
  return {
    network: canonical,
    withdrawFeeFixed: raw.withdrawFeeFixed,
    withdrawFeePercent: raw.withdrawFeePercent,
    depositFee: raw.depositFee,
    minWithdraw: raw.minWithdraw,
    maxWithdraw: raw.maxWithdraw,
    withdrawPrecisionStep: raw.withdrawPrecisionStep,
    withdrawEnabled: raw.withdrawEnabled,
    depositEnabled: raw.depositEnabled,
    requiresMemo: raw.requiresMemo || NETWORKS_REQUIRING_MEMO.has(canonical),
    contractAddress: raw.contractAddress,
    source,
    fetchedAt,
  };
}

/**
 * Builds and prices one buy-on-A / sell-on-B route for one asset. Every exit
 * before `calculateRoute` is a typed rejection recorded the same way an
 * engine rejection is — "no candidate route" is never a silent skip.
 */
export function buildAndPriceRoute(
  assetCode: string,
  quote: 'USDT' | 'USDC',
  buyAdapter: ExchangeAdapter,
  sellAdapter: ExchangeAdapter,
  params: CandidateParams,
): CandidateOutcome {
  const state = getState();
  const reject = (reason: RejectedRoute['reason'], detail: string, network: string | null = null): CandidateOutcome => ({
    ok: false,
    rejected: { asset: assetCode, network, buyExchange: buyAdapter.id, sellExchange: sellAdapter.id, reason, detail },
  });

  const identity = resolveAssetIdentity(assetCode, assetCode);
  if (!identity) return reject('ASSET_IDENTITY_AMBIGUOUS', `${assetCode} is not on the verified asset allowlist`);

  const buyMarkets = state.markets.get(buyAdapter.id);
  const sellMarkets = state.markets.get(sellAdapter.id);
  if (!buyMarkets || !sellMarkets) return reject('EXCHANGE_UNAVAILABLE', 'market data not yet loaded');

  const buyMarket = findMarket(buyMarkets.data, assetCode, quote);
  const sellMarket = findMarket(sellMarkets.data, assetCode, quote);
  if (!buyMarket || !sellMarket) return reject('EXCHANGE_UNAVAILABLE', `${assetCode}/${quote} not listed on both venues`);

  const buyCurrencies = state.currencies.get(buyAdapter.id);
  const sellCurrencies = state.currencies.get(sellAdapter.id);
  const buyCurrency = buyCurrencies?.data.find((c) => c.code === assetCode);
  const sellCurrency = sellCurrencies?.data.find((c) => c.code === assetCode);
  if (!buyCurrency || !sellCurrency || !buyCurrencies || !sellCurrencies) {
    return reject('STATUS_UNKNOWN', `network/withdrawal data for ${assetCode} unavailable from one or both exchanges`);
  }

  // Normalize both sides to canonical network ids, intersect, and restrict to
  // networks the allowlist has actually verified for this asset.
  const buyByCanonical = new Map<CanonicalNetwork, RawNetworkEntry>();
  for (const n of buyCurrency.networks) {
    const canon = normalizeNetwork(buyAdapter.id, n.rawNetworkCode);
    if (canon && identity.sharedNetworks.includes(canon)) buyByCanonical.set(canon, n);
  }
  const sellByCanonical = new Map<CanonicalNetwork, RawNetworkEntry>();
  for (const n of sellCurrency.networks) {
    const canon = normalizeNetwork(sellAdapter.id, n.rawNetworkCode);
    if (canon && identity.sharedNetworks.includes(canon)) sellByCanonical.set(canon, n);
  }

  const shared = [...buyByCanonical.keys()].filter((k) => sellByCanonical.has(k));
  if (shared.length === 0) return reject('NO_COMMON_NETWORK', `no shared verified network for ${assetCode}`);

  // Prefer the cheapest known withdrawal fee among shared networks; fall back
  // to the first when none are known (the engine will correctly reject that
  // as FEE_UNKNOWN rather than this layer guessing).
  let chosenNetwork = shared[0]!;
  let bestFee = buyByCanonical.get(chosenNetwork)!.withdrawFeeFixed;
  for (const net of shared.slice(1)) {
    const fee = buyByCanonical.get(net)!.withdrawFeeFixed;
    if (fee !== null && (bestFee === null || fee.lt(bestFee))) {
      chosenNetwork = net;
      bestFee = fee;
    }
  }

  const buyRaw = buyByCanonical.get(chosenNetwork)!;
  const sellRaw = sellByCanonical.get(chosenNetwork)!;

  const buyBook = state.books.get(bookKey(buyAdapter.id, buyMarket.symbol));
  const sellBook = state.books.get(bookKey(sellAdapter.id, sellMarket.symbol));
  if (!buyBook || !sellBook) {
    return reject('EXCHANGE_UNAVAILABLE', 'order book not available for this cycle', chosenNetwork);
  }

  const input: RouteInput = {
    asset: {
      canonicalId: identity.canonicalId,
      buyCode: assetCode,
      sellCode: assetCode,
      identityEvidence: identity.identityEvidence,
    },
    network: { id: chosenNetwork, displayName: chosenNetwork },
    buy: {
      exchange: buyAdapter.id,
      symbol: buyMarket.symbol,
      asks: buyBook.data.asks,
      takerFee: buyAdapter.getTakerFee(buyMarket.symbol),
      limits: buyMarket.limits,
      fetchedAt: buyBook.fetchedAt,
      marketUrl: buyAdapter.marketUrl(buyMarket.symbol),
    },
    sell: {
      exchange: sellAdapter.id,
      symbol: sellMarket.symbol,
      bids: sellBook.data.bids,
      takerFee: sellAdapter.getTakerFee(sellMarket.symbol),
      limits: sellMarket.limits,
      fetchedAt: sellBook.fetchedAt,
      marketUrl: sellAdapter.marketUrl(sellMarket.symbol),
    },
    transferBuySide: toTransferInfo(buyRaw, chosenNetwork, buyCurrencies.source, buyCurrencies.fetchedAt),
    transferSellSide: toTransferInfo(sellRaw, chosenNetwork, sellCurrencies.source, sellCurrencies.fetchedAt),
    quoteConversion: null,
    budget: params.budget,
    options: {
      adverseBufferBps: params.adverseBufferBps,
      maxDataAgeSec: params.maxDataAgeSec,
      maxTransferDataAgeSec: params.maxTransferDataAgeSec,
      minNetProfitPct: params.minNetProfitPct,
      strictMode: params.strictMode,
    },
    now: new Date(),
  };

  const outcome = calculateRoute(input);
  if (!outcome.ok) {
    return reject(outcome.reason, outcome.detail, chosenNetwork);
  }

  const maxCapacity = computeCapacity(input);
  outcome.value.maxCapacity = maxCapacity;

  const opportunity: PricedOpportunity = {
    id: `${assetCode}-${chosenNetwork}-${buyAdapter.id}-${sellAdapter.id}-${quote}`,
    asset: input.asset,
    network: input.network,
    buyExchange: buyAdapter.id,
    sellExchange: sellAdapter.id,
    buySymbol: buyMarket.symbol,
    sellSymbol: sellMarket.symbol,
    buyMarketUrl: input.buy.marketUrl,
    sellMarketUrl: input.sell.marketUrl,
    budget: params.budget,
    result: outcome.value,
    scannedAt: new Date().toISOString(),
  };

  return { ok: true, opportunity };
}

export function oldestAgeAcrossCache(): number | null {
  const state = getState();
  const now = new Date();
  const ages: number[] = [];
  for (const m of state.markets.values()) ages.push(ageSeconds(m.fetchedAt, now));
  for (const c of state.currencies.values()) ages.push(ageSeconds(c.fetchedAt, now));
  for (const b of state.books.values()) ages.push(ageSeconds(b.fetchedAt, now));
  if (ages.length === 0) return null;
  return Math.max(...ages);
}
