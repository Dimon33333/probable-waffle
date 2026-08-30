// Display-only formatting. Values arrive as exact decimal strings from the
// server; converting to Number here is fine because this is purely for
// rendering, never fed back into a calculation.

export function fmtNum(v: string | number | null | undefined, digits = 2): string {
  if (v === null || v === undefined) return '—';
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtPct(v: string | number | null | undefined, digits = 2): string {
  if (v === null || v === undefined) return '—';
  return `${fmtNum(v, digits)}%`;
}

export function fmtAge(sec: number | null | undefined): string {
  if (sec === null || sec === undefined || !Number.isFinite(sec)) return '—';
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  return `${Math.round(sec / 3600)}h`;
}

export function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString();
}
