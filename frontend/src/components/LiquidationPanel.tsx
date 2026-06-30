import React from 'react';
import { LiquidationSnapshot, LiquidationSubnet } from '../../../shared/types.ts';
import { Shield, ShieldAlert, Cpu, AlertTriangle, Clock, RefreshCw } from 'lucide-react';

interface LiquidationPanelProps {
  snapshot: LiquidationSnapshot | null;
}

export default function LiquidationPanel({ snapshot }: LiquidationPanelProps) {
  if (!snapshot) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 space-y-4">
        <RefreshCw className="animate-spin text-accentBlue" size={32} />
        <div className="text-sm font-semibold tracking-wide">等待主网区块数据同步中...</div>
        <div className="text-xs text-gray-500 max-w-xs text-center leading-relaxed">
          首个区块数据加载需要几秒钟，请稍候。本页面将与最新区块状态保持实时一致。
        </div>
      </div>
    );
  }

  const {
    block_number,
    beijing_time,
    total_networks,
    subnet_limit,
    current_lock_cost,
    network_immunity_period,
    prune_candidate,
    immune_count,
    non_immune_count,
    lowest_ema_subnets,
    immune_subnets,
  } = snapshot;

  function formatDuration(seconds: number): string {
    if (seconds <= 0) return '已结束';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days > 0) {
      return `${days}天 ${hours}小时`;
    }
    if (hours > 0) {
      return `${hours}小时 ${minutes}分钟`;
    }
    return `${minutes}分钟`;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden space-y-4 text-white">
      {/* Top Banner Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 flex-shrink-0">
        
        {/* Card 1: Subnet Limit */}
        <div className="glass-card p-4 flex items-center justify-between border-l-4 border-blue-500 bg-gradient-to-r from-blue-500/5 to-transparent">
          <div>
            <div className="text-xs text-gray-400 font-semibold mb-1">当前子网规模</div>
            <div className="text-2xl font-bold tracking-tight text-blue-400">
              {total_networks} <span className="text-xs text-gray-500">/ {subnet_limit}</span>
            </div>
          </div>
          <Cpu className="text-blue-500/50" size={24} />
        </div>

        {/* Card 2: Immunity Period */}
        <div className="glass-card p-4 flex items-center justify-between border-l-4 border-cyan-500 bg-gradient-to-r from-cyan-500/5 to-transparent">
          <div>
            <div className="text-xs text-gray-400 font-semibold mb-1">子网保护期</div>
            <div className="text-2xl font-bold tracking-tight text-cyan-400">
              {network_immunity_period.toLocaleString()}{' '}
              <span className="text-xs text-gray-500">区块</span>
            </div>
          </div>
          <Clock className="text-cyan-500/50" size={24} />
        </div>

        {/* Card 3: Reg Cost */}
        <div className="glass-card p-4 flex items-center justify-between border-l-4 border-emerald-500 bg-gradient-to-r from-emerald-500/5 to-transparent">
          <div>
            <div className="text-xs text-gray-400 font-semibold mb-1">新建注册成本</div>
            <div className="text-2xl font-bold tracking-tight text-emerald-400">
              {current_lock_cost.toFixed(2)}{' '}
              <span className="text-xs text-gray-500">TAO</span>
            </div>
          </div>
          <span className="text-emerald-500/50 font-bold text-lg">τ</span>
        </div>

        {/* Card 4: Subnets Status */}
        <div className="glass-card p-4 flex items-center justify-between border-l-4 border-purple-500 bg-gradient-to-r from-purple-500/5 to-transparent">
          <div>
            <div className="text-xs text-gray-400 font-semibold mb-1">子网状态分布</div>
            <div className="text-sm font-semibold mt-1.5 flex gap-3">
              <span className="flex items-center gap-1 text-cyan-400">
                <Shield size={12} />
                免疫: {immune_count}
              </span>
              <span className="flex items-center gap-1 text-rose-400">
                <ShieldAlert size={12} />
                非免疫: {non_immune_count}
              </span>
            </div>
          </div>
        </div>

        {/* Card 5: Block info */}
        <div className="glass-card p-4 flex flex-col justify-center">
          <div className="text-xs text-gray-500 font-semibold">最新统计区块</div>
          <div className="text-sm font-bold text-gray-300 mt-1">#{block_number}</div>
          <div className="text-[10px] text-gray-500 mt-0.5">{beijing_time}</div>
        </div>

      </div>

      {/* Pruning Candidate Hero Alert */}
      {prune_candidate && (
        <div className="glass-card p-4 border border-rose-500/30 bg-gradient-to-r from-rose-950/20 via-transparent to-transparent flex items-center justify-between flex-shrink-0 shadow-[0_0_15px_rgba(239,68,68,0.05)] animate-pulse hover:animate-none">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400">
              <AlertTriangle size={24} />
            </div>
            <div>
              <div className="text-xs text-rose-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <span>下个可淘汰候选子网 (Prune Candidate)</span>
              </div>
              <div className="text-lg font-bold text-white mt-0.5">
                SN {prune_candidate.netuid} -{' '}
                <span className="text-rose-300 font-semibold">{prune_candidate.subnet_name || 'Unnamed Subnet'}</span>
              </div>
              <div className="text-xs text-gray-400 mt-1 flex items-center gap-4">
                <span>
                  EMA 价格:{' '}
                  <span className="text-rose-400 font-semibold">
                    {prune_candidate.moving_price === 0
                      ? '未初始化'
                      : prune_candidate.moving_price.toFixed(6)}
                  </span>
                </span>
                <span>
                  锁仓成本:{' '}
                  <span className="text-gray-300 font-semibold">
                    {prune_candidate.locked_tao.toFixed(2)} TAO
                  </span>
                </span>
                <span>
                  注册于区块:{' '}
                  <span className="text-gray-300 font-semibold">
                    #{prune_candidate.registered_block}
                  </span>
                </span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <span className="inline-block px-3 py-1 rounded bg-rose-500/10 border border-rose-500/20 text-[10px] font-bold text-rose-300">
              面临清算风险
            </span>
          </div>
        </div>
      )}

      {/* Tables section */}
      <div className="flex-grow grid grid-cols-1 lg:grid-cols-2 gap-4 overflow-hidden min-h-0">
        
        {/* Left Table: Pruning Risk Ranking (Lowest EMA top 10) */}
        <div className="glass-card flex flex-col overflow-hidden">
          <div className="p-4 border-b border-white/5 flex items-center gap-2 flex-shrink-0">
            <ShieldAlert className="text-rose-400" size={16} />
            <h3 className="text-sm font-bold text-white">淘汰风险排行榜 (非免疫期最低 EMA)</h3>
          </div>
          <div className="flex-grow overflow-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 bg-[#0e131f] text-gray-400 font-semibold uppercase tracking-wider text-[10px] border-b border-white/5">
                <tr>
                  <th className="py-3 px-4 w-12 text-center">排名</th>
                  <th className="py-3 px-3 w-16">NetUID</th>
                  <th className="py-3 px-3">子网名称</th>
                  <th className="py-3 px-3 text-right">EMA 价格</th>
                  <th className="py-3 px-3 text-right">注册成本 (Locked)</th>
                  <th className="py-3 px-4 text-center">注册区块</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {lowest_ema_subnets.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-500 font-medium">
                      暂无可被清算的非免疫期子网
                    </td>
                  </tr>
                ) : (
                  lowest_ema_subnets.map((sub, index) => (
                    <tr 
                      key={sub.netuid} 
                      className={`hover:bg-white/5 transition-colors ${
                        index === 0 ? 'bg-rose-500/5' : ''
                      }`}
                    >
                      <td className="py-3 px-4 text-center font-bold">
                        <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] ${
                          index === 0 
                            ? 'bg-rose-500 text-white font-extrabold shadow-[0_0_8px_rgba(239,68,68,0.4)]' 
                            : index < 3 
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' 
                              : 'bg-white/5 text-gray-400'
                        }`}>
                          {index + 1}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-semibold text-gray-400">SN {sub.netuid}</td>
                      <td className="py-3 px-3 font-semibold text-white">
                        {sub.subnet_name || 'Unnamed Subnet'}
                      </td>
                      <td className="py-3 px-3 text-right font-semibold">
                        {sub.moving_price === 0 ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-500/10 text-rose-300 border border-rose-500/15">
                            未初始化
                          </span>
                        ) : (
                          <span className={index === 0 ? 'text-rose-400 font-bold' : 'text-gray-300'}>
                            {sub.moving_price.toFixed(6)}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right text-gray-300 font-medium">
                        {sub.locked_tao.toFixed(2)} TAO
                      </td>
                      <td className="py-3 px-4 text-center text-gray-500">
                        #{sub.registered_block}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Table: Immune Subnets List */}
        <div className="glass-card flex flex-col overflow-hidden">
          <div className="p-4 border-b border-white/5 flex items-center gap-2 flex-shrink-0">
            <Shield className="text-cyan-400" size={16} />
            <h3 className="text-sm font-bold text-white">免疫保护期内子网</h3>
          </div>
          <div className="flex-grow overflow-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 bg-[#0e131f] text-gray-400 font-semibold uppercase tracking-wider text-[10px] border-b border-white/5">
                <tr>
                  <th className="py-3 px-4 w-16">NetUID</th>
                  <th className="py-3 px-3">子网名称</th>
                  <th className="py-3 px-3 text-right">锁仓成本 (Locked)</th>
                  <th className="py-3 px-3 text-center">注册区块</th>
                  <th className="py-3 px-3 text-center">免疫结束区块</th>
                  <th className="py-3 px-4 text-right">剩余保护时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {immune_subnets.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-500 font-medium">
                      当前没有处于免疫期内的子网
                    </td>
                  </tr>
                ) : (
                  immune_subnets.map((sub) => (
                    <tr key={sub.netuid} className="hover:bg-white/5 transition-colors">
                      <td className="py-3 px-4 font-semibold text-gray-400">SN {sub.netuid}</td>
                      <td className="py-3 px-3 font-semibold text-white">
                        {sub.subnet_name || 'Unnamed Subnet'}
                      </td>
                      <td className="py-3 px-3 text-right text-gray-300 font-medium">
                        {sub.locked_tao.toFixed(2)} TAO
                      </td>
                      <td className="py-3 px-3 text-center text-gray-500">
                        #{sub.registered_block}
                      </td>
                      <td className="py-3 px-3 text-center text-gray-500">
                        #{sub.immunity_end_block}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-cyan-400">
                        {formatDuration(sub.remaining_seconds)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
