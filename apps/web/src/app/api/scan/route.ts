import { ensureScanLoopStarted, triggerImmediateRefresh } from '@/server/scanLoop';
import { getState } from '@/server/state';
import { jsonResponse } from '@/server/serialize';

export const dynamic = 'force-dynamic';

/**
 * "Run Scan" from the UI requests a refresh and returns immediately — it does
 * not synchronously perform the scan inside this request handler. The
 * refresh happens in the background; the UI polls /api/results and
 * /api/scan (for progress) while it runs.
 */
export async function POST(): Promise<Response> {
  ensureScanLoopStarted();
  const state = getState();
  if (state.scanInFlight) {
    return jsonResponse({ status: 'already-running', progress: state.progress });
  }
  void triggerImmediateRefresh();
  return jsonResponse({ status: 'started', progress: state.progress });
}

export async function GET(): Promise<Response> {
  ensureScanLoopStarted();
  const state = getState();
  return jsonResponse({ progress: state.progress, running: Boolean(state.scanInFlight) });
}
