import { ApiPromise, WsProvider } from '@polkadot/api';
import { getSetting } from '../services/settingsService.js';
import { logger } from '../services/logService.js';

let apiPromise: ApiPromise | null = null;
let currentProvider: WsProvider | null = null;

export async function getApi(): Promise<ApiPromise> {
  if (apiPromise && apiPromise.isConnected) {
    return apiPromise;
  }
  
  if (apiPromise) {
    try {
      await apiPromise.disconnect();
    } catch (e) {}
  }

  const endpointsStr = await getSetting('rpc_endpoints', 'wss://entrypoint-finney.opentensor.ai:443');
  const urls = endpointsStr.split(',').map(e => e.trim()).filter(e => e.length > 0);
  
  if (urls.length === 0) {
    throw new Error('未配置 RPC 节点地址！');
  }

  logger.info(`正在初始化 Subtensor RPC 连接，可用节点列表: ${urls.join(', ')}...`);
  
  currentProvider = new WsProvider(urls);
  apiPromise = new ApiPromise({ provider: currentProvider });
  
  currentProvider.on('connected', () => logger.info('与 Subtensor RPC 节点的连接已建立。'));
  currentProvider.on('disconnected', () => logger.warn('与 Subtensor RPC 节点的连接断开，正在尝试重连/切换备用节点...'));
  currentProvider.on('error', (err: any) => logger.error(`Subtensor WebSocket 错误: ${err.message || String(err)}`));

  await apiPromise.isReady;
  return apiPromise;
}

export async function testRpc(endpoint: string): Promise<{ success: boolean; latency: string; version: number; error?: string }> {
  const t0 = Date.now();
  let provider: WsProvider | null = null;
  let api: ApiPromise | null = null;
  try {
    provider = new WsProvider(endpoint);
    api = new ApiPromise({ provider });
    await api.isReady;
    
    // Test runtime version
    const runtime = await api.rpc.state.getRuntimeVersion();
    const version = runtime.specVersion.toNumber();
    
    const latency = `${Date.now() - t0} ms`;
    return { success: true, latency, version };
  } catch (err: any) {
    return { success: false, latency: '', version: 0, error: err.message || String(err) };
  } finally {
    if (api) {
      try {
        await api.disconnect();
      } catch (e) {}
    }
  }
}

export async function disconnectApi(): Promise<void> {
  if (apiPromise) {
    try {
      logger.info('主动断开当前的 Subtensor RPC 客户端连接以应用新配置...');
      await apiPromise.disconnect();
    } catch (e) {}
    apiPromise = null;
    currentProvider = null;
  }
}
