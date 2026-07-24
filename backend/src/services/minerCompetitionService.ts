import { getDb } from '../db/connection.js';
import {
  MinerCompetitionSnapshot,
  MinerCompetitionSubnet,
  SubnetBlockData
} from '../../../shared/types.js';
import { ParsedMinerRegEvent } from '../chain/minerEventParser.js';
import { MinerCompetitionChainState } from '../chain/minerCompetitionReader.js';
import { formatBeijingTime } from './logService.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const HALF_DAY_MS = 12 * 60 * 60 * 1000;
const EXPECTED_BLOCKS_PER_DAY = 7200;

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
let latestBlockTimestampMs = 0;
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
  const db = await getDb();
  const classifiedEvents = classifyMinerRegistrationEvents(input.events, input.previousSubnetworkN);
  const cutoff24h = input.blockTimestampMs - DAY_MS;

  await db.exec('BEGIN TRANSACTION');
  try {
    for (const event of classifiedEvents) {
      await db.run(
        `INSERT OR IGNORE INTO miner_registration_events
         (block_number, event_index, netuid, uid, is_replacement, timestamp_ms)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          event.blockNumber,
          event.eventIndex,
          event.netuid,
          event.uid,
          event.isReplacement === null ? null : event.isReplacement ? 1 : 0,
          input.blockTimestampMs
        ]
      );
    }

    for (const subnet of input.subnets) {
      await db.run(
        `INSERT OR REPLACE INTO miner_emission_snapshots
         (block_number, netuid, miner_pool_tao_per_block, timestamp_ms)
         VALUES (?, ?, ?, ?)`,
        [input.blockNumber, subnet.netuid, calculateMinerPoolTaoPerBlock(subnet), input.blockTimestampMs]
      );
    }

    if (input.blockNumber % EXPECTED_BLOCKS_PER_DAY === 0) {
      await db.run('DELETE FROM miner_registration_events WHERE timestamp_ms < ?', [cutoff24h]);
      await db.run('DELETE FROM miner_emission_snapshots WHERE timestamp_ms < ?', [cutoff24h]);
    }
    await db.exec('COMMIT');
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }

  latestBlockNumber = input.blockNumber;
  latestBlockTimestampMs = input.blockTimestampMs;
  latestBeijingTime = formatBeijingTime(new Date(input.blockTimestampMs));
  currentChainState = new Map(input.chainState.map(state => [state.netuid, state]));
  currentSubnets = new Map(input.subnets.map(subnet => [subnet.netuid, subnet]));
}

export async function getMinerCompetitionData(): Promise<MinerCompetitionSnapshot | null> {
  if (latestBlockNumber === 0 || currentChainState.size === 0) return null;

  const db = await getDb();
  const cutoff24h = latestBlockTimestampMs - DAY_MS;
  const cutoff12h = latestBlockTimestampMs - HALF_DAY_MS;

  const coverageRow = await db.get<{ observed_blocks: number }>(
    `SELECT COUNT(DISTINCT block_number) AS observed_blocks
     FROM miner_emission_snapshots WHERE timestamp_ms >= ?`,
    [cutoff24h]
  );
  const observedBlocks = coverageRow?.observed_blocks || 0;
  const historyCoverageRatio = Math.min(1, observedBlocks / EXPECTED_BLOCKS_PER_DAY);

  const eventRows = await db.all<{
    netuid: number;
    reg_count: number;
    replace_count: number;
    unknown_count: number;
  }[]>(
    `SELECT netuid,
       COUNT(*) AS reg_count,
       SUM(CASE WHEN is_replacement = 1 THEN 1 ELSE 0 END) AS replace_count,
       SUM(CASE WHEN is_replacement IS NULL THEN 1 ELSE 0 END) AS unknown_count
     FROM miner_registration_events WHERE timestamp_ms >= ? GROUP BY netuid`,
    [cutoff24h]
  );
  const eventMap = new Map(eventRows.map(row => [row.netuid, row]));

  const trendRows = await db.all<{
    netuid: number;
    recent_avg: number | null;
    previous_avg: number | null;
  }[]>(
    `SELECT netuid,
       AVG(CASE WHEN timestamp_ms >= ? THEN miner_pool_tao_per_block END) AS recent_avg,
       AVG(CASE WHEN timestamp_ms < ? THEN miner_pool_tao_per_block END) AS previous_avg
     FROM miner_emission_snapshots WHERE timestamp_ms >= ? GROUP BY netuid`,
    [cutoff12h, cutoff12h, cutoff24h]
  );
  const trendMap = new Map(trendRows.map(row => [row.netuid, row]));

  const subnets: MinerCompetitionSubnet[] = [];
  for (const [netuid, subnet] of currentSubnets) {
    const chainState = currentChainState.get(netuid);
    if (!chainState) continue;

    const eventData = eventMap.get(netuid);
    const trendData = trendMap.get(netuid);
    const minerPoolTao24h = calculateMinerPoolTaoPerBlock(subnet) * EXPECTED_BLOCKS_PER_DAY;
    const dailyTaoPerUid = subnet.subnetwork_n > 0
      ? minerPoolTao24h / subnet.subnetwork_n
      : 0;
    const replaceCount = (eventData?.unknown_count || 0) > 0
      ? null
      : eventData?.replace_count || 0;
    const turnoverRate = replaceCount !== null && subnet.max_allowed_uids > 0
      ? (replaceCount / subnet.max_allowed_uids) * 100
      : null;

    const recentAverage = trendData?.recent_avg;
    const previousAverage = trendData?.previous_avg;
    let emissionTrendPercent: number | null = null;
    if (
      historyCoverageRatio >= 0.95
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
      miner_emission_pool_tao_24h: minerPoolTao24h,
      daily_tao_per_uid: dailyTaoPerUid,
      top10_incentive_share: chainState.top10_incentive_share,
      reg_count_24h: eventData?.reg_count || 0,
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
    observed_blocks_24h: observedBlocks,
    history_coverage_ratio: historyCoverageRatio,
    subnets
  };
}
