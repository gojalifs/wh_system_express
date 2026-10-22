// src/infra/db.ts
import sql from 'mssql';
import { ENV } from '../../core/env.js';

// ---- Konfigurasi pool (ambil dari .env)
export const sqlConfig: sql.config = {
  user: ENV.SQL_USER,
  password: ENV.SQL_PASS,
  server: ENV.SQL_HOST, // gunakan IP/hostname langsung
  database: ENV.SQL_DB,
  port: ENV.SQL_PORT ? Number(ENV.SQL_PORT) : 1433,
  options: {
    encrypt: ENV.SQL_ENCRYPT, // true jika TLS; kalau self-signed, trust=true
    trustServerCertificate: ENV.SQL_TRUST_SERVER_CERTIFICATE,
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

let pool: sql.ConnectionPool | null = null;

/**
 * Dapatkan pool tunggal yang reusable.
 * - Hindari race dengan cek `connecting`.
 * - Reset pool jika connect gagal (biar bisa retry call berikutnya).
 */
export async function getPool(): Promise<sql.ConnectionPool> {
  // sudah terhubung → langsung pakai
  if (pool && pool.connected) return pool;

  // sedang proses connect → kembalikan instance yang sama (request akan di-queue)
  if (pool && (pool as sql.ConnectionPool & { connecting?: boolean }).connecting) {
    return pool;
  }

  // buat pool baru
  const newPool = new sql.ConnectionPool(sqlConfig);
  pool = newPool;

  // log error internal pool (mis. network drop) → reset supaya call berikutnya re-create
  newPool.on('error', (err) => {
    console.error('[DB] pool error:', err?.message ?? err);
    if (pool === newPool) pool = null;
  });

  try {
    await newPool.connect();
    console.log(
      '[DB] connected:',
      `${ENV.SQL_HOST}:${ENV.SQL_PORT || 1433}/${ENV.SQL_DB}`
    );
  } catch (err) {
    console.error('[DB] connect error:', (err as Error)?.message ?? err);
    if (pool === newPool) pool = null; // reset
    throw err;
  }

  return newPool;
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
      console.error(
        `[DB] ${label} failed (attempt ${attempt}/${maxRetry}):`,
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
        console.warn(
          `[SQL] Query failed (attempt ${attempt + 1}), retrying...`,
          (err as Error)?.message ?? err
        );
        if (pool) {
          pool = null; // Force reconnect
        }
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

/**
 * Tutup pool saat shutdown (SIGINT/SIGTERM)
 */
export async function closePool(): Promise<void> {
  if (pool) {
    try {
      await pool.close();
      console.log('[DB] pool closed');
    } catch (e) {
      console.error('[DB] close error:', (e as Error)?.message ?? e);
    } finally {
      pool = null;
    }
  }
}

// optional: registrasi graceful shutdown di entrypoint (server.ts)
export function registerDbShutdownHooks() {
  const shutdown = async (sig: string) => {
    console.log(`[APP] received ${sig}, closing DB pool...`);
    await closePool();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

export { sql };
