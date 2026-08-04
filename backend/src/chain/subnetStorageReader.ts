import { ApiDecoration } from '@polkadot/api/types';
import { codecToBoolean, codecToNumber } from './chainValueParser.js';

export interface StoredSubnetState {
  netuid: number;
  taoInEmission: unknown;
  alphaInEmission: unknown;
  alphaOutEmission: unknown;
  taoIn: unknown;
  alphaIn: unknown;
  movingPrice: unknown;
  subnetName: string;
  networkRegisteredAt: unknown;
  emissionEnabled: unknown;
  excessTao: unknown;
  rootProp: unknown;
  minerBurned: unknown;
  ownerCutEnabled: unknown;
  registrationAllowed: unknown;
  subnetworkN: unknown;
  maxAllowedUids: unknown;
  subnetLocked: unknown;
}

export interface SubnetStorageSnapshot {
  subnets: StoredSubnetState[];
  globalOwnerCut: unknown;
  networkImmunityPeriod: unknown;
  subnetLimit: unknown;
}

function decodeBytes(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') {
    return value.startsWith('0x')
      ? Buffer.from(value.slice(2), 'hex').toString('utf8').replace(/\0/g, '').trim()
      : value.replace(/\0/g, '').trim();
  }
  if (Array.isArray(value)) {
    return Buffer.from(value.map(Number).filter(Number.isFinite))
      .toString('utf8')
      .replace(/\0/g, '')
      .trim();
  }
  return String(value).replace(/\0/g, '').trim();
}

function subnetNameFromIdentity(value: any): string {
  const identity = value?.toJSON?.() ?? value;
  return decodeBytes(identity?.subnetName);
}

function subnetIds(entries: any[]): number[] {
  return entries
    .filter(([, value]) => codecToBoolean(value, false))
    .map(([key]) => codecToNumber(key.args[0]))
    .filter((netuid) => netuid > 0)
    .sort((left, right) => left - right);
}

export async function readSubnetStorageSnapshot(
  apiAt: ApiDecoration<'promise'>
): Promise<SubnetStorageSnapshot> {
  const subtensor = apiAt.query.subtensorModule;
  const entries = await (subtensor.networksAdded as any).entries();
  const netuids = subnetIds(entries);

  if (netuids.length === 0) {
    return { subnets: [], globalOwnerCut: 0, networkImmunityPeriod: 0, subnetLimit: 0 };
  }

  const calls: any[] = [
    ...netuids.map((netuid) => [subtensor.subnetTaoInEmission, netuid]),
    ...netuids.map((netuid) => [subtensor.subnetAlphaInEmission, netuid]),
    ...netuids.map((netuid) => [subtensor.subnetAlphaOutEmission, netuid]),
    ...netuids.map((netuid) => [subtensor.subnetTAO, netuid]),
    ...netuids.map((netuid) => [subtensor.subnetAlphaIn, netuid]),
    ...netuids.map((netuid) => [subtensor.subnetMovingPrice, netuid]),
    ...netuids.map((netuid) => [subtensor.subnetIdentitiesV3, netuid]),
    ...netuids.map((netuid) => [subtensor.networkRegisteredAt, netuid]),
    ...netuids.map((netuid) => [subtensor.subnetEmissionEnabled, netuid]),
    ...netuids.map((netuid) => [subtensor.subnetExcessTao, netuid]),
    ...netuids.map((netuid) => [subtensor.rootProp, netuid]),
    ...netuids.map((netuid) => [subtensor.minerBurned, netuid]),
    ...netuids.map((netuid) => [subtensor.ownerCutEnabled, netuid]),
    ...netuids.map((netuid) => [subtensor.networkRegistrationAllowed, netuid]),
    ...netuids.map((netuid) => [subtensor.subnetworkN, netuid]),
    ...netuids.map((netuid) => [subtensor.maxAllowedUids, netuid]),
    ...netuids.map((netuid) => [subtensor.subnetLocked, netuid]),
    subtensor.subnetOwnerCut,
    subtensor.networkImmunityPeriod,
    subtensor.subnetLimit
  ];
  const values = await (apiAt.queryMulti as any)(calls) as unknown[];
  const expectedLength = netuids.length * 17 + 3;
  if (values.length !== expectedLength) {
    throw new Error(`子网 storage 快照返回数量异常: ${values.length}/${expectedLength}`);
  }

  let offset = 0;
  const take = () => values.slice(offset, offset += netuids.length);
  const taoInEmission = take();
  const alphaInEmission = take();
  const alphaOutEmission = take();
  const taoIn = take();
  const alphaIn = take();
  const movingPrice = take();
  const identities = take();
  const networkRegisteredAt = take();
  const emissionEnabled = take();
  const excessTao = take();
  const rootProp = take();
  const minerBurned = take();
  const ownerCutEnabled = take();
  const registrationAllowed = take();
  const subnetworkN = take();
  const maxAllowedUids = take();
  const subnetLocked = take();

  return {
    subnets: netuids.map((netuid, index) => ({
      netuid,
      taoInEmission: taoInEmission[index],
      alphaInEmission: alphaInEmission[index],
      alphaOutEmission: alphaOutEmission[index],
      taoIn: taoIn[index],
      alphaIn: alphaIn[index],
      movingPrice: movingPrice[index],
      subnetName: subnetNameFromIdentity(identities[index]),
      networkRegisteredAt: networkRegisteredAt[index],
      emissionEnabled: emissionEnabled[index],
      excessTao: excessTao[index],
      rootProp: rootProp[index],
      minerBurned: minerBurned[index],
      ownerCutEnabled: ownerCutEnabled[index],
      registrationAllowed: registrationAllowed[index],
      subnetworkN: subnetworkN[index],
      maxAllowedUids: maxAllowedUids[index],
      subnetLocked: subnetLocked[index]
    })),
    globalOwnerCut: values[offset++],
    networkImmunityPeriod: values[offset++],
    subnetLimit: values[offset]
  };
}
