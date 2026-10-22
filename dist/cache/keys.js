import { ENV } from '../core/env.js';
const PREFIX = ENV.CACHE_PREFIX;
/**
 * Build cache keys matching Laravel StocktakingCache exactly
 */
export const CacheKeys = {
    version(sessionId) {
        return `${PREFIX}stkv3:ver:${sessionId}`;
    },
    scanSums(batchId, user, sessionId) {
        return `${PREFIX}stkv3:scansums:v${this.getVersion(sessionId)}:${batchId}:${user}:${sessionId}`;
    },
    dataBox(sessionId, month) {
        return `${PREFIX}stkv3:databox:v${this.getVersion(sessionId)}:${month}`;
    },
    sortedJobs(batchId, user, sessionId) {
        return `${PREFIX}stkv3:sortedjobs:v${this.getVersion(sessionId)}:${batchId}:${user}:${sessionId}`;
    },
    wireTagFull(sessionId) {
        return `${PREFIX}stkv3:wiretag:v${this.getVersion(sessionId)}:${sessionId}`;
    },
    bundle(sessionId, page, perPage) {
        return `${PREFIX}stkv3:bundle:v${this.getVersion(sessionId)}:${sessionId}:${page}:${perPage}`;
    },
    // Helper to get version without async - version must be fetched from cache first
    getVersion(sessionId) {
        return `{ver:${sessionId}}`; // placeholder, actual version fetched at runtime
    },
};
/**
 * Build all keys with actual version
 */
export async function buildKeysWithVersion(cacheStore, sessionId, batchId, user) {
    const version = await getVersion(cacheStore, sessionId);
    const v = `v${version}`;
    return {
        version,
        scanSums: `${PREFIX}stkv3:scansums:${v}:${batchId}:${user}:${sessionId}`,
        dataBox: (month) => `${PREFIX}stkv3:databox:${v}:${month}`,
        sortedJobs: `${PREFIX}stkv3:sortedjobs:${v}:${batchId}:${user}:${sessionId}`,
        wireTagFull: `${PREFIX}stkv3:wiretag:${v}:${sessionId}`,
        bundle: (page, perPage) => `${PREFIX}stkv3:bundle:${v}:${sessionId}:${page}:${perPage}`,
    };
}
async function getVersion(cacheStore, sessionId) {
    const key = `${PREFIX}stkv3:ver:${sessionId}`;
    const entry = await cacheStore.get(key);
    if (entry && !entry.expired && entry.data !== null) {
        return Number.parseInt(String(entry.data), 10) || 1;
    }
    return 1;
}
export async function getVersionOnly(cacheStore, sessionId) {
    return getVersion(cacheStore, sessionId);
}
