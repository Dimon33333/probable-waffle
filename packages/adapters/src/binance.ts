import { Decimal, type FeeSpec, type Timestamped } from '@scanner/core';
import { fetchJson } from './http';
import { ExchangeResilience } from './resilience';
import { toDecimal, toDecimalOrZero } from './parse';
import type { CurrencyInfo, ExchangeAdapter, HealthStatus, Market, OrderBookData, RawNetworkEntry } from './types';

/**
 * Binance's official trading API (api.binance.com) rejects requests from
 * several regions at the network edge regardless of the request itself. Two
 * separate public, unauthenticated surfaces are used instead:
 *  - data-api.binance.vision — Binance's own public market-data mirror
 *    (exchangeInfo, order book), meant for exactly this kind of read-only use.
 *  - www.binance.com/bapi/capital/.../getNetworkCoinAll — the public endpoint
 *    Binance's own website calls to render withdrawal network fees and
 *    status before login. No API key involved; it is simply public data.
 * Trading fees are NOT available from either surface without account keys,
 * so getTakerFee() returns a documented assumed default (see below) rather
 * than inventing a fetched-looking number.
 */
const MARKET_BASE = 'https://data-api.binance.vision';
const NETWORK_INFO_URL = 'https://www.binance.com/bapi/capital/v1/public/capital/getNetworkCoinAll';

/** Binance's public non-VIP spot taker fee, documented on binance.com/fee/schedule. Not account-specific. */
const ASSUMED_TAKER_FEE = new Decimal('0.001');

interface BinanceSymbol {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  status: string;
  filters: Array<Record<string, unknown>>;
}

interface BinanceExchangeInfo {
  symbols: BinanceSymbol[];
}

interface BinanceNetworkEntry {
  network: string;
  withdrawEnable: boolean;
  depositEnable: boolean;
  withdrawFee: string;
  withdrawMin: string;
  withdrawMax: string;
  withdrawIntegerMultiple: string;
  depositFee?: string;
  contractAddress?: string | null;
  sameAddress?: boolean;
}

interface BinanceCoin {
  coin: string;
  networkList: BinanceNetworkEntry[];
}

export class BinanceAdapter implements ExchangeAdapter {
  readonly id = 'binance';
  readonly displayName = 'Binance';
  readonly enabled = true;

  private readonly resilience = new ExchangeResilience('binance', 8, 5, 30_000);

  async loadMarkets(): Promise<Timestamped<Market[]>> {
    const info = await this.resilience.run(() =>
      fetchJson<BinanceExchangeInfo>(`${MARKET_BASE}/api/v3/exchangeInfo`),
    );

    const markets: Market[] = info.symbols
      .filter((s) => (s.quoteAsset === 'USDT' || s.quoteAsset === 'USDC') && s.status === 'TRADING')
      .map((s) => {
        const priceFilter = s.filters.find((f) => f.filterType === 'PRICE_FILTER');
        const lotFilter = s.filters.find((f) => f.filterType === 'LOT_SIZE');
        const notionalFilter = s.filters.find((f) => f.filterType === 'NOTIONAL' || f.filterType === 'MIN_NOTIONAL');
        return {
          symbol: `${s.baseAsset}/${s.quoteAsset}`,
          base: s.baseAsset,
          quote: s.quoteAsset,
          active: true,
          limits: {
            amountPrecisionStep: toDecimalOrZero(lotFilter?.stepSize as string | undefined),
            pricePrecisionStep: toDecimalOrZero(priceFilter?.tickSize as string | undefined),
            minAmount: toDecimalOrZero(lotFilter?.minQty as string | undefined),
            minNotional: toDecimalOrZero(notionalFilter?.minNotional as string | undefined),
          },
        };
      });

    return { data: markets, fetchedAt: new Date().toISOString(), source: 'native' };
  }

  async loadCurrencies(): Promise<Timestamped<CurrencyInfo[]>> {
    const payload = await this.resilience.run(() =>
      fetchJson<{ data: BinanceCoin[] }>(NETWORK_INFO_URL),
    );

    const currencies: CurrencyInfo[] = payload.data.map((coin) => ({
      code: coin.coin,
      source: 'native',
      networks: coin.networkList.map(
        (n): RawNetworkEntry => ({
          rawNetworkCode: n.network,
          withdrawEnabled: n.withdrawEnable,
          depositEnabled: n.depositEnable,
          withdrawFeeFixed: toDecimal(n.withdrawFee),
          withdrawFeePercent: new Decimal(0), // Binance charges flat withdrawal fees only
          depositFee: toDecimal(n.depositFee) ?? new Decimal(0),
          minWithdraw: toDecimalOrZero(n.withdrawMin),
          maxWithdraw: toDecimal(n.withdrawMax),
          withdrawPrecisionStep: toDecimalOrZero(n.withdrawIntegerMultiple),
          requiresMemo: n.sameAddress === true,
          contractAddress: n.contractAddress ?? null,
        }),
      ),
    }));

    return { data: currencies, fetchedAt: new Date().toISOString(), source: 'native' };
  }

  async fetchOrderBook(symbol: string, depth: number): Promise<Timestamped<OrderBookData>> {
    const binanceSymbol = symbol.replace('/', '');
    const allowedLimits = [5, 10, 20, 50, 100, 500, 1000, 5000];
    const limit = allowedLimits.find((l) => l >= depth) ?? 100;

    const raw = await this.resilience.run(() =>
      fetchJson<{ bids: [string, string][]; asks: [string, string][] }>(
        `${MARKET_BASE}/api/v3/depth?symbol=${binanceSymbol}&limit=${limit}`,
      ),
    );

    return {
      data: {
        symbol,
        bids: raw.bids.map(([price, amount]) => ({ price: toDecimalOrZero(price), amount: toDecimalOrZero(amount) })),
        asks: raw.asks.map(([price, amount]) => ({ price: toDecimalOrZero(price), amount: toDecimalOrZero(amount) })),
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
    return `https://www.binance.com/en/trade/${symbol.replace('/', '_')}`;
  }
}
