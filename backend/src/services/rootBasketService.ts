import { ApiDecoration } from '@polkadot/api/types';
import { RootBasketOverview, RootBasketSubnetDetail } from '../../../shared/types.js';
import { getDb } from '../db/connection.js';
import { readRootBasketSnapshot, RootBasketChainSnapshot } from '../chain/rootBasketReader.js';
import { calculateOverview, RootBasketClaimSell24h, RootBasketHistoryPoint, validatorDetails } from './rootBasketCalculator.js';
import { formatBeijingTime, logger } from './logService.js';
import { sendTelegramAlert } from './telegramService.js';

let latestOverview: RootBasketOverview | null = null;
let latestSnapshot: RootBasketChainSnapshot | null = null;
let history = new Map<number, RootBasketHistoryPoint[]>();
const weightChanges = new Map<string, string>();
const previousWeights = new Map<string, number>();
const claimSellHistory = new Map<number, Array<{ sampled_at_ms: number; sold_tao: number }>>();

export async function initRootBasketService(): Promise<void> {
  const db = await getDb();
  const rows = await db.all<RootBasketHistoryPoint[]>(
    'SELECT sampled_at_ms, block_number, netuid, basket_alpha, alpha_price, estimated_income_24h_tao FROM root_basket_snapshots WHERE sampled_at_ms >= ? ORDER BY sampled_at_ms ASC',
    [Date.now() - 24 * 60 * 60 * 1000]
  );
  history = new Map();
  for (const row of rows) {
    const items = history.get(row.netuid) || [];
    items.push(row);
    history.set(row.netuid, items);
  }
  const claimRows = await db.all<Array<{ netuid: number; sampled_at_ms: number; sold_tao: number }>>(
    'SELECT netuid, sampled_at_ms, sold_tao FROM root_basket_claim_sells WHERE sampled_at_ms >= ? AND sold_tao > 0 ORDER BY sampled_at_ms ASC',
    [Date.now() - 24 * 60 * 60 * 1000]
  );
  claimSellHistory.clear();
  for (const row of claimRows) {
    const items = claimSellHistory.get(row.netuid) || [];
    items.push({ sampled_at_ms: row.sampled_at_ms, sold_tao: row.sold_tao });
    claimSellHistory.set(row.netuid, items);
  }
}

function getClaimSell24h(timestampMs: number): RootBasketClaimSell24h {
  const cutoff = timestampMs - 24 * 60 * 60 * 1000;
  return new Map([...claimSellHistory.entries()].map(([netuid, rows]) => [
    netuid,
    rows.filter((row) => row.sampled_at_ms >= cutoff).reduce((sum, row) => sum + row.sold_tao, 0)
  ]));
}

function detectWeightChanges(snapshot: RootBasketChainSnapshot): void {
  const seen = new Set<string>();
  for (const validator of snapshot.validators) {
    for (const item of validator.weights) {
      const key = `${validator.hotkey}:${item.netuid}`;
      seen.add(key);
      const previous = previousWeights.get(key);
      if (previous !== undefined && Math.abs(item.share - previous) >= 0.05) {
        weightChanges.set(key, formatBeijingTime(new Date(snapshot.timestamp_ms)));
        sendTelegramAlert([
          'Root验证者权重调整',
          '',
          `验证者：${validator.hotkey}`,
          `子网：SN${item.netuid}`,
          `权重：${(previous * 100).toFixed(2)}% → ${(item.share * 100).toFixed(2)}%`,
          `变化：${item.share >= previous ? '+' : ''}${((item.share - previous) * 100).toFixed(2)}个百分点`,
          `时间：${formatBeijingTime(new Date(snapshot.timestamp_ms))}`
        ].join('\n'), { type: 'root_weight_change', parseMode: null }).catch((error) => logRootBasketError(error));
      }
      previousWeights.set(key, item.share);
    }
  }
  for (const [key, previous] of previousWeights) {
    if (seen.has(key) || previous < 0.05) continue;
    weightChanges.set(key, formatBeijingTime(new Date(snapshot.timestamp_ms)));
    sendTelegramAlert([
      'Root验证者权重调整', '', `验证者：${key.split(':')[0]}`, `子网：SN${key.split(':')[1]}`,
      `权重：${(previous * 100).toFixed(2)}% → 0.00%`,
      `变化：-${(previous * 100).toFixed(2)}个百分点`,
      `时间：${formatBeijingTime(new Date(snapshot.timestamp_ms))}`
    ].join('\n'), { type: 'root_weight_change', parseMode: null }).catch((error) => logRootBasketError(error));
    previousWeights.set(key, 0);
  }
}

export async function recordRootBasketBlock(
  apiAt: ApiDecoration<'promise'>,
  blockNumber: number,
  timestampMs: number,
  subnets: Array<{ netuid: number; subnet_name?: string; subnet_tao: number; alpha_price: number; root_income_tao: number }>
): Promise<void> {
  const snapshot = await readRootBasketSnapshot(apiAt, blockNumber, timestampMs, subnets);
  detectWeightChanges(snapshot);
  const now = snapshot.timestamp_ms;
  const db = await getDb();
  for (const subnet of snapshot.subnets) {
    if (subnet.root_claim_sell_tao > 0) {
      await db.run(
        'INSERT OR REPLACE INTO root_basket_claim_sells (block_number, netuid, sold_tao, sampled_at_ms) VALUES (?, ?, ?, ?)',
        [blockNumber, subnet.netuid, subnet.root_claim_sell_tao, now]
      );
      const claimItems = claimSellHistory.get(subnet.netuid) || [];
      claimItems.push({ sampled_at_ms: now, sold_tao: subnet.root_claim_sell_tao });
      claimSellHistory.set(
        subnet.netuid,
        claimItems.filter((item) => item.sampled_at_ms >= now - 24 * 60 * 60 * 1000)
      );
    }
    const basketAlpha = snapshot.validators.reduce((sum, validator) => {
      return sum + validator.holdings.filter((holding) => holding.netuid === subnet.netuid)
        .reduce((holdingSum, holding) => holdingSum + holding.alpha, 0);
    }, 0);
    const income24h = subnet.root_income_tao * 7200;
    const previousIncome = history.get(subnet.netuid)?.at(-1)?.estimated_income_24h_tao;
    if (previousIncome !== undefined && previousIncome !== null && Math.abs(income24h - previousIncome) >= 200) {
      sendTelegramAlert([
        'Root篮子预计24小时收益变化',
        '',
        `子网：SN${subnet.netuid}`,
        `预计24小时收益：${previousIncome.toFixed(2)}T → ${income24h.toFixed(2)}T`,
        `变化：${income24h >= previousIncome ? '+' : ''}${(income24h - previousIncome).toFixed(2)}T`,
        `时间：${formatBeijingTime(new Date(snapshot.timestamp_ms))}`
      ].join('\n'), { type: 'root_income_change', parseMode: null }).catch((error) => logRootBasketError(error));
    }
    await db.run(
      'INSERT OR REPLACE INTO root_basket_snapshots (sampled_at_ms, block_number, netuid, basket_alpha, alpha_price, estimated_income_24h_tao) VALUES (?, ?, ?, ?, ?, ?)',
      [now, blockNumber, subnet.netuid, basketAlpha, subnet.alpha_price, income24h]
    );
    const items = history.get(subnet.netuid) || [];
    items.push({ netuid: subnet.netuid, sampled_at_ms: now, block_number: blockNumber, basket_alpha: basketAlpha, alpha_price: subnet.alpha_price, estimated_income_24h_tao: income24h });
    history.set(subnet.netuid, items.slice(-17280));
  }
  latestOverview = calculateOverview(snapshot, history, getClaimSell24h(now));
  latestSnapshot = snapshot;
}

export function getRootBasketOverview(): RootBasketOverview | null {
  return latestOverview;
}

export function getRootBasketSubnetDetail(netuid: number): RootBasketSubnetDetail | null {
  if (!latestSnapshot) return null;
  return validatorDetails(latestSnapshot, netuid, weightChanges);
}

export function logRootBasketError(error: unknown): void {
  logger.error(`Root篮子数据处理失败: ${error instanceof Error ? error.message : String(error)}`);
}
