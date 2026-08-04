import { ApiDecoration } from '@polkadot/api/types';
import { codecToBoolean, codecToNumber, fixed32ToNumber, RAO_PER_TAO } from './chainValueParser.js';

export interface RootBasketValidatorRaw {
  hotkey: string;
  root_stake_tao: number;
  weights: Array<{ netuid: number; share: number }>;
  holdings: Array<{ netuid: number; alpha: number }>;
}

export interface RootBasketChainSnapshot {
  block_number: number;
  timestamp_ms: number;
  claim_threshold_tao: number;
  weight_setting_enabled: boolean;
  root_validator_count: number;
  root_stake_total_tao: number;
  root_hotkeys: string[];
  root_stakes: Array<{ hotkey: string; stake_tao: number }>;
  validators: RootBasketValidatorRaw[];
  subnets: Array<{ netuid: number; subnet_name: string; tao_pool: number; alpha_price: number; root_claim_sell_tao: number; root_income_tao: number }>;
}

function decodeAccount(value: any): string {
  return value?.toString?.() || String(value);
}

function decodeWeights(value: any): Array<{ netuid: number; share: number }> {
  const rows = Array.isArray(value) ? value : [];
  const pairs = rows.map((row: any) => [Number(row[0]), Number(row[1])] as [number, number]);
  const total = pairs.reduce((sum, [, weight]) => sum + weight, 0);
  return total > 0 ? pairs.map(([netuid, weight]) => ({ netuid, share: weight / total })) : [];
}

function decodeBasketSummaries(value: any): RootBasketValidatorRaw[] {
  return value.map((row: any) => ({
    hotkey: decodeAccount(row.hotkey),
    root_stake_tao: 0,
    weights: decodeWeights(row.weights),
    holdings: row.holdings.map((holding: any) => ({
      netuid: Number(holding.netuid.toString()),
      alpha: Number(holding.alpha.toString()) / RAO_PER_TAO
    }))
  }));
}

export async function readRootBasketSnapshot(
  apiAt: ApiDecoration<'promise'>,
  blockNumber: number,
  timestampMs: number,
  subnetData: Array<{ netuid: number; subnet_name?: string; subnet_tao: number; alpha_price: number; root_income_tao: number }>
): Promise<RootBasketChainSnapshot> {
  const subtensor = apiAt.query.subtensorModule as any;
  const netuids = subnetData.map((subnet) => subnet.netuid).filter((netuid) => netuid > 0);
  const rootEntries = await subtensor.keys.entries(0);
  const hotkeys: string[] = rootEntries.map(([, value]: any) => decodeAccount(value));
  const calls: any[] = [
    subtensor.rootWeightSettingEnabled,
    [subtensor.rootClaimableThreshold, 0],
    ...hotkeys.map((hotkey) => [subtensor.totalHotkeyAlpha, [hotkey, 0]]),
    ...netuids.map((netuid) => [subtensor.subnetRootSellTao, netuid])
  ];
  const values = await (apiAt.queryMulti as any)(calls);
  const stakeStart = 2;
  const stakeValues: number[] = values.slice(stakeStart, stakeStart + hotkeys.length)
    .map((value: any): number => Number(codecToNumber(value)) / RAO_PER_TAO);
  const basketBytes = await (apiAt.call as any).betaBasketRuntimeApi.getAllValidatorBaskets();
  const validators = decodeBasketSummaries(basketBytes);
  const totalStake = stakeValues.reduce((sum, value) => sum + value, 0);
  const stakeByHotkey = new Map<string, number>(hotkeys.map((hotkey: string, index: number) => [hotkey, stakeValues[index] || 0]));
  validators.forEach((validator) => { validator.root_stake_tao = stakeByHotkey.get(validator.hotkey) || 0; });
  const subnetStart = stakeStart + hotkeys.length;
  const rootSells = values.slice(subnetStart, subnetStart + netuids.length);
  return {
    block_number: blockNumber,
    timestamp_ms: timestampMs,
    claim_threshold_tao: fixed32ToNumber(values[1]) / RAO_PER_TAO,
    weight_setting_enabled: codecToBoolean(values[0], false),
    root_validator_count: hotkeys.length,
    root_stake_total_tao: totalStake,
    root_hotkeys: hotkeys,
    root_stakes: hotkeys.map((hotkey, index) => ({ hotkey, stake_tao: stakeValues[index] || 0 })),
    validators,
    subnets: subnetData.filter((subnet) => subnet.netuid > 0).map((subnet, index) => ({
      netuid: subnet.netuid,
      subnet_name: subnet.subnet_name || '',
      tao_pool: subnet.subnet_tao,
      alpha_price: subnet.alpha_price,
      root_claim_sell_tao: codecToNumber(rootSells[index]) / RAO_PER_TAO,
      root_income_tao: subnet.root_income_tao
    }))
  };
}
