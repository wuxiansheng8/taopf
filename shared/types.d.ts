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

