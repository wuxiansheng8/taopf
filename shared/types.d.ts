export interface SubnetBlockData {
  netuid: number;
  enabled: boolean;
  status: '排放禁用' | '排放开关正常' | '本块有注入';
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
}

export interface BlockEmissionRecord {
  block_number: number;
  beijing_time: string;
  subnets: SubnetBlockData[];
}
