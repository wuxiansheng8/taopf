import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import client from '../api/client.ts';
import { RootBasketOverview, RootBasketSubnetDetail, RootBasketSubnetRow } from '../../../shared/types.js';

type SortField = keyof RootBasketSubnetRow;

const COLUMNS: Array<{ field: SortField; label: string; description: string }> = [
  { field: 'netuid', label: '子网', description: '子网编号。鼠标停在SN编号上可查看完整子网名称。' },
  { field: 'pointing_validator_count', label: '验证者权重', description: '有多少个 Root 验证者把权重指向这个子网。' },
  { field: 'holder_count', label: '总持仓篮子', description: '全网有多少个 Basket 持有该子网 Alpha。' },
  { field: 'weighted_target_share', label: '全网权重', description: '所有 Root 验证者合起来，计划把多少比例的收益分配到这个子网。' },
  { field: 'basket_value_tao', label: '篮子总持仓(T)', description: '全部 Basket 持有的该子网 Alpha，按当前价格折算成的 TAO 价值。' },
  { field: 'root_capital_share', label: '全网篮子占比', description: '该子网篮子持仓价值，占所有 Basket 持仓总价值的比例。' },
  { field: 'pool_share', label: '占本子网TAO池', description: '该子网篮子持仓价值，占该子网 TAO 池的比例。' },
  { field: 'holding_change_1h_alpha', label: '1H篮子Alpha变化', description: '当前篮子 Alpha 数量减去约1小时前的数量。正数表示净增加，负数表示净减少。' },
  { field: 'holding_change_24h_alpha', label: '24H篮子Alpha变化', description: '当前篮子 Alpha 数量减去约24小时前的数量。正数表示净增加，负数表示净减少。' },
  { field: 'estimated_buy_24h_tao', label: '预计24H买入', description: '按当前 Root 验证者权重估算，未来24小时预计买入该子网的 TAO 数量。' },
  { field: 'estimated_buy_pool_share', label: '预计买入占池比', description: '预计24小时买入量，占该子网 TAO 池的比例。' },
  { field: 'estimated_net_pressure_24h_tao', label: '预计24H净压力', description: '预计未来24小时，这个子网会有多少资金净买入或净卖出。' },
  { field: 'alpha_price_change_1h', label: 'Alpha涨跌1H', description: '当前 Alpha 价格相比约1小时前的涨跌比例。' },
  { field: 'alpha_price_change_24h', label: 'Alpha涨跌24H', description: '当前 Alpha 价格相比约24小时前的涨跌比例。' }
];

function percent(value: number | null): string {
  return value === null ? '--' : `${(value * 100).toFixed(2)}%`;
}

function signed(value: number | null, digits = 2): string {
  if (value === null) return '--';
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`;
}

function directionColor(value: number | null): string {
  if (value === null || value === 0) return 'text-gray-400';
  return value > 0 ? 'text-emerald-400' : 'text-rose-400';
}

function tao(value: number): string {
  return `${value.toFixed(2)}T`;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function sumDefined(values: Array<number | null>): number | null {
  const defined = values.filter((value): value is number => value !== null);
  return defined.length > 0 ? sum(defined) : null;
}

export default function RootBasketFlowPanel() {
  const [overview, setOverview] = useState<RootBasketOverview | null>(null);
  const [detail, setDetail] = useState<RootBasketSubnetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortField, setSortField] = useState<SortField>('netuid');
  const [sortAscending, setSortAscending] = useState(true);

  const fetchOverview = useCallback(async () => {
    try {
      const response = await client.get<RootBasketOverview>('/api/root-basket');
      setOverview(response.data);
      setError('');
    } catch (requestError: any) {
      setError(requestError?.response?.data?.error || 'Root篮子数据加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview();
    const timer = window.setInterval(fetchOverview, 12_000);
    return () => window.clearInterval(timer);
  }, [fetchOverview]);

  const selectSubnet = async (netuid: number) => {
    if (detail?.netuid === netuid) {
      setDetail(null);
      return;
    }

    setDetail(null);
    try {
      const response = await client.get<RootBasketSubnetDetail>(`/api/root-basket/subnets/${netuid}`);
      setDetail(response.data);
    } catch {
      setDetail(null);
    }
  };

  const rows = useMemo(() => {
    if (!overview) return [];

    return [...overview.subnets].sort((left, right) => {
      const leftValue = left[sortField];
      const rightValue = right[sortField];

      if (leftValue === null && rightValue === null) return left.netuid - right.netuid;
      if (leftValue === null) return 1;
      if (rightValue === null) return -1;

      const comparison = typeof leftValue === 'string' && typeof rightValue === 'string'
        ? leftValue.localeCompare(rightValue)
        : Number(leftValue) - Number(rightValue);

      if (comparison === 0) return left.netuid - right.netuid;
      return sortAscending ? comparison : -comparison;
    });
  }, [overview, sortAscending, sortField]);

  const totals = useMemo(() => {
    const subnets = overview?.subnets ?? [];
    return {
      weightedTargetShare: sum(subnets.map((subnet) => subnet.weighted_target_share)),
      basketValueTao: sum(subnets.map((subnet) => subnet.basket_value_tao)),
      rootCapitalShare: sum(subnets.map((subnet) => subnet.root_capital_share)),
      estimatedBuyTao: sumDefined(subnets.map((subnet) => subnet.estimated_buy_24h_tao)),
      estimatedNetPressureTao: sumDefined(subnets.map((subnet) => subnet.estimated_net_pressure_24h_tao))
    };
  }, [overview]);

  const changeSort = (field: SortField) => {
    if (field === sortField) {
      setSortAscending(current => !current);
      return;
    }

    setSortField(field);
    setSortAscending(false);
  };

  const sortIcon = (field: SortField) => {
    if (field !== sortField) return <ChevronsUpDown size={12} />;
    return sortAscending ? <ArrowUp size={12} /> : <ArrowDown size={12} />;
  };

  if (loading && !overview) return <div className="p-6 text-sm text-gray-400">数据加载中...</div>;
  if (!overview) return <div className="p-6 text-sm text-rose-400">{error || '暂无Root篮子数据'}</div>;

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden">
      <header className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Root 篮子资金流</h2>
          <p className="mt-1 text-xs text-gray-500">区块 #{overview.block_number} · {overview.beijing_time}</p>
        </div>
        <div className="text-xs text-gray-400">
          权重设置：<span className={overview.summary.root_weight_setting_enabled ? 'text-emerald-400' : 'text-amber-400'}>
            {overview.summary.root_weight_setting_enabled ? '开启' : '关闭'}
          </span>
        </div>
      </header>

      <section className="grid flex-shrink-0 grid-cols-2 gap-2 xl:grid-cols-4">
        <Summary label="当前Claim门槛" value={`${overview.summary.claim_threshold_tao.toFixed(4)} TAO`} />
        <Summary
          label="Root验证者"
          value={`${overview.summary.root_validator_count}个`}
          detail={(
            <>
              <span>已设置权重：<strong className="font-semibold text-blue-300">{overview.summary.custom_weight_validator_count}个</strong></span>
              <span className="mx-2 text-gray-600">|</span>
              <span>验证者持仓篮子：<strong className="font-semibold text-emerald-300">{overview.summary.basket_validator_count}个</strong></span>
              <span className="mx-2 text-gray-600">|</span>
              <span>总持仓篮子：<strong className="font-semibold text-violet-300">{overview.summary.seeded_basket_validator_count}个</strong></span>
            </>
          )}
        />
        <Summary label="前10名Root质押" value={percent(overview.summary.top10_root_stake_share)} detail={`其中已设置权重：${overview.summary.top10_custom_weight_count}个`} />
        <Summary
          label="资金指向最集中"
          value={overview.summary.concentrated_subnets.length > 0 ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {overview.summary.concentrated_subnets.map((item, index) => (
                <span key={item.netuid} className="whitespace-nowrap">
                  {index > 0 && <span className="mr-3 text-gray-600">|</span>}
                  <span className="font-normal text-gray-300">SN{item.netuid}</span>{' '}
                  <strong className={index === 0 ? 'text-blue-300' : index === 1 ? 'text-emerald-300' : 'text-violet-300'}>{percent(item.weighted_target_share)}</strong>
                </span>
              ))}
            </div>
          ) : '--'}
        />
      </section>

      <section className="min-h-0 flex-1 overflow-auto rounded-lg border border-white/10 bg-[#111722]">
        <table className="min-w-[1320px] w-full text-xs">
          <thead className="sticky top-0 z-10 bg-[#0f141f] text-gray-400">
            <tr>
              <th title="当前排序下的名次。" className="sticky left-0 z-30 w-14 border-b border-white/5 bg-[#0f141f] px-2 py-3 text-center font-semibold whitespace-nowrap">序号</th>
              {COLUMNS.map(column => (
                <th key={column.field} className="border-b border-white/5 px-3 py-3 font-semibold whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => changeSort(column.field)}
                    title={column.description}
                    className="mx-auto flex items-center gap-1 hover:text-white"
                  >
                    {column.label}
                    <span className="opacity-60">{sortIcon(column.field)}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-gray-300">
            {rows.map((subnet, index) => (
              <Fragment key={subnet.netuid}>
                <tr onClick={() => selectSubnet(subnet.netuid)} className="group cursor-pointer hover:bg-white/[0.03]">
                  <td className="sticky left-0 z-10 w-14 bg-[#111722] px-2 py-3 text-center text-gray-500 group-hover:bg-[#151c28]">{index + 1}</td>
                  <td className="px-3 py-3 text-center"><div className="font-semibold text-blue-400" title={subnet.subnet_name || undefined}>SN{subnet.netuid}</div></td>
                  <td className="px-3 py-3 text-center">{subnet.pointing_validator_count}</td>
                   <td className="px-3 py-3 text-center">{subnet.holder_count}</td>
                   <td className="px-3 py-3 text-center text-cyan-300">{percent(subnet.weighted_target_share)}</td>
                   <td className="px-3 py-3 text-center">{tao(subnet.basket_value_tao)}</td>
                   <td className="px-3 py-3 text-center text-cyan-300">{percent(subnet.root_capital_share)}</td>
                   <td className="px-3 py-3 text-center">{percent(subnet.pool_share)}</td>
                   <td className={`px-3 py-3 text-center ${directionColor(subnet.holding_change_1h_alpha)}`}>{signed(subnet.holding_change_1h_alpha)}</td>
                   <td className={`px-3 py-3 text-center ${directionColor(subnet.holding_change_24h_alpha)}`}>{signed(subnet.holding_change_24h_alpha)}</td>
                  <td className="px-3 py-3 text-center text-amber-300">{subnet.estimated_buy_24h_tao === null ? '--' : `${subnet.estimated_buy_24h_tao.toFixed(2)}T`}</td>
                  <td className="px-3 py-3 text-center text-amber-300">{percent(subnet.estimated_buy_pool_share)}</td>
                  <td className={`px-3 py-3 text-center ${directionColor(subnet.estimated_net_pressure_24h_tao)}`}>{subnet.estimated_net_pressure_24h_tao === null ? '--' : `${signed(subnet.estimated_net_pressure_24h_tao)}T`}</td>
                  <td className={`px-3 py-3 text-center ${directionColor(subnet.alpha_price_change_1h)}`}>{percent(subnet.alpha_price_change_1h)}</td>
                  <td className={`px-3 py-3 text-center ${directionColor(subnet.alpha_price_change_24h)}`}>{percent(subnet.alpha_price_change_24h)}</td>
                </tr>
                {detail?.netuid === subnet.netuid && (
                  <tr>
                    <td colSpan={COLUMNS.length + 1} className="border-y border-blue-500/20 bg-blue-500/[0.03] p-0">
                      <SubnetDetail detail={detail} onClose={() => setDetail(null)} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
          <tfoot className="sticky bottom-0 z-20 border-t-2 border-white/10 bg-[#0f141f] text-gray-300 shadow-[0_-4px_12px_rgba(0,0,0,0.18)]">
            <tr>
              <td className="sticky left-0 z-30 w-14 bg-[#0f141f] px-2 py-3 text-center" />
              <td className="px-3 py-3 text-center font-semibold text-white">合计</td>
              <td className="px-3 py-3 text-center text-gray-500">--</td>
              <td className="px-3 py-3 text-center text-gray-500">--</td>
              <td className="px-3 py-3 text-center text-cyan-300">{percent(totals.weightedTargetShare)}</td>
              <td className="px-3 py-3 text-center font-semibold text-white">{tao(totals.basketValueTao)}</td>
              <td className="px-3 py-3 text-center text-cyan-300">{percent(totals.rootCapitalShare)}</td>
              <td className="px-3 py-3 text-center text-gray-500">--</td>
              <td className="px-3 py-3 text-center text-gray-500">--</td>
              <td className="px-3 py-3 text-center text-gray-500">--</td>
              <td className="px-3 py-3 text-center text-amber-300">{totals.estimatedBuyTao === null ? '--' : tao(totals.estimatedBuyTao)}</td>
              <td className="px-3 py-3 text-center text-gray-500">--</td>
              <td className={`px-3 py-3 text-center ${directionColor(totals.estimatedNetPressureTao)}`}>{totals.estimatedNetPressureTao === null ? '--' : `${signed(totals.estimatedNetPressureTao)}T`}</td>
              <td className="px-3 py-3 text-center text-gray-500">--</td>
              <td className="px-3 py-3 text-center text-gray-500">--</td>
            </tr>
          </tfoot>
        </table>
      </section>
    </div>
  );
}

function Summary({ label, value, detail }: { label: string; value: ReactNode; detail?: ReactNode }) {
  return <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-3"><div className="text-xs font-normal text-gray-400">{label}</div><div className="mt-1 text-sm font-semibold text-white">{value}</div>{detail && <div className="mt-1 text-xs font-normal text-gray-400">{detail}</div>}</div>;
}

function SubnetDetail({ detail, onClose }: { detail: RootBasketSubnetDetail; onClose: () => void }) {
  return <div className="p-3"><div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold text-white">SN{detail.netuid} 指向验证者明细</h3><button onClick={onClose} className="text-xs text-gray-400 hover:text-white">关闭</button></div><div className="overflow-x-auto"><table className="min-w-[700px] w-full text-xs"><thead className="text-gray-400"><tr>{['验证者', 'Root质押占比', `SN${detail.netuid}权重`, '当前全网权重', '最近一次修改权重时间'].map(label => <th key={label} className="border-b border-white/5 px-3 py-2 text-center font-semibold">{label}</th>)}</tr></thead><tbody className="divide-y divide-white/5 text-gray-300">{detail.validators.map(validator => <tr key={validator.hotkey}><td className="px-3 py-2">{validator.validator_name}<div className="text-[10px] text-gray-500">{validator.hotkey}</div></td><td className="px-3 py-2 text-right">{percent(validator.root_stake_share)}</td><td className="px-3 py-2 text-right">{percent(validator.subnet_weight)}</td><td className="px-3 py-2 text-right">{percent(validator.global_weight)}</td><td className="px-3 py-2 text-center">{validator.last_weight_change_time || '--'}</td></tr>)}</tbody></table></div></div>;
}
