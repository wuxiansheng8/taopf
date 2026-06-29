import { FastifyInstance } from 'fastify';
import { getSetting } from '../services/settingsService.js';
import { createToken } from '../utils/jwt.js';
import crypto from 'crypto';

export async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/api/login', async (request, reply) => {
    const { username, password } = request.body as any;
    
    const adminUser = await getSetting('admin_username', 'admin');
    const adminPassHash = await getSetting('admin_password_hash');
    
    const providedPassHash = crypto.createHash('sha256').update(password).digest('hex');
    
    if (username === adminUser && providedPassHash === adminPassHash) {
      const token = await createToken(username);
      return { access_token: token, token_type: 'bearer' };
    } else {
      return reply.status(401).send({ detail: '账号或密码不正确！' });
    }
  });
}
