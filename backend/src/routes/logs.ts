import { FastifyInstance } from 'fastify';
import { getLogs } from '../services/logService.js';
import { verifyToken } from '../utils/jwt.js';

async function checkAuth(request: any, reply: any) {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.status(401).send({ detail: '未授权访问' });
    return false;
  }
  const token = authHeader.split(' ')[1];
  const username = await verifyToken(token);
  if (!username) {
    reply.status(401).send({ detail: 'Token 凭证已失效' });
    return false;
  }
  return true;
}

export async function logsRoutes(fastify: FastifyInstance) {
  fastify.get('/api/logs', async (request, reply) => {
    if (!(await checkAuth(request, reply))) return;
    
    const query = request.query as any;
    const levelFilter = query.level || 'ALL';
    
    const logs = await getLogs(levelFilter, 200);
    return logs;
  });
}
