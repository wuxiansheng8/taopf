import { getSetting } from './settingsService.js';
import { logger } from './logService.js';

let lastAlertTime = 0;
let isSending = false;

// 底层标准事件推流函数，避免测试接口与常规调用代码重复
export async function postFlashdutyEvent(webhook: string, title: string, description: string, alertKey: string): Promise<void> {
  const res = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event_status: 'Warning',
      title,
      description,
      alert_key: alertKey
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`FlashDuty API 报错: ${errText || res.statusText}`);
  }
}

// 供常规监控流程调用，带并发锁和冷却校验
export async function sendFlashdutyAlert(title: string, description: string, alertKey: string): Promise<void> {
  if (isSending) {
    logger.info('FlashDuty 告警正在发送中，已合并本次触发。');
    return;
  }

  // 立即占锁，避免在接下来的 await 数据库查询期间发生并发穿透
  isSending = true;

  try {
    const enabled = await getSetting('flashduty_enabled', 'false');
    if (enabled !== 'true') return;

    const webhook = await getSetting('flashduty_webhook', '');
    if (!webhook) return;

    const now = Date.now();
    const rawCooldown = await getSetting('flashduty_cooldown', '300');
    let cooldownSec = parseInt(rawCooldown, 10);
    if (isNaN(cooldownSec) || cooldownSec < 0) {
      cooldownSec = 300;
    }

    if (now - lastAlertTime < cooldownSec * 1000) {
      logger.info(`FlashDuty 告警处于全局冷却状态，已跳过本次触发。`);
      return;
    }

    await postFlashdutyEvent(webhook, title, description, alertKey);
    // 成功后才更新冷却时间
    lastAlertTime = Date.now();
    logger.info(`FlashDuty 电话告警已成功触发！标题: "${title}"`);
  } catch (err: any) {
    logger.error(`FlashDuty 电话告警发送错误: ${err.message}`);
  } finally {
    isSending = false;
  }
}
