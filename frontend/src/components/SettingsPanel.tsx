import { useState, useEffect } from 'react';
import client from '../api/client.ts';

export default function SettingsPanel() {
  const [rpcEndpoints, setRpcEndpoints] = useState('');
  const [telegramToken, setTelegramToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [telegramTokenBackup, setTelegramTokenBackup] = useState('');
  const [telegramChatIdBackup, setTelegramChatIdBackup] = useState('');
  const [flashdutyEnabled, setFlashdutyEnabled] = useState(false);
  const [flashdutyWebhook, setFlashdutyWebhook] = useState('');
  const [flashdutyCooldown, setFlashdutyCooldown] = useState('300');
  const [burnRateMonitorEnabled, setBurnRateMonitorEnabled] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [rpcTestStatus, setRpcTestStatus] = useState('');
  const [rpcTestLevel, setRpcTestLevel] = useState<'idle' | 'success' | 'warning' | 'error'>('idle');
  const [rpcTestResults, setRpcTestResults] = useState<any[]>([]);
  const [tgTestStatus, setTgTestStatus] = useState('');
  const [tgBackupTestStatus, setTgBackupTestStatus] = useState('');
  const [fdTestStatus, setFdTestStatus] = useState('');

  const parseRpcEndpoints = (value: string) => {
    const seen = new Set<string>();
    return value
      .split(/[\s,，]+/)
      .map((endpoint) => endpoint.trim())
      .filter(Boolean)
      .filter((endpoint) => {
        if (seen.has(endpoint)) return false;
        seen.add(endpoint);
        return true;
      });
  };

  const normalizeRpcEndpoints = (value: string) => parseRpcEndpoints(value).join('\n');

  // Load current settings
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await client.get('/api/settings');
        setRpcEndpoints(normalizeRpcEndpoints(res.data.rpc_endpoints || ''));
        setTelegramToken(res.data.telegram_token || '');
        setTelegramChatId(res.data.telegram_chat_id || '');
        setTelegramTokenBackup(res.data.telegram_token_backup || '');
        setTelegramChatIdBackup(res.data.telegram_chat_id_backup || '');
        setFlashdutyEnabled(res.data.flashduty_enabled || false);
        setFlashdutyWebhook(res.data.flashduty_webhook || '');
        setFlashdutyCooldown(res.data.flashduty_cooldown || '300');
        setBurnRateMonitorEnabled(res.data.burn_rate_monitor_enabled || false);
      } catch (err) {
        console.error('Failed to load settings:', err);
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus('正在保存...');
    const normalizedRpcEndpoints = normalizeRpcEndpoints(rpcEndpoints);
    setRpcEndpoints(normalizedRpcEndpoints);
    try {
      await client.post('/api/settings', {
        rpc_endpoints: normalizedRpcEndpoints,
        telegram_token: telegramToken,
        telegram_chat_id: telegramChatId,
        telegram_token_backup: telegramTokenBackup,
        telegram_chat_id_backup: telegramChatIdBackup,
        flashduty_enabled: flashdutyEnabled,
        flashduty_webhook: flashdutyWebhook,
        flashduty_cooldown: flashdutyCooldown,
        burn_rate_monitor_enabled: burnRateMonitorEnabled
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
    setRpcTestLevel('idle');
    setRpcTestResults([]);
    const urls = parseRpcEndpoints(rpcEndpoints);
    const normalizedRpcEndpoints = urls.join('\n');
    setRpcEndpoints(normalizedRpcEndpoints);
    if (urls.length === 0) {
      setRpcTestStatus('❌ RPC 节点为空');
      setRpcTestLevel('error');
      return;
    }

    try {
      const res = await client.post('/api/test-rpc', { endpoints: urls });
      setRpcTestResults(res.data.results || []);
      if (res.data.success_count === res.data.total) {
        setRpcTestLevel('success');
      } else if (res.data.success_count > 0) {
        setRpcTestLevel('warning');
      } else {
        setRpcTestLevel('error');
      }
      setRpcTestStatus(
        `测试完成：${res.data.success_count}/${res.data.total} 个节点连接成功`
      );
    } catch (err: any) {
      setRpcTestStatus(`❌ 连接失败: ${err.response?.data?.detail || err.message}`);
      setRpcTestLevel('error');
    }
  };

  const handleTestTg = async () => {
    setTgTestStatus('发送测试推送中...');
    try {
      await client.post('/api/test-telegram', { token: telegramToken, chat_id: telegramChatId });
      setTgTestStatus('✅ 主机器人发送成功，请前往 Telegram 确认！');
    } catch (err: any) {
      setTgTestStatus(`❌ 发送失败: ${err.response?.data?.detail || err.message}`);
    }
  };

  const handleTestTgBackup = async () => {
    setTgBackupTestStatus('发送测试推送中...');
    try {
      await client.post('/api/test-telegram', { token: telegramTokenBackup, chat_id: telegramChatIdBackup });
      setTgBackupTestStatus('✅ 备用机器人发送成功，请前往 Telegram 确认！');
    } catch (err: any) {
      setTgBackupTestStatus(`❌ 发送失败: ${err.response?.data?.detail || err.message}`);
    }
  };

  const handleTestFlashDuty = async () => {
    setFdTestStatus('发送测试电话告警中...');
    try {
      await client.post('/api/test-flashduty', { webhook: flashdutyWebhook });
      setFdTestStatus('✅ 发送成功，请前往 FlashDuty 确认！');
    } catch (err: any) {
      setFdTestStatus(`❌ 发送失败: ${err.response?.data?.detail || err.message}`);
    }
  };

  return (
    <div className="h-full overflow-y-auto pr-2 scrollbar-thin">
      <div className="space-y-6 pb-8">
      <div className="panel-header">
        <h2 className="text-xl font-bold text-white">⚙️ 系统设置</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* RPC Nodes */}
        <div className="glass-card p-6 space-y-6">
          <h3 className="text-sm font-bold text-white border-b border-white/5 pb-2">🔌 Subtensor RPC 节点地址</h3>
          <div className="space-y-2">
            <label className="text-xs text-gray-400">WebSocket 节点列表（一行一个，保存和测试时会自动整理）</label>
            <textarea
              rows={6}
              className="glass-input w-full p-4 text-xs font-mono"
              placeholder={'wss://entrypoint-finney.opentensor.ai:443\nwss://api-bittensor-mainnet.example.com'}
              value={rpcEndpoints}
              onChange={(e) => setRpcEndpoints(e.target.value)}
              onBlur={(e) => setRpcEndpoints(normalizeRpcEndpoints(e.target.value))}
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
              <span className={`text-xs ${
                rpcTestLevel === 'error'
                  ? 'text-red-400'
                  : rpcTestLevel === 'warning'
                    ? 'text-yellow-400'
                    : 'text-green-400'
              }`}>
                {rpcTestStatus}
              </span>
            )}
            {rpcTestResults.length > 0 && (
              <div className="space-y-1 pt-1">
                {rpcTestResults.map((result) => (
                  <div
                    key={result.endpoint}
                    className={`text-xs font-mono break-all ${
                      result.success ? 'text-green-400' : 'text-red-400'
                    }`}
                  >
                    {result.success
                      ? `✅ ${result.endpoint} | 延迟: ${result.latency} | 协议版本: v${result.version}`
                      : `❌ ${result.endpoint} | ${result.error || '测试失败'}`}
                  </div>
                ))}
              </div>
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
            <div className="flex flex-col gap-2">
              <button
                onClick={handleTestTg}
                className="w-fit px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-semibold transition border border-white/10"
              >
                🔔 测试主机器人告警
              </button>
              {tgTestStatus && (
                <span className={`text-xs ${tgTestStatus.startsWith('✅') ? 'text-green-400' : 'text-red-400'}`}>
                  {tgTestStatus}
                </span>
              )}
            </div>

            <div className="border-t border-white/5 pt-3 space-y-4">
              <div className="space-y-1">
                <label className="text-xs text-gray-400">Telegram Bot Token (备用)</label>
                <input
                  type="password"
                  className="glass-input w-full px-4 py-2.5 text-xs"
                  placeholder="请输入备用 API Token"
                  value={telegramTokenBackup}
                  onChange={(e) => setTelegramTokenBackup(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-400">Telegram Chat ID (备用)</label>
                <input
                  type="text"
                  className="glass-input w-full px-4 py-2.5 text-xs"
                  placeholder="请输入备用 Chat/Channel ID"
                  value={telegramChatIdBackup}
                  onChange={(e) => setTelegramChatIdBackup(e.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={handleTestTgBackup}
                className="w-fit px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-semibold transition border border-white/10"
              >
                🔔 测试备用机器人告警
              </button>
              {tgBackupTestStatus && (
                <span className={`text-xs ${tgBackupTestStatus.startsWith('✅') ? 'text-green-400' : 'text-red-400'}`}>
                  {tgBackupTestStatus}
                </span>
              )}
            </div>

            <div className="border-t border-white/5 pt-4 flex items-center justify-between">
              <span className="text-xs text-gray-300 font-semibold select-none">燃烧率监控</span>
              <button
                type="button"
                role="switch"
                aria-checked={burnRateMonitorEnabled}
                aria-label="燃烧率监控"
                onClick={() => setBurnRateMonitorEnabled((enabled) => !enabled)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center cursor-pointer rounded-full border border-white/10 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${
                  burnRateMonitorEnabled ? 'bg-blue-600' : 'bg-white/10'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${
                    burnRateMonitorEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        {/* FlashDuty Alerts */}
        <div className="glass-card p-6 space-y-6 md:col-span-2">
          <h3 className="text-sm font-bold text-white border-b border-white/5 pb-2">📞 FlashDuty 电话告警推送</h3>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="fd-enabled"
              className="rounded bg-white/5 border border-white/10 text-blue-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
              checked={flashdutyEnabled}
              onChange={(e) => setFlashdutyEnabled(e.target.checked)}
            />
            <label htmlFor="fd-enabled" className="text-xs text-gray-300 font-semibold cursor-pointer select-none">
              启用 FlashDuty 电话告警
            </label>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-gray-400">FlashDuty Webhook 地址</label>
              <input
                type="text"
                className="glass-input w-full px-4 py-2.5 text-xs font-mono"
                placeholder="https://api.flashcat.cloud/event/push/alert/standard?integration_key=..."
                value={flashdutyWebhook}
                onChange={(e) => setFlashdutyWebhook(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400">全局告警冷却时间 (秒，默认 300 即 5 分钟)</label>
              <input
                type="number"
                min="0"
                className="glass-input w-full px-4 py-2.5 text-xs"
                placeholder="300"
                value={flashdutyCooldown}
                onChange={(e) => setFlashdutyCooldown(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <button
              onClick={handleTestFlashDuty}
              className="w-fit px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-semibold transition border border-white/10"
            >
              📞 发送 FlashDuty 测试电话告警
            </button>
            {fdTestStatus && (
              <span className={`text-xs ${fdTestStatus.startsWith('✅') ? 'text-green-400' : 'text-red-400'}`}>
                {fdTestStatus}
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
    </div>
  );
}
