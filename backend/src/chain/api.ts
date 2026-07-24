import { ApiPromise, WsProvider } from '@polkadot/api';
import { getSetting } from '../services/settingsService.js';
import { logger } from '../services/logService.js';
import { parseRpcEndpoints } from '../utils/rpcEndpoints.js';

const matchAnyVersion = (methods: Record<string, any>) =>
  Array.from({ length: 1000 }, (_, i) => ({ methods, version: i + 1 }));

const customRuntimeApis = {
  SubnetInfoRuntimeApi: matchAnyVersion({
    get_all_dynamic_info: {
      description: 'Get all dynamic info',
      params: [],
      type: 'Vec<Option<DynamicInfo>>'
    },
    get_dynamic_info: {
      description: 'Get dynamic info for a subnet',
      params: [
        { name: 'netuid', type: 'u16' }
      ],
      type: 'Option<DynamicInfo>'
    }
  }),
  SwapRuntimeApi: matchAnyVersion({
    current_alpha_price_all: {
      description: 'Get all alpha prices',
      params: [],
      type: 'Vec<SubnetPrice>'
    }
  }),
  SubnetRegistrationRuntimeApi: matchAnyVersion({
    get_network_registration_cost: {
      description: 'Get network registration cost',
      params: [],
      type: 'u64'
    }
  })
};


let apiPromise: ApiPromise | null = null;
let currentProvider: WsProvider | null = null;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

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
  const urls = parseRpcEndpoints(endpointsStr);
  
  if (urls.length === 0) {
    throw new Error('未配置 RPC 节点地址！');
  }

  logger.info(`正在初始化 Subtensor RPC 连接，可用节点列表: ${urls.join(', ')}...`);
  
  currentProvider = new WsProvider(urls);
  apiPromise = new ApiPromise({ 
    provider: currentProvider,
    runtime: customRuntimeApis
  });

  
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
    api = new ApiPromise({ 
      provider,
      runtime: customRuntimeApis
    });
    await withTimeout(api.isReady, 10000, '连接超时');
    
    // Test runtime version
    const runtime = await withTimeout(api.rpc.state.getRuntimeVersion(), 10000, '版本检测超时');
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
