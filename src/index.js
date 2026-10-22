import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config.js';
import sessionsRouter from './routes/sessions.js';
import { closePool } from './db/pool.js';

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(morgan(config.nodeEnv === 'development' ? 'dev' : 'combined'));

// Routes
app.use('/api/v3/sto', sessionsRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[Express] Unhandled error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: config.nodeEnv === 'development' ? err.message : undefined,
  });
});

// Graceful shutdown
let server;

async function start() {
  server = app.listen(config.port, () => {
    console.log(`[sto-express] Running on port ${config.port} (${config.nodeEnv})`);
    console.log(`[sto-express] Laravel cache path: ${config.laravelCachePath}`);
  });
}

async function shutdown(signal) {
  console.log(`\n[sto-express] Received ${signal}, shutting down...`);
  if (server) {
    server.close();
  }
  await closePool();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  console.error('[sto-express] Uncaught exception:', err);
  shutdown('uncaughtException');
});
process.on('unhandledRejection', (reason) => {
  console.error('[sto-express] Unhandled rejection:', reason);
});

start();

export { app };