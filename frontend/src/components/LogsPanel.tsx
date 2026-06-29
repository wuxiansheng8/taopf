import { useState, useEffect } from 'react';
import client from '../api/client.ts';

export interface LogItem {
  level: 'INFO' | 'WARN' | 'ERROR';
  message: string;
  timestamp: string;
}

interface LogsPanelProps {
  realtimeLogs: LogItem[];
}

export default function LogsPanel({ realtimeLogs }: LogsPanelProps) {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [level, setLevel] = useState<string>('ALL');

  // Load initial logs on mount or when filter changes
  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await client.get(`/api/logs?level=${level}`);
        setLogs(res.data);
      } catch (err) {
        console.error('Failed to fetch logs:', err);
      }
    };
    fetchLogs();
  }, [level]);

  // Merge real-time logs that match the current filter
  useEffect(() => {
    if (realtimeLogs.length === 0) return;
    const latest = realtimeLogs[0]; // The newest real-time log is always at index 0
    
    if (level === 'ALL' || latest.level === level) {
      setLogs((prev) => {
        // Prepend and cap at 200 to prevent browser slowdowns
        const updated = [latest, ...prev];
        if (updated.length > 200) {
          updated.pop();
        }
        return updated;
      });
    }
  }, [realtimeLogs, level]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-white">📜 系统运行日志</h2>
          <p className="text-xs text-gray-400">显示实时运行记录，自动清理2天以上的历史日志。</p>
        </div>
        
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">日志级别过滤:</span>
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            className="glass-input px-3 py-1.5 text-xs bg-slate-900 border border-white/10 rounded focus:border-blue-500"
          >
            <option value="ALL">全部 (ALL)</option>
            <option value="INFO">信息 (INFO)</option>
            <option value="WARN">警告 (WARN)</option>
            <option value="ERROR">错误 (ERROR)</option>
          </select>
        </div>
      </div>

      {/* Terminal View */}
      <div className="flex-grow flex flex-col overflow-hidden rounded-xl border border-white/10 glass-card">
        {/* Terminal Header */}
        <div className="bg-[#0a0c12]/80 px-4 py-3 flex items-center gap-2 border-b border-white/10">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
          <span className="font-mono text-xs text-gray-500 ml-2">taopf-terminal.log</span>
        </div>
        
        {/* Terminal Body */}
        <div className="flex-grow bg-[#05070a] p-4 overflow-y-auto font-mono text-xs space-y-2 select-text">
          {logs.length === 0 ? (
            <div className="text-gray-500 italic text-center py-8">暂无匹配的运行日志...</div>
          ) : (
            logs.map((log, idx) => {
              let levelColor = 'text-blue-400';
              if (log.level === 'WARN') levelColor = 'text-yellow-400';
              if (log.level === 'ERROR') levelColor = 'text-red-400';
              
              return (
                <div key={idx} className="flex gap-4 border-b border-white/[0.01] pb-1 hover:bg-white/[0.02]">
                  <span className="text-gray-600 flex-shrink-0">{log.timestamp}</span>
                  <span className={`font-bold flex-shrink-0 w-12 ${levelColor}`}>[{log.level}]</span>
                  <span className="text-gray-300 break-all">{log.message}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
