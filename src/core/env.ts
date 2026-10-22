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

function firstNonEmpty(...values: Array<string | undefined>): string {
  for (const value of values) {
    if (value !== undefined && value.trim() !== '') return value;
  }
  return '';
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
const sqlTrustServerCertificate =
  process.env.DB_OPTIONS_TRUST_SERVER_CERTIFICATE === undefined
    ? true
    : booleanFromEnv(
        process.env.DB_OPTIONS_TRUST_SERVER_CERTIFICATE,
        true
      );

// STO bundle database uses its own connection. Blank values fall back to
// the main SQL configuration above for backward compatibility.
const stoDbUser = firstNonEmpty(process.env.STO_DB_USER, sqlUser);
const stoDbPass = firstNonEmpty(process.env.STO_DB_PASSWORD, sqlPass);
const stoDbHost = firstNonEmpty(process.env.STO_DB_HOST, sqlHost);
const stoDbName = firstNonEmpty(process.env.STO_DB_DATABASE, sqlDb);
const stoDbPort = numberFromEnv(
  firstNonEmpty(
    process.env.STO_DB_PORT,
    process.env.SQL_PORT,
    process.env.DB_PORT
  ),
  sqlPort
);
const stoDbEncryptValue = firstNonEmpty(
  process.env.STO_DB_OPTIONS_ENCRYPT,
  process.env.SQL_ENCRYPT,
  process.env.DB_OPTIONS_ENCRYPT
);
const stoDbEncrypt =
  stoDbEncryptValue === ''
    ? sqlEncrypt
    : booleanFromEnv(stoDbEncryptValue, sqlEncrypt);
const stoDbTrustServerCertificateValue = firstNonEmpty(
  process.env.STO_DB_OPTIONS_TRUST_SERVER_CERTIFICATE,
  process.env.DB_OPTIONS_TRUST_SERVER_CERTIFICATE
);
const stoDbTrustServerCertificate =
  stoDbTrustServerCertificateValue === ''
    ? sqlTrustServerCertificate
    : booleanFromEnv(stoDbTrustServerCertificateValue, true);

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
  SQL_TRUST_SERVER_CERTIFICATE: sqlTrustServerCertificate,
  POLL_INTERVAL_MS: numberFromEnv(process.env.POLL_INTERVAL_MS, 60_000),

  // SQL Server khusus fitur STO bundle (bisa beda database/server)
  STO_DB_USER: stoDbUser,
  STO_DB_PASSWORD: stoDbPass,
  STO_DB_HOST: stoDbHost,
  STO_DB_DATABASE: stoDbName,
  STO_DB_PORT: stoDbPort,
  STO_DB_ENCRYPT: stoDbEncrypt,
  STO_DB_TRUST_SERVER_CERTIFICATE: stoDbTrustServerCertificate,

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

  // STO v4 pre-generated bundle artifacts (Plan B Fase 2)
  STO_BUNDLE_DIR: path.resolve(
    PROJECT_ROOT,
    process.env.STO_BUNDLE_DIR || './storage/sto-bundles'
  ),
  STO_BUILD_CONCURRENCY: numberFromEnv(process.env.STO_BUILD_CONCURRENCY, 2),
  STO_RUNNER_INTERVAL_MS: numberFromEnv(process.env.STO_RUNNER_INTERVAL_MS, 2000),
  STO_BUILD_STALE_MINUTES: numberFromEnv(process.env.STO_BUILD_STALE_MINUTES, 10),
  // Shared secret for POST /api/v4/sto/internal/prewarm (empty = disabled)
  STO_INTERNAL_SECRET: process.env.STO_INTERNAL_SECRET || '',
};
