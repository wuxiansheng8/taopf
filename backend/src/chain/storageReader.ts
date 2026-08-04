import { ApiDecoration } from '@polkadot/api/types';
import { SubnetBlockData } from '../../../shared/types.js';
import { codecToBoolean, codecToNumber, fixed32ToNumber, RAO_PER_TAO } from './chainValueParser.js';
import { readOptionalRuntimeData, resolveAlphaPrices } from './optionalRuntimeReader.js';
import { readSubnetStorageSnapshot } from './subnetStorageReader.js';

export interface LiquidationSubnetRaw {
  netuid: number;
  subnet_name: string;
  moving_price: number;
  registered_block: number;
  locked_tao: number;
}

export async function queryBlockEmissionSnapshot(
  apiAt: ApiDecoration<'promise'>
): Promise<{ 
  events: any[]; 
  subnetsData: SubnetBlockData[]; 
  rawLiquidation: {
    subnet_limit: number;
    current_lock_cost: number;
    network_immunity_period: number;
    liquidationSubnetsRaw: LiquidationSubnetRaw[];
  }
}> {
  const [snapshot, events, optionalRuntime] = await Promise.all([
    readSubnetStorageSnapshot(apiAt),
    apiAt.query.system.events() as unknown as Promise<any[]>,
    readOptionalRuntimeData(apiAt)
  ]);
  const { subnets, globalOwnerCut, networkImmunityPeriod, subnetLimit } = snapshot;
  if (subnets.length === 0) {
    throw new Error('未返回任何非 Root 子网');
  }
  const alphaPrices = resolveAlphaPrices(subnets, optionalRuntime.alphaPrices);
  const baseOwnerCut = codecToNumber(globalOwnerCut) / 65535;
  const current_lock_cost = optionalRuntime.registrationCostTao;

  const liquidationSubnetsRaw: LiquidationSubnetRaw[] = [];

  const subnetsData = subnets.map((subnet): SubnetBlockData => {
    const enabled = codecToBoolean(subnet.emissionEnabled, true);
    const alpha_out = codecToNumber(subnet.alphaOutEmission) / RAO_PER_TAO;
    const alpha_price = alphaPrices.get(subnet.netuid) ?? 0;
    const root_prop = fixed32ToNumber(subnet.rootProp);
    const owner_cut = codecToBoolean(subnet.ownerCutEnabled, true) ? baseOwnerCut : 0;
    const neuron_alpha = alpha_out * (1 - owner_cut) * (1 - root_prop * 0.5);

    const locked = codecToNumber(subnet.subnetLocked) / RAO_PER_TAO;
    const regBlock = codecToNumber(subnet.networkRegisteredAt);

    liquidationSubnetsRaw.push({
      netuid: subnet.netuid,
      subnet_name: subnet.subnetName,
      moving_price: fixed32ToNumber(subnet.movingPrice),
      registered_block: regBlock,
      locked_tao: locked
    });

    return {
      netuid: subnet.netuid,
      enabled,
      status: enabled ? '正常排放' : '禁止排放',
      tao_in: enabled ? codecToNumber(subnet.taoInEmission) / RAO_PER_TAO : 0,
      alpha_in: enabled ? codecToNumber(subnet.alphaInEmission) / RAO_PER_TAO : 0,
      alpha_out,
      excess_tao: enabled ? codecToNumber(subnet.excessTao) / RAO_PER_TAO : 0,
      emission_share: 0,
      subnet_tao: codecToNumber(subnet.taoIn) / RAO_PER_TAO,
      subnet_alpha: codecToNumber(subnet.alphaIn) / RAO_PER_TAO,
      alpha_price,
      total_neuron_em: neuron_alpha * alpha_price,
      root_prop,
      miner_burned: fixed32ToNumber(subnet.minerBurned),
      moving_price: fixed32ToNumber(subnet.movingPrice),
      registration_allowed: codecToBoolean(subnet.registrationAllowed, true),
      subnetwork_n: codecToNumber(subnet.subnetworkN),
      max_allowed_uids: codecToNumber(subnet.maxAllowedUids),
      subnet_name: subnet.subnetName,
      owner_cut
    };
  });

  return { 
    events, 
    subnetsData, 
    rawLiquidation: {
      subnet_limit: codecToNumber(subnetLimit),
      current_lock_cost,
      network_immunity_period: codecToNumber(networkImmunityPeriod),
      liquidationSubnetsRaw
    }
  };
}
