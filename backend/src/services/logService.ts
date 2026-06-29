import { getDb } from '../db/connection.js';
import EventEmitter from 'events';

// Custom event emitter to push log updates in real-time to active SSE connections
export const logEmitter = new EventEmitter();

export async function addLog(level: 'INFO' | 'WARN' | 'ERROR', message: string): Promise<void> {
  const db = await getDb();
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  
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
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
  
  const result = await db.run('DELETE FROM system_logs WHERE timestamp < ?', [twoDaysAgo]);
  return result.changes || 0;
}

// Helper logging methods
export const logger = {
  info: (msg: string) => {
    console.log(`[INFO] ${msg}`);
    addLog('INFO', msg).catch(err => console.error('Failed to log to DB:', err));
  },
  warn: (msg: string) => {
    console.warn(`[WARNING] ${msg}`);
    addLog('WARN', msg).catch(err => console.error('Failed to log to DB:', err));
  },
  error: (msg: string) => {
    console.error(`[ERROR] ${msg}`);
    addLog('ERROR', msg).catch(err => console.error('Failed to log to DB:', err));
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
