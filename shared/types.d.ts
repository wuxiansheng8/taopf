export interface SubnetBlockData {
  netuid: number;
  enabled: boolean;
  status: '正常排放' | '禁止排放';
  tao_in: number;
  alpha_in: number;
  alpha_out: number;
  excess_tao: number;
  emission_share: number;
  subnet_tao: number;
  subnet_alpha: number;
  alpha_price: number;
  total_neuron_em: number;
  root_prop: number;
  miner_burned: number;
  moving_price: number;
  registration_allowed: boolean;
  subnetwork_n: number;
  max_allowed_uids: number;
  subnet_name?: string;
  owner_cut?: number;
}

export interface BlockEmissionRecord {
  block_number: number;
  beijing_time: string;
  subnets: SubnetBlockData[];
}

export interface LiquidationSubnet {
  netuid: number;
  subnet_name: string;
  moving_price: number;
  registered_block: number;
  immunity_end_block: number;
  locked_tao: number;
  remaining_blocks: number;
  remaining_seconds: number;
  is_immune: boolean;
}

export interface LiquidationSnapshot {
  block_number: number;
  beijing_time: string;
  total_networks: number;
  subnet_limit: number;
  current_lock_cost: number;
  network_immunity_period: number;
  prune_candidate: LiquidationSubnet | null;
  immune_count: number;
  non_immune_count: number;
  lowest_ema_subnets: LiquidationSubnet[];
  immune_subnets: LiquidationSubnet[];
}

export interface SubnetStakeFlowData {
  netuid: number;
  stake_amount: number;
  unstake_amount: number;
  net_inflow: number;
  tx_count: number;
}

export interface StakeFlowCycleSummary {
  cycle: {
    date_key: string;
    start_time: string;
    end_time: string;
  };
  summary: {
    today_stake: number;
    today_unstake: number;
    today_net_inflow: number;
    yesterday_net_inflow: number | null;
  };
  subnets: SubnetStakeFlowData[];
}

export interface MinerCompetitionSubnet {
  netuid: number;
  subnet_name: string;
  registration_allowed: boolean;
  miner_burn_cost: number;
  uid_immunity_period: number;
  miner_burned: number;
  subnetwork_n: number;
  max_allowed_uids: number;
  active_uids: number;
  rewarded_uids: number;
  validator_uids: number;
  miner_emission_pool_tao_24h: number;
  daily_tao_per_uid: number;
  top10_incentive_share: number;
  reg_count_24h: number;
  replace_count_24h: number | null;
  turnover_rate_24h: number | null;
  emission_trend_percent: number | null;
  payback_days: number | null;
}

export interface MinerCompetitionSnapshot {
  block_number: number;
  beijing_time: string;
  observed_blocks_24h: number;
  history_coverage_ratio: number;
  subnets: MinerCompetitionSubnet[];
}

export interface RootBasketSubnetRow {
  netuid: number;
  subnet_name: string;
  pointing_validator_count: number;
  holder_count: number;
  weighted_target_share: number;
  basket_value_tao: number;
  root_capital_share: number;
  pool_share: number | null;
  holding_change_1h_alpha: number | null;
  holding_change_24h_alpha: number | null;
  estimated_buy_24h_tao: number | null;
  estimated_buy_pool_share: number | null;
  estimated_net_pressure_24h_tao: number | null;
  alpha_price_change_1h: number | null;
  alpha_price_change_24h: number | null;
}

export interface RootBasketValidatorDetail {
  hotkey: string;
  validator_name: string;
  root_stake_share: number;
  subnet_weight: number;
  global_weight: number;
  last_weight_change_time: string | null;
}

export interface RootBasketOverview {
  block_number: number;
  beijing_time: string;
  summary: {
    claim_threshold_tao: number;
    root_weight_setting_enabled: boolean;
    root_validator_count: number;
    basket_validator_count: number;
    seeded_basket_validator_count: number;
    custom_weight_validator_count: number;
    top10_root_stake_share: number;
    top10_custom_weight_count: number;
    concentrated_subnets: Array<{ netuid: number; subnet_name: string; weighted_target_share: number }>;
  };
  subnets: RootBasketSubnetRow[];
}

export interface RootBasketSubnetDetail {
  netuid: number;
  subnet_name: string;
  validators: RootBasketValidatorDetail[];
}
