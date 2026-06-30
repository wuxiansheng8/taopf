import { LiquidationSnapshot } from '../../../shared/types.js';

let latestSnapshot: LiquidationSnapshot | null = null;

export function updateLiquidationSnapshot(snapshot: LiquidationSnapshot): void {
  latestSnapshot = snapshot;
}

export function getLiquidationSnapshot(): LiquidationSnapshot | null {
  return latestSnapshot;
}
