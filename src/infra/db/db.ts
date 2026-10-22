// src/infra/db.ts
import sql from 'mssql';
import { ENV } from '../../core/env.js';
import { createLogger } from '../logger.js';

const log = createLogger('db');

interface SqlConfigInput {
  user: string;
  password: string;
  server: string;
  database: string;
  port: number;
  encrypt: boolean;
  trustServerCertificate: boolean;
}

function buildSqlConfig(input: SqlConfigInput): sql.config {
  return {
    user: input.user,
    password: input.password,
    server: input.server, // gunakan IP/hostname langsung
    database: input.database,
    port: input.port ? Number(input.port) : 1433,
    options: {
      encrypt: input.encrypt, // true jika TLS; kalau self-signed, trust=true
      trustServerCertificate: input.trustServerCertificate,
      enableArithAbort: true,
      cryptoCredentialsDetails: {
        minVersion: 'TLSv1.2',
      },
    },
    connectionTimeout: 10_000, // 10s connect timeout
    requestTimeout: 15_000, // 15s default per-request timeout
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30_000,
      acquireTimeoutMillis: 30_000,
      createTimeoutMillis: 30_000,
      destroyTimeoutMillis: 5_000,
      reapIntervalMillis: 1_000,
      createRetryIntervalMillis: 200,
    },
  };
}

// ---- Konfigurasi pool (ambil dari .env)
export const sqlConfig: sql.config = buildSqlConfig({
  user: ENV.SQL_USER,
  password: ENV.SQL_PASS,
  server: ENV.SQL_HOST,
  database: ENV.SQL_DB,
  port: ENV.SQL_PORT,
  encrypt: ENV.SQL_ENCRYPT,
  trustServerCertificate: ENV.SQL_TRUST_SERVER_CERTIFICATE,
});

// STO bundle memakai koneksi database sendiri.
export const stoSqlConfig: sql.config = buildSqlConfig({
  user: ENV.STO_DB_USER,
  password: ENV.STO_DB_PASSWORD,
  server: ENV.STO_DB_HOST,
  database: ENV.STO_DB_DATABASE,
  port: ENV.STO_DB_PORT,
  encrypt: ENV.STO_DB_ENCRYPT,
  trustServerCertificate: ENV.STO_DB_TRUST_SERVER_CERTIFICATE,
});

interface PoolState {
  pool: sql.ConnectionPool | null;
}

interface PoolInfo {
  label: string;
  host: string;
  port: number;
  database: string;
}

const mainPoolState: PoolState = { pool: null };
const stoPoolState: PoolState = { pool: null };

/**
 * Dapatkan pool tunggal yang reusable.
 * - Hindari race dengan cek `connecting`.
 * - Reset pool jika connect gagal (biar bisa retry call berikutnya).
 */
async function getPoolFor(
  state: PoolState,
  config: sql.config,
  info: PoolInfo
): Promise<sql.ConnectionPool> {
  // sudah terhubung → langsung pakai
  if (state.pool && state.pool.connected) return state.pool;

  // sedang proses connect → kembalikan instance yang sama (request akan di-queue)
  if (
    state.pool &&
    (state.pool as sql.ConnectionPool & { connecting?: boolean }).connecting
  ) {
    return state.pool;
  }

  // buat pool baru
  const newPool = new sql.ConnectionPool(config);
  state.pool = newPool;

  // log error internal pool (mis. network drop) → reset supaya call berikutnya re-create
  newPool.on('error', (err) => {
    log.error(`[${info.label}] pool error`, err?.message ?? err);
    if (state.pool === newPool) state.pool = null;
  });

  try {
    await newPool.connect();
    log.info(
      `[${info.label}] connected ${info.host}:${info.port || 1433}/${info.database}`
    );
  } catch (err) {
    log.error(
      `[${info.label}] connect error`,
      (err as Error)?.message ?? err
    );
    if (state.pool === newPool) state.pool = null; // reset
    throw err;
  }

  return newPool;
}

export function getPool(): Promise<sql.ConnectionPool> {
  return getPoolFor(mainPoolState, sqlConfig, {
    label: 'DB',
    host: ENV.SQL_HOST,
    port: ENV.SQL_PORT,
    database: ENV.SQL_DB,
  });
}

export function getStoPool(): Promise<sql.ConnectionPool> {
  return getPoolFor(stoPoolState, stoSqlConfig, {
    label: 'STO DB',
    host: ENV.STO_DB_HOST,
    port: ENV.STO_DB_PORT,
    database: ENV.STO_DB_DATABASE,
  });
}

/**
 * Helper: jalankan fungsi query dengan retry backoff ringan
 */
export async function withDbRetry<T>(
  fn: (pool: sql.ConnectionPool) => Promise<T>,
  label = 'db-op',
  maxRetry = 3
): Promise<T> {
  let attempt = 0;
  let lastErr: unknown;
  while (attempt < maxRetry) {
    try {
      const p = await getPool();
      return await fn(p);
    } catch (e) {
      lastErr = e;
      attempt++;
      log.error(
        `[DB] ${label} failed (attempt ${attempt}/${maxRetry})`,
        (e as Error)?.message ?? e
      );
      await delay(1000 * attempt); // 1s, 2s, 3s ...
    }
  }
  throw lastErr;
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isTransientError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return (
    code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ECONNREFUSED'
  );
}

/**
 * Execute a query with automatic retry on transient failures
 */
export async function query<Entity>(
  sqlText: string,
  params: unknown[] = [],
  retries = 2
): Promise<Entity[]> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const currentPool = await getPool();
      const request = currentPool.request();
      params.forEach((param, index) => {
        request.input(`param${index}`, param);
      });
      const result = await request.query<Entity>(sqlText);
      return result.recordset;
    } catch (err) {
      lastError = err;
      if (isTransientError(err) && attempt < retries) {
        log.warn(
          `[SQL] Query failed (attempt ${attempt + 1}), retrying...`,
          (err as Error)?.message ?? err
        );
        mainPoolState.pool = null; // Force reconnect
        await delay(1000 * (attempt + 1));
        continue;
      }
      throw err;
    }
  }

  throw lastError;
}

export interface TypedQueryParam {
  type: sql.ISqlType | (() => sql.ISqlType);
  value: unknown;
}

/**
 * Execute a query with typed parameters (for complex types)
 */
export async function queryTyped<Entity>(
  sqlText: string,
  paramMap: Record<string, TypedQueryParam> = {}
): Promise<Entity[]> {
  const currentPool = await getPool();
  const request = currentPool.request();

  for (const [name, { type, value }] of Object.entries(paramMap)) {
    request.input(name, type, value);
  }

  const result = await request.query<Entity>(sqlText);
  return result.recordset;
}

async function closePoolFor(state: PoolState, label: string): Promise<void> {
  if (!state.pool) return;

  try {
    await state.pool.close();
    log.info(`[${label}] pool closed`);
  } catch (e) {
    log.error(`[${label}] close error`, (e as Error)?.message ?? e);
  } finally {
    state.pool = null;
  }
}

/**
 * Tutup pool saat shutdown (SIGINT/SIGTERM)
 */
export async function closePool(): Promise<void> {
  await closePoolFor(mainPoolState, 'DB');
}

export async function closeStoPool(): Promise<void> {
  await closePoolFor(stoPoolState, 'STO DB');
}

export async function closeAllPools(): Promise<void> {
  await Promise.all([closePool(), closeStoPool()]);
}

// optional: registrasi graceful shutdown di entrypoint (server.ts)
export function registerDbShutdownHooks() {
  const shutdown = async (sig: string) => {
    log.info(`received ${sig}, closing DB pools...`);
    await closeAllPools();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

export { sql };
