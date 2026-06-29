export interface SubnetBlockData {
  netuid: number;
  enabled: boolean;
  status: '正常排放' | '禁止排放';
  owner: string;
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
}

export interface BlockEmissionRecord {
  block_number: number;
  beijing_time: string;
  subnets: SubnetBlockData[];
}
