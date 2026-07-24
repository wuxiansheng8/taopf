import { ApiDecoration } from '@polkadot/api/types';
import { codecToNumber, RAO_PER_TAO } from './chainValueParser.js';

export interface MinerCompetitionChainState {
  netuid: number;
  miner_burn_cost: number;
  uid_immunity_period: number;
  active_uids: number;
  rewarded_uids: number;
  top10_incentive_share: number;
}

function codecArray(value: any): unknown[] {
  const decoded = value?.toJSON?.();
  return Array.isArray(decoded) ? decoded : [];
}

export async function queryMinerCompetitionState(
  apiAt: ApiDecoration<'promise'>,
  netuids: number[]
): Promise<MinerCompetitionChainState[]> {
  if (netuids.length === 0) return [];

  const calls: any[] = [
    ...netuids.map(netuid => [apiAt.query.subtensorModule.burn, netuid]),
    ...netuids.map(netuid => [apiAt.query.subtensorModule.immunityPeriod, netuid]),
    ...netuids.map(netuid => [apiAt.query.subtensorModule.active, netuid]),
    // NetUidStorageIndex is equal to netuid for the primary mechanism.
    ...netuids.map(netuid => [apiAt.query.subtensorModule.incentive, netuid])
  ];
  const values = await apiAt.queryMulti(calls) as any[];
  const expected = netuids.length * 4;
  if (values.length !== expected) {
    throw new Error(`矿工竞争查询返回数量异常: ${values.length}/${expected}`);
  }

  let offset = 0;
  const burns = values.slice(offset, offset += netuids.length);
  const immunityPeriods = values.slice(offset, offset += netuids.length);
  const activeVectors = values.slice(offset, offset += netuids.length);
  const incentiveVectors = values.slice(offset, offset += netuids.length);

  return netuids.map((netuid, index) => {
    const active = codecArray(activeVectors[index]);
    const incentives = codecArray(incentiveVectors[index]).map(Number);
    const incentiveTotal = incentives.reduce((sum, value) => sum + value, 0);
    const top10Total = [...incentives]
      .sort((left, right) => right - left)
      .slice(0, 10)
      .reduce((sum, value) => sum + value, 0);

    return {
      netuid,
      miner_burn_cost: codecToNumber(burns[index]) / RAO_PER_TAO,
      uid_immunity_period: codecToNumber(immunityPeriods[index]),
      active_uids: active.filter(Boolean).length,
      rewarded_uids: incentives.filter(value => value > 0).length,
      top10_incentive_share: incentiveTotal > 0 ? (top10Total / incentiveTotal) * 100 : 0
    };
  });
}
