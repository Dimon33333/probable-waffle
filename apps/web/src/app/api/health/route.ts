import { ensureScanLoopStarted, ensureAdaptersMeta } from '@/server/scanLoop';
import { getAllHealth } from '@/server/state';
import { jsonResponse } from '@/server/serialize';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  ensureScanLoopStarted();
  return jsonResponse({ health: getAllHealth(), exchanges: ensureAdaptersMeta() });
}
