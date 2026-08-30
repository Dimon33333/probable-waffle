import { Decimal } from '../src/rounding';
import type { Level, NetworkTransferInfo, RouteInput } from '../src/types';

export const lvl = (price: number | string, amount: number | string): Level => ({
  price: new Decimal(price),
  amount: new Decimal(amount),
});

const NOW = new Date('2026-01-01T00:00:00.000Z');
const FRESH = '2026-01-01T00:00:00.000Z'; // age 0 relative to NOW

export function baseTransfer(overrides: Partial<NetworkTransferInfo> = {}): NetworkTransferInfo {
  return {
    network: 'BTC',
    withdrawFeeFixed: new Decimal(0),
    withdrawFeePercent: new Decimal(0),
    depositFee: new Decimal(0),
    minWithdraw: new Decimal(0),
    maxWithdraw: null,
    withdrawPrecisionStep: new Decimal(0),
    withdrawEnabled: true,
    depositEnabled: true,
    requiresMemo: false,
    contractAddress: null,
    source: 'native',
    fetchedAt: FRESH,
    ...overrides,
  };
}

/**
 * A route that, worked through by hand, nets exactly +50 on a 1000 budget:
 * buy 10 BTC at 100 USDT (no fee), sell at 105 USDT (no fee), no transfer
 * costs. Every test below overrides only what it needs to isolate.
 */
export function baseRouteInput(overrides: Partial<RouteInput> = {}): RouteInput {
  return {
    asset: { canonicalId: 'bitcoin', buyCode: 'BTC', sellCode: 'BTC', identityEvidence: 'allowlist' },
    network: { id: 'BTC', displayName: 'Bitcoin' },
    buy: {
      exchange: 'binance',
      symbol: 'BTC/USDT',
      asks: [lvl(100, 100)],
      takerFee: { rate: new Decimal(0), chargedIn: 'quote', source: 'native' },
      limits: {
        amountPrecisionStep: new Decimal(0),
        pricePrecisionStep: new Decimal(0),
        minAmount: new Decimal(0),
        minNotional: new Decimal(0),
      },
      fetchedAt: FRESH,
      marketUrl: 'https://example.com/binance/BTC_USDT',
    },
    sell: {
      exchange: 'kucoin',
      symbol: 'BTC/USDT',
      bids: [lvl(105, 100)],
      takerFee: { rate: new Decimal(0), chargedIn: 'quote', source: 'native' },
      limits: {
        amountPrecisionStep: new Decimal(0),
        pricePrecisionStep: new Decimal(0),
        minAmount: new Decimal(0),
        minNotional: new Decimal(0),
      },
      fetchedAt: FRESH,
      marketUrl: 'https://example.com/kucoin/BTC_USDT',
    },
    transferBuySide: baseTransfer(),
    transferSellSide: baseTransfer(),
    quoteConversion: null,
    budget: new Decimal(1000),
    options: {
      adverseBufferBps: new Decimal(0),
      maxDataAgeSec: 90,
      minNetProfitPct: new Decimal(0),
      strictMode: false,
    },
    now: NOW,
    ...overrides,
  };
}

export { NOW, FRESH };
