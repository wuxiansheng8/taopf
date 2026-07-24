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

-- 4. 质押事件去重表
CREATE TABLE IF NOT EXISTS stake_events_log (
    block_number INTEGER NOT NULL,
    event_index INTEGER NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('stake', 'unstake')),
    netuid INTEGER NOT NULL CHECK (netuid > 0),
    amount_rao INTEGER NOT NULL CHECK (amount_rao > 0),
    date_key TEXT NOT NULL,
    chain_timestamp_ms INTEGER NOT NULL,
    PRIMARY KEY (block_number, event_index)
) WITHOUT ROWID;

-- 5. 已监听周期表，用于区分零交易和停机
CREATE TABLE IF NOT EXISTS stake_flow_periods (
    date_key TEXT PRIMARY KEY
) WITHOUT ROWID;

-- 6. 每日子网质押流向汇总表
CREATE TABLE IF NOT EXISTS daily_stake_summary (
    date_key TEXT NOT NULL,
    netuid INTEGER NOT NULL CHECK (netuid > 0),
    staked_rao INTEGER NOT NULL DEFAULT 0,
    unstaked_rao INTEGER NOT NULL DEFAULT 0,
    tx_count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (date_key, netuid)
) WITHOUT ROWID;

-- 7. Miner registrations observed while this service is running.
CREATE TABLE IF NOT EXISTS miner_registration_events (
    block_number INTEGER NOT NULL,
    event_index INTEGER NOT NULL,
    netuid INTEGER NOT NULL,
    uid INTEGER NOT NULL,
    is_replacement INTEGER CHECK (is_replacement IN (0, 1)),
    timestamp_ms INTEGER NOT NULL,
    PRIMARY KEY (block_number, event_index)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_miner_events_netuid_time
ON miner_registration_events(netuid, timestamp_ms);

-- 8. Per-block miner pool estimates used for the rolling trend.
CREATE TABLE IF NOT EXISTS miner_emission_snapshots (
    block_number INTEGER NOT NULL,
    netuid INTEGER NOT NULL,
    miner_pool_tao_per_block REAL NOT NULL,
    timestamp_ms INTEGER NOT NULL,
    PRIMARY KEY (block_number, netuid)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_miner_snapshots_netuid_time
ON miner_emission_snapshots(netuid, timestamp_ms);
`;
