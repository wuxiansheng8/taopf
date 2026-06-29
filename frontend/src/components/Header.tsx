import { useEffect, useState } from 'react';

interface HeaderProps {
  lastSuccessBlock: number;
  latestChainBlock: number;
  beijingTime: string;
  uptimeSeconds: number;
}

export default function Header({
  lastSuccessBlock,
  latestChainBlock,
  beijingTime,
  uptimeSeconds
}: HeaderProps) {
  const [localUptime, setLocalUptime] = useState(uptimeSeconds);

  // Keep a local counter for uptime to tick every second
  useEffect(() => {
    setLocalUptime(uptimeSeconds);
  }, [uptimeSeconds]);

  useEffect(() => {
    const timer = setInterval(() => {
      setLocalUptime((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatUptime = (seconds: number) => {
    if (seconds <= 0) return '0秒';
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;

    const parts = [];
    if (d > 0) parts.push(`${d}天`);
    if (h > 0 || d > 0) parts.push(`${h}小时`);
    if (m > 0 || h > 0 || d > 0) parts.push(`${m}分`);
    parts.push(`${s}秒`);
    return parts.join(' ');
  };

  const delay = Math.max(0, latestChainBlock - lastSuccessBlock);
  const delayColor = delay === 0 ? 'text-green-500' : delay < 3 ? 'text-yellow-500' : 'text-red-500';

  return (
    <header className="glass-card px-6 py-4 mb-4 flex items-center justify-between shadow-lg">
      <div className="flex items-center gap-6">
        <div className="flex flex-col">
          <span className="text-[10px] text-gray-400 font-semibold tracking-wider uppercase">最后成功区块</span>
          <span className="text-base font-bold text-white">#{lastSuccessBlock || '-'}</span>
        </div>

        <div className="h-8 w-[1px] bg-white/5" />

        <div className="flex flex-col">
          <span className="text-[10px] text-gray-400 font-semibold tracking-wider uppercase">同步延迟</span>
          <span className={`text-base font-bold ${delayColor}`}>
            {delay} 块 {delay === 0 ? ' (同步中)' : ' (滞后)'}
          </span>
        </div>

        <div className="h-8 w-[1px] bg-white/5" />

        <div className="flex flex-col">
          <span className="text-[10px] text-gray-400 font-semibold tracking-wider uppercase">最新链上高度</span>
          <span className="text-base font-bold text-white">#{latestChainBlock || '-'}</span>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex flex-col items-end">
          <span className="text-[10px] text-gray-400 font-semibold tracking-wider uppercase">北京时间</span>
          <span className="text-sm font-semibold text-white">{beijingTime || '-'}</span>
        </div>

        <div className="h-8 w-[1px] bg-white/5" />

        <div className="flex flex-col items-end">
          <span className="text-[10px] text-gray-400 font-semibold tracking-wider uppercase">系统运行时间</span>
          <span className="text-sm font-semibold text-white">{formatUptime(localUptime)}</span>
        </div>
      </div>
    </header>
  );
}
