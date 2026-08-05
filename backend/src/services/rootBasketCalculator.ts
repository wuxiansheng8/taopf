import { RootBasketChainSnapshot } from '../chain/rootBasketReader.js';
import { RootBasketOverview, RootBasketSubnetRow, RootBasketValidatorDetail } from '../../../shared/types.js';

export interface RootBasketHistoryPoint {
  netuid: number;
  sampled_at_ms: number;
  block_number: number;
  basket_alpha: number;
  alpha_price: number;
  estimated_income_24h_tao: number | null;
}

export type RootBasketClaimSell24h = Map<number, number>;

export function calculateGlobalWeight(rootStakeShare: number, subnetWeight: number): number {
  return rootStakeShare * subnetWeight;
}

export function calculateRootIncomeTao(
  alphaOut: number,
  ownerCut: number,
  rootProportion: number,
  alphaPrice: number
): number {
  return alphaOut * (1 - ownerCut) * rootProportion * 0.5 * alphaPrice;
}

export function calculateEstimatedNetPressure(
  targetBuyTao: number,
  sourceSellTao: number,
  claimSellTao: number
): number {
  return targetBuyTao - sourceSellTao - claimSellTao;
}

function holdingsBySubnet(snapshot: RootBasketChainSnapshot): Map<number, number> {
  const result = new Map<number, number>();
  snapshot.validators.forEach((validator) => {
    validator.holdings.forEach((holding) => {
      result.set(holding.netuid, (result.get(holding.netuid) || 0) + holding.alpha);
    });
  });
  return result;
}

function markedValue(alphaAmount: number, alphaPrice: number): number {
  return alphaAmount * alphaPrice;
}

export function calculateOverview(
  snapshot: RootBasketChainSnapshot,
  history: Map<number, RootBasketHistoryPoint[]>,
  claimSell24h: RootBasketClaimSell24h
): RootBasketOverview {
  const totalStake = snapshot.root_stake_total_tao;
  const sortedStake = [...snapshot.root_stakes].sort((left, right) => right.stake_tao - left.stake_tao);
  const currentRootValidators = new Set(snapshot.root_hotkeys);
  const holdings = holdingsBySubnet(snapshot);
  const basketValues = new Map(snapshot.subnets.map((subnet) => [
    subnet.netuid,
    markedValue(holdings.get(subnet.netuid) || 0, subnet.alpha_price)
  ]));
  const totalBasketValue = [...basketValues.values()].reduce((sum, value) => sum + value, 0);
  const oneHour = snapshot.timestamp_ms - 60 * 60 * 1000;
  const day = snapshot.timestamp_ms - 24 * 60 * 60 * 1000;
  const latestIncome = [...history.values()]
    .map((items) => items.at(-1)?.estimated_income_24h_tao ?? null)
    .filter((value): value is number => value !== null)
    .reduce((sum, value) => sum + value, 0);
  const rows: RootBasketSubnetRow[] = snapshot.subnets.map((subnet) => {
    const pointing = snapshot.validators.filter((validator) => currentRootValidators.has(validator.hotkey) &&
      validator.weights.some((weight) => weight.netuid === subnet.netuid && weight.share > 0)
    );
    const weightedTargetShare = pointing.reduce((sum, validator) => {
      const weight = validator.weights.find((item) => item.netuid === subnet.netuid)?.share || 0;
      return sum + (totalStake > 0 ? validator.root_stake_tao / totalStake : 0) * weight;
    }, 0);
    const currentAlpha = holdings.get(subnet.netuid) || 0;
    const points = history.get(subnet.netuid) || [];
    const oneHourPoint = [...points].reverse().find((point) => point.sampled_at_ms <= oneHour);
    const dayPoint = [...points].reverse().find((point) => point.sampled_at_ms <= day);
    const currentValue = basketValues.get(subnet.netuid) || 0;
    const targetBuy = !snapshot.weight_setting_enabled || latestIncome === 0
      ? null
      : latestIncome * weightedTargetShare;
    const sourceIncome = points.at(-1)?.estimated_income_24h_tao ?? 0;
    const sourceSell = snapshot.weight_setting_enabled
      ? sourceIncome * Math.max(0, 1 - weightedTargetShare)
      : 0;
    const netPressure = targetBuy === null ? null : calculateEstimatedNetPressure(
      targetBuy,
      sourceSell,
      claimSell24h.get(subnet.netuid) || 0
    );
    return {
      netuid: subnet.netuid,
      subnet_name: subnet.subnet_name,
      pointing_validator_count: pointing.length,
      holder_count: snapshot.validators.filter((validator) => validator.holdings
        .some((holding) => holding.netuid === subnet.netuid && holding.alpha > 0)).length,
      weighted_target_share: weightedTargetShare,
      basket_value_tao: currentValue,
      root_capital_share: totalBasketValue > 0 ? currentValue / totalBasketValue : 0,
      pool_share: subnet.tao_pool > 0 ? currentValue / subnet.tao_pool : null,
      holding_change_1h_alpha: oneHourPoint ? currentAlpha - oneHourPoint.basket_alpha : null,
      holding_change_24h_alpha: dayPoint ? currentAlpha - dayPoint.basket_alpha : null,
      estimated_buy_24h_tao: targetBuy,
      estimated_buy_pool_share: targetBuy === null || subnet.tao_pool <= 0 ? null : targetBuy / subnet.tao_pool,
      estimated_net_pressure_24h_tao: netPressure,
      alpha_price_change_1h: oneHourPoint && oneHourPoint.alpha_price > 0 ? (subnet.alpha_price - oneHourPoint.alpha_price) / oneHourPoint.alpha_price : null,
      alpha_price_change_24h: dayPoint && dayPoint.alpha_price > 0 ? (subnet.alpha_price - dayPoint.alpha_price) / dayPoint.alpha_price : null
    };
  });
  const concentrated = [...rows].sort((left, right) => right.weighted_target_share - left.weighted_target_share).slice(0, 3)
    .map((row) => ({ netuid: row.netuid, subnet_name: row.subnet_name, weighted_target_share: row.weighted_target_share }));
  return {
    block_number: snapshot.block_number,
    beijing_time: new Date(snapshot.timestamp_ms).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }),
    summary: {
      claim_threshold_tao: snapshot.claim_threshold_tao,
      root_weight_setting_enabled: snapshot.weight_setting_enabled,
      root_validator_count: snapshot.root_validator_count,
      basket_validator_count: snapshot.validators.filter((validator) => currentRootValidators.has(validator.hotkey)).length,
      seeded_basket_validator_count: snapshot.validators.length,
      custom_weight_validator_count: snapshot.validators.filter((validator) => currentRootValidators.has(validator.hotkey) && validator.weights.length > 0).length,
      top10_root_stake_share: totalStake > 0 ? sortedStake.slice(0, 10).reduce((sum, validator) => sum + validator.stake_tao, 0) / totalStake : 0,
      top10_custom_weight_count: sortedStake.slice(0, 10).filter((entry) => snapshot.validators.some((validator) => validator.hotkey === entry.hotkey && validator.weights.length > 0)).length,
      concentrated_subnets: concentrated
    },
    subnets: rows
  };
}

export function validatorDetails(
  snapshot: RootBasketChainSnapshot,
  netuid: number,
  weightChanges: Map<string, string>
): { netuid: number; subnet_name: string; validators: RootBasketValidatorDetail[] } | null {
  const subnet = snapshot.subnets.find((item) => item.netuid === netuid);
  if (!subnet) return null;
  const totalStake = snapshot.validators.reduce((sum, validator) => sum + validator.root_stake_tao, 0);
  return {
    netuid,
    subnet_name: subnet.subnet_name,
    validators: snapshot.validators
      .map((validator) => {
        const weight = validator.weights.find((item) => item.netuid === netuid)?.share || 0;
        return {
          hotkey: validator.hotkey,
          validator_name: validator.hotkey,
          root_stake_share: totalStake > 0 ? validator.root_stake_tao / totalStake : 0,
          subnet_weight: weight,
          global_weight: calculateGlobalWeight(totalStake > 0 ? validator.root_stake_tao / totalStake : 0, weight),
          last_weight_change_time: weightChanges.get(`${validator.hotkey}:${netuid}`) || null
        };
      })
      .filter((validator) => validator.root_stake_share > 0 && validator.subnet_weight > 0)
      .sort((left, right) => right.global_weight - left.global_weight)
  };
}
