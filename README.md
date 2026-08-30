# Crypto Arbitrage Scanner

A web-based cross-exchange spot arbitrage scanner. It prices real buy-transfer-sell
routes against executable order-book depth — not last price or ticker spread —
and shows a full, auditable calculation breakdown or an explicit rejection
reason for every route it evaluates. Manual execution only: no trading keys,
no automatic orders, no automatic withdrawals.

## Architecture

```
packages/core/       Pure profit engine: Decimal-only math, order-book walk,
                      fee/precision/capacity/confidence logic, asset identity
                      allowlist, network alias table. No network I/O — this is
                      what the unit tests pin down with fixtures.
packages/adapters/    ExchangeAdapter interface + one implementation per venue
                      (Binance, Bybit, KuCoin; OKX scaffolded but disabled),
                      plus shared rate limiting / circuit breaker / retry.
apps/web/             Next.js app: a background scan loop (refreshes markets,
                      currencies/network fees, and order books on their own
                      cadence) plus a UI that recomputes pricing on demand
                      from that cache so filter changes are instant and never
                      re-hit exchange rate limits.
```

Adding another exchange means implementing `ExchangeAdapter` and listing it in
`packages/adapters/src/registry.ts` — nothing else changes.

## Running it

```bash
npm install
npm run build      # builds core, adapters, and the Next.js app
npm run start -w web  -- -p 3100   # or: npm run dev -w web
```

Then open the printed URL. No `.env` is required — every exchange call is a
public, unauthenticated endpoint. Copy `.env.example` to `.env` only if you
want to tune `SCAN_INTERVAL_MS` / `MAX_DATA_AGE_SEC`, or later add Telegram
alerting (`TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID`) or read-only exchange
keys — none of these are needed for the app to work.

## Verifying it

```bash
npm run typecheck
npm run test        # 61 deterministic unit tests, no network access
npm run lint
npm run build
```

Then hit `POST /api/scan` (or click "Run Scan" in the UI) and read
`GET /api/results` / `GET /api/health`.

## What's real here

- **Live data**: Binance and KuCoin order books, market precision/limits, and
  per-network withdrawal fee/status are all fetched from public exchange
  endpoints in real time. Bybit's adapter is implemented against Bybit's
  official v5 endpoints but may be network-blocked depending on where this
  runs (see the final report for details) — the circuit breaker degrades it
  to `EXCHANGE_UNAVAILABLE` rather than crashing the scan.
- **Assumed data**: every exchange's taker fee is a documented public
  non-VIP default (0.1%), not an account-specific fetched rate — there is no
  public endpoint for that. It's tagged `source: 'assumed'` end-to-end, and
  "strict mode" (on by default) treats it as unknown and rejects the route
  rather than pricing it optimistically.
- **Never fabricated**: a missing or ambiguous fee, status, or asset
  identity always rejects with a typed reason (`FEE_UNKNOWN`,
  `STATUS_UNKNOWN`, `ASSET_IDENTITY_AMBIGUOUS`, ...) — it never defaults to
  zero or "enabled".

## Scope of this version

Spot markets only, USDT/USDC quotes, informational — links out to both
exchanges' market pages for manual execution. No margin, no futures, no DEX
routes, no automatic trading or withdrawals.
