import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(currentDir, '../..');

function numberFromEnv(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanFromEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value === 'true';
}

const sqlUser = process.env.SQL_USER ?? process.env.DB_USER ?? '';
const sqlPass = process.env.SQL_PASS ?? process.env.DB_PASSWORD ?? '';
const sqlHost = process.env.SQL_HOST ?? process.env.DB_HOST ?? '';
const sqlDb = process.env.SQL_DB ?? process.env.DB_DATABASE ?? '';
const sqlPort = numberFromEnv(
  process.env.SQL_PORT ?? process.env.DB_PORT,
  1433
);
const sqlEncrypt = booleanFromEnv(
  process.env.SQL_ENCRYPT ?? process.env.DB_OPTIONS_ENCRYPT,
  false
);

export const ENV = {
  NODE_ENV: process.env.NODE_ENV ?? 'production',

  HOST: process.env.HOST ?? '0.0.0.0',
  PORT: numberFromEnv(process.env.PORT, 3000),
  AUTH_TOKEN: process.env.AUTH_TOKEN ?? 'supersecret-lan-token',

  // SQL (opsional kalau pakai poller)
  SQL_USER: sqlUser,
  SQL_PASS: sqlPass,
  SQL_HOST: sqlHost,
  SQL_DB: sqlDb,
  SQL_PORT: sqlPort,
  SQL_ENCRYPT: sqlEncrypt,
  SQL_TRUST_SERVER_CERTIFICATE:
    process.env.DB_OPTIONS_TRUST_SERVER_CERTIFICATE === undefined
      ? true
      : booleanFromEnv(process.env.DB_OPTIONS_TRUST_SERVER_CERTIFICATE, true),
  POLL_INTERVAL_MS: numberFromEnv(process.env.POLL_INTERVAL_MS, 60_000),

  // Laravel file cache directory (absolute path)
  LARAVEL_CACHE_PATH: path.resolve(
    PROJECT_ROOT,
    process.env.LARAVEL_CACHE_PATH || '../storage/framework/cache/data'
  ),

  // Linked server for wire_tag view
  LINKED_SERVER: process.env.LINKED_SERVER || '192.168.89.218\\iGHSSIWSL202',
  LINKED_DB: process.env.LINKED_DB || 'iGHS_L2_B3',

  // Cache key prefix (must match Laravel config/sto.php prefix logic)
  CACHE_PREFIX: process.env.CACHE_PREFIX || 'laravel_cache_',

  // TTL constants (seconds) - must match Laravel StocktakingCache
  STO_TTL: {
    scanSums: 600,
    dataBox: 120,
    sortedJobs: 600,
    wireTag: 600,
    bundle: 600,
  },

  // Chunk size for SQL Server IN clause (2100 param limit)
  CHUNK_SIZE: 1000,
};
