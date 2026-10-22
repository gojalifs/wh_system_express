import { start } from './index.js';
import { logger } from './infra/logger.js';

start().catch((err) => {
  logger.error('failed to start', err);
  process.exit(1);
});
