import {
  MinerCompetitionSnapshot,
  MinerCompetitionSubnet,
  SubnetBlockData
} from '../../../shared/types.js';
import { ParsedMinerRegEvent } from '../chain/minerEventParser.js';
import { MinerCompetitionChainState } from '../chain/minerCompetitionReader.js';
import { formatBeijingTime } from './logService.js';
import {
  EXPECTED_BLOCKS_PER_DAY,
  minerCompetitionHistory
} from './minerCompetitionHistory.js';

interface ClassifiedMinerRegEvent extends ParsedMinerRegEvent {
  isReplacement: boolean | null;
}

interface RecordMinerCompetitionBlockInput {
  blockNumber: number;
  blockTimestampMs: number;
  events: ParsedMinerRegEvent[];
  subnets: SubnetBlockData[];
  chainState: MinerCompetitionChainState[];
  previousSubnetworkN: Map<number, number> | null;
}

let latestBlockNumber = 0;
let latestBeijingTime = '';
let currentChainState = new Map<number, MinerCompetitionChainState>();
let currentSubnets = new Map<number, SubnetBlockData>();

export function calculateMinerPoolTaoPerBlock(subnet: SubnetBlockData): number {
  return (subnet.alpha_out || 0)
    * (1 - (subnet.owner_cut || 0))
    * 0.5
    * (1 - (subnet.miner_burned || 0))
    * (subnet.alpha_price || 0);
}

export function classifyMinerRegistrationEvents(
  events: ParsedMinerRegEvent[],
  previousSubnetworkN: Map<number, number> | null
): ClassifiedMinerRegEvent[] {
  const runningN = previousSubnetworkN ? new Map(previousSubnetworkN) : new Map<number, number>();

  return events.map(event => {
    const subnetN = runningN.get(event.netuid);
    if (subnetN === undefined) {
      return { ...event, isReplacement: null };
    }

    if (event.uid < subnetN) {
      return { ...event, isReplacement: true };
    }

    if (event.uid === subnetN) {
      runningN.set(event.netuid, subnetN + 1);
      return { ...event, isReplacement: false };
    }

    // A gap means blocks or state changes were not observed locally.
    runningN.set(event.netuid, event.uid + 1);
    return { ...event, isReplacement: null };
  });
}

export async function recordMinerCompetitionBlock(
  input: RecordMinerCompetitionBlockInput
): Promise<void> {
  const classifiedEvents = classifyMinerRegistrationEvents(input.events, input.previousSubnetworkN);
  const minerPools = new Map(
    input.subnets.map(subnet => [subnet.netuid, calculateMinerPoolTaoPerBlock(subnet)])
  );
  minerCompetitionHistory.recordBlock(
    input.blockNumber,
    input.blockTimestampMs,
    minerPools,
    classifiedEvents
  );

  latestBlockNumber = input.blockNumber;
  latestBeijingTime = formatBeijingTime(new Date(input.blockTimestampMs));
  currentChainState = new Map(input.chainState.map(state => [state.netuid, state]));
  currentSubnets = new Map(input.subnets.map(subnet => [subnet.netuid, subnet]));
}

export async function getMinerCompetitionData(): Promise<MinerCompetitionSnapshot | null> {
  if (latestBlockNumber === 0 || currentChainState.size === 0) return null;

  const history = minerCompetitionHistory.getSnapshot();

  const subnets: MinerCompetitionSubnet[] = [];
  for (const [netuid, subnet] of currentSubnets) {
    const chainState = currentChainState.get(netuid);
    if (!chainState) continue;

    const historyData = history.subnets.get(netuid);
    const minerPoolTao24h = calculateMinerPoolTaoPerBlock(subnet) * EXPECTED_BLOCKS_PER_DAY;
    const dailyTaoPerUid = subnet.subnetwork_n > 0
      ? minerPoolTao24h / subnet.subnetwork_n
      : 0;
    const replaceCount = (historyData?.unknownReplacementCount || 0) > 0
      ? null
      : historyData?.replacementCount || 0;
    const turnoverRate = replaceCount !== null && subnet.max_allowed_uids > 0
      ? (replaceCount / subnet.max_allowed_uids) * 100
      : null;

    const recentAverage = historyData?.recentEmissionAverage;
    const previousAverage = historyData?.previousEmissionAverage;
    let emissionTrendPercent: number | null = null;
    if (
      history.coverageRatio >= 0.95
      && recentAverage !== null
      && recentAverage !== undefined
      && previousAverage !== null
      && previousAverage !== undefined
      && previousAverage > 0
    ) {
      emissionTrendPercent = ((recentAverage - previousAverage) / previousAverage) * 100;
    }

    subnets.push({
      netuid,
      subnet_name: subnet.subnet_name || '',
      registration_allowed: subnet.registration_allowed,
      miner_burn_cost: chainState.miner_burn_cost,
      uid_immunity_period: chainState.uid_immunity_period,
      miner_burned: subnet.miner_burned,
      subnetwork_n: subnet.subnetwork_n,
      max_allowed_uids: subnet.max_allowed_uids,
      active_uids: chainState.active_uids,
      rewarded_uids: chainState.rewarded_uids,
      validator_uids: chainState.validator_uids,
      miner_emission_pool_tao_24h: minerPoolTao24h,
      daily_tao_per_uid: dailyTaoPerUid,
      top10_incentive_share: chainState.top10_incentive_share,
      reg_count_24h: historyData?.registrationCount || 0,
      replace_count_24h: replaceCount,
      turnover_rate_24h: turnoverRate,
      emission_trend_percent: emissionTrendPercent,
      payback_days: dailyTaoPerUid > 0 && chainState.miner_burn_cost > 0
        ? chainState.miner_burn_cost / dailyTaoPerUid
        : null
    });
  }

  return {
    block_number: latestBlockNumber,
    beijing_time: latestBeijingTime,
    observed_blocks_24h: history.observedBlocks,
    history_coverage_ratio: history.coverageRatio,
    subnets
  };
}
