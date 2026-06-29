import { FastifyInstance } from 'fastify';
import { getSetting, setSetting } from '../services/settingsService.js';
import { testTelegramBot } from '../services/telegramService.js';
import { testRpc, disconnectApi } from '../chain/api.js';
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

export async function settingsRoutes(fastify: FastifyInstance) {
  fastify.get('/api/settings', async (request, reply) => {
    if (!(await checkAuth(request, reply))) return;
    
    const rpc_endpoints = await getSetting('rpc_endpoints', 'wss://entrypoint-finney.opentensor.ai:443');
    const telegram_token = await getSetting('telegram_token', '');
    const telegram_chat_id = await getSetting('telegram_chat_id', '');
    
    return {
      rpc_endpoints,
      telegram_token,
      telegram_chat_id
    };
  });

  fastify.post('/api/settings', async (request, reply) => {
    if (!(await checkAuth(request, reply))) return;
    
    const { rpc_endpoints, telegram_token, telegram_chat_id } = request.body as any;
    const oldEndpoints = await getSetting('rpc_endpoints', 'wss://entrypoint-finney.opentensor.ai:443');
    
    await setSetting('rpc_endpoints', rpc_endpoints || '');
    await setSetting('telegram_token', telegram_token || '');
    await setSetting('telegram_chat_id', telegram_chat_id || '');
    
    if (rpc_endpoints && rpc_endpoints !== oldEndpoints) {
      await disconnectApi();
    }
    
    return { message: '系统配置保存成功，RPC 连接已自愈重载！' };
  });

  fastify.post('/api/test-telegram', async (request, reply) => {
    if (!(await checkAuth(request, reply))) return;
    
    const { token, chat_id } = request.body as any;
    const result = await testTelegramBot(token, chat_id);
    
    if (result.success) {
      return result;
    } else {
      return reply.status(400).send({ detail: result.message });
    }
  });

  fastify.post('/api/test-rpc', async (request, reply) => {
    if (!(await checkAuth(request, reply))) return;
    
    const { endpoint } = request.body as any;
    const result = await testRpc(endpoint);
    
    if (result.success) {
      return result;
    } else {
      return reply.status(400).send({ detail: result.error || '测试失败' });
    }
  });
}
