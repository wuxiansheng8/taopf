export interface SubnetBlockData {
  netuid: number;
  enabled: boolean;
  status: '未 start_call' | '已 start_call 但排放禁用' | '正常排放' | '无权重或注册关闭';
  tempo: number;
  owner: string;
  tao_in: number;
  alpha_in: number;
  alpha_out: number;
  excess_tao: number;
  subnet_tao: number;
  subnet_alpha: number;
  alpha_price: number;
  total_neuron_em: number;
  root_prop: number;
  miner_burned: number;
  moving_price: number;
  first_emission_block: number;
}

export interface BlockEmissionRecord {
  block_number: number;
  beijing_time: string;
  subnets: SubnetBlockData[];
}
