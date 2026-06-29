import { getDb } from '../db/connection.js';
import { SubnetBlockData, BlockEmissionRecord } from '../../../shared/types.js';
import { logger } from './logService.js';
import { EventEmitter } from 'events';

export const blockEmitter = new EventEmitter();

const ROLLING_LIMIT = 7200; // 24 hours of blocks at 12s per block
const ROLLING_BUFFER: { block_number: number; subnets: { [netuid: number]: any } }[] = [];

// Running sum of emissions over the sliding window
const RUNNING_SUM: {
  [netuid: number]: {
    tao_in: number;
    alpha_in: number;
    alpha_out: number;
    excess_tao: number;
    total_neuron_em: number;
  };
} = {};

let CURRENT_BLOCK_DATA: BlockEmissionRecord = {
  block_number: 0,
  beijing_time: '',
  subnets: []
};

const uptimeStart = Date.now();

function getEmissionValue(subnet: Pick<SubnetBlockData, 'tao_in' | 'excess_tao' | 'total_neuron_em'>): number {
  return (subnet.tao_in || 0) + (subnet.excess_tao || 0) + (subnet.total_neuron_em || 0);
}

function withEmissionShares(subnets: SubnetBlockData[]): SubnetBlockData[] {
  const totalEmission = subnets.reduce((sum, subnet) => sum + getEmissionValue(subnet), 0);
  return subnets.map((subnet) => ({
    ...subnet,
    emission_share: totalEmission > 0 ? getEmissionValue(subnet) / totalEmission : 0
  }));
}

// Load sliding window cache from SQLite
export async function initEmissionsCache(): Promise<void> {
  const db = await getDb();
  try {
    const blockNumbersRow = await db.all('SELECT DISTINCT block_number FROM emissions_history ORDER BY block_number DESC LIMIT ?', [ROLLING_LIMIT]);
    if (blockNumbersRow.length === 0) {
      logger.info('数据库为空，未加载历史排放缓存');
      return;
    }
    
    // Sort block numbers ascendingly
    const blockNumbers = blockNumbersRow.map(r => r.block_number).reverse();
    
    logger.info(`加载中... 发现数据库中存有 ${blockNumbers.length} 个历史区块`);
    
    for (const bNum of blockNumbers) {
      const rows = await db.all('SELECT * FROM emissions_history WHERE block_number = ?', [bNum]);
      const blockData: { [netuid: number]: any } = {};
      
      for (const row of rows) {
        const netuid = row.netuid;
        const metrics = {
          tao_in: row.tao_in,
          alpha_in: row.alpha_in,
          alpha_out: row.alpha_out,
          excess_tao: row.excess_tao,
          total_neuron_em: row.total_neuron_em
        };
        blockData[netuid] = metrics;
        
        if (!RUNNING_SUM[netuid]) {
          RUNNING_SUM[netuid] = { tao_in: 0, alpha_in: 0, alpha_out: 0, excess_tao: 0, total_neuron_em: 0 };
        }
        RUNNING_SUM[netuid].tao_in += metrics.tao_in;
        RUNNING_SUM[netuid].alpha_in += metrics.alpha_in;
        RUNNING_SUM[netuid].alpha_out += metrics.alpha_out;
        RUNNING_SUM[netuid].excess_tao += metrics.excess_tao;
        RUNNING_SUM[netuid].total_neuron_em += metrics.total_neuron_em;
      }
      ROLLING_BUFFER.push({ block_number: bNum, subnets: blockData });
    }

    const latestBNum = blockNumbers[blockNumbers.length - 1];
    const latestRows = await db.all('SELECT * FROM emissions_history WHERE block_number = ?', [latestBNum]);
    const timeStr = latestRows[0]?.timestamp || new Date().toISOString().replace('T', ' ').substring(0, 19);
    
    CURRENT_BLOCK_DATA = {
      block_number: latestBNum,
      beijing_time: timeStr,
      subnets: withEmissionShares(latestRows.map(row => ({
        netuid: row.netuid,
        enabled: row.enabled === 1,
        status: row.enabled === 1 ? '正常排放' : '禁止排放',
        owner: row.owner,
        tao_in: row.tao_in,
        alpha_in: row.alpha_in,
        alpha_out: row.alpha_out,
        excess_tao: row.excess_tao,
        emission_share: 0,
        subnet_tao: row.subnet_tao,
        subnet_alpha: row.subnet_alpha || 0,
        alpha_price: row.alpha_price,
        total_neuron_em: row.total_neuron_em,
        root_prop: row.root_prop || 0,
        miner_burned: row.miner_burned || 0,
        moving_price: row.moving_price || 0
      })))
    };
    logger.info(`已同步初始化最新区块数据为 #${latestBNum} (${CURRENT_BLOCK_DATA.subnets.length} 个子网)`);
    logger.info(`缓存加载完成。范围: #${ROLLING_BUFFER[0].block_number} 至 #${ROLLING_BUFFER[ROLLING_BUFFER.length - 1].block_number}`);
  } catch (err: any) {
    logger.error(`加载排放缓存出错: ${err.message}`);
  }
}

// Add new block emissions, write to DB, and slide the cache window
export async function addBlockEmissions(blockNumber: number, beijingTime: string, subnets: SubnetBlockData[]): Promise<void> {
  if (blockNumber <= CURRENT_BLOCK_DATA.block_number) {
    logger.warn(`检测到重复或旧区块 #${blockNumber}，已跳过数据落盘与累加（当前最新区块: #${CURRENT_BLOCK_DATA.block_number}）`);
    return;
  }
  const subnetsWithShares = withEmissionShares(subnets);
  const db = await getDb();
  // 1. Insert into database using transactions for reliability
  await db.run('BEGIN TRANSACTION');
  try {
    for (const sub of subnetsWithShares) {
      await db.run(
        `INSERT OR REPLACE INTO emissions_history 
        (block_number, netuid, enabled, status, owner, tao_in, alpha_in, alpha_out, excess_tao, subnet_tao, subnet_alpha, alpha_price, total_neuron_em, root_prop, miner_burned, moving_price, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          blockNumber, sub.netuid, sub.enabled ? 1 : 0, sub.status, sub.owner,
          sub.tao_in, sub.alpha_in, sub.alpha_out, sub.excess_tao, sub.subnet_tao, sub.subnet_alpha, sub.alpha_price, sub.total_neuron_em,
          sub.root_prop, sub.miner_burned, sub.moving_price, beijingTime
        ]
      );
    }
    await db.run('COMMIT');
  } catch (err: any) {
    await db.run('ROLLBACK');
    logger.error(`写入数据库出错: ${err.message}`);
    throw err;
  }

  // Update in-memory ROLLING_BUFFER & RUNNING_SUM
  const blockMemoryData: { [netuid: number]: any } = {};
  for (const sub of subnetsWithShares) {
    blockMemoryData[sub.netuid] = {
      tao_in: sub.tao_in,
      alpha_in: sub.alpha_in,
      alpha_out: sub.alpha_out,
      excess_tao: sub.excess_tao,
      total_neuron_em: sub.total_neuron_em
    };
    
    if (!RUNNING_SUM[sub.netuid]) {
      RUNNING_SUM[sub.netuid] = { tao_in: 0, alpha_in: 0, alpha_out: 0, excess_tao: 0, total_neuron_em: 0 };
    }
    RUNNING_SUM[sub.netuid].tao_in += sub.tao_in;
    RUNNING_SUM[sub.netuid].alpha_in += sub.alpha_in;
    RUNNING_SUM[sub.netuid].alpha_out += sub.alpha_out;
    RUNNING_SUM[sub.netuid].excess_tao += sub.excess_tao;
    RUNNING_SUM[sub.netuid].total_neuron_em += sub.total_neuron_em;
  }
  ROLLING_BUFFER.push({ block_number: blockNumber, subnets: blockMemoryData });

  // Slide window
  if (ROLLING_BUFFER.length > ROLLING_LIMIT) {
    const oldBlock = ROLLING_BUFFER.shift();
    if (oldBlock) {
      for (const [netuidStr, metrics] of Object.entries(oldBlock.subnets)) {
        const netuid = parseInt(netuidStr);
        if (RUNNING_SUM[netuid]) {
          RUNNING_SUM[netuid].tao_in = Math.max(0, RUNNING_SUM[netuid].tao_in - metrics.tao_in);
          RUNNING_SUM[netuid].alpha_in = Math.max(0, RUNNING_SUM[netuid].alpha_in - metrics.alpha_in);
          RUNNING_SUM[netuid].alpha_out = Math.max(0, RUNNING_SUM[netuid].alpha_out - metrics.alpha_out);
          RUNNING_SUM[netuid].excess_tao = Math.max(0, RUNNING_SUM[netuid].excess_tao - metrics.excess_tao);
          RUNNING_SUM[netuid].total_neuron_em = Math.max(0, RUNNING_SUM[netuid].total_neuron_em - metrics.total_neuron_em);
        }
      }
    }
  }

  CURRENT_BLOCK_DATA = { block_number: blockNumber, beijing_time: beijingTime, subnets: subnetsWithShares };

  try {
    const oldestBlock = blockNumber - ROLLING_LIMIT;
    await db.run('DELETE FROM emissions_history WHERE block_number <= ?', [oldestBlock]);
  } catch (err: any) {
    logger.error(`清理数据库过期区块记录出错: ${err.message}`);
  }

  blockEmitter.emit('block', {
    event: 'block',
    block_number: blockNumber,
    beijing_time: beijingTime,
    uptime: Math.floor((Date.now() - uptimeStart) / 1000),
    subnets: subnetsWithShares
  });
}

export function getCurrentBlockEmissions(): BlockEmissionRecord {
  return CURRENT_BLOCK_DATA;
}

export function get24hAggregatedEmissions(): SubnetBlockData[] {
  if (ROLLING_BUFFER.length === 0) return [];
  const output: SubnetBlockData[] = [];
  
  for (const currentSub of CURRENT_BLOCK_DATA.subnets) {
    const netuid = currentSub.netuid;
    const sums = RUNNING_SUM[netuid] || { tao_in: 0, alpha_in: 0, alpha_out: 0, excess_tao: 0, total_neuron_em: 0 };
    output.push({
      netuid,
      enabled: currentSub.enabled,
      status: currentSub.status,
      owner: currentSub.owner,
      tao_in: sums.tao_in,
      alpha_in: sums.alpha_in,
      alpha_out: sums.alpha_out,
      excess_tao: sums.excess_tao,
      emission_share: 0,
      subnet_tao: currentSub.subnet_tao,
      subnet_alpha: currentSub.subnet_alpha,
      alpha_price: currentSub.alpha_price,
      total_neuron_em: sums.total_neuron_em,
      root_prop: currentSub.root_prop,
      miner_burned: currentSub.miner_burned,
      moving_price: currentSub.moving_price
    });
  }
  return withEmissionShares(output);
}
