import { SubnetBlockData } from '../../../shared/types.js';
import { blockEmitter } from './emissionService.js';
import { logger } from './logService.js';
import { getSetting } from './settingsService.js';
import { sendTelegramAlert } from './telegramService.js';

type BlockData = {
  block_number: number;
  beijing_time: string;
  subnets: SubnetBlockData[];
};

type BurnRateChange = {
  netuid: number;
  previous: number;
  current: number;
};

const TELEGRAM_MESSAGE_LIMIT = 4000;
const MIN_BURN_RATE_CHANGE_PERCENTAGE_POINTS = 1;

let lastBurnRates = new Map<number, number>();
let wasEnabled = false;
let initialized = false;
let blockQueue: Promise<void> = Promise.resolve();
let sendQueue: Promise<void> = Promise.resolve();

function buildCurrentRates(subnets: SubnetBlockData[]): Map<number, number> {
  const currentRates = new Map<number, number>();

  for (const subnet of subnets) {
    const value = subnet.miner_burned;
    if (Number.isFinite(value)) {
      currentRates.set(subnet.netuid, value);
      continue;
    }

    logger.warn(`子网 SN${subnet.netuid} 的矿工燃烧率不是有效数值: ${String(value)}`);

    // Keep the last valid value for a subnet that is still present. Missing
    // subnets are omitted and therefore removed when the snapshot is replaced.
    const previous = lastBurnRates.get(subnet.netuid);
    if (previous !== undefined) {
      currentRates.set(subnet.netuid, previous);
    }
  }

  return currentRates;
}

function findChanges(currentRates: Map<number, number>): BurnRateChange[] {
  const changes: BurnRateChange[] = [];

  for (const [netuid, current] of currentRates) {
    const previous = lastBurnRates.get(netuid);
    const changePercentagePoints = previous === undefined
      ? 0
      : Math.abs(current - previous) * 100;

    if (previous !== undefined && changePercentagePoints >= MIN_BURN_RATE_CHANGE_PERCENTAGE_POINTS) {
      changes.push({ netuid, previous, current });
    }
  }

  return changes;
}

function formatChange(change: BurnRateChange): string {
  const previous = (change.previous * 100).toFixed(6);
  const current = (change.current * 100).toFixed(6);
  const delta = (change.current - change.previous) * 100;
  const direction = delta > 0 ? '增加' : '减少';
  const signedDelta = delta > 0 ? `+${delta.toFixed(6)}` : delta.toFixed(6);

  return `• SN${change.netuid}: 燃烧率${direction} ${signedDelta} 个百分点 (${previous}% -> ${current}%)`;
}

function buildAlertMessages(data: BlockData, changes: BurnRateChange[]): string[] {
  const header = `🔥 子网矿工燃烧率变更警报\n区块高度: #${data.block_number}\n北京时间: ${data.beijing_time}\n\n`;
  const messages: string[] = [];
  let currentMessage = header;

  for (const change of changes) {
    const line = `${formatChange(change)}\n`;
    if (currentMessage.length + line.length > TELEGRAM_MESSAGE_LIMIT && currentMessage !== header) {
      messages.push(currentMessage.trimEnd());
      currentMessage = header;
    }
    currentMessage += line;
  }

  if (currentMessage !== header) {
    messages.push(currentMessage.trimEnd());
  }

  return messages;
}

function enqueueMessages(messages: string[]): void {
  for (const message of messages) {
    sendQueue = sendQueue
      .then(() => sendTelegramAlert(message, { parseMode: null }))
      .catch((err: any) => {
        logger.error(`燃烧率 Telegram 告警发送失败: ${err.message || String(err)}`);
      });
  }
}

async function handleBlock(data: BlockData): Promise<void> {
  const enabled = await getSetting('burn_rate_monitor_enabled', 'false') === 'true';

  if (!enabled) {
    if (wasEnabled) {
      lastBurnRates.clear();
      wasEnabled = false;
      logger.info('燃烧率监控已关闭，基线已清空');
    }
    return;
  }

  const currentRates = buildCurrentRates(data.subnets);

  if (!wasEnabled) {
    lastBurnRates = currentRates;
    wasEnabled = true;
    logger.info(`燃烧率监控已开启，已在区块 #${data.block_number} 建立 ${currentRates.size} 个子网的基线`);
    return;
  }

  const changes = findChanges(currentRates);
  lastBurnRates = currentRates;

  if (changes.length > 0) {
    logger.warn(`区块 #${data.block_number} 检测到 ${changes.length} 个子网燃烧率变化`);
    enqueueMessages(buildAlertMessages(data, changes));
  }
}

export function initBurnRateMonitor(): void {
  if (initialized) return;
  initialized = true;

  logger.info('正在初始化子网矿工燃烧率监控服务...');
  blockEmitter.on('block', (data: BlockData) => {
    blockQueue = blockQueue
      .then(() => handleBlock(data))
      .catch((err: any) => {
        logger.error(`燃烧率监控处理区块 #${data.block_number} 失败: ${err.message || String(err)}`);
      });
  });
}
