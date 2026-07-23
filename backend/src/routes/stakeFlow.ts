import { FastifyInstance } from 'fastify';
import { getStakeFlowSummary } from '../services/stakeFlowService.js';

export async function stakeFlowRoutes(fastify: FastifyInstance) {
  fastify.get('/api/stake-flow/current', async (request, reply) => {
    try {
      const summary = await getStakeFlowSummary();
      return reply.send(summary);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });
}
