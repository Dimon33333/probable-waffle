'use client';

import type { SnapshotDTO } from '@/lib/types';
import OpportunityRow from './OpportunityRow';

export default function ResultsTable({ snapshot }: { snapshot: SnapshotDTO }) {
  if (snapshot.opportunities.length === 0) {
    return (
      <div className="empty-state">
        No opportunities clear your filters right now. That can mean the market has nothing right now, or your
        filters are strict — check the rejection counts above for which.
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="results">
        <thead>
          <tr>
            <th>Asset</th>
            <th>Route</th>
            <th>Net profit %</th>
            <th>Net profit</th>
            <th>Capacity</th>
            <th>Confidence</th>
          </tr>
        </thead>
        <tbody>
          {snapshot.opportunities.map((o) => (
            <OpportunityRow key={o.id} o={o} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
