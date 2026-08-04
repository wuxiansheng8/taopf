import { FastifyInstance } from 'fastify';
import { getRootBasketOverview, getRootBasketSubnetDetail } from '../services/rootBasketService.js';

export default async function rootBasketRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/root-basket', async (_request, reply) => {
    const data = getRootBasketOverview();
    if (!data) return reply.status(503).send({ error: 'Root篮子数据正在初始化' });
    return reply.send(data);
  });

  fastify.get<{ Params: { netuid: string } }>('/api/root-basket/subnets/:netuid', async (request, reply) => {
    const netuid = Number(request.params.netuid);
    if (!Number.isInteger(netuid) || netuid < 0) return reply.status(400).send({ error: '子网编号错误' });
    const data = getRootBasketSubnetDetail(netuid);
    if (!data) return reply.status(404).send({ error: '没有找到该子网的Root篮子数据' });
    return reply.send(data);
  });
}
