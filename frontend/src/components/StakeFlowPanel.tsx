import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  RefreshCw,
  Search
} from 'lucide-react';
import client from '../api/client.ts';
import { StakeFlowCycleSummary, SubnetStakeFlowData } from '../../../shared/types.ts';

type SortField = keyof SubnetStakeFlowData;

function formatAmount(value: number, mode: 'signed' | 'stake' | 'unstake'): string {
  const absolute = Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4
  });

  if (value === 0) return absolute;
  if (mode === 'unstake') return `-${absolute}`;
  return value > 0 ? `+${absolute}` : `-${absolute}`;
}

function valueColor(value: number): string {
  if (value > 0) return 'text-emerald-400';
  if (value < 0) return 'text-rose-400';
  return 'text-gray-300';
}

export default function StakeFlowPanel() {
  const [data, setData] = useState<StakeFlowCycleSummary | null>(null);
  const [error, setError] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('netuid');
  const [sortAsc, setSortAsc] = useState(true);

  const fetchStakeFlow = useCallback(async () => {
    try {
      const response = await client.get<StakeFlowCycleSummary>('/api/stake-flow/current');
      setData(response.data);
      setError(false);
    } catch (fetchError) {
      console.error('Failed to fetch stake flow summary:', fetchError);
      setError(true);
    }
  }, []);

  useEffect(() => {
    fetchStakeFlow();
    const interval = window.setInterval(fetchStakeFlow, 12_000);
    return () => window.clearInterval(interval);
  }, [fetchStakeFlow]);

  const changeSort = (field: SortField) => {
    if (field === sortField) {
      setSortAsc(current => !current);
      return;
    }
    setSortField(field);
    setSortAsc(field === 'netuid');
  };

  const visibleSubnets = useMemo(() => {
    if (!data) return [];
    const query = searchQuery.trim().toLowerCase().replace(/^sn/, '');
    const rows = query
      ? data.subnets.filter(subnet => String(subnet.netuid).includes(query))
      : [...data.subnets];

    rows.sort((left, right) => {
      const delta = left[sortField] - right[sortField];
      return sortAsc ? delta : -delta;
    });
    return rows;
  }, [data, searchQuery, sortAsc, sortField]);

  const sortIcon = (field: SortField) => {
    if (sortField !== field) return <ChevronsUpDown size={12} />;
    return sortAsc ? <ArrowUp size={12} /> : <ArrowDown size={12} />;
  };

  if (!data && !error) {
    return <div className="p-6 text-sm text-gray-400">数据加载中...</div>;
  }

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center">
        <button
          type="button"
          onClick={fetchStakeFlow}
          title="重新加载"
          className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-gray-300 hover:bg-white/10 hover:text-white"
        >
          <RefreshCw size={15} />
          重新加载
        </button>
      </div>
    );
  }

  const { cycle, summary } = data;
  const cards = [
    { label: '今日质押', value: summary.today_stake, mode: 'stake' as const, color: 'text-emerald-400' },
    { label: '今日解质押', value: summary.today_unstake, mode: 'unstake' as const, color: 'text-rose-400' },
    { label: '净流入', value: summary.today_net_inflow, mode: 'signed' as const, color: valueColor(summary.today_net_inflow) }
  ];

  const columns: Array<{ field: SortField; label: string }> = [
    { field: 'netuid', label: 'SN' },
    { field: 'stake_amount', label: '质押量' },
    { field: 'unstake_amount', label: '解质押量' },
    { field: 'net_inflow', label: '净流入' },
    { field: 'tx_count', label: '交易次数' }
  ];

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden">
      <header className="flex-shrink-0 border-b border-white/10 pb-3">
        <div className="flex items-center gap-2">
          <Activity className="text-accentBlue" size={20} />
          <h2 className="text-base font-bold text-white">每日质押流向</h2>
        </div>
        <p className="mt-1 text-xs text-gray-400">
          统计周期: {cycle.start_time} 至 {cycle.end_time}（北京时间）
        </p>
      </header>

      <div className="grid flex-shrink-0 grid-cols-2 gap-3 xl:grid-cols-4">
        {cards.map(card => (
          <div key={card.label} className="glass-card flex min-h-20 flex-col items-center justify-center rounded-lg p-4">
            <span className="mb-2 text-xs font-medium text-gray-400">{card.label}</span>
            <span className={`text-base font-bold sm:text-lg ${card.color}`}>
              {formatAmount(card.value, card.mode)} TAO
            </span>
          </div>
        ))}
        <div className="glass-card flex min-h-20 flex-col items-center justify-center rounded-lg p-4">
          <span className="mb-2 text-xs font-medium text-gray-400">昨日净流入</span>
          <span className={`text-base font-bold sm:text-lg ${summary.yesterday_net_inflow === null ? 'text-gray-400' : valueColor(summary.yesterday_net_inflow)}`}>
            {summary.yesterday_net_inflow === null
              ? '--'
              : `${formatAmount(summary.yesterday_net_inflow, 'signed')} TAO`}
          </span>
        </div>
      </div>

      <section className="glass-card flex min-h-0 flex-grow flex-col overflow-hidden rounded-lg p-4">
        <div className="mb-4 flex flex-shrink-0 flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-gray-300">
            子网周期明细 ({visibleSubnets.length} 个子网)
          </h3>
          <label className="relative w-full sm:w-60">
            <Search className="absolute left-3 top-2 text-gray-500" size={14} />
            <input
              type="search"
              aria-label="搜索子网"
              placeholder="搜索子网（如 19 或 SN19）"
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 py-1.5 pl-9 pr-3 text-xs text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
            />
          </label>
        </div>

        <div className="min-h-0 flex-grow overflow-auto">
          <table className="w-full min-w-[680px] border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-[#0f141f] text-gray-400">
              <tr>
                {columns.map((column, index) => (
                  <th key={column.field} className={`border-b border-white/5 px-4 py-3 ${index > 0 ? 'text-right' : ''}`}>
                    <button
                      type="button"
                      onClick={() => changeSort(column.field)}
                      className={`inline-flex items-center gap-1 hover:text-white ${index > 0 ? 'float-right' : ''}`}
                    >
                      {column.label}
                      {sortIcon(column.field)}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-gray-300">
              {visibleSubnets.map(subnet => (
                <tr key={subnet.netuid} className="hover:bg-white/[0.03]">
                  <td className="px-4 py-3 font-semibold text-blue-400">SN{subnet.netuid}</td>
                  <td className="px-4 py-3 text-right font-mono text-emerald-400">{formatAmount(subnet.stake_amount, 'stake')}</td>
                  <td className="px-4 py-3 text-right font-mono text-rose-400">{formatAmount(subnet.unstake_amount, 'unstake')}</td>
                  <td className={`px-4 py-3 text-right font-mono font-semibold ${valueColor(subnet.net_inflow)}`}>
                    {formatAmount(subnet.net_inflow, 'signed')}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{subnet.tx_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibleSubnets.length === 0 && (
            <div className="py-10 text-center text-xs text-gray-500">当前周期暂无数据</div>
          )}
        </div>
      </section>
    </div>
  );
}
