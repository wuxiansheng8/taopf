import { useState, useEffect, useMemo } from 'react';
import Login from './pages/Login.tsx';
import Header from './components/Header.tsx';
import SubnetsTable from './components/SubnetsTable.tsx';
import LogsPanel, { LogItem } from './components/LogsPanel.tsx';
import SettingsPanel from './components/SettingsPanel.tsx';
import LiquidationPanel from './components/LiquidationPanel.tsx';
import client from './api/client.ts';
import { SubnetBlockData, LiquidationSnapshot } from '../../shared/types.ts';
import { Activity, Terminal, Settings, Lock, TrendingDown } from 'lucide-react';

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('taopf_token'));
  const [activeTab, setActiveTab] = useState<'dashboard' | 'liquidation' | 'logs' | 'settings'>('dashboard');
  const [dataMode, setDataMode] = useState<'current' | '24h'>('current');

  // Stats State
  const [lastSuccessBlock, setLastSuccessBlock] = useState(0);
  const [latestChainBlock, setLatestChainBlock] = useState(0);
  const [beijingTime, setBeijingTime] = useState('');
  const [uptimeSeconds, setUptimeSeconds] = useState(0);
  const [subnetsData, setSubnetsData] = useState<SubnetBlockData[]>([]);
  const [liquidationSnapshot, setLiquidationSnapshot] = useState<LiquidationSnapshot | null>(null);

  // Logs stream
  const [realtimeLogs, setRealtimeLogs] = useState<LogItem[]>([]);

  // Toggle modes
  const handleToggleMode = (mode: 'current' | '24h') => {
    setDataMode(mode);
  };

  const handleLogout = () => {
    localStorage.removeItem('taopf_token');
    setToken(null);
  };

  // Fetch initial data
  const fetchData = async () => {
    try {
      const url = dataMode === 'current' ? '/api/emissions/current' : '/api/emissions/24h';
      const res = await client.get(url);
      
      if (dataMode === 'current') {
        setLastSuccessBlock(res.data.block_number);
        setLatestChainBlock((prev) => Math.max(prev, res.data.block_number));
        setBeijingTime(res.data.beijing_time);
        setSubnetsData(res.data.subnets || []);
      } else {
        setSubnetsData(res.data || []);
      }
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    }
  };

  const fetchLiquidationData = async () => {
    try {
      const res = await client.get('/api/liquidation/current');
      setLiquidationSnapshot(res.data);
      setLastSuccessBlock(res.data.block_number);
      setLatestChainBlock((prev) => Math.max(prev, res.data.block_number));
      setBeijingTime(res.data.beijing_time);
    } catch (err) {
      console.error('Failed to load liquidation snapshot:', err);
    }
  };

  useEffect(() => {
    if (!token) return;
    if (activeTab === 'dashboard') {
      fetchData();
    } else if (activeTab === 'liquidation') {
      fetchLiquidationData();
    }
  }, [token, dataMode, activeTab]);

  // Subscribe to SSE
  useEffect(() => {
    if (!token) return;

    const sse = new EventSource('/api/stream');

    sse.addEventListener('block', (e) => {
      const data = JSON.parse(e.data);
      setLastSuccessBlock(data.block_number);
      setLatestChainBlock(data.block_number);
      setBeijingTime(data.beijing_time);
      setUptimeSeconds(data.uptime);
      
      if (data.liquidation) {
        setLiquidationSnapshot(data.liquidation);
      }

      if (activeTab === 'dashboard') {
        if (dataMode === 'current') {
          setSubnetsData(data.subnets || []);
        } else {
          // In 24h mode, pull latest rolling stats
          fetchData();
        }
      }
    });

    sse.addEventListener('log', (e) => {
      const log = JSON.parse(e.data);
      // Prepend to realtimeLogs queue
      setRealtimeLogs((prev) => [log, ...prev].slice(0, 10));
    });

    sse.onerror = () => {
      console.warn('SSE 连接异常，浏览器正在尝试自动重连...');
    };

    return () => sse.close();
  }, [token, dataMode, activeTab]);

  // Totals calculations
  const totals = useMemo(() => {
    let inflow = 0;
    let buyback = 0;
    subnetsData.forEach((s) => {
      inflow += s.tao_in || 0;
      buyback += s.excess_tao || 0;
    });
    return { inflow, buyback };
  }, [subnetsData]);

  if (!token) {
    return <Login onLoginSuccess={(t) => setToken(t)} />;
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bgDark">
      {/* Sidebar Navigation */}
      <aside className="w-60 h-[calc(100vh-24px)] m-3 flex flex-col p-6 glass-panel rounded-2xl flex-shrink-0">
        <div className="flex items-center gap-3 mb-10">
          <span className="text-2xl text-accentBlue drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]">☯</span>
          <h2 className="text-lg font-bold tracking-wide text-white">Bittensor生态</h2>
        </div>

        <nav className="flex-grow space-y-2">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-xs font-semibold transition-all duration-150 ${
              activeTab === 'dashboard'
                ? 'bg-blue-500/10 text-white border-l-2 border-accentBlue'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Activity size={16} />
            <span>排放统计</span>
          </button>
          
          <button
            onClick={() => setActiveTab('liquidation')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-xs font-semibold transition-all duration-150 ${
              activeTab === 'liquidation'
                ? 'bg-blue-500/10 text-white border-l-2 border-accentBlue'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <TrendingDown size={16} />
            <span>子网清算</span>
          </button>
          
          <button
            onClick={() => setActiveTab('logs')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-xs font-semibold transition-all duration-150 ${
              activeTab === 'logs'
                ? 'bg-blue-500/10 text-white border-l-2 border-accentBlue'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Terminal size={16} />
            <span>系统日志</span>
          </button>
          
          <button
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-xs font-semibold transition-all duration-150 ${
              activeTab === 'settings'
                ? 'bg-blue-500/10 text-white border-l-2 border-accentBlue'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Settings size={16} />
            <span>配置选项</span>
          </button>
        </nav>

        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 py-2 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white rounded-lg text-xs font-semibold border border-white/5 transition"
        >
          <Lock size={14} />
          <span>退出登录</span>
        </button>
      </aside>

      {/* Main Container */}
      <main className="flex-grow flex flex-col h-screen p-3 pl-0 overflow-hidden">
        {/* Top Header stats */}
        <Header
          lastSuccessBlock={lastSuccessBlock}
          latestChainBlock={latestChainBlock}
          beijingTime={beijingTime}
          uptimeSeconds={uptimeSeconds}
        />

        {/* Tab contents */}
        <div className="flex-grow overflow-hidden p-1">
          {activeTab === 'dashboard' && (
            <div className="flex flex-col h-full overflow-hidden space-y-3">
              {/* Dashboard Controls */}
              <div className="flex justify-between items-center flex-shrink-0">
                <div className="p-1 glass-card flex gap-1">
                  <button
                    onClick={() => handleToggleMode('current')}
                    className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${
                      dataMode === 'current' ? 'bg-white/5 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    当前区块
                  </button>
                  <button
                    onClick={() => handleToggleMode('24h')}
                    className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${
                      dataMode === '24h' ? 'bg-white/5 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    24H 排放统计
                  </button>
                </div>

                <div className="flex items-center gap-6 text-xs text-accentBlue font-semibold">
                  <span>总排放: {(totals.inflow + totals.buyback).toFixed(4)} TAO</span>
                  <span>总流入: {totals.inflow.toFixed(4)} TAO</span>
                  <span>总回购: {totals.buyback.toFixed(4)} TAO</span>
                </div>
              </div>

              {/* Subnets list */}
              <div className="flex-grow overflow-hidden">
                <SubnetsTable data={subnetsData} />
              </div>
            </div>
          )}

          {activeTab === 'liquidation' && (
            <LiquidationPanel snapshot={liquidationSnapshot} />
          )}

          {activeTab === 'logs' && <LogsPanel realtimeLogs={realtimeLogs} />}

          {activeTab === 'settings' && <SettingsPanel />}
        </div>
      </main>
    </div>
  );
}
