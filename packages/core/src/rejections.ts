export type RejectionReason =
  | 'NO_COMMON_NETWORK'
  | 'WITHDRAW_DISABLED'
  | 'DEPOSIT_DISABLED'
  | 'ASSET_IDENTITY_AMBIGUOUS'
  | 'INSUFFICIENT_BUY_DEPTH'
  | 'INSUFFICIENT_SELL_DEPTH'
  | 'BELOW_MIN_ORDER'
  | 'BELOW_MIN_WITHDRAWAL'
  | 'ABOVE_MAX_WITHDRAWAL'
  | 'FEE_UNKNOWN'
  | 'STATUS_UNKNOWN'
  | 'STALE_DATA'
  | 'NEGATIVE_NET_RETURN'
  | 'RATE_LIMITED'
  | 'EXCHANGE_UNAVAILABLE'
  | 'BELOW_MIN_PROFIT';

export const ALL_REJECTION_REASONS: RejectionReason[] = [
  'NO_COMMON_NETWORK',
  'WITHDRAW_DISABLED',
  'DEPOSIT_DISABLED',
  'ASSET_IDENTITY_AMBIGUOUS',
  'INSUFFICIENT_BUY_DEPTH',
  'INSUFFICIENT_SELL_DEPTH',
  'BELOW_MIN_ORDER',
  'BELOW_MIN_WITHDRAWAL',
  'ABOVE_MAX_WITHDRAWAL',
  'FEE_UNKNOWN',
  'STATUS_UNKNOWN',
  'STALE_DATA',
  'NEGATIVE_NET_RETURN',
  'RATE_LIMITED',
  'EXCHANGE_UNAVAILABLE',
  'BELOW_MIN_PROFIT',
];

export type Outcome<T> =
  | { ok: true; value: T }
  | { ok: false; reason: RejectionReason; detail: string; partial?: Record<string, unknown> };

export const reject = (
  reason: RejectionReason,
  detail: string,
  partial?: Record<string, unknown>,
): Outcome<never> => ({ ok: false, reason, detail, partial });
