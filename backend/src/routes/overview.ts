import { FastifyInstance } from 'fastify';
import { getCurrentBlockEmissions, get24hAggregatedEmissions, blockEmitter } from '../services/emissionService.js';
import { logEmitter } from '../services/logService.js';
import { getLiquidationSnapshot } from '../services/liquidationService.js';

export async function overviewRoutes(fastify: FastifyInstance) {
  fastify.get('/api/emissions/current', async (request, reply) => {
    return getCurrentBlockEmissions();
  });

  fastify.get('/api/emissions/24h', async (request, reply) => {
    return get24hAggregatedEmissions();
  });

  fastify.get('/api/liquidation/current', async (request, reply) => {
    const snapshot = getLiquidationSnapshot();
    if (!snapshot) {
      return reply.status(404).send({ error: '清算快照尚未初始化，请等待新块到达' });
    }
    return snapshot;
  });

  fastify.get('/api/stream', async (request, reply) => {
    // Setup SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    const onBlock = (data: any) => {
      reply.raw.write(`event: block\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const onLog = (data: any) => {
      reply.raw.write(`event: log\ndata: ${JSON.stringify(data)}\n\n`);
    };

    blockEmitter.on('block', onBlock);
    logEmitter.on('log', onLog);

    const keepAlive = setInterval(() => {
      reply.raw.write(': keep-alive\n\n');
    }, 15000);

    // Cleanup on connection close
    request.raw.on('close', () => {
      clearInterval(keepAlive);
      blockEmitter.off('block', onBlock);
      logEmitter.off('log', onLog);
      reply.raw.end();
    });
  });
}
