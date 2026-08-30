export const SCAN_INTERVAL_MS = Number(process.env.SCAN_INTERVAL_MS ?? 45_000);
export const MAX_DATA_AGE_SEC_DEFAULT = Number(process.env.MAX_DATA_AGE_SEC ?? 90);
export const MARKETS_TTL_MS = 60 * 60 * 1000; // markets/precision change rarely
export const CURRENCIES_TTL_MS = 5 * 60 * 1000; // network status/fees flip more often than people expect
export const ORDER_BOOK_DEPTH = 50;

export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
export const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? '';
