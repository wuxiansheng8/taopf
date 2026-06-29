import { useMemo, useState } from 'react';
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
        cell: (info) => <span className="font-bold text-white">{info.getValue()}</span>
      }),
      columnHelper.accessor('status', {
        header: '排放状态',
        cell: (info) => {
          const val = info.getValue();
          let color = 'text-gray-400 bg-gray-500/10 border-gray-500/20';
          if (val === '本块有注入') {
            color = 'text-green-400 bg-green-500/10 border-green-500/20';
          } else if (val === '排放开关正常') {
            color = 'text-blue-400 bg-blue-500/10 border-blue-500/20';
          } else if (val === '排放禁用') {
            color = 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20';
          }
          return (
            <span className={`px-2 py-0.5 text-xs rounded border ${color} font-medium`}>
              {val}
            </span>
          );
        }
      }),
      columnHelper.accessor('tempo', {
        header: '周期 (区块)'
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
      }),
      columnHelper.accessor('owner', {
        header: '所有者 Hotkey',
        cell: (info) => (
          <span className="font-mono text-[10px] text-gray-400 block max-w-[120px] truncate" title={info.getValue()}>
            {info.getValue()}
          </span>
        )
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
    enableSortingRemoval: true // Enables third click to clear sorting
  });

  return (
    <div className="glass-card overflow-hidden shadow-xl">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="bg-[#0f141f]/80">
                {headerGroup.headers.map((header) => {
                  const isSortable = header.column.getCanSort();
                  const sortDir = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      onClick={header.column.getToggleSortingHandler()}
                      className={`p-4 border-b border-white/5 font-semibold text-gray-400 select-none ${
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
            {table.getRowModel().rows.map((row) => {
              const subnet = row.original;
              const isInactive = subnet.status === '排放禁用';
              return (
                <tr
                  key={row.id}
                  className={`border-b border-white/5 hover:bg-white/[0.02] transition-colors duration-150 ${
                    isInactive ? 'opacity-50 text-gray-400' : ''
                  }`}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="p-3 align-middle">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
