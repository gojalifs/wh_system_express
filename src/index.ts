import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import http from 'node:http';
import healthRoutes from './app/routes/health.routes.js';
import notifyRoutes from './app/routes/notify.routes.js';
import mrRoutes from './app/routes/material-requests.routes.js';
import docListRoutes from './app/routes/material-requests.query.routes.js';
import stoRoutes from './app/routes/sto.routes.js';
import stoV4Routes from './app/routes/sto-v4.routes.js';
import internalRoutes from './app/routes/internal.routes.js';
import { startBuildRunner, stopBuildRunner } from './services/buildRunner.js';
import { createWsServer } from './app/ws/wsHub.js';
import { ENV } from './core/env.js';
import { createLogger, logger } from './infra/logger.js';
import { closeAllPools } from './infra/db/db.js';
import { startExistingQueryPoller } from './infra/pollers/simpleTablePoller.js';

export async function start(): Promise<http.Server> {
  const app = express();

  // Middleware
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  // HTTP access log through the app logger (stdout -> PM2 + logrotate)
  const httpLog = createLogger('http');
  app.use(
    morgan(
      ':remote-addr :method :url :status :response-time ms - :res[content-length]',
      { stream: { write: (line: string) => httpLog.info(line.trim()) } }
    )
  );

  // Routes
  app.use(healthRoutes);
  app.use(notifyRoutes);
  app.use(mrRoutes);
  app.use(docListRoutes);
  app.use('/api/v3/sto', stoRoutes);
  app.use('/api/v4/sto', stoV4Routes);
  app.use('/api/v4/sto', internalRoutes);

  // 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      message: 'Endpoint not found',
    });
  });

  // Global error handler
  app.use(
    (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
      logger.error('unhandled error', err);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: ENV.NODE_ENV === 'development' ? (err as Error).message : undefined,
      });
    }
  );

  const server = http.createServer(app);
  createWsServer(server);

  // <-- Start poller tiap 1 menit (bisa override via env POLL_INTERVAL_MS)
  startExistingQueryPoller(ENV.POLL_INTERVAL_MS);

  // STO v4 bundle build runner (antrean sto_bundle_builds, in-process)
  startBuildRunner();

  await new Promise<void>((resolve) => {
    server.listen(ENV.PORT, ENV.HOST, () => {
      logger.info(`HTTP on http://${ENV.HOST}:${ENV.PORT}`);
      logger.info(`WSS  on ws://${ENV.HOST}:${ENV.PORT}/wh_sys/ws/doc`);
      resolve();
    });
  });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`received ${signal}, shutting down...`);
    stopBuildRunner();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await closeAllPools();
    process.exit(0);
  };

  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.on('uncaughtException', (err) => {
    logger.error('uncaught exception', err);
    void shutdown('uncaughtException');
  });
  process.on('unhandledRejection', (reason) => {
    logger.error('unhandled rejection', reason);
  });

  return server;
}
