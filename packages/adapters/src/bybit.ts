import { Decimal, type FeeSpec, type Timestamped } from '@scanner/core';
import { fetchJson } from './http';
import { ExchangeResilience } from './resilience';
import { toDecimal, toDecimalOrZero } from './parse';
import type { CurrencyInfo, ExchangeAdapter, HealthStatus, Market, OrderBookData, RawNetworkEntry } from './types';

const BASE = 'https://api.bybit.com';

/** Bybit's public non-VIP spot taker fee, documented on bybit.com/fee-rate. Not account-specific. */
const ASSUMED_TAKER_FEE = new Decimal('0.001');

interface BybitInstrument {
  symbol: string;
  baseCoin: string;
  quoteCoin: string;
  status: string;
  lotSizeFilter: { basePrecision: string; minOrderQty: string; minOrderAmt: string };
  priceFilter: { tickSize: string };
}

interface BybitCoinChain {
  chain: string;
  chainType?: string;
  withdrawEnable: boolean;
  chainDeposit: string; // "1" enabled / "0" disabled
  chainWithdraw: string;
  withdrawFee: string;
  withdrawMin: string;
  withdrawPercentageFee?: string;
  minAccuracy: string; // decimal places for withdrawal precision
  contractAddress?: string;
  confirmation?: string;
}

interface BybitCoinInfo {
  coin: string;
  chains: BybitCoinChain[];
}

/**
 * Adapter implemented against Bybit's official v5 public endpoints. Bybit's
 * edge (CloudFront) blocks requests from some regions/hosting providers
 * entirely regardless of authentication, independent of anything this code
 * does — when that happens every call here fails as EXCHANGE_UNAVAILABLE and
 * the circuit breaker opens, degrading the scan rather than crashing it.
 * `/v5/asset/coin/query-info` in particular is documented by Bybit as
 * requiring an API key; without one this adapter's currency/network data is
 * expected to come back empty, and any route needing it correctly rejects
 * with STATUS_UNKNOWN / FEE_UNKNOWN rather than guessing.
 */
export class BybitAdapter implements ExchangeAdapter {
  readonly id = 'bybit';
  readonly displayName = 'Bybit';
  readonly enabled = true;

  private readonly resilience = new ExchangeResilience('bybit', 5, 5, 30_000);

  async loadMarkets(): Promise<Timestamped<Market[]>> {
    const info = await this.resilience.run(() =>
      fetchJson<{ result: { list: BybitInstrument[] } }>(
        `${BASE}/v5/market/instruments-info?category=spot`,
      ),
    );

    const markets: Market[] = info.result.list
      .filter((s) => (s.quoteCoin === 'USDT' || s.quoteCoin === 'USDC') && s.status === 'Trading')
      .map((s) => ({
        symbol: `${s.baseCoin}/${s.quoteCoin}`,
        base: s.baseCoin,
        quote: s.quoteCoin,
        active: true,
        limits: {
          amountPrecisionStep: toDecimalOrZero(s.lotSizeFilter.basePrecision),
          pricePrecisionStep: toDecimalOrZero(s.priceFilter.tickSize),
          minAmount: toDecimalOrZero(s.lotSizeFilter.minOrderQty),
          minNotional: toDecimalOrZero(s.lotSizeFilter.minOrderAmt),
        },
      }));

    return { data: markets, fetchedAt: new Date().toISOString(), source: 'native' };
  }

  async loadCurrencies(coins: string[] = []): Promise<Timestamped<CurrencyInfo[]>> {
    if (coins.length === 0) {
      return { data: [], fetchedAt: new Date().toISOString(), source: 'native' };
    }
    // Bybit has no bulk "all coins" public endpoint; query the ones the scan
    // actually needs. Each failure is isolated so one unsupported coin does
    // not blank out the rest.
    const results = await Promise.allSettled(
      coins.map((coin) =>
        this.resilience.run(() =>
          fetchJson<{ result: { rows: BybitCoinInfo[] } }>(`${BASE}/v5/asset/coin/query-info?coin=${coin}`),
        ),
      ),
    );

    const currencies: CurrencyInfo[] = [];
    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      const rows = r.value.result.rows;
      for (const row of rows) {
        currencies.push({
          code: row.coin,
          source: 'native',
          networks: row.chains.map(
            (c): RawNetworkEntry => ({
              rawNetworkCode: c.chain,
              withdrawEnabled: c.chainWithdraw === '1',
              depositEnabled: c.chainDeposit === '1',
              withdrawFeeFixed: toDecimal(c.withdrawFee),
              withdrawFeePercent: toDecimal(c.withdrawPercentageFee) ?? new Decimal(0),
              depositFee: new Decimal(0),
              minWithdraw: toDecimalOrZero(c.withdrawMin),
              maxWithdraw: null,
              withdrawPrecisionStep: new Decimal(1).div(new Decimal(10).pow(Number(c.minAccuracy) || 8)),
              // Not exposed on this endpoint. The scan loop ORs this with the
              // canonical NETWORKS_REQUIRING_MEMO set before trusting it, so
              // a false here is never the last word for a memo-required chain.
              requiresMemo: false,
              contractAddress: c.contractAddress ?? null,
            }),
          ),
        });
      }
    }

    return { data: currencies, fetchedAt: new Date().toISOString(), source: 'native' };
  }

  async fetchOrderBook(symbol: string, depth: number): Promise<Timestamped<OrderBookData>> {
    const bybitSymbol = symbol.replace('/', '');
    const limit = Math.min(200, Math.max(1, depth));

    const raw = await this.resilience.run(() =>
      fetchJson<{ result: { b: [string, string][]; a: [string, string][] } }>(
        `${BASE}/v5/market/orderbook?category=spot&symbol=${bybitSymbol}&limit=${limit}`,
      ),
    );

    return {
      data: {
        symbol,
        bids: raw.result.b.map(([price, amount]) => ({ price: toDecimalOrZero(price), amount: toDecimalOrZero(amount) })),
        asks: raw.result.a.map(([price, amount]) => ({ price: toDecimalOrZero(price), amount: toDecimalOrZero(amount) })),
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
    return `https://www.bybit.com/en/trade/spot/${symbol.replace('/', '/')}`;
  }
}
