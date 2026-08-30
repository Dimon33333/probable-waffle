import { Decimal } from '@scanner/core';
import { ensureScanLoopStarted, computeSnapshot } from '@/server/scanLoop';
import { getAllHealth } from '@/server/state';
import { jsonResponse } from '@/server/serialize';
import { MAX_DATA_AGE_SEC_DEFAULT } from '@/server/config';

export const dynamic = 'force-dynamic';

function parseDecimal(v: string | null, fallback: number): Decimal {
  if (v === null || v === '') return new Decimal(fallback);
  try {
    const d = new Decimal(v);
    return d.isFinite() ? d : new Decimal(fallback);
  } catch {
    return new Decimal(fallback);
  }
}

export async function GET(request: Request): Promise<Response> {
  ensureScanLoopStarted();
  const url = new URL(request.url);
  const q = url.searchParams;

  const budget = parseDecimal(q.get('budget'), 100);
  const minNetProfitPct = parseDecimal(q.get('minNetProfitPct'), 0);
  const adverseBufferBps = parseDecimal(q.get('adverseBufferBps'), 10);
  const strictMode = q.get('strictMode') !== 'false';
  const maxDataAgeSec = Number(q.get('maxDataAgeSec') ?? MAX_DATA_AGE_SEC_DEFAULT);

  const exchangesParam = q.get('exchanges');
  const enabledExchangeIds = exchangesParam ? exchangesParam.split(',').filter(Boolean) : ['binance', 'bybit', 'kucoin'];

  const quotesParam = q.get('quotes');
  const quotes = (quotesParam ? quotesParam.split(',') : ['USDT', 'USDC']).filter(
    (x): x is 'USDT' | 'USDC' => x === 'USDT' || x === 'USDC',
  );

  const snapshot = computeSnapshot({
    budget,
    enabledExchangeIds,
    quotes: quotes.length > 0 ? quotes : ['USDT', 'USDC'],
    minNetProfitPct,
    adverseBufferBps,
    strictMode,
    maxDataAgeSec: Number.isFinite(maxDataAgeSec) ? maxDataAgeSec : MAX_DATA_AGE_SEC_DEFAULT,
  });

  return jsonResponse({ snapshot, health: getAllHealth() });
}
