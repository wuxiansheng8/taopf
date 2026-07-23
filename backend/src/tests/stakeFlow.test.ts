import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import sqlite3 from 'sqlite3';
import { open, type Database } from 'sqlite';
import { parseStakeFlowEvents } from '../chain/stakeFlowEventParser.js';
import { SCHEMA_SQL } from '../db/schema.js';
import {
  getStakeFlowPeriod,
  getStakeFlowSummary,
  recordStakeFlowBlock
} from '../services/stakeFlowService.js';

const TODAY_MS = new Date('2026-07-23T10:00:00+08:00').getTime();
const YESTERDAY_MS = TODAY_MS - 24 * 60 * 60 * 1000;

function codec(value: string | number | bigint) {
  return { toString: () => String(value) };
}

function eventRecord(extrinsic: number, method: string, data: Array<string | number | bigint>) {
  return {
    phase: {
      isApplyExtrinsic: true,
      asApplyExtrinsic: { toNumber: () => extrinsic }
    },
    event: {
      section: 'subtensorModule',
      method,
      data: data.map(codec)
    }
  };
}

describe('daily stake flow', () => {
  let db: Database;

  beforeEach(async () => {
    db = await open({ filename: ':memory:', driver: sqlite3.Database });
    await db.exec(SCHEMA_SQL);
  });

  afterEach(async () => {
    await db.close();
  });

  test('uses the Beijing 08:00 cycle boundary', () => {
    const beforeBoundary = getStakeFlowPeriod(new Date('2026-07-23T07:59:59+08:00').getTime());
    const atBoundary = getStakeFlowPeriod(new Date('2026-07-23T08:00:00+08:00').getTime());

    assert.equal(beforeBoundary.dateKey, '2026-07-22');
    assert.equal(atBoundary.dateKey, '2026-07-23');
    assert.equal(atBoundary.startTime, '2026-07-23 08:00:00');
    assert.equal(atBoundary.endTime, '2026-07-24 07:59:59');
  });

  test('records stake and unstake once per physical event', async () => {
    await recordStakeFlowBlock([
      { blockNumber: 100, eventIndex: 4, direction: 'stake', netuid: 1, amountRao: 5_000_000_000n },
      { blockNumber: 100, eventIndex: 8, direction: 'unstake', netuid: 1, amountRao: 2_000_000_000n }
    ], TODAY_MS, db);

    await recordStakeFlowBlock([
      { blockNumber: 100, eventIndex: 4, direction: 'stake', netuid: 1, amountRao: 5_000_000_000n }
    ], TODAY_MS, db);

    const summary = await getStakeFlowSummary(TODAY_MS, db);
    assert.deepEqual(summary.subnets[0], {
      netuid: 1,
      stake_amount: 5,
      unstake_amount: 2,
      net_inflow: 3,
      tx_count: 2
    });
  });

  test('registers a zero-event period for yesterday', async () => {
    await recordStakeFlowBlock([], YESTERDAY_MS, db);

    const summary = await getStakeFlowSummary(TODAY_MS, db);
    assert.equal(summary.summary.yesterday_net_inflow, 0);
  });

  test('keeps integer RAO exact beyond the JavaScript safe integer range', async () => {
    const amountRao = 9_007_199_254_740_993n;
    await recordStakeFlowBlock([
      { blockNumber: 101, eventIndex: 1, direction: 'stake', netuid: 2, amountRao }
    ], TODAY_MS, db);

    const row = await db.get<{ amount_rao: string }>(
      'SELECT CAST(amount_rao AS TEXT) AS amount_rao FROM stake_events_log'
    );
    assert.equal(row?.amount_rao, amountRao.toString());
  });

  test('filters SN0 and uses both legs of a cross-subnet move', () => {
    const records = [
      eventRecord(1, 'StakeRemoved', ['cold', 'hot', 1_000_000_000n, 0, 0, 0]),
      eventRecord(1, 'StakeAdded', ['cold', 'hot', 900_000_000n, 0, 1, 0]),
      eventRecord(2, 'StakeRemoved', ['cold', 'hot', 2_000_000_000n, 0, 1, 0]),
      eventRecord(2, 'StakeAdded', ['cold', 'hot', 1_900_000_000n, 0, 2, 0]),
      eventRecord(2, 'StakeMoved', ['cold', 'hot', 1, 'hot', 2, 2_000_000_000n])
    ];

    assert.deepEqual(parseStakeFlowEvents(records, 200), [
      { blockNumber: 200, eventIndex: 1, direction: 'stake', netuid: 1, amountRao: 900_000_000n },
      { blockNumber: 200, eventIndex: 2, direction: 'unstake', netuid: 1, amountRao: 2_000_000_000n },
      { blockNumber: 200, eventIndex: 3, direction: 'stake', netuid: 2, amountRao: 1_900_000_000n }
    ]);
  });

  test('excludes only the StakeAdded leg matched by AddStakeBurn', () => {
    const records = [
      eventRecord(3, 'StakeAdded', ['cold-a', 'hot-a', 1_000_000_000n, 0, 1, 0]),
      eventRecord(3, 'StakeAdded', ['cold-b', 'hot-b', 2_000_000_000n, 0, 2, 0]),
      eventRecord(3, 'AlphaBurned', ['cold-b', 'hot-b', 3_000_000_000n, 2]),
      eventRecord(3, 'AddStakeBurn', [2, 'hot-b', 2_000_000_000n, 3_000_000_000n])
    ];

    assert.deepEqual(parseStakeFlowEvents(records, 201), [
      { blockNumber: 201, eventIndex: 0, direction: 'stake', netuid: 1, amountRao: 1_000_000_000n }
    ]);
  });
});
