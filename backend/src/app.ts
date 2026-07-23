import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';

// Import local services
import { getDb } from './db/connection.js';
import { initEmissionsCache } from './services/emissionService.js';
import { startLogPruner, logger } from './services/logService.js';
import { startChainListener } from './chain/listener.js';
import { initBurnRateMonitor } from './services/burnRateMonitorService.js';

// Import local routes
import { authRoutes } from './routes/auth.js';
import { overviewRoutes } from './routes/overview.js';
import { settingsRoutes } from './routes/settings.js';
import { logsRoutes } from './routes/logs.js';
import { stakeFlowRoutes } from './routes/stakeFlow.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fastify = Fastify({ logger: false });

// Register CORS
await fastify.register(cors, {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
});

// Register routes
await fastify.register(authRoutes);
await fastify.register(overviewRoutes);
await fastify.register(settingsRoutes);
await fastify.register(logsRoutes);
await fastify.register(stakeFlowRoutes);

// Serve frontend build files
const frontendDist = path.join(__dirname, '..', '..', 'frontend', 'dist');
fastify.register(fastifyStatic, {
  root: frontendDist,
  prefix: '/'
});

// Fallback to index.html for React SPA routing
fastify.setNotFoundHandler((request, reply) => {
  reply.sendFile('index.html');
});

// Start Server & Services
const start = async () => {
  try {
    // 1. Initialize SQLite Database (and run WAL / schema)
    await getDb();
    
    // 2. Start background log pruner
    startLogPruner();
    
    // 3. Populate memory emissions cache
    await initEmissionsCache();

    // 3.5 Register optional burn-rate monitoring
    initBurnRateMonitor();
    
    // 4. Start blockchain subscriber
    startChainListener().catch(err => {
      console.error('Failed to start block listener:', err);
    });

    const port = Number(process.env.PORT || 8000);
    const host = '0.0.0.0';
    
    await fastify.listen({ port, host });
    logger.info(`☯ 子网排放监控系统后端运行中: http://${host}:${port}`);
  } catch (err: any) {
    console.error('Fatal error during startup:', err);
    process.exit(1);
  }
};

start();
