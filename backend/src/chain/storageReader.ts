import { ApiPromise } from '@polkadot/api';
import { SubnetBlockData } from '../../../shared/types.js';

function parseFixed32(val: any): number {
  if (!val) return 0;
  const bits = val.bits ? Number(val.bits.toString()) : Number(val.toString());
  return bits / 4294967296; // bits / 2^32
}

export async function querySubnetEmissionsAtHash(
  api: ApiPromise,
  blockHash: string
): Promise<SubnetBlockData[]> {
  // Get API decorated at the specific block hash
  const apiAt = await api.at(blockHash);

  // Query all maps concurrently
  const [
    tempoEntries,
    enabledEntries,
    ownerHotkeyEntries,
    taoInEntries,
    alphaInEntries,
    alphaOutEntries,
    excessTaoEntries,
    subnetTaoEntries,
    subnetAlphaInEntries,
    rootPropEntries,
    minerBurnedEntries,
    movingPriceEntries,
    firstEmBlockEntries,
    ownerCutEnabledEntries,
    globalOwnerCut,
    rawPrices
  ] = await Promise.all([
    apiAt.query.subtensorModule.tempo.entries(),
    apiAt.query.subtensorModule.subnetEmissionEnabled.entries(),
    apiAt.query.subtensorModule.subnetOwnerHotkey.entries(),
    apiAt.query.subtensorModule.subnetTaoInEmission.entries(),
    apiAt.query.subtensorModule.subnetAlphaInEmission.entries(),
    apiAt.query.subtensorModule.subnetAlphaOutEmission.entries(),
    apiAt.query.subtensorModule.subnetExcessTao.entries(),
    apiAt.query.subtensorModule.subnetTAO.entries(),
    apiAt.query.subtensorModule.subnetAlphaIn.entries(),
    apiAt.query.subtensorModule.rootProp.entries(),
    apiAt.query.subtensorModule.minerBurned.entries(),
    apiAt.query.subtensorModule.subnetMovingPrice.entries(),
    apiAt.query.subtensorModule.firstEmissionBlockNumber.entries(),
    apiAt.query.subtensorModule.ownerCutEnabled.entries(),
    apiAt.query.subtensorModule.subnetOwnerCut(),
    apiAt.call.swapRuntimeApi.currentAlphaPriceAll()
  ]);

  // Convert entries to simple lookup Maps: netuid -> value
  const tempoMap = new Map<number, number>();
  for (const [key, val] of tempoEntries) {
    tempoMap.set(Number(key.args[0].toString()), Number(val.toString()));
  }

  const enabledMap = new Map<number, boolean>();
  for (const [key, val] of enabledEntries) {
    enabledMap.set(Number(key.args[0].toString()), val.toJSON() === true);
  }

  const ownerMap = new Map<number, string>();
  for (const [key, val] of ownerHotkeyEntries) {
    ownerMap.set(Number(key.args[0].toString()), val.toString());
  }

  const taoInMap = new Map<number, number>();
  for (const [key, val] of taoInEntries) {
    taoInMap.set(Number(key.args[0].toString()), Number(val.toString()));
  }

  const alphaInMap = new Map<number, number>();
  for (const [key, val] of alphaInEntries) {
    alphaInMap.set(Number(key.args[0].toString()), Number(val.toString()));
  }

  const alphaOutMap = new Map<number, number>();
  for (const [key, val] of alphaOutEntries) {
    alphaOutMap.set(Number(key.args[0].toString()), Number(val.toString()));
  }

  const excessTaoMap = new Map<number, number>();
  for (const [key, val] of excessTaoEntries) {
    excessTaoMap.set(Number(key.args[0].toString()), Number(val.toString()));
  }

  const subnetTaoMap = new Map<number, number>();
  for (const [key, val] of subnetTaoEntries) {
    subnetTaoMap.set(Number(key.args[0].toString()), Number(val.toString()));
  }

  const subnetAlphaInMap = new Map<number, number>();
  for (const [key, val] of subnetAlphaInEntries) {
    subnetAlphaInMap.set(Number(key.args[0].toString()), Number(val.toString()));
  }

  const rootPropMap = new Map<number, number>();
  for (const [key, val] of rootPropEntries) {
    rootPropMap.set(Number(key.args[0].toString()), parseFixed32(val));
  }

  const minerBurnedMap = new Map<number, number>();
  for (const [key, val] of minerBurnedEntries) {
    minerBurnedMap.set(Number(key.args[0].toString()), parseFixed32(val));
  }

  const movingPriceMap = new Map<number, number>();
  for (const [key, val] of movingPriceEntries) {
    movingPriceMap.set(Number(key.args[0].toString()), parseFixed32(val));
  }

  const firstEmBlockMap = new Map<number, number>();
  for (const [key, val] of firstEmBlockEntries) {
    firstEmBlockMap.set(Number(key.args[0].toString()), Number(val.toString()));
  }

  const ownerCutEnabledMap = new Map<number, boolean>();
  for (const [key, val] of ownerCutEnabledEntries) {
    ownerCutEnabledMap.set(Number(key.args[0].toString()), val.toJSON() === true);
  }

  const baseOwnerCut = Number(globalOwnerCut.toString()) / 65535;

  const priceMap = new Map<number, number>();
  const pricesList = rawPrices.toJSON() as { netuid: number; price: number }[];
  if (pricesList) {
    for (const item of pricesList) {
      priceMap.set(Number(item.netuid), Number(item.price) / 1e9);
    }
  }

  const subnetsData: SubnetBlockData[] = [];

  // Generate list for subnets 1 to 128
  for (let netuid = 1; netuid <= 128; netuid++) {
    // Check if the subnet exists/active
    if (!ownerMap.has(netuid) && (tempoMap.get(netuid) || 0) === 0) {
      continue;
    }

    const enabled = enabledMap.get(netuid) ?? true;
    const tempo = tempoMap.get(netuid) ?? 0;
    const owner = ownerMap.get(netuid) ?? 'Unknown';
    const first_emission_block = firstEmBlockMap.get(netuid) ?? 0;

    // Convert from Rao (9 decimals) to TAO
    const rawTaoIn = taoInMap.get(netuid) ?? 0;
    const rawExcessTao = excessTaoMap.get(netuid) ?? 0;
    const rawSubnetTao = subnetTaoMap.get(netuid) ?? 0;

    const tao_in = enabled ? rawTaoIn / 1e9 : 0;
    const excess_tao = enabled ? rawExcessTao / 1e9 : 0;
    const subnet_tao = rawSubnetTao / 1e9;

    const alpha_in = enabled ? (alphaInMap.get(netuid) ?? 0) / 1e9 : 0;
    const alpha_out = (alphaOutMap.get(netuid) ?? 0) / 1e9;

    const alphaReserve = subnetAlphaInMap.get(netuid) ?? 0;
    const alpha_price = priceMap.get(netuid) ?? 0.0;

    const root_prop = rootPropMap.get(netuid) ?? 0;
    const miner_burned = minerBurnedMap.get(netuid) ?? 0;
    const moving_price = movingPriceMap.get(netuid) ?? 0;

    const ownerCutEnabled = ownerCutEnabledMap.get(netuid) ?? true;
    const owner_cut = ownerCutEnabled ? baseOwnerCut : 0.0;
    const after_owner = alpha_out * (1 - owner_cut);
    const neuron_alpha = after_owner * (1 - root_prop * 0.5);
    const total_neuron_em = neuron_alpha * alpha_price;

    // Classify Subnet Emission Status (Four-state)
    let status: SubnetBlockData['status'] = '正常排放';
    if (first_emission_block === 0) {
      status = '未 start_call';
    } else if (!enabled) {
      status = '已 start_call 但排放禁用';
    } else if (tao_in + excess_tao === 0) {
      status = '无权重或注册关闭';
    } else {
      status = '正常排放';
    }

    subnetsData.push({
      netuid,
      enabled,
      status,
      tempo,
      owner,
      tao_in,
      alpha_in,
      alpha_out,
      excess_tao,
      subnet_tao,
      subnet_alpha: alphaReserve / 1e9,
      alpha_price,
      total_neuron_em,
      root_prop,
      miner_burned,
      moving_price,
      first_emission_block
    });
  }

  return subnetsData;
}
