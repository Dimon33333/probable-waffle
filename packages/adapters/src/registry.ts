import { BinanceAdapter } from './binance';
import { BybitAdapter } from './bybit';
import { KucoinAdapter } from './kucoin';
import { OkxAdapter } from './okx';
import type { ExchangeAdapter } from './types';

/**
 * Every adapter this build knows about, enabled or not. Add a new venue by
 * implementing ExchangeAdapter and listing it here — nothing else in the
 * scan loop or UI needs to change to pick it up.
 */
export function createAdapterRegistry(): ExchangeAdapter[] {
  return [new BinanceAdapter(), new BybitAdapter(), new KucoinAdapter(), new OkxAdapter()];
}
