import { sendTelegramAlert } from '../services/telegramService.js';
import { formatBeijingTime, logger } from '../services/logService.js';

export function parseBlockEvents(
  events: any[],
  blockNumber: number,
  beijingTime: string = formatBeijingTime()
): void {
  for (const record of events) {
    const { event } = record;
    const section = event.section; 
    const method = event.method;   
    
    // Check for SubnetEmissionEnabledSet
    if (
      (section === 'adminUtils' || section === 'subtensorModule') &&
      method === 'SubnetEmissionEnabledSet'
    ) {
      try {
        const netuid = Number(event.data[0].toString());
        const enabled = event.data[1].toJSON() === true;
        
        const alertMsg = 
          `⚠️ *子网排放状态变更警报*\n` +
          `• 子网 ID: \`Subnet ${netuid}\`\n` +
          `• 当前状态: ${enabled ? '已启用 ✅ (恢复排放)' : '已禁用 ❌ (暂停排放)'}\n` +
          `• 区块高度: \`#${blockNumber}\``;
        
        logger.warn(`监测到子网排放状态变更: Subnet ${netuid} 被设置为 ${enabled ? '启用' : '禁用'}`);
        sendTelegramAlert(alertMsg).catch(err => console.error('Failed to send Telegram alert:', err));
      } catch (err: any) {
        logger.error(`解析 SubnetEmissionEnabledSet 事件出错: ${err.message}`);
      }
    }
    
    // Check for FirstEmissionBlockNumberSet
    if (
      section === 'subtensorModule' && 
      method === 'FirstEmissionBlockNumberSet'
    ) {
      try {
        const netuid = Number(event.data[0].toString());
        const firstBlock = Number(event.data[1].toString());
        const logMsg = `子网 ${netuid} 已执行 start_call，设定首次排放区块为 #${firstBlock}`;
        const alertMsg = `${beijingTime}\n[INFO]\n${logMsg}`;
        
        logger.info(logMsg);
        sendTelegramAlert(alertMsg, { parseMode: null }).catch(err => console.error('Failed to send Telegram alert:', err));
      } catch (err: any) {
        logger.error(`解析 FirstEmissionBlockNumberSet 事件出错: ${err.message}`);
      }
    }
  }
}
