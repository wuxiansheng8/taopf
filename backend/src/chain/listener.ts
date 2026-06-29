import { getApi } from './api.js';
import { querySubnetEmissionsAtHash } from './storageReader.js';
import { parseBlockEvents } from './eventParser.js';
import { addBlockEmissions } from '../services/emissionService.js';
import { logger } from '../services/logService.js';

let isListening = false;

export async function startChainListener(): Promise<void> {
  if (isListening) return;
  isListening = true;

  logger.info('正在启动区块链监听线程 (Polkadot/api)...');
  
  const runListener = async () => {
    while (isListening) {
      try {
        const api = await getApi();
        let blockLatencies: number[] = [];
        let processingQueue = Promise.resolve();

        // Subscribe to block heads
        const unsubscribe = await api.rpc.chain.subscribeNewHeads((header) => {
          const blockNumber = header.number.toNumber();
          const blockHash = header.hash.toHex();
          const t0 = Date.now();
          
          // Append block processing to the serial Promise chain queue
          processingQueue = processingQueue.then(async () => {
            try {
              const apiAt = await api.at(blockHash);
              const events = await apiAt.query.system.events();
              parseBlockEvents(events as any, blockNumber);
              
              const subnetsData = await querySubnetEmissionsAtHash(api, blockHash);
              
              const now = new Date();
              const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
              const beijingTime = new Date(utc + (3600000 * 8)).toISOString().replace('T', ' ').substring(0, 19);
              
              await addBlockEmissions(blockNumber, beijingTime, subnetsData);
              
              blockLatencies.push(Date.now() - t0);
              if (blockLatencies.length >= 100) {
                const sum = blockLatencies.reduce((a, b) => a + b, 0);
                const avg = sum / blockLatencies.length;
                const max = Math.max(...blockLatencies);
                logger.info(`最近100块平均处理耗时 ${avg.toFixed(0)}ms，最大 ${max.toFixed(0)}ms`);
                blockLatencies = [];
              }
            } catch (err: any) {
              logger.error(`处理新块 #${blockNumber} 出错: ${err.message || String(err)}`);
            }
          });
        });
        
        // Wait until API is disconnected
        await new Promise((resolve) => {
          const timer = setInterval(() => {
            if (!api.isConnected) {
              clearInterval(timer);
              unsubscribe();
              resolve(null);
            }
          }, 3000);
        });
        
        logger.warn('链连接已断开，事件订阅已取消，准备尝试重连...');
      } catch (err: any) {
        logger.error(`监听线程出现故障: ${err.message || String(err)}. 5秒后尝试重连...`);
        await new Promise(r => setTimeout(r, 5000));
      }
    }
  };

  runListener().catch(err => logger.error(`监听循环退出: ${err.message}`));
}
