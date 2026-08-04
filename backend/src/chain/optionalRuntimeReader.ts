import { ApiDecoration } from '@polkadot/api/types';
import { codecToNumber, RAO_PER_TAO } from './chainValueParser.js';
import { StoredSubnetState } from './subnetStorageReader.js';

export interface OptionalRuntimeData {
  registrationCostTao: number;
  alphaPrices: Map<number, number> | null;
}

function codecToBigInt(value: unknown): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(Math.trunc(value));
  if (typeof value === 'string') return BigInt(value);

  return BigInt((value as any)?.toString?.());
}

function reserveAlphaPrice(subnet: StoredSubnetState): number {
  try {
    const taoRao = codecToBigInt(subnet.taoIn);
    const alphaRao = codecToBigInt(subnet.alphaIn);
    if (alphaRao <= 0n) return 0;

    const scaledPrice = (taoRao * BigInt(RAO_PER_TAO)) / alphaRao;
    return Number(scaledPrice) / RAO_PER_TAO;
  } catch {
    return 0;
  }
}

async function readRegistrationCost(apiAt: ApiDecoration<'promise'>): Promise<number> {
  try {
    const runtimeApi = (apiAt.call as any).subnetRegistrationRuntimeApi;
    if (typeof runtimeApi?.getNetworkRegistrationCost !== 'function') return 0;

    const value = await runtimeApi.getNetworkRegistrationCost();
    return codecToNumber(value) / RAO_PER_TAO;
  } catch {
    return 0;
  }
}

async function readRuntimeAlphaPrices(
  apiAt: ApiDecoration<'promise'>
): Promise<Map<number, number> | null> {
  try {
    const runtimeApi = (apiAt.call as any).swapRuntimeApi;
    if (typeof runtimeApi?.currentAlphaPriceAll !== 'function') return null;

    const value = await runtimeApi.currentAlphaPriceAll();
    const rows = value.toJSON() as Array<{ netuid: number; price: unknown }> | null;
    return new Map((rows ?? []).map((row) => [
      Number(row.netuid),
      codecToNumber(row.price) / RAO_PER_TAO
    ]));
  } catch {
    return null;
  }
}

export async function readOptionalRuntimeData(
  apiAt: ApiDecoration<'promise'>
): Promise<OptionalRuntimeData> {
  const [registrationCostTao, alphaPrices] = await Promise.all([
    readRegistrationCost(apiAt),
    readRuntimeAlphaPrices(apiAt)
  ]);

  return { registrationCostTao, alphaPrices };
}

export function resolveAlphaPrices(
  subnets: StoredSubnetState[],
  runtimePrices: Map<number, number> | null
): Map<number, number> {
  return new Map(subnets.map((subnet) => [
    subnet.netuid,
    runtimePrices?.get(subnet.netuid) ?? reserveAlphaPrice(subnet)
  ]));
}
