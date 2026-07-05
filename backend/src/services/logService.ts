import { getDb } from '../db/connection.js';
import EventEmitter from 'events';

// Custom event emitter to push log updates in real-time to active SSE connections
export const logEmitter = new EventEmitter();

const beijingTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  hourCycle: 'h23'
});

export function formatBeijingTime(date: Date = new Date()): string {
  const parts = Object.fromEntries(
    beijingTimeFormatter.formatToParts(date).map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

export async function addLog(level: 'INFO' | 'WARN' | 'ERROR', message: string, timestamp = formatBeijingTime()): Promise<void> {
  const db = await getDb();
  
  await db.run('INSERT INTO system_logs (level, message, timestamp) VALUES (?, ?, ?)', [level, message, timestamp]);
  
  // Emit SSE log event
  logEmitter.emit('log', { level, message, timestamp });
}

export async function getLogs(levelFilter?: string, limit: number = 200): Promise<any[]> {
  const db = await getDb();
  if (levelFilter && levelFilter !== 'ALL') {
    return db.all('SELECT level, message, timestamp FROM system_logs WHERE level = ? ORDER BY id DESC LIMIT ?', [levelFilter, limit]);
  }
  return db.all('SELECT level, message, timestamp FROM system_logs ORDER BY id DESC LIMIT ?', [limit]);
}

export async function pruneOldLogs(): Promise<number> {
  const db = await getDb();
  const twoDaysAgo = formatBeijingTime(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000));
  
  const result = await db.run('DELETE FROM system_logs WHERE timestamp < ?', [twoDaysAgo]);
  return result.changes || 0;
}

// Helper logging methods
export const logger = {
  info: (msg: string) => {
    const timestamp = formatBeijingTime();
    console.log(`${timestamp} [INFO] ${msg}`);
    addLog('INFO', msg, timestamp).catch(err => console.error('Failed to log to DB:', err));
  },
  warn: (msg: string) => {
    const timestamp = formatBeijingTime();
    console.warn(`${timestamp} [WARN] ${msg}`);
    addLog('WARN', msg, timestamp).catch(err => console.error('Failed to log to DB:', err));
  },
  error: (msg: string) => {
    const timestamp = formatBeijingTime();
    console.error(`${timestamp} [ERROR] ${msg}`);
    addLog('ERROR', msg, timestamp).catch(err => console.error('Failed to log to DB:', err));
  }
};

// Start background pruner thread/loop (run every hour)
export function startLogPruner() {
  setInterval(async () => {
    try {
      const pruned = await pruneOldLogs();
      if (pruned > 0) {
        logger.info(`清理了超过2天的历史日志数量: ${pruned} 条。`);
      }
    } catch (err: any) {
      console.error('Log pruner failed:', err);
    }
  }, 3600 * 1000);
}
