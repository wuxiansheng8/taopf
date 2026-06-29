import path from 'path';
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { fileURLToPath } from 'url';
import { SCHEMA_SQL } from './schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Go up 3 levels: src/db -> src -> backend -> taopf/taopf.db (or dist/db -> dist -> backend -> taopf/taopf.db)
const DB_PATH = path.join(__dirname, '..', '..', '..', 'taopf.db');

let dbInstance: Database | null = null;

export async function getDb(): Promise<Database> {
  if (dbInstance) return dbInstance;
  
  dbInstance = await open({
    filename: DB_PATH,
    driver: sqlite3.Database
  });

  // Enable WAL (Write-Ahead Logging) mode for performance
  await dbInstance.exec("PRAGMA journal_mode=WAL;");
  
  // Initialize Schema directly from embedded SQL string
  await dbInstance.exec(SCHEMA_SQL);
  
  // Migration: append Spec 421/423 columns to older emissions_history tables.
  for (const col of [
    'subnet_alpha REAL DEFAULT 0',
    'root_prop REAL DEFAULT 0',
    'miner_burned REAL DEFAULT 0',
    'moving_price REAL DEFAULT 0'
  ]) {
    try {
      await dbInstance.exec(`ALTER TABLE emissions_history ADD COLUMN ${col};`);
    } catch (err: any) {
      if (!err.message.includes('duplicate column name') && !err.message.includes('already exists')) {
        throw err;
      }
    }
  }
  
  return dbInstance;
}
