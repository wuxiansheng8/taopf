import { useMemo, useState, type ReactNode } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  SortingState
} from '@tanstack/react-table';
import { SubnetBlockData } from '../../../shared/types.ts';

interface SubnetsTableProps {
  data: SubnetBlockData[];
  comparison24hData?: SubnetBlockData[];
  showShareTrend?: boolean;
}

const columnHelper = createColumnHelper<SubnetBlockData>();

export default function SubnetsTable({ 
  data, 
  comparison24hData = [], 
  showShareTrend = false 
}: SubnetsTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);

  // 将 24H 排放数据转化为 Map 方便 O(1) 匹配
  const comparisonMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const item of comparison24hData) {
      map.set(item.netuid, item.emission_share);
    }
    return map;
  }, [comparison24hData]);

  const columns = useMemo(
    () => [
      columnHelper.accessor('netuid', {
        header: '子网 ID',
        cell: (info) => <span className="font-bold text-white">SN{info.getValue()}</span>
      }),
      columnHelper.accessor('status', {
        header: '排放状态',
        cell: (info) => {
          const enabled = info.row.original.enabled;
          const color = enabled
            ? 'text-green-400 bg-green-500/10 border-green-500/20'
            : 'text-red-400 bg-red-500/10 border-red-500/20';
          return (
            <span className={`px-2 py-0.5 text-xs rounded border ${color} font-medium`}>
              {enabled ? '启用' : '停用'}
            </span>
          );
        }
      }),
      columnHelper.accessor('emission_share', {
        header: '排放占比',
        cell: (info) => {
          const value = info.getValue();
          const percent = value * 100;
          const decimals = percent >= 0.01 ? 2 : 4;
          const displayedString = percent.toFixed(decimals);
          
          let trendIndicator = null;
          
          if (showShareTrend && comparisonMap.size > 0) {
            const netuid = info.row.original.netuid;
            const share24h = comparisonMap.get(netuid);
            
            if (share24h !== undefined) {
              const percent24h = share24h * 100;
              const decimals24h = percent24h >= 0.01 ? 2 : 4;
              const displayedString24h = percent24h.toFixed(decimals24h);
              
              const currentRounded = parseFloat(displayedString);
              const rounded24h = parseFloat(displayedString24h);
              const tooltipText = `24H 平均占比: ${displayedString24h}%`;
              
              if (currentRounded > rounded24h) {
                trendIndicator = (
                  <span 
                    className="inline-flex items-center justify-center p-1 rounded bg-green-500/10 text-green-400 border border-green-500/20"
                    title={tooltipText}
                  >
                    <TrendingUp size={12} className="stroke-[2.5]" />
                  </span>
                );
              } else if (currentRounded < rounded24h) {
                trendIndicator = (
                  <span 
                    className="inline-flex items-center justify-center p-1 rounded bg-red-500/10 text-red-400 border border-red-500/20"
                    title={tooltipText}
                  >
                    <TrendingDown size={12} className="stroke-[2.5]" />
                  </span>
                );
              } else {
                trendIndicator = (
                  <span 
                    className="inline-flex items-center justify-center p-1 rounded bg-amber-500/5 text-amber-400 border border-amber-500/10"
                    title={tooltipText}
                  >
                    <Minus size={12} className="stroke-[2.5]" />
                  </span>
                );
              }
            }
          }

          return (
            <div className="flex items-center gap-2">
              <span className="font-semibold text-cyan-300">
                {displayedString}%
              </span>
              {trendIndicator}
            </div>
          );
        }
      }),
      columnHelper.accessor('tao_in', {
        header: '池子 TAO 注入',
        cell: (info) => <span className="font-semibold text-white">{info.getValue().toFixed(4)}</span>
      }),
      columnHelper.accessor('alpha_in', {
        header: '池子 Alpha 注入',
        cell: (info) => <span className="font-semibold text-white">{info.getValue().toFixed(4)}</span>
      }),
      columnHelper.accessor('excess_tao', {
        header: '回购 TAO',
        cell: (info) => <span className="font-semibold text-white">{info.getValue().toFixed(4)}</span>
      }),
      columnHelper.accessor('alpha_price', {
        header: 'Alpha 现价',
        cell: (info) => <span className="text-blue-400 font-semibold">{info.getValue().toFixed(6)}</span>
      }),
      columnHelper.accessor('moving_price', {
        header: 'Alpha EMA',
        cell: (info) => <span className="text-purple-400 font-semibold">{info.getValue().toFixed(6)}</span>
      }),
      columnHelper.accessor('root_prop', {
        header: '根比例',
        cell: (info) => <span className="text-orange-400 font-semibold">{(info.getValue() * 100).toFixed(2)}%</span>
      }),
      columnHelper.accessor('miner_burned', {
        header: '矿工燃烧率',
        cell: (info) => {
          const val = info.getValue();
          const percent = (val * 100).toFixed(2);
          const isHigh = val > 0;
          return (
            <span className={`font-semibold ${isHigh ? 'text-red-400 font-bold' : 'text-gray-400'}`}>
              {percent}%
            </span>
          );
        }
      }),
      columnHelper.accessor('subnet_tao', {
        header: '池子 TAO 储备',
        cell: (info) => <span>{info.getValue().toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      }),
      columnHelper.accessor('subnet_alpha', {
        header: '池子 Alpha 储备',
        cell: (info) => <span>{info.getValue().toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      }),
      columnHelper.accessor('total_neuron_em', {
        header: '神经元排放(TAO)',
        cell: (info) => <span className="font-semibold text-white">{info.getValue().toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</span>
      }),
      columnHelper.accessor('registration_allowed', {
        header: '矿工/验证者名额',
        sortingFn: (rowA, rowB) => {
          const getRemainingSlots = (subnet: SubnetBlockData) => {
            if (!subnet.registration_allowed) return -1;
            return Math.max(0, subnet.max_allowed_uids - subnet.subnetwork_n);
          };

          return getRemainingSlots(rowA.original) - getRemainingSlots(rowB.original);
        },
        cell: (info) => {
          const subnet = info.row.original;
          if (!info.getValue()) {
            return (
              <span className="px-2 py-0.5 text-xs rounded border text-red-400 bg-red-500/10 border-red-500/20 font-medium">
                注册关闭
              </span>
            );
          }

          return (
            <span className="font-semibold text-white">
              {subnet.subnetwork_n}/{subnet.max_allowed_uids}
            </span>
          );
        }
      })
    ],
    [comparisonMap, showShareTrend]
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableSortingRemoval: true
  });

  const { totalShare, totalTaoIn, totalAlphaIn, totalExcessTao, totalNeuronEm } = useMemo(() => {
    let tShare = 0, tTaoIn = 0, tAlphaIn = 0, tExcess = 0, tNeuron = 0;
    for (const item of data) {
      tShare += item.emission_share || 0;
      tTaoIn += item.tao_in || 0;
      tAlphaIn += item.alpha_in || 0;
      tExcess += item.excess_tao || 0;
      tNeuron += item.total_neuron_em || 0;
    }
    return {
      totalShare: tShare,
      totalTaoIn: tTaoIn,
      totalAlphaIn: tAlphaIn,
      totalExcessTao: tExcess,
      totalNeuronEm: tNeuron
    };
  }, [data]);

  return (
    <div className="glass-card overflow-hidden shadow-xl h-full flex flex-col">
      <div className="overflow-x-auto overflow-y-auto flex-grow">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="bg-[#0f141f]/80">
                <th className="px-4 py-3 border-b border-white/5 font-semibold text-gray-400 select-none sticky top-0 z-10 bg-[#0f141f] text-left">
                  序号
                </th>
                {headerGroup.headers.map((header) => {
                  const isSortable = header.column.getCanSort();
                  const sortDir = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      onClick={header.column.getToggleSortingHandler()}
                      className={`px-4 py-3 border-b border-white/5 font-semibold text-gray-400 select-none sticky top-0 z-10 bg-[#0f141f] text-left ${
                        isSortable ? 'cursor-pointer hover:text-white' : ''
                      }`}
                    >
                      <div className="flex items-center justify-start gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {isSortable && (
                          <span className="text-[10px] opacity-60">
                            {sortDir === 'desc' ? '▼' : sortDir === 'asc' ? '▲' : '↕'}
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, idx) => {
              const subnet = row.original;
              const isInactive = !subnet.enabled;
              return (
                <tr
                  key={row.id}
                  className={`border-b border-white/5 hover:bg-white/[0.02] transition-colors duration-150 ${
                    isInactive ? 'opacity-50 text-gray-400' : ''
                  }`}
                >
                  <td className="px-4 py-3 align-middle text-gray-500 font-mono text-left">
                    {idx + 1}
                  </td>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3 align-middle text-left">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              {/* 1. 硬编码序号列 - 留空 */}
              <td className="sticky bottom-0 bg-[#0f141f]/95 backdrop-blur-md border-t border-white/10 px-4 py-3 align-middle text-gray-500 font-mono z-20 text-left"></td>
              
              {/* 2. TanStack Table 动态单元格 */}
              {table.getVisibleFlatColumns().map((column) => {
                const colId = column.id;
                let content: ReactNode = null;
                let className = "sticky bottom-0 bg-[#0f141f]/95 backdrop-blur-md border-t border-white/10 px-4 py-3 align-middle z-20 text-left";

                if (colId === 'netuid') {
                  content = "合计";
                  className += " font-bold text-white";
                } else if (colId === 'emission_share') {
                  content = `${(totalShare * 100).toFixed(2)}%`;
                  className += " text-cyan-300 font-semibold";
                } else if (colId === 'tao_in') {
                  content = totalTaoIn.toFixed(4);
                  className += " font-semibold text-white";
                } else if (colId === 'alpha_in') {
                  content = totalAlphaIn.toFixed(4);
                  className += " font-semibold text-white";
                } else if (colId === 'excess_tao') {
                  content = totalExcessTao.toFixed(4);
                  className += " font-semibold text-white";
                } else if (colId === 'total_neuron_em') {
                  content = totalNeuronEm.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
                  className += " font-semibold text-white";
                }

                return (
                  <td key={column.id} className={className}>
                    {content}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
