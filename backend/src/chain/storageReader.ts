import { ApiDecoration } from '@polkadot/api/types';
import { SubnetBlockData } from '../../../shared/types.js';
import { codecToBoolean, codecToNumber, fixed32ToNumber, RAO_PER_TAO } from './chainValueParser.js';

interface DynamicInfoJson {
  netuid: number;
  taoInEmission?: unknown;
  alphaInEmission?: unknown;
  alphaOutEmission?: unknown;
  taoIn?: unknown;
  alphaIn?: unknown;
  movingPrice?: unknown;
  subnetName?: unknown;
  networkRegisteredAt?: unknown;
}

function decodeBytes(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') {
    if (value.startsWith('0x')) {
      return Buffer.from(value.slice(2), 'hex').toString('utf8').replace(/\0/g, '').trim();
    }
    return value.replace(/\0/g, '').trim();
  }
  if (Array.isArray(value)) {
    return Buffer.from(value.map(Number).filter(Number.isFinite))
      .toString('utf8')
      .replace(/\0/g, '')
      .trim();
  }
  return String(value).replace(/\0/g, '').trim();
}


function buildPriceMap(rawPrices: any): Map<number, number> {
  const priceMap = new Map<number, number>();
  const pricesList = rawPrices.toJSON() as { netuid: number; price: unknown }[] | null;

  if (!pricesList) return priceMap;

  for (const item of pricesList) {
    priceMap.set(Number(item.netuid), codecToNumber(item.price) / RAO_PER_TAO);
  }

  return priceMap;
}

function buildDynamicInfoMap(rawDynamicInfo: any): Map<number, DynamicInfoJson> {
  const dynamicMap = new Map<number, DynamicInfoJson>();
  const dynamicList = rawDynamicInfo.toJSON() as Array<DynamicInfoJson | null> | null;

  if (!dynamicList) return dynamicMap;

  for (const item of dynamicList) {
    if (item) {
      dynamicMap.set(Number(item.netuid), item);
    }
  }

  return dynamicMap;
}

function assertCompleteSnapshot(
  storageValues: any[],
  netuids: number[],
  dynamicMap: Map<number, DynamicInfoJson>,
  priceMap: Map<number, number>
): void {
  const expectedStorageValues = 1 + netuids.length * 9 + 3;
  if (storageValues.length !== expectedStorageValues) {
    throw new Error(`链上批量查询返回数量异常: ${storageValues.length}/${expectedStorageValues}`);
  }

  const missingDynamic = netuids.filter((netuid) => !dynamicMap.has(netuid));
  if (missingDynamic.length > 0) {
    throw new Error(`DynamicInfo 缺少子网: ${missingDynamic.join(',')}`);
  }

  const missingPrices = netuids.filter((netuid) => !priceMap.has(netuid));
  if (missingPrices.length > 0) {
    throw new Error(`Alpha 价格缺少子网: ${missingPrices.join(',')}`);
  }
}

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
  const rawDynamicInfo = await apiAt.call.subnetInfoRuntimeApi.getAllDynamicInfo();
  const dynamicMap = buildDynamicInfoMap(rawDynamicInfo);
  const netuids = Array.from(dynamicMap.keys())
    .filter((netuid) => netuid > 0)
    .sort((a, b) => a - b);

  if (netuids.length === 0) {
    throw new Error('DynamicInfo 未返回任何非 Root 子网');
  }

  const storageCalls: any[] = [
    apiAt.query.system.events,
    ...netuids.map((netuid) => [apiAt.query.subtensorModule.subnetEmissionEnabled, netuid]),
    ...netuids.map((netuid) => [apiAt.query.subtensorModule.subnetExcessTao, netuid]),
    ...netuids.map((netuid) => [apiAt.query.subtensorModule.rootProp, netuid]),
    ...netuids.map((netuid) => [apiAt.query.subtensorModule.minerBurned, netuid]),
    ...netuids.map((netuid) => [apiAt.query.subtensorModule.ownerCutEnabled, netuid]),
    ...netuids.map((netuid) => [apiAt.query.subtensorModule.networkRegistrationAllowed, netuid]),
    ...netuids.map((netuid) => [apiAt.query.subtensorModule.subnetworkN, netuid]),
    ...netuids.map((netuid) => [apiAt.query.subtensorModule.maxAllowedUids, netuid]),
    apiAt.query.subtensorModule.subnetOwnerCut,
    apiAt.query.subtensorModule.networkImmunityPeriod,
    apiAt.query.subtensorModule.subnetLimit,
    ...netuids.map((netuid) => [apiAt.query.subtensorModule.subnetLocked, netuid])
  ];

  const [rawPrices, rawLockCost, storageValues] = await Promise.all([
    apiAt.call.swapRuntimeApi.currentAlphaPriceAll(),
    apiAt.call.subnetRegistrationRuntimeApi?.getNetworkRegistrationCost 
      ? apiAt.call.subnetRegistrationRuntimeApi.getNetworkRegistrationCost() 
      : Promise.resolve(null),
    apiAt.queryMulti(storageCalls) as Promise<any[]>
  ]);

  let offset = 0;
  const events = storageValues[offset++] as any[];
  const enabledValues = storageValues.slice(offset, offset += netuids.length);
  const excessTaoValues = storageValues.slice(offset, offset += netuids.length);
  const rootPropValues = storageValues.slice(offset, offset += netuids.length);
  const minerBurnedValues = storageValues.slice(offset, offset += netuids.length);
  const ownerCutEnabledValues = storageValues.slice(offset, offset += netuids.length);
  const registrationAllowedValues = storageValues.slice(offset, offset += netuids.length);
  const subnetworkNValues = storageValues.slice(offset, offset += netuids.length);
  const maxAllowedUidsValues = storageValues.slice(offset, offset += netuids.length);
  
  const globalOwnerCut = storageValues[offset++];
  const networkImmunityPeriod = storageValues[offset++];
  const subnetLimit = storageValues[offset++];
  const subnetLockedValues = storageValues.slice(offset, offset += netuids.length);

  const priceMap = buildPriceMap(rawPrices);
  assertCompleteSnapshot(storageValues, netuids, dynamicMap, priceMap);
  const baseOwnerCut = codecToNumber(globalOwnerCut) / 65535;

  const current_lock_cost = rawLockCost ? Number(rawLockCost.toString()) / 1e9 : 0;

  const liquidationSubnetsRaw: LiquidationSubnetRaw[] = [];

  const subnetsData = netuids.map((netuid, index): SubnetBlockData => {
    const dynamicInfo = dynamicMap.get(netuid);
    const enabled = codecToBoolean(enabledValues[index], true);
    const alpha_out = codecToNumber(dynamicInfo?.alphaOutEmission) / RAO_PER_TAO;
    const alpha_price = priceMap.get(netuid) ?? 0;
    const root_prop = fixed32ToNumber(rootPropValues[index]);
    const owner_cut = codecToBoolean(ownerCutEnabledValues[index], true) ? baseOwnerCut : 0;
    const neuron_alpha = alpha_out * (1 - owner_cut) * (1 - root_prop * 0.5);

    const subnet_name = decodeBytes(dynamicInfo?.subnetName);
    const locked = codecToNumber(subnetLockedValues[index]) / RAO_PER_TAO;
    const regBlock = dynamicInfo ? Number(dynamicInfo.networkRegisteredAt || 0) : 0;

    liquidationSubnetsRaw.push({
      netuid,
      subnet_name,
      moving_price: fixed32ToNumber(dynamicInfo?.movingPrice),
      registered_block: regBlock,
      locked_tao: locked
    });

    return {
      netuid,
      enabled,
      status: enabled ? '正常排放' : '禁止排放',
      tao_in: enabled ? codecToNumber(dynamicInfo?.taoInEmission) / RAO_PER_TAO : 0,
      alpha_in: enabled ? codecToNumber(dynamicInfo?.alphaInEmission) / RAO_PER_TAO : 0,
      alpha_out,
      excess_tao: enabled ? codecToNumber(excessTaoValues[index]) / RAO_PER_TAO : 0,
      emission_share: 0,
      subnet_tao: codecToNumber(dynamicInfo?.taoIn) / RAO_PER_TAO,
      subnet_alpha: codecToNumber(dynamicInfo?.alphaIn) / RAO_PER_TAO,
      alpha_price,
      total_neuron_em: neuron_alpha * alpha_price,
      root_prop,
      miner_burned: fixed32ToNumber(minerBurnedValues[index]),
      moving_price: fixed32ToNumber(dynamicInfo?.movingPrice),
      registration_allowed: codecToBoolean(registrationAllowedValues[index], true),
      subnetwork_n: codecToNumber(subnetworkNValues[index]),
      max_allowed_uids: codecToNumber(maxAllowedUidsValues[index])
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
