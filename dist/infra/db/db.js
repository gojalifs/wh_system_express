// src/infra/db.ts
import sql from 'mssql';
import { ENV } from '../../core/env.js';
function buildSqlConfig(input) {
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
export const sqlConfig = buildSqlConfig({
    user: ENV.SQL_USER,
    password: ENV.SQL_PASS,
    server: ENV.SQL_HOST,
    database: ENV.SQL_DB,
    port: ENV.SQL_PORT,
    encrypt: ENV.SQL_ENCRYPT,
    trustServerCertificate: ENV.SQL_TRUST_SERVER_CERTIFICATE,
});
// STO bundle memakai koneksi database sendiri.
export const stoSqlConfig = buildSqlConfig({
    user: ENV.STO_DB_USER,
    password: ENV.STO_DB_PASSWORD,
    server: ENV.STO_DB_HOST,
    database: ENV.STO_DB_DATABASE,
    port: ENV.STO_DB_PORT,
    encrypt: ENV.STO_DB_ENCRYPT,
    trustServerCertificate: ENV.STO_DB_TRUST_SERVER_CERTIFICATE,
});
const mainPoolState = { pool: null };
const stoPoolState = { pool: null };
/**
 * Dapatkan pool tunggal yang reusable.
 * - Hindari race dengan cek `connecting`.
 * - Reset pool jika connect gagal (biar bisa retry call berikutnya).
 */
async function getPoolFor(state, config, info) {
    // sudah terhubung → langsung pakai
    if (state.pool && state.pool.connected)
        return state.pool;
    // sedang proses connect → kembalikan instance yang sama (request akan di-queue)
    if (state.pool &&
        state.pool.connecting) {
        return state.pool;
    }
    // buat pool baru
    const newPool = new sql.ConnectionPool(config);
    state.pool = newPool;
    // log error internal pool (mis. network drop) → reset supaya call berikutnya re-create
    newPool.on('error', (err) => {
        console.error(`[${info.label}] pool error:`, err?.message ?? err);
        if (state.pool === newPool)
            state.pool = null;
    });
    try {
        await newPool.connect();
        console.log(`[${info.label}] connected:`, `${info.host}:${info.port || 1433}/${info.database}`);
    }
    catch (err) {
        console.error(`[${info.label}] connect error:`, err?.message ?? err);
        if (state.pool === newPool)
            state.pool = null; // reset
        throw err;
    }
    return newPool;
}
export function getPool() {
    return getPoolFor(mainPoolState, sqlConfig, {
        label: 'DB',
        host: ENV.SQL_HOST,
        port: ENV.SQL_PORT,
        database: ENV.SQL_DB,
    });
}
export function getStoPool() {
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
export async function withDbRetry(fn, label = 'db-op', maxRetry = 3) {
    let attempt = 0;
    let lastErr;
    while (attempt < maxRetry) {
        try {
            const p = await getPool();
            return await fn(p);
        }
        catch (e) {
            lastErr = e;
            attempt++;
            console.error(`[DB] ${label} failed (attempt ${attempt}/${maxRetry}):`, e?.message ?? e);
            await delay(1000 * attempt); // 1s, 2s, 3s ...
        }
    }
    throw lastErr;
}
function delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
function isTransientError(err) {
    const code = err?.code;
    return (code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ECONNREFUSED');
}
/**
 * Execute a query with automatic retry on transient failures
 */
export async function query(sqlText, params = [], retries = 2) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const currentPool = await getPool();
            const request = currentPool.request();
            params.forEach((param, index) => {
                request.input(`param${index}`, param);
            });
            const result = await request.query(sqlText);
            return result.recordset;
        }
        catch (err) {
            lastError = err;
            if (isTransientError(err) && attempt < retries) {
                console.warn(`[SQL] Query failed (attempt ${attempt + 1}), retrying...`, err?.message ?? err);
                mainPoolState.pool = null; // Force reconnect
                await delay(1000 * (attempt + 1));
                continue;
            }
            throw err;
        }
    }
    throw lastError;
}
/**
 * Execute a query with typed parameters (for complex types)
 */
export async function queryTyped(sqlText, paramMap = {}) {
    const currentPool = await getPool();
    const request = currentPool.request();
    for (const [name, { type, value }] of Object.entries(paramMap)) {
        request.input(name, type, value);
    }
    const result = await request.query(sqlText);
    return result.recordset;
}
async function closePoolFor(state, label) {
    if (!state.pool)
        return;
    try {
        await state.pool.close();
        console.log(`[${label}] pool closed`);
    }
    catch (e) {
        console.error(`[${label}] close error:`, e?.message ?? e);
    }
    finally {
        state.pool = null;
    }
}
/**
 * Tutup pool saat shutdown (SIGINT/SIGTERM)
 */
export async function closePool() {
    await closePoolFor(mainPoolState, 'DB');
}
export async function closeStoPool() {
    await closePoolFor(stoPoolState, 'STO DB');
}
export async function closeAllPools() {
    await Promise.all([closePool(), closeStoPool()]);
}
// optional: registrasi graceful shutdown di entrypoint (server.ts)
export function registerDbShutdownHooks() {
    const shutdown = async (sig) => {
        console.log(`[APP] received ${sig}, closing DB pools...`);
        await closeAllPools();
        process.exit(0);
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
}
export { sql };
