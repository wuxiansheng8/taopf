import { useState, useEffect } from 'react';
import client from '../api/client.ts';

export default function SettingsPanel() {
  const [rpcEndpoints, setRpcEndpoints] = useState('');
  const [telegramToken, setTelegramToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');

  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [rpcTestStatus, setRpcTestStatus] = useState('');
  const [tgTestStatus, setTgTestStatus] = useState('');

  // Load current settings
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await client.get('/api/settings');
        setRpcEndpoints(res.data.rpc_endpoints);
        setTelegramToken(res.data.telegram_token);
        setTelegramChatId(res.data.telegram_chat_id);
      } catch (err) {
        console.error('Failed to load settings:', err);
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus('正在保存...');
    try {
      await client.post('/api/settings', {
        rpc_endpoints: rpcEndpoints,
        telegram_token: telegramToken,
        telegram_chat_id: telegramChatId
      });
      setSaveStatus('✅ 配置保存成功！');
    } catch (err: any) {
      setSaveStatus(`❌ 保存失败: ${err.response?.data?.detail || err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleTestRpc = async () => {
    setRpcTestStatus('测试中...');
    // Extract first RPC node for test
    const firstUrl = rpcEndpoints.split(',')[0]?.trim();
    if (!firstUrl) {
      setRpcTestStatus('❌ RPC 节点为空');
      return;
    }

    try {
      const res = await client.post('/api/test-rpc', { endpoint: firstUrl });
      setRpcTestStatus(`✅ 连接成功! 延迟: ${res.data.latency} | 协议版本: v${res.data.version}`);
    } catch (err: any) {
      setRpcTestStatus(`❌ 连接失败: ${err.response?.data?.detail || err.message}`);
    }
  };

  const handleTestTg = async () => {
    setTgTestStatus('发送测试推送中...');
    try {
      await client.post('/api/test-telegram', { token: telegramToken, chat_id: telegramChatId });
      setTgTestStatus('✅ 发送成功，请前往 Telegram 确认！');
    } catch (err: any) {
      setTgTestStatus(`❌ 发送失败: ${err.response?.data?.detail || err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="panel-header">
        <h2 className="text-xl font-bold text-white">⚙️ 系统设置</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* RPC Nodes */}
        <div className="glass-card p-6 space-y-6">
          <h3 className="text-sm font-bold text-white border-b border-white/5 pb-2">🔌 Subtensor RPC 节点地址</h3>
          <div className="space-y-2">
            <label className="text-xs text-gray-400">WebSocket 节点列表 (逗号分隔多个地址实现故障自切换)</label>
            <textarea
              rows={4}
              className="glass-input w-full p-4 text-xs font-mono"
              placeholder="wss://entrypoint-finney.opentensor.ai:443"
              value={rpcEndpoints}
              onChange={(e) => setRpcEndpoints(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <button
              onClick={handleTestRpc}
              className="w-fit px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-semibold transition border border-white/10"
            >
              ⚡ 测试连接及版本检测
            </button>
            {rpcTestStatus && (
              <span className={`text-xs ${rpcTestStatus.startsWith('✅') ? 'text-green-400' : 'text-red-400'}`}>
                {rpcTestStatus}
              </span>
            )}
          </div>
        </div>

        {/* Telegram Alerts */}
        <div className="glass-card p-6 space-y-6">
          <h3 className="text-sm font-bold text-white border-b border-white/5 pb-2">🤖 Telegram 机器人报警推送</h3>
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs text-gray-400">Telegram Bot Token</label>
              <input
                type="password"
                className="glass-input w-full px-4 py-2.5 text-xs"
                placeholder="请输入 Bot API Token"
                value={telegramToken}
                onChange={(e) => setTelegramToken(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400">Telegram Chat ID</label>
              <input
                type="text"
                className="glass-input w-full px-4 py-2.5 text-xs"
                placeholder="请输入 Chat/Channel ID"
                value={telegramChatId}
                onChange={(e) => setTelegramChatId(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <button
              onClick={handleTestTg}
              className="w-fit px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-semibold transition border border-white/10"
            >
              🔔 发送一条测试警报
            </button>
            {tgTestStatus && (
              <span className={`text-xs ${tgTestStatus.startsWith('✅') ? 'text-green-400' : 'text-red-400'}`}>
                {tgTestStatus}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-semibold text-white transition shadow shadow-blue-500/10"
        >
          {saving ? '正在保存...' : '💾 保存所有设置'}
        </button>
        {saveStatus && (
          <span className={`text-xs ${saveStatus.startsWith('✅') ? 'text-green-400' : 'text-red-400'}`}>
            {saveStatus}
          </span>
        )}
      </div>
    </div>
  );
}
