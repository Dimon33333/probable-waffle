import { Decimal, type FeeSpec, type Timestamped } from '@scanner/core';
import { fetchJson } from './http';
import { ExchangeResilience } from './resilience';
import { toDecimalOrZero } from './parse';
import type { CurrencyInfo, ExchangeAdapter, HealthStatus, Market, OrderBookData } from './types';

const BASE = 'https://www.okx.com';

/** OKX's public non-VIP spot taker fee, documented on okx.com/fees. Not account-specific. */
const ASSUMED_TAKER_FEE = new Decimal('0.001');

interface OkxInstrument {
  instId: string; // "BTC-USDT"
  baseCcy: string;
  quoteCcy: string;
  state: string; // "live"
  lotSz: string;
  tickSz: string;
  minSz: string;
}

interface OkxBookLevel extends Array<string> {
  0: string; // price
  1: string; // size
}

/**
 * OKX's public market endpoints (instruments, order book) work from every
 * environment tested while building this and need no key. Its per-network
 * withdrawal-fee/status endpoint (`/api/v5/asset/currencies`) is documented
 * by OKX as requiring an authenticated request (`OK-ACCESS-KEY`) and there is
 * no public substitute — confirmed directly against the live endpoint, which
 * returns error 50103 ("Request header OK-ACCESS-KEY can not be empty")
 * regardless of the coin queried. So `loadCurrencies` always returns empty:
 * every route through OKX correctly rejects with `STATUS_UNKNOWN` rather
 * than guessing a withdrawal fee or status. OKX still contributes real,
 * live buy/sell VWAP data to the scan — it just can never complete a full
 * priced route until OKX read-only API keys are added for that one endpoint.
 */
export class OkxAdapter implements ExchangeAdapter {
  readonly id = 'okx';
  readonly displayName = 'OKX';
  readonly enabled = true;

  private readonly resilience = new ExchangeResilience('okx', 6, 5, 30_000);

  async loadMarkets(): Promise<Timestamped<Market[]>> {
    const info = await this.resilience.run(() =>
      fetchJson<{ data: OkxInstrument[] }>(`${BASE}/api/v5/public/instruments?instType=SPOT`),
    );

    const markets: Market[] = info.data
      .filter((s) => (s.quoteCcy === 'USDT' || s.quoteCcy === 'USDC') && s.state === 'live')
      .map((s) => ({
        symbol: `${s.baseCcy}/${s.quoteCcy}`,
        base: s.baseCcy,
        quote: s.quoteCcy,
        active: true,
        limits: {
          amountPrecisionStep: toDecimalOrZero(s.lotSz),
          pricePrecisionStep: toDecimalOrZero(s.tickSz),
          minAmount: toDecimalOrZero(s.minSz),
          // OKX's public instruments endpoint doesn't publish a minimum
          // notional value directly; treat it as unenforced (0) rather than
          // inventing one.
          minNotional: new Decimal(0),
        },
      }));

    return { data: markets, fetchedAt: new Date().toISOString(), source: 'native' };
  }

  async loadCurrencies(): Promise<Timestamped<CurrencyInfo[]>> {
    // No public endpoint exists for this — see class doc. Every asset
    // resolves to "no data", which correctly degrades any OKX route to
    // STATUS_UNKNOWN instead of assuming withdrawals are enabled.
    return { data: [], fetchedAt: new Date().toISOString(), source: 'native' };
  }

  async fetchOrderBook(symbol: string, depth: number): Promise<Timestamped<OrderBookData>> {
    const instId = symbol.replace('/', '-');
    const sz = Math.min(400, Math.max(1, depth));

    const raw = await this.resilience.run(() =>
      fetchJson<{ data: Array<{ asks: OkxBookLevel[]; bids: OkxBookLevel[] }> }>(
        `${BASE}/api/v5/market/books?instId=${instId}&sz=${sz}`,
      ),
    );

    const book = raw.data[0];
    if (!book) throw new Error(`OKX returned no order book for ${instId}`);

    return {
      data: {
        symbol,
        bids: book.bids.map(([price, amount]) => ({ price: toDecimalOrZero(price), amount: toDecimalOrZero(amount) })),
        asks: book.asks.map(([price, amount]) => ({ price: toDecimalOrZero(price), amount: toDecimalOrZero(amount) })),
      },
      fetchedAt: new Date().toISOString(),
      source: 'native',
    };
  }

  getTakerFee(_symbol: string): FeeSpec {
    return { rate: ASSUMED_TAKER_FEE, chargedIn: 'quote', source: 'assumed' };
  }

  health(): HealthStatus {
    return this.resilience.health();
  }

  marketUrl(symbol: string): string {
    return `${BASE}/trade-spot/${symbol.replace('/', '-').toLowerCase()}`;
  }
}
