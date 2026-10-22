import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'production',

  // Laravel file cache directory (absolute path)
  laravelCachePath: path.resolve(PROJECT_ROOT, process.env.LARAVEL_CACHE_PATH || '../storage/framework/cache/data'),

  // SQL Server config
  db: {
    server: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '1433', 10),
    database: process.env.DB_DATABASE || 'wh_system',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    domain: process.env.DB_DOMAIN || '',
    options: {
      encrypt: process.env.DB_OPTIONS_ENCRYPT === 'true',
      trustServerCertificate: process.env.DB_OPTIONS_TRUST_SERVER_CERTIFICATE !== 'false',
      enableArithAbort: true,
      cryptoCredentialsDetails: {
        minVersion: 'TLSv1.2',
      },
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
  },

  // Linked server for wire_tag view
  linkedServer: {
    server: process.env.LINKED_SERVER || '192.168.89.218\\iGHSSIWSL202',
    database: process.env.LINKED_DB || 'iGHS_L2_B3',
  },

  // Cache key prefix
  cachePrefix: process.env.CACHE_PREFIX || 'laravel_cache_',

  // TTL constants (seconds) - must match Laravel StocktakingCache
  ttl: {
    scanSums: 600,
    dataBox: 120,
    sortedJobs: 600,
    wireTag: 600,
    bundle: 600,
  },

  // Chunk size for SQL Server IN clause (2100 param limit)
  chunkSize: 1000,
};

export default config;