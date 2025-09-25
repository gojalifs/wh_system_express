// src/infra/db.ts
import sql from 'mssql';
import { ENV } from '../../core/env';

// ---- Konfigurasi pool (ambil dari .env)
export const sqlConfig: sql.config = {
  user: ENV.SQL_USER,
  password: ENV.SQL_PASS,
  server: ENV.SQL_HOST, // gunakan IP/hostname langsung
  database: ENV.SQL_DB,
  port: ENV.SQL_PORT ? Number(ENV.SQL_PORT) : 1433,
  options: {
    encrypt: ENV.SQL_ENCRYPT, // true jika TLS; kalau self-signed, trust=true
    trustServerCertificate: true,
  },
  connectionTimeout: 10_000, // 10s connect timeout
  requestTimeout: 15_000, // 15s default per-request timeout
  pool: { max: 10, min: 0, idleTimeoutMillis: 30_000 },
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
  if (pool && (pool as any).connecting) return pool;

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
    console.error('[DB] connect error:', (err as any)?.message ?? err);
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
  let attempt = 0,
    lastErr: any;
  while (attempt < maxRetry) {
    try {
      const p = await getPool();
      return await fn(p);
    } catch (e) {
      lastErr = e;
      attempt++;
      console.error(
        `[DB] ${label} failed (attempt ${attempt}/${maxRetry}):`,
        (e as any)?.message ?? e
      );
      await delay(1000 * attempt); // 1s, 2s, 3s ...
    }
  }
  throw lastErr;
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
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
      console.error('[DB] close error:', (e as any)?.message ?? e);
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
