import { FastifyInstance } from 'fastify';
import { getSetting, setSetting } from '../services/settingsService.js';
import { testTelegramBot } from '../services/telegramService.js';
import { postFlashdutyEvent } from '../services/flashdutyService.js';
import { testRpc, disconnectApi } from '../chain/api.js';
import { verifyToken } from '../utils/jwt.js';
import { normalizeRpcEndpoints, parseRpcEndpoints } from '../utils/rpcEndpoints.js';

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
    const telegram_token_backup = await getSetting('telegram_token_backup', '');
    const telegram_chat_id_backup = await getSetting('telegram_chat_id_backup', '');
    const flashduty_enabled = await getSetting('flashduty_enabled', 'false');
    const flashduty_webhook = await getSetting('flashduty_webhook', '');
    const flashduty_cooldown = await getSetting('flashduty_cooldown', '300');
    
    return {
      rpc_endpoints,
      telegram_token,
      telegram_chat_id,
      telegram_token_backup,
      telegram_chat_id_backup,
      flashduty_enabled: flashduty_enabled === 'true',
      flashduty_webhook,
      flashduty_cooldown
    };
  });

  fastify.post('/api/settings', async (request, reply) => {
    if (!(await checkAuth(request, reply))) return;
    
    const { 
      rpc_endpoints, 
      telegram_token, 
      telegram_chat_id,
      telegram_token_backup,
      telegram_chat_id_backup,
      flashduty_enabled,
      flashduty_webhook,
      flashduty_cooldown
    } = request.body as any;
    
    const oldEndpoints = await getSetting('rpc_endpoints', 'wss://entrypoint-finney.opentensor.ai:443');
    const normalizedRpcEndpoints = normalizeRpcEndpoints(rpc_endpoints || '');
    
    let cooldownNum = parseInt(flashduty_cooldown, 10);
    if (isNaN(cooldownNum) || cooldownNum < 0) {
      cooldownNum = 300;
    }
    
    await setSetting('rpc_endpoints', normalizedRpcEndpoints);
    await setSetting('telegram_token', telegram_token || '');
    await setSetting('telegram_chat_id', telegram_chat_id || '');
    await setSetting('telegram_token_backup', telegram_token_backup || '');
    await setSetting('telegram_chat_id_backup', telegram_chat_id_backup || '');
    await setSetting('flashduty_enabled', flashduty_enabled ? 'true' : 'false');
    await setSetting('flashduty_webhook', flashduty_webhook || '');
    await setSetting('flashduty_cooldown', String(cooldownNum));
    
    if (normalizedRpcEndpoints !== normalizeRpcEndpoints(oldEndpoints)) {
      await disconnectApi();
    }
    
    return { message: '系统配置保存成功，RPC 连接已自愈重载！' };
  });

  fastify.post('/api/test-telegram', async (request, reply) => {
    if (!(await checkAuth(request, reply))) return;
    
    const { token, chat_id } = request.body as any;
    if (!token || !chat_id) {
      return reply.status(400).send({ detail: 'Token 和 Chat ID 不能为空' });
    }
    const result = await testTelegramBot(token, chat_id);
    
    if (result.success) {
      return result;
    } else {
      return reply.status(400).send({ detail: result.message });
    }
  });

  fastify.post('/api/test-flashduty', async (request, reply) => {
    if (!(await checkAuth(request, reply))) return;
    
    const { webhook } = request.body as any;
    if (!webhook) {
      return reply.status(400).send({ detail: 'Webhook 地址不能为空' });
    }
    
    try {
      await postFlashdutyEvent(
        webhook,
        '🤖 FlashDuty 电话告警测试',
        '这是一条来自 Bittensor 子网排放监控系统 taopf 的 FlashDuty 电话测试告警。',
        `flashduty_test_${Date.now()}`
      );
      return { success: true, message: '测试电话告警事件成功发送到 FlashDuty！' };
    } catch (err: any) {
      return reply.status(400).send({ detail: err.message });
    }
  });

  fastify.post('/api/test-rpc', async (request, reply) => {
    if (!(await checkAuth(request, reply))) return;
    
    const { endpoint, endpoints } = request.body as any;
    const urls = Array.isArray(endpoints)
      ? parseRpcEndpoints(endpoints.map((item) => String(item)).join('\n'))
      : parseRpcEndpoints(endpoint || '');
    
    if (urls.length === 0) {
      return reply.status(400).send({ detail: 'RPC 节点为空' });
    }

    const results = [];
    for (const url of urls) {
      const result = await testRpc(url);
      results.push({ endpoint: url, ...result });
    }

    const successCount = results.filter((result) => result.success).length;
    return {
      success: successCount > 0,
      total: results.length,
      success_count: successCount,
      failed_count: results.length - successCount,
      results
    };
  });
}
