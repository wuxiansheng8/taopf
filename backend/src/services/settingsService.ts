import { getDb } from '../db/connection.js';

export async function getSetting(key: string, defaultValue: string = ''): Promise<string> {
  const db = await getDb();
  const row = await db.get('SELECT value FROM settings WHERE key = ?', [key]);
  return row ? row.value : defaultValue;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
}
