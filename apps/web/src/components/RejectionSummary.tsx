'use client';

import type { SnapshotDTO } from '@/lib/types';

export default function RejectionSummary({ snapshot }: { snapshot: SnapshotDTO }) {
  const entries = Object.entries(snapshot.rejections.counts).sort((a, b) => b[1] - a[1]);

  return (
    <div className="rejection-summary">
      {snapshot.candidatesEvaluated} routes evaluated —{' '}
      {snapshot.opportunities.length > 0 ? `${snapshot.opportunities.length} priced` : 'none priced'}
      {entries.length > 0 && (
        <div style={{ marginTop: 6 }}>
          {entries.map(([reason, count]) => (
            <span className="reason" key={reason}>
              {reason}: {count}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
