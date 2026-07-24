import { FastifyInstance } from 'fastify';
import { getMinerCompetitionData } from '../services/minerCompetitionService.js';
import { logger } from '../services/logService.js';

export default async function minerCompetitionRoutes(fastify: FastifyInstance) {
  fastify.get('/api/miner-competition', async (_request, reply) => {
    try {
      const data = await getMinerCompetitionData();
      if (!data) {
        return reply.status(404).send({ error: '矿工竞争数据正在等待新区块' });
      }
      return reply.send(data);
    } catch (err: any) {
      logger.error(`获取矿工竞争分析数据失败: ${err.message}`);
      return reply.status(500).send({ error: '获取数据失败' });
    }
  });
}
