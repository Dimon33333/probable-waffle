'use client';

import type { HealthDTO, ExchangeMetaDTO } from '@/lib/types';

const LABEL: Record<HealthDTO['status'], string> = {
  ok: 'OK',
  degraded: 'Degraded',
  circuit_open: 'Circuit open',
  unavailable: 'Unavailable',
};

export default function HealthPanel({ health, exchanges }: { health: HealthDTO[]; exchanges: ExchangeMetaDTO[] }) {
  const byId = new Map(health.map((h) => [h.id, h]));

  return (
    <div className="health-strip">
      {exchanges.map((ex) => {
        const h = byId.get(ex.id);
        const status: HealthDTO['status'] = !ex.enabled ? 'unavailable' : h?.status ?? 'unavailable';
        const title = !ex.enabled
          ? h?.reason ?? 'not enabled in this build'
          : h?.reason ?? (status === 'ok' ? 'healthy' : 'no data yet');
        return (
          <span className="health-pill" key={ex.id} title={title}>
            <span className={`dot ${status}`} />
            {ex.displayName}
            {!ex.enabled ? ' (coming soon)' : ` — ${LABEL[status]}`}
          </span>
        );
      })}
    </div>
  );
}
