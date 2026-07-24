import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  Minus,
  Pickaxe,
  RefreshCw,
  Search,
  TrendingDown,
  TrendingUp
} from 'lucide-react';
import client from '../api/client.ts';
import {
  MinerCompetitionSnapshot,
  MinerCompetitionSubnet
} from '../../../shared/types.ts';

type RegistrationFilter = 'all' | 'open' | 'closed';
type SortField = keyof MinerCompetitionSubnet;

function formatNumber(value: number, maximumFractionDigits = 4): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits
  });
}

function nullableNumber(value: number | null, suffix = '', digits = 1): string {
  return value === null ? '--' : `${formatNumber(value, digits)}${suffix}`;
}

export default function MinerCompetitionPanel() {
  const [snapshot, setSnapshot] = useState<MinerCompetitionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [registrationFilter, setRegistrationFilter] = useState<RegistrationFilter>('all');
  const [sortField, setSortField] = useState<SortField>('daily_tao_per_uid');
  const [sortAscending, setSortAscending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const requestInFlight = useRef(false);

  const fetchData = useCallback(async (manual = false) => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;

    if (manual) setRefreshing(true);
    try {
      const response = await client.get<MinerCompetitionSnapshot>('/api/miner-competition');
      setSnapshot(response.data);
      setError('');
    } catch (fetchError: any) {
      const message = fetchError?.response?.data?.error || '矿工竞争数据加载失败';
      setError(message);
    } finally {
      requestInFlight.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const timer = window.setInterval(() => fetchData(), 12_000);
    return () => window.clearInterval(timer);
  }, [fetchData]);

  const rows = useMemo(() => {
    if (!snapshot) return [];
    const normalizedQuery = searchQuery.trim().toLowerCase().replace(/^sn/, '');
    const filtered = snapshot.subnets.filter(subnet => {
      if (registrationFilter === 'open' && !subnet.registration_allowed) return false;
      if (registrationFilter === 'closed' && subnet.registration_allowed) return false;
      if (!normalizedQuery) return true;
      return String(subnet.netuid) === normalizedQuery
        || subnet.subnet_name.toLowerCase().includes(normalizedQuery);
    });

    return filtered.sort((left, right) => {
      const leftValue = left[sortField];
      const rightValue = right[sortField];
      if (leftValue === null && rightValue === null) return 0;
      if (leftValue === null) return 1;
      if (rightValue === null) return -1;

      let comparison = 0;
      if (typeof leftValue === 'string' && typeof rightValue === 'string') {
        comparison = leftValue.localeCompare(rightValue);
      } else {
        comparison = Number(leftValue) - Number(rightValue);
      }
      return sortAscending ? comparison : -comparison;
    });
  }, [registrationFilter, searchQuery, snapshot, sortAscending, sortField]);

  const changeSort = (field: SortField) => {
    if (field === sortField) {
      setSortAscending(current => !current);
      return;
    }
    setSortField(field);
    setSortAscending(field === 'netuid');
  };

  const sortIcon = (field: SortField) => {
    if (field !== sortField) return <ChevronsUpDown size={12} />;
    return sortAscending ? <ArrowUp size={12} /> : <ArrowDown size={12} />;
  };

  const observedHours = snapshot
    ? Math.min(24, snapshot.observed_blocks_24h * 12 / 3600)
    : 0;
  const fullWindow = (snapshot?.history_coverage_ratio || 0) >= 0.99;
  const historyLabel = fullWindow
    ? '24小时窗口完整'
    : `运行期已采集 ${formatNumber(observedHours, 1)} 小时`;

  if (loading && !snapshot) {
    return <div className="p-6 text-sm text-gray-400">数据加载中...</div>;
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden">
      <header className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <Pickaxe className="text-accentBlue" size={19} />
            <h2 className="text-base font-bold text-white">矿工竞争分析</h2>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
            <span>{historyLabel}</span>
            {snapshot && <span>区块 #{snapshot.block_number}</span>}
            {snapshot?.beijing_time && <span>{snapshot.beijing_time}</span>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-white/10 bg-white/5 p-1">
            {([
              ['all', '全部'],
              ['open', '开放'],
              ['closed', '关闭']
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setRegistrationFilter(value)}
                className={`px-3 py-1.5 text-xs font-semibold transition ${
                  registrationFilter === value
                    ? 'rounded-md bg-white/10 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <label className="relative w-52">
            <Search className="absolute left-3 top-2 text-gray-500" size={14} />
            <input
              type="search"
              aria-label="搜索子网"
              placeholder="搜索 SN 或名称"
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 py-1.5 pl-9 pr-3 text-xs text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
            />
          </label>

          <button
            type="button"
            onClick={() => fetchData(true)}
            disabled={refreshing}
            title="刷新数据"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-gray-400 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      {error && (
        <div className="flex-shrink-0 rounded border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          {error}
        </div>
      )}

      <section className="glass-card min-h-0 flex-grow overflow-auto rounded-lg">
        <table className="w-full min-w-[1640px] table-fixed border-collapse text-xs">
          <colgroup>
            <col className="w-[150px]" />
            <col className="w-[80px]" />
            <col className="w-[100px]" />
            <col className="w-[105px]" />
            <col className="w-[90px]" />
            <col className="w-[90px]" />
            <col className="w-[75px]" />
            <col className="w-[75px]" />
            <col className="w-[125px]" />
            <col className="w-[110px]" />
            <col className="w-[100px]" />
            <col className="w-[115px]" />
            <col className="w-[115px]" />
            <col className="w-[85px]" />
            <col className="w-[95px]" />
            <col className="w-[90px]" />
          </colgroup>
          <thead className="sticky top-0 z-20 bg-[#0f141f] text-gray-400">
            <tr>
              <SortableHeader label="SN / 名称" field="netuid" onSort={changeSort} icon={sortIcon('netuid')} sticky />
              <Header label="注册状态" />
              <SortableHeader label="注册成本" field="miner_burn_cost" onSort={changeSort} icon={sortIcon('miner_burn_cost')} />
              <SortableHeader label="新UID保护期" field="uid_immunity_period" onSort={changeSort} icon={sortIcon('uid_immunity_period')} />
              <SortableHeader label="矿工燃烧率" field="miner_burned" onSort={changeSort} icon={sortIcon('miner_burned')} />
              <SortableHeader label="UID占用" field="subnetwork_n" onSort={changeSort} icon={sortIcon('subnetwork_n')} />
              <SortableHeader label="活跃UID" field="active_uids" onSort={changeSort} icon={sortIcon('active_uids')} />
              <SortableHeader label="奖励UID" field="rewarded_uids" onSort={changeSort} icon={sortIcon('rewarded_uids')} />
              <SortableHeader label="矿工排放池(日估算)" field="miner_emission_pool_tao_24h" onSort={changeSort} icon={sortIcon('miner_emission_pool_tao_24h')} />
              <SortableHeader label="单UID日均" field="daily_tao_per_uid" onSort={changeSort} icon={sortIcon('daily_tao_per_uid')} />
              <SortableHeader label="前10矿工占比" field="top10_incentive_share" onSort={changeSort} icon={sortIcon('top10_incentive_share')} />
              <SortableHeader label="24H UID注册数" field="reg_count_24h" onSort={changeSort} icon={sortIcon('reg_count_24h')} />
              <SortableHeader label="24H UID替换数" field="replace_count_24h" onSort={changeSort} icon={sortIcon('replace_count_24h')} />
              <SortableHeader label="UID换手率" field="turnover_rate_24h" onSort={changeSort} icon={sortIcon('turnover_rate_24h')} />
              <SortableHeader label="排放趋势" field="emission_trend_percent" onSort={changeSort} icon={sortIcon('emission_trend_percent')} />
              <SortableHeader label="理论回本" field="payback_days" onSort={changeSort} icon={sortIcon('payback_days')} />
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-gray-300">
            {rows.map(subnet => (
              <tr key={subnet.netuid} className="hover:bg-white/[0.03]">
                <td className="sticky left-0 z-10 bg-[#111722] px-2 py-3 text-center">
                  <div className="font-semibold text-blue-400">SN{subnet.netuid}</div>
                  <div className="mx-auto mt-0.5 max-w-[132px] truncate text-[11px] text-gray-400" title={subnet.subnet_name || `SN${subnet.netuid}`}>
                    {subnet.subnet_name || '--'}
                  </div>
                </td>
                <td className="px-2 py-3 text-center">
                  <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${
                    subnet.registration_allowed
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                      : 'border-rose-500/30 bg-rose-500/10 text-rose-400'
                  }`}>
                    {subnet.registration_allowed ? '开放' : '关闭'}
                  </span>
                </td>
                <NumberCell value={`${formatNumber(subnet.miner_burn_cost, 4)} TAO`} color="text-amber-300" />
                <NumberCell value={`${subnet.uid_immunity_period} 块`} />
                <NumberCell
                  value={`${formatNumber(subnet.miner_burned * 100, 1)}%`}
                  color={subnet.miner_burned > 0 ? 'text-red-400' : ''}
                />
                <NumberCell value={`${subnet.subnetwork_n} / ${subnet.max_allowed_uids}`} />
                <NumberCell value={String(subnet.active_uids)} color="text-emerald-400" />
                <NumberCell value={String(subnet.rewarded_uids)} color="text-blue-400" />
                <NumberCell value={`${formatNumber(subnet.miner_emission_pool_tao_24h, 4)} TAO`} />
                <NumberCell value={`${formatNumber(subnet.daily_tao_per_uid, 4)} TAO`} color="text-cyan-300" />
                <NumberCell value={`${formatNumber(subnet.top10_incentive_share, 1)}%`} />
                <NumberCell value={String(subnet.reg_count_24h)} />
                <NumberCell value={subnet.replace_count_24h === null ? '--' : String(subnet.replace_count_24h)} />
                <NumberCell value={nullableNumber(subnet.turnover_rate_24h, '%')} />
                <td className="px-2 py-3 text-center">
                  <TrendValue value={subnet.emission_trend_percent} />
                </td>
                <NumberCell value={nullableNumber(subnet.payback_days, ' 天', 1)} />
              </tr>
            ))}
          </tbody>
        </table>

        {!error && rows.length === 0 && (
          <div className="py-12 text-center text-xs text-gray-500">暂无匹配数据</div>
        )}
      </section>
    </div>
  );
}

function Header({ label }: { label: string }) {
  return <th className="border-b border-white/5 px-2 py-3 text-center font-semibold whitespace-nowrap">{label}</th>;
}

function SortableHeader({
  label,
  field,
  onSort,
  icon,
  sticky = false
}: {
  label: string;
  field: SortField;
  onSort: (field: SortField) => void;
  icon: React.ReactNode;
  sticky?: boolean;
}) {
  return (
    <th className={`border-b border-white/5 px-2 py-3 text-center font-semibold whitespace-nowrap ${sticky ? 'sticky left-0 z-30 bg-[#0f141f]' : ''}`}>
      <button type="button" onClick={() => onSort(field)} className="inline-flex w-full items-center justify-center gap-1 hover:text-white">
        {label}
        {icon}
      </button>
    </th>
  );
}

function NumberCell({ value, color = '' }: { value: string; color?: string }) {
  return <td className={`px-2 py-3 text-center font-mono whitespace-nowrap ${color}`}>{value}</td>;
}

function TrendValue({ value }: { value: number | null }) {
  if (value === null) return <span className="text-gray-500">--</span>;
  if (value > 1) {
    return <span className="inline-flex items-center gap-1 text-emerald-400"><TrendingUp size={13} />{formatNumber(value, 1)}%</span>;
  }
  if (value < -1) {
    return <span className="inline-flex items-center gap-1 text-rose-400"><TrendingDown size={13} />{formatNumber(value, 1)}%</span>;
  }
  return <span className="inline-flex items-center gap-1 text-gray-400"><Minus size={13} />{formatNumber(value, 1)}%</span>;
}
