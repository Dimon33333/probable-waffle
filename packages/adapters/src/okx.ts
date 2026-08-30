import { Decimal, type FeeSpec, type Timestamped } from '@scanner/core';
import type { CurrencyInfo, ExchangeAdapter, HealthStatus, Market, OrderBookData } from './types';

/**
 * OKX's public order book and instrument endpoints are reachable without a
 * key, but its network/withdrawal-fee endpoint (`/api/v5/asset/currencies`)
 * requires authentication — there is no public substitute. Pricing an OKX
 * leg would therefore always resolve withdrawal data as unknown, so rather
 * than ship a route that can never complete, this adapter is wired to the
 * same ExchangeAdapter interface as the working ones (proving the
 * architecture is ready for it) but left `enabled: false` — the UI lists it
 * as "coming soon" instead of offering a checkbox that silently returns
 * nothing. Wiring it up for real is a matter of adding read-only OKX API
 * keys for that one endpoint.
 */
export class OkxAdapter implements ExchangeAdapter {
  readonly id = 'okx';
  readonly displayName = 'OKX';
  readonly enabled = false;

  async loadMarkets(): Promise<Timestamped<Market[]>> {
    throw new Error('OKX adapter is not enabled in this build');
  }

  async loadCurrencies(): Promise<Timestamped<CurrencyInfo[]>> {
    throw new Error('OKX adapter is not enabled in this build');
  }

  async fetchOrderBook(): Promise<Timestamped<OrderBookData>> {
    throw new Error('OKX adapter is not enabled in this build');
  }

  getTakerFee(): FeeSpec {
    return { rate: new Decimal('0.001'), chargedIn: 'quote', source: 'assumed' };
  }

  health(): HealthStatus {
    return {
      id: this.id,
      status: 'unavailable',
      reason: 'adapter not enabled — withdrawal/network data requires authenticated OKX endpoint',
      lastSuccessAt: null,
      lastErrorAt: null,
      lastLatencyMs: null,
      consecutiveFailures: 0,
    };
  }

  marketUrl(symbol: string): string {
    return `https://www.okx.com/trade-spot/${symbol.replace('/', '-').toLowerCase()}`;
  }
}
