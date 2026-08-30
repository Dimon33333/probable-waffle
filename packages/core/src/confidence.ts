import type { Confidence, ConfidenceResult, DataSource } from './types';

export interface ConfidenceInputs {
  buyFeeSource: DataSource;
  sellFeeSource: DataSource;
  transferSource: DataSource;
  identityEvidence: 'contract-match' | 'allowlist' | 'name-and-network';
  oldestAgeSec: number;
  maxDataAgeSec: number;
  buyBookLevelsTotal: number;
  buyBookLevelsConsumed: number;
  sellBookLevelsTotal: number;
  sellBookLevelsConsumed: number;
  requiresMemo: boolean;
}

/**
 * Confidence is where honest uncertainty lives. Anything not backed by a live,
 * fetched, high-signal input pulls the level down — it never defaults to high.
 */
export function computeConfidence(inputs: ConfidenceInputs): ConfidenceResult {
  const reasons: string[] = [];
  let score = 0; // 0 = high; each downgrade adds weight

  if (inputs.buyFeeSource === 'assumed' || inputs.sellFeeSource === 'assumed') {
    reasons.push('trading fee rate is an assumed default tier, not fetched from the account');
    score += 1;
  }
  if (inputs.transferSource === 'assumed') {
    reasons.push('withdrawal/network fee data is assumed, not fetched live');
    score += 2;
  }

  if (inputs.identityEvidence === 'allowlist') {
    reasons.push('asset identity confirmed via curated allowlist, not a contract-address match');
    score += 1;
  } else if (inputs.identityEvidence === 'name-and-network') {
    reasons.push('asset identity resolved by name + shared network only, not a contract-address match');
    score += 2;
  }

  const ageRatio = inputs.maxDataAgeSec > 0 ? inputs.oldestAgeSec / inputs.maxDataAgeSec : 0;
  if (ageRatio > 0.6) {
    reasons.push(
      `oldest input data is ${inputs.oldestAgeSec.toFixed(0)}s old, approaching the ${inputs.maxDataAgeSec}s limit`,
    );
    score += 1;
  }

  const buyConsumedRatio = inputs.buyBookLevelsTotal > 0 ? inputs.buyBookLevelsConsumed / inputs.buyBookLevelsTotal : 0;
  const sellConsumedRatio = inputs.sellBookLevelsTotal > 0 ? inputs.sellBookLevelsConsumed / inputs.sellBookLevelsTotal : 0;
  if (buyConsumedRatio > 0.7 || sellConsumedRatio > 0.7) {
    reasons.push('fill consumed most of the visible order book depth');
    score += 1;
  }

  if (inputs.buyBookLevelsTotal < 3 || inputs.sellBookLevelsTotal < 3) {
    reasons.push('order book returned very few levels');
    score += 1;
  }

  if (inputs.requiresMemo) {
    reasons.push('destination network requires a memo/tag — verify it manually before transferring');
  }

  let level: Confidence = 'high';
  if (score >= 3) level = 'low';
  else if (score >= 1) level = 'medium';

  return { level, reasons };
}
