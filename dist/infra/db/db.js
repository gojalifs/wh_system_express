"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sqlConfig = void 0;
exports.getPool = getPool;
exports.withDbRetry = withDbRetry;
exports.closePool = closePool;
exports.registerDbShutdownHooks = registerDbShutdownHooks;
// src/infra/db.ts
const mssql_1 = __importDefault(require("mssql"));
const env_1 = require("../../core/env");
// ---- Konfigurasi pool (ambil dari .env)
exports.sqlConfig = {
    user: env_1.ENV.SQL_USER,
    password: env_1.ENV.SQL_PASS,
    server: env_1.ENV.SQL_HOST, // gunakan IP/hostname langsung
    database: env_1.ENV.SQL_DB,
    port: env_1.ENV.SQL_PORT ? Number(env_1.ENV.SQL_PORT) : 1433,
    options: {
        encrypt: env_1.ENV.SQL_ENCRYPT, // true jika TLS; kalau self-signed, trust=true
        trustServerCertificate: true,
    },
    connectionTimeout: 10_000, // 10s connect timeout
    requestTimeout: 15_000, // 15s default per-request timeout
    pool: { max: 10, min: 0, idleTimeoutMillis: 30_000 },
};
let pool = null;
/**
 * Dapatkan pool tunggal yang reusable.
 * - Hindari race dengan cek `connecting`.
 * - Reset pool jika connect gagal (biar bisa retry call berikutnya).
 */
async function getPool() {
    // sudah terhubung → langsung pakai
    if (pool && pool.connected)
        return pool;
    // sedang proses connect → kembalikan instance yang sama (request akan di-queue)
    if (pool && pool.connecting)
        return pool;
    // buat pool baru
    const newPool = new mssql_1.default.ConnectionPool(exports.sqlConfig);
    pool = newPool;
    // log error internal pool (mis. network drop) → reset supaya call berikutnya re-create
    newPool.on('error', (err) => {
        console.error('[DB] pool error:', err?.message ?? err);
        if (pool === newPool)
            pool = null;
    });
    try {
        await newPool.connect();
        console.log('[DB] connected:', `${env_1.ENV.SQL_HOST}:${env_1.ENV.SQL_PORT || 1433}/${env_1.ENV.SQL_DB}`);
    }
    catch (err) {
        console.error('[DB] connect error:', err?.message ?? err);
        if (pool === newPool)
            pool = null; // reset
        throw err;
    }
    return newPool;
}
/**
 * Helper: jalankan fungsi query dengan retry backoff ringan
 */
async function withDbRetry(fn, label = 'db-op', maxRetry = 3) {
    let attempt = 0, lastErr;
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
/**
 * Tutup pool saat shutdown (SIGINT/SIGTERM)
 */
async function closePool() {
    if (pool) {
        try {
            await pool.close();
            console.log('[DB] pool closed');
        }
        catch (e) {
            console.error('[DB] close error:', e?.message ?? e);
        }
        finally {
            pool = null;
        }
    }
}
// optional: registrasi graceful shutdown di entrypoint (server.ts)
function registerDbShutdownHooks() {
    const shutdown = async (sig) => {
        console.log(`[APP] received ${sig}, closing DB pool...`);
        await closePool();
        process.exit(0);
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
}
