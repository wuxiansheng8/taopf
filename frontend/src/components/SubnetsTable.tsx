import { useMemo, useState, type ReactNode } from 'react';
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
}

const columnHelper = createColumnHelper<SubnetBlockData>();

export default function SubnetsTable({ data }: SubnetsTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns = useMemo(
    () => [
      columnHelper.accessor('netuid', {
        header: '子网 ID',
        cell: (info) => <span className="font-bold text-white">SN{info.getValue()}</span>
      }),
      columnHelper.accessor('status', {
        header: '排放状态',
        cell: (info) => {
          const val = info.getValue();
          const color = val === '正常排放'
            ? 'text-green-400 bg-green-500/10 border-green-500/20'
            : 'text-red-400 bg-red-500/10 border-red-500/20';
          return (
            <span className={`px-2 py-0.5 text-xs rounded border ${color} font-medium`}>
              {val}
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
          return (
            <span className="font-semibold text-cyan-300">
              {percent.toFixed(decimals)}%
            </span>
          );
        }
      }),
      columnHelper.accessor('tao_in', {
        header: 'TAO 注入量',
        cell: (info) => <span className="font-semibold text-white">{info.getValue().toFixed(4)}</span>
      }),
      columnHelper.accessor('alpha_in', {
        header: 'Alpha 注入量',
        cell: (info) => <span className="font-semibold text-white">{info.getValue().toFixed(4)}</span>
      }),
      columnHelper.accessor('excess_tao', {
        header: '回购 TAO',
        cell: (info) => <span className="font-semibold text-white">{info.getValue().toFixed(4)}</span>
      }),
      columnHelper.accessor('alpha_price', {
        header: 'Alpha 价格',
        cell: (info) => <span className="text-blue-400 font-semibold">{info.getValue().toFixed(6)}</span>
      }),
      columnHelper.accessor('moving_price', {
        header: 'EMA 价格',
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
        header: '神经元排放',
        cell: (info) => <span className="font-semibold text-white">{info.getValue().toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</span>
      })
    ],
    []
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
                <th className="p-4 border-b border-white/5 font-semibold text-gray-400 select-none sticky top-0 z-10 bg-[#0f141f]">
                  序号
                </th>
                {headerGroup.headers.map((header) => {
                  const isSortable = header.column.getCanSort();
                  const sortDir = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      onClick={header.column.getToggleSortingHandler()}
                      className={`p-4 border-b border-white/5 font-semibold text-gray-400 select-none sticky top-0 z-10 bg-[#0f141f] ${
                        isSortable ? 'cursor-pointer hover:text-white' : ''
                      }`}
                    >
                      <div className="flex items-center gap-1">
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
              const isInactive = subnet.status === '禁止排放';
              return (
                <tr
                  key={row.id}
                  className={`border-b border-white/5 hover:bg-white/[0.02] transition-colors duration-150 ${
                    isInactive ? 'opacity-50 text-gray-400' : ''
                  }`}
                >
                  <td className="p-3 align-middle text-gray-500 font-mono">
                    {idx + 1}
                  </td>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="p-3 align-middle">
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
              <td className="sticky bottom-0 bg-[#0f141f]/95 backdrop-blur-md border-t border-white/10 p-3 align-middle text-gray-500 font-mono z-20"></td>
              
              {/* 2. TanStack Table 动态单元格 */}
              {table.getVisibleFlatColumns().map((column) => {
                const colId = column.id;
                let content: ReactNode = null;
                let className = "sticky bottom-0 bg-[#0f141f]/95 backdrop-blur-md border-t border-white/10 p-3 align-middle z-20";

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
