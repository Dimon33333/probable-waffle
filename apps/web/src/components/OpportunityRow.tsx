'use client';

import { useState } from 'react';
import type { OpportunityDTO } from '@/lib/types';
import { fmtNum, fmtPct, fmtAge } from '@/lib/format';

export default function OpportunityRow({ o }: { o: OpportunityDTO }) {
  const [open, setOpen] = useState(false);
  const r = o.result;
  const confClass = `confidence-badge confidence-${r.confidence.level}`;

  return (
    <>
      <tr className="opportunity-row" onClick={() => setOpen((v) => !v)}>
        <td data-label="Asset">{o.asset.canonicalId} <span style={{ color: 'var(--text-faint)' }}>({o.network.displayName})</span></td>
        <td data-label="Route">
          {o.buyExchange} → {o.sellExchange}
          <div className="gross-spread">gross {fmtPct(r.grossSpreadPct)}</div>
        </td>
        <td data-label="Net profit %" className="profit-positive">{fmtPct(r.netProfitPct)}</td>
        <td data-label="Net profit">{fmtNum(r.netProfit)}</td>
        <td data-label="Capacity">{r.maxCapacity ? fmtNum(r.maxCapacity, 0) : '—'}</td>
        <td data-label="Confidence">
          <span className={confClass}>{r.confidence.level}</span>
          {r.warnings.length > 0 && <span className="warn-icon" title={r.warnings.join(' | ')}> ⚠</span>}
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={6} style={{ padding: 0 }}>
            <Breakdown o={o} />
          </td>
        </tr>
      )}
    </>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="line">
      <span className="label">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function Breakdown({ o }: { o: OpportunityDTO }) {
  const r = o.result;
  return (
    <div className="breakdown">
      <div className="section-title">Route</div>
      <Line label="Starting amount" value={`${fmtNum(o.budget)} (${o.buySymbol.split('/')[1]})`} />
      <Line label="Buy" value={`${o.buyExchange} — ${o.buySymbol} (fetched ${fmtAge(r.dataAges.buyBookSec)} ago)`} />
      <Line label="Sell" value={`${o.sellExchange} — ${o.sellSymbol} (fetched ${fmtAge(r.dataAges.sellBookSec)} ago)`} />
      <Line label="Network" value={`${o.network.displayName} (identity: ${o.asset.identityEvidence})`} />

      <div className="section-title">Buy leg — order book walk</div>
      {r.buyFills.map((f, i) => (
        <Line key={i} label={`level ${i + 1}`} value={`${fmtNum(f.amount, 6)} @ ${fmtNum(f.price, 6)} = ${fmtNum(f.quote)}`} />
      ))}
      <Line label="Buy VWAP (incl. adverse buffer)" value={fmtNum(r.buyVWAP, 6)} />
      <Line label={`Buy fee (${r.buyFeeCurrency})`} value={fmtNum(r.buyFee, 8)} />
      <Line label="Base acquired" value={fmtNum(r.baseAcquired, 8)} />

      <div className="section-title">Transfer leg</div>
      <Line label="Base withdrawn (after precision)" value={fmtNum(r.baseWithdrawn, 8)} />
      <Line label="Withdrawal fee (fixed)" value={fmtNum(r.withdrawFeeFixed, 8)} />
      <Line label="Withdrawal fee (percent component)" value={fmtPct(Number(r.withdrawFeePercent) * 100, 4)} />
      <Line label="Withdrawal fee total" value={fmtNum(r.withdrawFeeTotal, 8)} />
      <Line label="Deposit fee" value={fmtNum(r.depositFee, 8)} />
      <Line label="Base arriving" value={fmtNum(r.baseArriving, 8)} />

      <div className="section-title">Sell leg — order book walk</div>
      {r.sellFills.map((f, i) => (
        <Line key={i} label={`level ${i + 1}`} value={`${fmtNum(f.amount, 6)} @ ${fmtNum(f.price, 6)} = ${fmtNum(f.quote)}`} />
      ))}
      <Line label="Sell VWAP (incl. adverse buffer)" value={fmtNum(r.sellVWAP, 6)} />
      <Line label={`Sell fee (${r.sellFeeCurrency})`} value={fmtNum(r.sellFee, 8)} />
      <Line label="Base sold" value={fmtNum(r.baseSold, 8)} />
      <Line label="Dust (excluded from proceeds)" value={fmtNum(r.dust, 8)} />
      {Number(r.quoteConversionCost) !== 0 && <Line label="Quote conversion cost" value={fmtNum(r.quoteConversionCost)} />}

      <div className="section-title">Result</div>
      <Line label="Adverse buffer applied" value={`${r.adverseBufferBps} bps`} />
      <Line label="Net proceeds" value={fmtNum(r.netProceeds)} />
      <Line label="Net profit" value={fmtNum(r.netProfit)} />
      <Line label="Net profit %" value={fmtPct(r.netProfitPct)} />
      <Line label="Gross spread % (display only)" value={fmtPct(r.grossSpreadPct)} />
      <Line label="Max route capacity" value={r.maxCapacity ? fmtNum(r.maxCapacity) : 'unknown'} />
      <Line label="Confidence" value={`${r.confidence.level}${r.confidence.reasons.length ? ' — ' + r.confidence.reasons.join('; ') : ''}`} />
      {r.warnings.length > 0 && <Line label="Warnings" value={r.warnings.join(' | ')} />}

      <div className="section-title">Manual execution</div>
      <div className="links-row">
        <a href={o.buyMarketUrl} target="_blank" rel="noreferrer">Open {o.buyExchange} market ↗</a>
        <a href={o.sellMarketUrl} target="_blank" rel="noreferrer">Open {o.sellExchange} market ↗</a>
      </div>
      <div style={{ color: 'var(--text-faint)', marginTop: 8 }}>
        Estimate at scan time only. The price can move during the manual transfer window — this buy-transfer-sell
        approach carries execution-timing risk that pre-funded, near-simultaneous professional arbitrage does not.
      </div>
    </div>
  );
}
