import { getSetting } from './settingsService.js';
import { logger } from './logService.js';

export async function sendTelegramAlert(message: string): Promise<void> {
  const token = await getSetting('telegram_token');
  const chatId = await getSetting('telegram_chat_id');
  
  if (!token || !chatId) return;
  
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown'
      })
    });
    
    if (!res.ok) {
      const errText = await res.text();
      logger.error(`Telegram 发送失败: ${errText}`);
    }
  } catch (err: any) {
    logger.error(`Telegram 连接出错: ${err.message}`);
  }
}

export async function testTelegramBot(token: string, chatId: string): Promise<{ success: boolean; message: string }> {
  if (!token || !chatId) {
    return { success: false, message: 'Token 和 Chat ID 不能为空' };
  }
  
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: '🤖 Bittensor (TAO) 子网排放监控系统：Telegram 机器人测试连接成功！'
      })
    });
    
    const data: any = await res.json();
    if (res.ok && data.ok) {
      return { success: true, message: '测试消息发送成功，请前往 Telegram 确认。' };
    } else {
      return { success: false, message: `Telegram API 报错: ${data.description || '未知错误'}` };
    }
  } catch (err: any) {
    return { success: false, message: `网络请求失败: ${err.message}` };
  }
}
