import { ApiPromise } from '@polkadot/api';
import { SubnetBlockData } from '../../../shared/types.js';
import { logger } from '../services/logService.js';

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
    ownerEntries,
    taoInEntries,
    alphaInEntries,
    alphaOutEntries,
    excessTaoEntries,
    subnetTaoEntries,
    subnetAlphaInEntries,
    emissionEntries,
    pendingServerEntries,
    pendingValidatorEntries,
    blocksSinceLastStepEntries
  ] = await Promise.all([
    apiAt.query.subtensorModule.tempo.entries(),
    apiAt.query.subtensorModule.subnetEmissionEnabled.entries(),
    apiAt.query.subtensorModule.subnetOwner.entries(),
    apiAt.query.subtensorModule.subnetTaoInEmission.entries(),
    apiAt.query.subtensorModule.subnetAlphaInEmission.entries(),
    apiAt.query.subtensorModule.subnetAlphaOutEmission.entries(),
    apiAt.query.subtensorModule.subnetExcessTao.entries(),
    apiAt.query.subtensorModule.subnetTAO.entries(),
    apiAt.query.subtensorModule.subnetAlphaIn.entries(),
    apiAt.query.subtensorModule.emission.entries(),
    apiAt.query.subtensorModule.pendingServerEmission.entries(),
    apiAt.query.subtensorModule.pendingValidatorEmission.entries(),
    apiAt.query.subtensorModule.blocksSinceLastStep.entries()
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
  for (const [key, val] of ownerEntries) {
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

  const pendingServerMap = new Map<number, number>();
  for (const [key, val] of pendingServerEntries) {
    pendingServerMap.set(Number(key.args[0].toString()), Number(val.toString()));
  }

  const pendingValidatorMap = new Map<number, number>();
  for (const [key, val] of pendingValidatorEntries) {
    pendingValidatorMap.set(Number(key.args[0].toString()), Number(val.toString()));
  }

  const blocksSinceLastStepMap = new Map<number, number>();
  for (const [key, val] of blocksSinceLastStepEntries) {
    blocksSinceLastStepMap.set(Number(key.args[0].toString()), Number(val.toString()));
  }

  const emissionMap = new Map<number, number>();
  for (const [key, val] of emissionEntries) {
    const list = val.toJSON() as number[];
    const sum = list ? list.reduce((a, b) => a + b, 0) : 0;
    emissionMap.set(Number(key.args[0].toString()), sum);
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

    // Convert from Rao (9 decimals) to TAO
    const rawTaoIn = taoInMap.get(netuid) ?? 0;
    const rawExcessTao = excessTaoMap.get(netuid) ?? 0;
    const rawSubnetTao = subnetTaoMap.get(netuid) ?? 0;
    const rawTotalNeuronEm = emissionMap.get(netuid) ?? 0;

    const tao_in = enabled ? rawTaoIn / 1e9 : 0;
    const excess_tao = enabled ? rawExcessTao / 1e9 : 0;
    const subnet_tao = rawSubnetTao / 1e9;

    const alpha_in = enabled ? (alphaInMap.get(netuid) ?? 0) / 1e9 : 0;
    const alpha_out = (alphaOutMap.get(netuid) ?? 0) / 1e9;

    // Spot Price = SubnetTAO / SubnetAlphaIn
    const alphaReserve = subnetAlphaInMap.get(netuid) ?? 0;
    const alpha_price = alphaReserve > 0 ? rawSubnetTao / alphaReserve : 0.0;

    // High precision real-time neuron emission rate calculation in TAO per block
    const pendingServer = pendingServerMap.get(netuid) ?? 0;
    const pendingValidator = pendingValidatorMap.get(netuid) ?? 0;
    const blocksSinceLastStep = blocksSinceLastStepMap.get(netuid) ?? 0;
    const totalPending = pendingServer + pendingValidator;
    const alphaEmRate = blocksSinceLastStep > 0 ? (totalPending / blocksSinceLastStep) : 0;
    const fallbackVal = tempo > 0 ? ((rawTotalNeuronEm / 1e9 / tempo) * alpha_price) : 0;
    const total_neuron_em = blocksSinceLastStep > 0 ? ((alphaEmRate / 1e9) * alpha_price) : fallbackVal;

    // Classify Subnet Emission Status (Three-state)
    let status: SubnetBlockData['status'] = '排放开关正常';
    if (!enabled) {
      status = '排放禁用';
    } else if (tao_in > 0 || alpha_in > 0 || excess_tao > 0) {
      status = '本块有注入';
    } else {
      status = '排放开关正常';
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
      total_neuron_em
    });
  }

  return subnetsData;
}
