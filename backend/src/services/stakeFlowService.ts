import type { Database } from 'sqlite';
import { getDb } from '../db/connection.js';
import { StakeFlowCycleSummary, SubnetStakeFlowData } from '../../../shared/types.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const RAO_PER_TAO = 1_000_000_000n;

export interface ParsedStakeEvent {
  blockNumber: number;
  eventIndex: number;
  direction: 'stake' | 'unstake';
  netuid: number;
  amountRao: bigint;
}

export interface StakeFlowPeriod {
  dateKey: string;
  yesterdayDateKey: string;
  startTime: string;
  endTime: string;
}

function formatUtcDate(timestampMs: number): string {
  return new Date(timestampMs).toISOString().slice(0, 10);
}

export function getStakeFlowPeriod(timestampMs: number): StakeFlowPeriod {
  // Beijing 08:00 is UTC 00:00, so each period aligns with a UTC calendar day.
  const periodStartMs = Math.floor(timestampMs / DAY_MS) * DAY_MS;
  const dateKey = formatUtcDate(periodStartMs);

  return {
    dateKey,
    yesterdayDateKey: formatUtcDate(periodStartMs - DAY_MS),
    startTime: `${dateKey} 08:00:00`,
    endTime: `${formatUtcDate(periodStartMs + DAY_MS)} 07:59:59`
  };
}

async function resolveDb(database?: Database): Promise<Database> {
  return database ?? getDb();
}

export async function recordStakeFlowBlock(
  events: ParsedStakeEvent[],
  blockTimestampMs: number,
  database?: Database
): Promise<void> {
  const db = await resolveDb(database);
  const { dateKey } = getStakeFlowPeriod(blockTimestampMs);
  const validEvents = events.filter(event => event.netuid > 0 && event.amountRao > 0n);

  await db.exec('BEGIN IMMEDIATE TRANSACTION');
  try {
    await db.run('INSERT OR IGNORE INTO stake_flow_periods (date_key) VALUES (?)', [dateKey]);

    for (const event of validEvents) {
      const amountRao = event.amountRao.toString();
      const inserted = await db.run(
        `INSERT OR IGNORE INTO stake_events_log
          (block_number, event_index, direction, netuid, amount_rao, date_key, chain_timestamp_ms)
         VALUES (?, ?, ?, ?, CAST(? AS INTEGER), ?, ?)`,
        [
          event.blockNumber,
          event.eventIndex,
          event.direction,
          event.netuid,
          amountRao,
          dateKey,
          blockTimestampMs
        ]
      );

      if (inserted.changes === 0) continue;

      const stakedRao = event.direction === 'stake' ? amountRao : '0';
      const unstakedRao = event.direction === 'unstake' ? amountRao : '0';
      await db.run(
        `INSERT INTO daily_stake_summary
          (date_key, netuid, staked_rao, unstaked_rao, tx_count)
         VALUES (?, ?, CAST(? AS INTEGER), CAST(? AS INTEGER), 1)
         ON CONFLICT(date_key, netuid) DO UPDATE SET
           staked_rao = staked_rao + excluded.staked_rao,
           unstaked_rao = unstaked_rao + excluded.unstaked_rao,
           tx_count = tx_count + 1`,
        [dateKey, event.netuid, stakedRao, unstakedRao]
      );
    }

    await db.exec('COMMIT');
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
}

function raoToTao(amountRao: bigint): number {
  const sign = amountRao < 0n ? '-' : '';
  const absolute = amountRao < 0n ? -amountRao : amountRao;
  const whole = absolute / RAO_PER_TAO;
  const fraction = (absolute % RAO_PER_TAO).toString().padStart(9, '0');
  return Number(`${sign}${whole}.${fraction}`);
}

export async function getStakeFlowSummary(
  nowMs: number = Date.now(),
  database?: Database
): Promise<StakeFlowCycleSummary> {
  const db = await resolveDb(database);
  const period = getStakeFlowPeriod(nowMs);

  const rows = await db.all<{
    netuid: number;
    staked_rao: string;
    unstaked_rao: string;
    tx_count: number;
  }[]>(
    `SELECT
       netuid,
       CAST(staked_rao AS TEXT) AS staked_rao,
       CAST(unstaked_rao AS TEXT) AS unstaked_rao,
       tx_count
     FROM daily_stake_summary
     WHERE date_key = ?
     ORDER BY netuid`,
    [period.dateKey]
  );

  let totalStakedRao = 0n;
  let totalUnstakedRao = 0n;
  const subnets: SubnetStakeFlowData[] = rows.map(row => {
    const stakedRao = BigInt(row.staked_rao);
    const unstakedRao = BigInt(row.unstaked_rao);
    totalStakedRao += stakedRao;
    totalUnstakedRao += unstakedRao;

    return {
      netuid: row.netuid,
      stake_amount: raoToTao(stakedRao),
      unstake_amount: raoToTao(unstakedRao),
      net_inflow: raoToTao(stakedRao - unstakedRao),
      tx_count: row.tx_count
    };
  });

  const yesterdayPeriod = await db.get<{ date_key: string }>(
    'SELECT date_key FROM stake_flow_periods WHERE date_key = ?',
    [period.yesterdayDateKey]
  );

  let yesterdayNetInflow: number | null = null;
  if (yesterdayPeriod) {
    const row = await db.get<{ net_inflow_rao: string }>(
      `SELECT CAST(COALESCE(SUM(staked_rao - unstaked_rao), 0) AS TEXT) AS net_inflow_rao
       FROM daily_stake_summary
       WHERE date_key = ?`,
      [period.yesterdayDateKey]
    );
    yesterdayNetInflow = raoToTao(BigInt(row?.net_inflow_rao ?? '0'));
  }

  return {
    cycle: {
      date_key: period.dateKey,
      start_time: period.startTime,
      end_time: period.endTime
    },
    summary: {
      today_stake: raoToTao(totalStakedRao),
      today_unstake: raoToTao(totalUnstakedRao),
      today_net_inflow: raoToTao(totalStakedRao - totalUnstakedRao),
      yesterday_net_inflow: yesterdayNetInflow
    },
    subnets
  };
}
