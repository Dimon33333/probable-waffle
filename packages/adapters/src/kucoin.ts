import { Decimal, type FeeSpec, type Timestamped } from '@scanner/core';
import { fetchJson } from './http';
import { ExchangeResilience } from './resilience';
import { toDecimal, toDecimalOrZero, precisionToStep } from './parse';
import type { CurrencyInfo, ExchangeAdapter, HealthStatus, Market, OrderBookData, RawNetworkEntry } from './types';

const BASE = 'https://api.kucoin.com';

/** KuCoin's public non-VIP spot taker fee, documented on kucoin.com/vip/level. Not account-specific. */
const ASSUMED_TAKER_FEE = new Decimal('0.001');

interface KucoinSymbol {
  symbol: string; // "BTC-USDT"
  baseCurrency: string;
  quoteCurrency: string;
  enableTrading: boolean;
  baseIncrement: string;
  priceIncrement: string;
  baseMinSize: string;
  minFunds: string;
}

interface KucoinChain {
  chainName: string;
  isWithdrawEnabled: boolean;
  isDepositEnabled: boolean;
  withdrawMinFee?: string;
  withdrawalMinFee?: string;
  withdrawFeeRate?: string;
  withdrawMinSize?: string;
  withdrawalMinSize?: string;
  withdrawPrecision?: number;
  maxWithdraw?: string | null;
  needTag: boolean;
  contractAddress?: string | null;
}

interface KucoinCurrency {
  currency: string;
  chains: KucoinChain[];
}

/**
 * Every endpoint used here is documented as public (no API key) in KuCoin's
 * own API docs, and all of it — including per-network withdrawal fee,
 * percentage fee, min withdrawal, precision, and memo requirement — is
 * genuinely live. This is the one exchange in this MVP where the full route
 * (order book AND network/fee data) is confirmed reachable from every
 * environment tested while building this, which made it valuable to wire up
 * alongside Binance and Bybit for the vertical-slice demonstration.
 */
export class KucoinAdapter implements ExchangeAdapter {
  readonly id = 'kucoin';
  readonly displayName = 'KuCoin';
  readonly enabled = true;

  private readonly resilience = new ExchangeResilience('kucoin', 6, 5, 30_000);

  async loadMarkets(): Promise<Timestamped<Market[]>> {
    const info = await this.resilience.run(() =>
      fetchJson<{ data: KucoinSymbol[] }>(`${BASE}/api/v2/symbols`),
    );

    const markets: Market[] = info.data
      .filter((s) => (s.quoteCurrency === 'USDT' || s.quoteCurrency === 'USDC') && s.enableTrading)
      .map((s) => ({
        symbol: `${s.baseCurrency}/${s.quoteCurrency}`,
        base: s.baseCurrency,
        quote: s.quoteCurrency,
        active: true,
        limits: {
          amountPrecisionStep: toDecimalOrZero(s.baseIncrement),
          pricePrecisionStep: toDecimalOrZero(s.priceIncrement),
          minAmount: toDecimalOrZero(s.baseMinSize),
          minNotional: toDecimalOrZero(s.minFunds),
        },
      }));

    return { data: markets, fetchedAt: new Date().toISOString(), source: 'native' };
  }

  async loadCurrencies(codes: string[] = []): Promise<Timestamped<CurrencyInfo[]>> {
    const targets = codes.length > 0 ? codes : [];
    const results = await Promise.allSettled(
      targets.map((code) =>
        this.resilience.run(() => fetchJson<{ data: KucoinCurrency }>(`${BASE}/api/v3/currencies/${code}`)),
      ),
    );

    const currencies: CurrencyInfo[] = [];
    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      const cur = r.value.data;
      currencies.push({
        code: cur.currency,
        source: 'native',
        networks: cur.chains.map(
          (c): RawNetworkEntry => ({
            rawNetworkCode: c.chainName,
            withdrawEnabled: c.isWithdrawEnabled,
            depositEnabled: c.isDepositEnabled,
            withdrawFeeFixed: toDecimal(c.withdrawalMinFee ?? c.withdrawMinFee),
            withdrawFeePercent: toDecimal(c.withdrawFeeRate) ?? new Decimal(0),
            depositFee: new Decimal(0),
            minWithdraw: toDecimalOrZero(c.withdrawalMinSize ?? c.withdrawMinSize),
            maxWithdraw: toDecimal(c.maxWithdraw),
            withdrawPrecisionStep: precisionToStep(c.withdrawPrecision),
            requiresMemo: c.needTag === true,
            contractAddress: c.contractAddress ?? null,
          }),
        ),
      });
    }

    return { data: currencies, fetchedAt: new Date().toISOString(), source: 'native' };
  }

  async fetchOrderBook(symbol: string, depth: number): Promise<Timestamped<OrderBookData>> {
    const kucoinSymbol = symbol.replace('/', '-');
    // KuCoin's public tier caps level2 depth at 20 without a key.
    void depth;
    const raw = await this.resilience.run(() =>
      fetchJson<{ data: { bids: [string, string][]; asks: [string, string][] } }>(
        `${BASE}/api/v1/market/orderbook/level2_20?symbol=${kucoinSymbol}`,
      ),
    );

    return {
      data: {
        symbol,
        bids: raw.data.bids.map(([price, amount]) => ({ price: toDecimalOrZero(price), amount: toDecimalOrZero(amount) })),
        asks: raw.data.asks.map(([price, amount]) => ({ price: toDecimalOrZero(price), amount: toDecimalOrZero(amount) })),
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
    return `https://www.kucoin.com/trade/${symbol.replace('/', '-')}`;
  }
}
