import { ParsedStakeEvent } from '../services/stakeFlowService.js';

function extrinsicIndex(record: any): number | null {
  if (!record.phase?.isApplyExtrinsic) return null;
  return record.phase.asApplyExtrinsic.toNumber();
}

function burnMatchKey(record: any): string | null {
  const index = extrinsicIndex(record);
  if (index === null) return null;

  const { event } = record;
  if (event.section !== 'subtensorModule') return null;

  if (event.method === 'StakeAdded') {
    return `${index}:${event.data[1].toString()}:${event.data[4].toString()}`;
  }

  if (event.method === 'AddStakeBurn') {
    return `${index}:${event.data[1].toString()}:${event.data[0].toString()}`;
  }

  return null;
}

function findBurnedStakeEventIndexes(records: any[]): Set<number> {
  const pendingStakeAdds = new Map<string, number[]>();
  const excludedIndexes = new Set<number>();

  records.forEach((record, eventIndex) => {
    const key = burnMatchKey(record);
    if (!key) return;

    if (record.event.method === 'StakeAdded') {
      const indexes = pendingStakeAdds.get(key) ?? [];
      indexes.push(eventIndex);
      pendingStakeAdds.set(key, indexes);
      return;
    }

    const indexes = pendingStakeAdds.get(key);
    const stakeEventIndex = indexes?.pop();
    if (stakeEventIndex !== undefined) excludedIndexes.add(stakeEventIndex);
  });

  return excludedIndexes;
}

export function parseStakeFlowEvents(records: any[], blockNumber: number): ParsedStakeEvent[] {
  const burnedStakeEventIndexes = findBurnedStakeEventIndexes(records);
  const parsed: ParsedStakeEvent[] = [];

  records.forEach((record, eventIndex) => {
    const { event } = record;
    if (event.section !== 'subtensorModule') return;
    if (event.method !== 'StakeAdded' && event.method !== 'StakeRemoved') return;
    if (burnedStakeEventIndexes.has(eventIndex)) return;

    try {
      const netuid = Number(event.data[4].toString());
      const amountRao = BigInt(event.data[2].toString());
      if (!Number.isInteger(netuid) || netuid <= 0 || amountRao <= 0n) return;

      parsed.push({
        blockNumber,
        eventIndex,
        direction: event.method === 'StakeAdded' ? 'stake' : 'unstake',
        netuid,
        amountRao
      });
    } catch {
      // Ignore malformed staking events without affecting other block processing.
    }
  });

  return parsed;
}
