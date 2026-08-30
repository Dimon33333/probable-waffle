import type { PricedOpportunity } from '@scanner/core';
import { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } from './config';

/**
 * Architecture placeholder for the alert channel described in
 * references/telegram.md: minimum profit/capacity thresholds, per-route
 * cooldown, and strict mode (suppress unknown-fee/low-confidence routes) all
 * belong here once this is wired to a queue with retry/backoff. Telegram is
 * NOT required for the MVP — with no token/chat id configured this is a
 * pure no-op, and nothing else in the app depends on it running.
 */
const enabled = Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID);

const lastSentAtByFingerprint = new Map<string, number>();
const COOLDOWN_MS = 15 * 60 * 1000;

function fingerprint(o: PricedOpportunity): string {
  const band = o.result.netProfitPct.toDecimalPlaces(1).toString();
  return `${o.asset.canonicalId}:${o.network.id}:${o.buyExchange}:${o.sellExchange}:${band}`;
}

export async function notifyOpportunities(opportunities: PricedOpportunity[]): Promise<void> {
  if (!enabled) return; // no-op until TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID are configured

  const now = Date.now();
  const due = opportunities.filter((o) => {
    const key = fingerprint(o);
    const last = lastSentAtByFingerprint.get(key);
    if (last && now - last < COOLDOWN_MS) return false;
    lastSentAtByFingerprint.set(key, now);
    return true;
  });

  for (const o of due) {
    const text = formatMessage(o);
    try {
      await sendTelegramMessage(text);
    } catch {
      // Delivery failures must never abort or slow a scan (see
      // references/telegram.md). A future version queues and retries with
      // backoff and surfaces failures in the health panel.
    }
  }
}

function formatMessage(o: PricedOpportunity): string {
  const r = o.result;
  return [
    `${o.asset.canonicalId.toUpperCase()} via ${o.network.displayName} — ${o.buyExchange} → ${o.sellExchange}`,
    `Gross spread: ${r.grossSpreadPct.toFixed(2)}% (informational only)`,
    `Estimated net profit: ${r.netProfit.toFixed(2)} (${r.netProfitPct.toFixed(2)}%)`,
    `Max capacity: ${r.maxCapacity?.toFixed(2) ?? 'unknown'}`,
    `Confidence: ${r.confidence.level}`,
    r.warnings.length ? `Warnings: ${r.warnings.join(' | ')}` : '',
    'Estimate at scan time only — the price can move during the manual transfer window.',
  ]
    .filter(Boolean)
    .join('\n');
}

async function sendTelegramMessage(text: string): Promise<void> {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
  });
}

export const telegramEnabled = enabled;
