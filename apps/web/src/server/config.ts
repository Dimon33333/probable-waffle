export const SCAN_INTERVAL_MS = Number(process.env.SCAN_INTERVAL_MS ?? 45_000);
export const MAX_DATA_AGE_SEC_DEFAULT = Number(process.env.MAX_DATA_AGE_SEC ?? 90);
export const MARKETS_TTL_MS = 60 * 60 * 1000; // markets/precision change rarely
export const CURRENCIES_TTL_MS = 5 * 60 * 1000; // network status/fees flip more often than people expect
// Network/withdrawal data is only ever as fresh as CURRENCIES_TTL_MS allows,
// so its staleness gate must be looser than the order-book one — otherwise
// every route would reject STALE_DATA a couple of minutes into any scan
// regardless of how fresh the actual order books are. Give it 2x headroom
// over the refresh cadence.
export const MAX_TRANSFER_DATA_AGE_SEC_DEFAULT = Number(
  process.env.MAX_TRANSFER_DATA_AGE_SEC ?? (CURRENCIES_TTL_MS / 1000) * 2,
);
export const ORDER_BOOK_DEPTH = 50;

export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
export const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? '';
