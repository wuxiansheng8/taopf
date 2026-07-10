import { getSetting } from './settingsService.js';
import { logger } from './logService.js';

type TelegramAlertOptions = {
  parseMode?: 'Markdown' | null;
};

export async function sendTelegramAlert(message: string, options: TelegramAlertOptions = { parseMode: 'Markdown' }): Promise<void> {
  const token = await getSetting('telegram_token');
  const chatId = await getSetting('telegram_chat_id');
  const tokenBackup = await getSetting('telegram_token_backup');
  const chatIdBackup = await getSetting('telegram_chat_id_backup');
  
  const sends = [];
  if (token && chatId) {
    sends.push(sendSingleTelegram(token, chatId, message, options));
  }
  if (tokenBackup && chatIdBackup) {
    sends.push(sendSingleTelegram(tokenBackup, chatIdBackup, message, options));
  }
  
  if (sends.length > 0) {
    await Promise.all(sends).catch(err => {
      logger.error(`双通道警报发送失败: ${err.message || String(err)}`);
    });
  }
}

async function sendSingleTelegram(token: string, chatId: string, message: string, options: TelegramAlertOptions): Promise<void> {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const parseMode = options.parseMode === undefined ? 'Markdown' : options.parseMode;
  const body: any = { chat_id: chatId, text: message };
  if (parseMode) {
    body.parse_mode = parseMode;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Bot (${chatId}) 失败: ${errText}`);
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
