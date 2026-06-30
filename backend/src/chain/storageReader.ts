import { ApiDecoration } from '@polkadot/api/types';
import { SubnetBlockData } from '../../../shared/types.js';
import { codecToBoolean, codecToNumber, fixed32ToNumber, RAO_PER_TAO } from './chainValueParser.js';

const NETUIDS = Array.from({ length: 128 }, (_, i) => i + 1);
const EXPECTED_STORAGE_VALUES = 1 + NETUIDS.length * 5 + 1;

interface DynamicInfoJson {
  netuid: number;
  taoInEmission?: unknown;
  alphaInEmission?: unknown;
  alphaOutEmission?: unknown;
  taoIn?: unknown;
  alphaIn?: unknown;
  movingPrice?: unknown;
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
  dynamicMap: Map<number, DynamicInfoJson>,
  priceMap: Map<number, number>
): void {
  if (storageValues.length !== EXPECTED_STORAGE_VALUES) {
    throw new Error(`链上批量查询返回数量异常: ${storageValues.length}/${EXPECTED_STORAGE_VALUES}`);
  }

  const missingDynamic = NETUIDS.filter((netuid) => !dynamicMap.has(netuid));
  if (missingDynamic.length > 0) {
    throw new Error(`DynamicInfo 缺少子网: ${missingDynamic.join(',')}`);
  }

  const missingPrices = NETUIDS.filter((netuid) => !priceMap.has(netuid));
  if (missingPrices.length > 0) {
    throw new Error(`Alpha 价格缺少子网: ${missingPrices.join(',')}`);
  }
}

export async function queryBlockEmissionSnapshot(
  apiAt: ApiDecoration<'promise'>
): Promise<{ events: any[]; subnetsData: SubnetBlockData[] }> {
  const storageCalls: any[] = [
    apiAt.query.system.events,
    ...NETUIDS.map((netuid) => [apiAt.query.subtensorModule.subnetEmissionEnabled, netuid]),
    ...NETUIDS.map((netuid) => [apiAt.query.subtensorModule.subnetExcessTao, netuid]),
    ...NETUIDS.map((netuid) => [apiAt.query.subtensorModule.rootProp, netuid]),
    ...NETUIDS.map((netuid) => [apiAt.query.subtensorModule.minerBurned, netuid]),
    ...NETUIDS.map((netuid) => [apiAt.query.subtensorModule.ownerCutEnabled, netuid]),
    apiAt.query.subtensorModule.subnetOwnerCut
  ];

  const [rawDynamicInfo, rawPrices, storageValues] = await Promise.all([
    apiAt.call.subnetInfoRuntimeApi.getAllDynamicInfo(),
    apiAt.call.swapRuntimeApi.currentAlphaPriceAll(),
    apiAt.queryMulti(storageCalls) as Promise<any[]>
  ]);

  let offset = 0;
  const events = storageValues[offset++] as any[];
  const enabledValues = storageValues.slice(offset, offset += NETUIDS.length);
  const excessTaoValues = storageValues.slice(offset, offset += NETUIDS.length);
  const rootPropValues = storageValues.slice(offset, offset += NETUIDS.length);
  const minerBurnedValues = storageValues.slice(offset, offset += NETUIDS.length);
  const ownerCutEnabledValues = storageValues.slice(offset, offset += NETUIDS.length);
  const globalOwnerCut = storageValues[offset];

  const dynamicMap = buildDynamicInfoMap(rawDynamicInfo);
  const priceMap = buildPriceMap(rawPrices);
  assertCompleteSnapshot(storageValues, dynamicMap, priceMap);
  const baseOwnerCut = codecToNumber(globalOwnerCut) / 65535;

  const subnetsData = NETUIDS.map((netuid, index): SubnetBlockData => {
    const dynamicInfo = dynamicMap.get(netuid);
    const enabled = codecToBoolean(enabledValues[index], true);
    const alpha_out = codecToNumber(dynamicInfo?.alphaOutEmission) / RAO_PER_TAO;
    const alpha_price = priceMap.get(netuid) ?? 0;
    const root_prop = fixed32ToNumber(rootPropValues[index]);
    const owner_cut = codecToBoolean(ownerCutEnabledValues[index], true) ? baseOwnerCut : 0;
    const neuron_alpha = alpha_out * (1 - owner_cut) * (1 - root_prop * 0.5);

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
      moving_price: fixed32ToNumber(dynamicInfo?.movingPrice)
    };
  });

  return { events, subnetsData };
}
