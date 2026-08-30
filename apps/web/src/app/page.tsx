'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Controls, { type ControlsState, effectiveBudget } from '@/components/Controls';
import HealthPanel from '@/components/HealthPanel';
import RejectionSummary from '@/components/RejectionSummary';
import ResultsTable from '@/components/ResultsTable';
import { fmtAge, fmtWhen } from '@/lib/format';
import type { ExchangeMetaDTO, HealthDTO, ResultsResponse, SnapshotDTO } from '@/lib/types';

const POLL_MS = 8000;

const DEFAULT_STATE: ControlsState = {
  amountPreset: '100',
  customAmount: '100',
  exchanges: ['binance', 'bybit', 'kucoin', 'okx'],
  quotes: ['USDT', 'USDC'],
  minNetProfitPct: '0',
  adverseBufferBps: '10',
  strictMode: true,
};

function buildQuery(state: ControlsState): string {
  const params = new URLSearchParams({
    budget: String(effectiveBudget(state)),
    exchanges: state.exchanges.join(','),
    quotes: state.quotes.join(','),
    minNetProfitPct: state.minNetProfitPct || '0',
    adverseBufferBps: state.adverseBufferBps || '10',
    strictMode: String(state.strictMode),
  });
  return params.toString();
}

export default function Page() {
  const [controls, setControls] = useState<ControlsState>(DEFAULT_STATE);
  const [snapshot, setSnapshot] = useState<SnapshotDTO | null>(null);
  const [health, setHealth] = useState<HealthDTO[]>([]);
  const [exchanges, setExchanges] = useState<ExchangeMetaDTO[]>([]);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadResults = useCallback(async (state: ControlsState) => {
    try {
      const res = await fetch(`/api/results?${buildQuery(state)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`results request failed (${res.status})`);
      const data: ResultsResponse = await res.json();
      setSnapshot(data.snapshot);
      setHealth(data.health);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to load results');
    }
  }, []);

  const loadHealthMeta = useCallback(async () => {
    try {
      const res = await fetch('/api/health', { cache: 'no-store' });
      if (!res.ok) return;
      const data: { health: HealthDTO[]; exchanges: ExchangeMetaDTO[] } = await res.json();
      setHealth(data.health);
      setExchanges(data.exchanges);
    } catch {
      // health panel just stays stale; not fatal
    }
  }, []);

  useEffect(() => {
    void loadHealthMeta();
  }, [loadHealthMeta]);

  useEffect(() => {
    void loadResults(controls);
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      void loadResults(controls);
      void loadHealthMeta();
    }, POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controls.exchanges.join(','), controls.quotes.join(','), controls.minNetProfitPct, controls.adverseBufferBps, controls.strictMode, controls.amountPreset, controls.customAmount]);

  const runScan = useCallback(async () => {
    setScanning(true);
    try {
      await fetch('/api/scan', { method: 'POST' });
      // Poll scan progress until it finishes, then refresh results.
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const res = await fetch('/api/scan', { cache: 'no-store' });
        const data: { running: boolean } = await res.json();
        if (!data.running) break;
      }
      await loadResults(controls);
      await loadHealthMeta();
    } finally {
      setScanning(false);
    }
  }, [controls, loadResults, loadHealthMeta]);

  return (
    <div className="page">
      <div className="header">
        <div className="brand">
          <div className="mark">⇄</div>
          <div>
            <h1>Crypto Arbitrage Scanner</h1>
            <div className="tagline">Spot markets · USDT/USDC · executable order-book depth, not last price</div>
          </div>
        </div>
      </div>

      <div className="disclaimer">
        Every number below is a conservative estimate at scan time, priced against real order-book depth. Manual
        execution only — no automatic trading or withdrawals. The buy-transfer-sell approach means the price can
        move during the transfer window; professional arbitrage avoids this by pre-funding both exchanges instead.
      </div>

      <HealthPanel health={health} exchanges={exchanges} />

      <Controls state={controls} onChange={setControls} onRunScan={runScan} scanning={scanning} exchanges={exchanges} />

      <div className="card">
        <div className="status-line">
          Last scan finished {fmtWhen(snapshot?.finishedAt)} · oldest input data {fmtAge(snapshot?.oldestInputAgeSec)} old
          {error && <span style={{ color: 'var(--red)' }}> · {error}</span>}
        </div>
        {snapshot && (
          <div style={{ marginTop: 8 }}>
            <RejectionSummary snapshot={snapshot} />
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 0 }}>
        {snapshot ? <ResultsTable snapshot={snapshot} /> : <div className="empty-state">Loading…</div>}
      </div>
    </div>
  );
}
