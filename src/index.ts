import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import http from 'http';
import healthRoutes from './app/routes/health.routes';
import notifyRoutes from './app/routes/notify.routes';
import mrRoutes from './app/routes/material-requests.routes';
import docListRoutes from './app/routes/material-requests.query.routes';
import { createWsServer } from './app/ws/wsHub';
import { ENV } from './core/env';
import { startExistingQueryPoller } from './infra/pollers/simpleTablePoller';

export async function start() {
  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  app.use(healthRoutes);
  app.use(notifyRoutes);
  app.use(mrRoutes);
  app.use(docListRoutes);

  const server = http.createServer(app);
  createWsServer(server);

  // <-- Start poller tiap 1 menit (bisa override via env POLL_INTERVAL_MS)
  startExistingQueryPoller(ENV.POLL_INTERVAL_MS);

  server.listen(ENV.PORT, ENV.HOST, () => {
    console.log(`HTTP on http://${ENV.HOST}:${ENV.PORT}`);
    console.log(`WSS  on ws://${ENV.HOST}:${ENV.PORT}/wh_sys/ws/doc`);
  });
}
