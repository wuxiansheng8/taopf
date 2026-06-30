export const SCHEMA_SQL = `
-- 1. 系统设置表
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
);

-- 2. 7200 区块历史排放明细表
CREATE TABLE IF NOT EXISTS emissions_history (
    block_number INTEGER,
    netuid INTEGER,
    enabled INTEGER,
    status TEXT, -- '正常排放' | '禁止排放'
    tao_in REAL,
    alpha_in REAL,
    alpha_out REAL,
    excess_tao REAL,
    subnet_tao REAL,
    subnet_alpha REAL, -- P1: Alpha reserves in the pool
    alpha_price REAL,
    total_neuron_em REAL,
    root_prop REAL DEFAULT 0,
    miner_burned REAL DEFAULT 0,
    moving_price REAL DEFAULT 0,
    registration_allowed INTEGER DEFAULT 1,
    subnetwork_n INTEGER DEFAULT 0,
    max_allowed_uids INTEGER DEFAULT 0,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (block_number, netuid)
);

CREATE INDEX IF NOT EXISTS idx_emissions_history_block ON emissions_history(block_number);

-- 3. 结构化日志表
CREATE TABLE IF NOT EXISTS system_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level TEXT, -- 'INFO' | 'WARN' | 'ERROR'
    message TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;
