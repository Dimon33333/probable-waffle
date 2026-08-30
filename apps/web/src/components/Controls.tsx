'use client';

import type { ExchangeMetaDTO } from '@/lib/types';

export interface ControlsState {
  amountPreset: '100' | '500' | '1000' | 'custom';
  customAmount: string;
  exchanges: string[];
  quotes: string[];
  minNetProfitPct: string;
  adverseBufferBps: string;
  strictMode: boolean;
}

export const PRESETS: Array<ControlsState['amountPreset']> = ['100', '500', '1000'];

interface Props {
  state: ControlsState;
  onChange: (next: ControlsState) => void;
  onRunScan: () => void;
  scanning: boolean;
  exchanges: ExchangeMetaDTO[];
}

export function effectiveBudget(state: ControlsState): number {
  const raw = state.amountPreset === 'custom' ? state.customAmount : state.amountPreset;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 100;
}

export default function Controls({ state, onChange, onRunScan, scanning, exchanges }: Props) {
  const set = (patch: Partial<ControlsState>) => onChange({ ...state, ...patch });

  const toggleExchange = (id: string) => {
    const has = state.exchanges.includes(id);
    set({ exchanges: has ? state.exchanges.filter((x) => x !== id) : [...state.exchanges, id] });
  };

  const toggleQuote = (q: string) => {
    const has = state.quotes.includes(q);
    set({ quotes: has ? state.quotes.filter((x) => x !== q) : [...state.quotes, q] });
  };

  return (
    <div className="card">
      <div className="controls-grid">
        <div className="field">
          <label>Starting amount</label>
          <div className="amount-presets">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                className={`chip ${state.amountPreset === p ? 'active' : ''}`}
                onClick={() => set({ amountPreset: p })}
              >
                {p}
              </button>
            ))}
            <button
              type="button"
              className={`chip ${state.amountPreset === 'custom' ? 'active' : ''}`}
              onClick={() => set({ amountPreset: 'custom' })}
            >
              Custom
            </button>
          </div>
          {state.amountPreset === 'custom' && (
            <input
              type="number"
              min={1}
              value={state.customAmount}
              onChange={(e) => set({ customAmount: e.target.value })}
              placeholder="Amount"
              style={{ marginTop: 6 }}
            />
          )}
        </div>

        <div className="field">
          <label>Min net profit %</label>
          <input
            type="number"
            step="0.1"
            value={state.minNetProfitPct}
            onChange={(e) => set({ minNetProfitPct: e.target.value })}
          />
        </div>

        <div className="field">
          <label>Adverse-price buffer (bps)</label>
          <input
            type="number"
            step="1"
            value={state.adverseBufferBps}
            onChange={(e) => set({ adverseBufferBps: e.target.value })}
            title="A cushion against the order book moving between scan and execution. Not a real fee — shown as its own line."
          />
        </div>

        <div className="field">
          <label>Quote currency</label>
          <div className="checkbox-row">
            {['USDT', 'USDC'].map((q) => (
              <label key={q}>
                <input type="checkbox" checked={state.quotes.includes(q)} onChange={() => toggleQuote(q)} />
                {q}
              </label>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Exchanges</label>
          <div className="checkbox-row">
            {exchanges.map((ex) => (
              <label key={ex.id} className={ex.enabled ? '' : 'disabled'}>
                <input
                  type="checkbox"
                  disabled={!ex.enabled}
                  checked={state.exchanges.includes(ex.id)}
                  onChange={() => toggleExchange(ex.id)}
                />
                {ex.displayName}
                {!ex.enabled ? ' (coming soon)' : ''}
              </label>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Strict mode</label>
          <div className="checkbox-row">
            <label>
              <input
                type="checkbox"
                checked={state.strictMode}
                onChange={(e) => set({ strictMode: e.target.checked })}
              />
              Reject unknown fees / assumed data
            </label>
          </div>
        </div>
      </div>

      <div className="run-row">
        <button className="run" onClick={onRunScan} disabled={scanning}>
          {scanning ? 'Scanning…' : 'Run Scan'}
        </button>
      </div>
    </div>
  );
}
