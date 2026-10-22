import { ENV } from '../core/env.js';
import type { CacheEntry } from './store.js';

const PREFIX = ENV.CACHE_PREFIX;

/**
 * Build cache keys matching Laravel StocktakingCache exactly
 */
export const CacheKeys = {
  version(sessionId: string): string {
    return `${PREFIX}stkv3:ver:${sessionId}`;
  },

  scanSums(batchId: number, user: string, sessionId: string): string {
    return `${PREFIX}stkv3:scansums:v${this.getVersion(sessionId)}:${batchId}:${user}:${sessionId}`;
  },

  dataBox(sessionId: string, month: string): string {
    return `${PREFIX}stkv3:databox:v${this.getVersion(sessionId)}:${month}`;
  },

  sortedJobs(batchId: number, user: string, sessionId: string): string {
    return `${PREFIX}stkv3:sortedjobs:v${this.getVersion(sessionId)}:${batchId}:${user}:${sessionId}`;
  },

  wireTagFull(sessionId: string): string {
    return `${PREFIX}stkv3:wiretag:v${this.getVersion(sessionId)}:${sessionId}`;
  },

  bundle(sessionId: string, page: number, perPage: number): string {
    return `${PREFIX}stkv3:bundle:v${this.getVersion(sessionId)}:${sessionId}:${page}:${perPage}`;
  },

  // Helper to get version without async - version must be fetched from cache first
  getVersion(sessionId: string): string {
    return `{ver:${sessionId}}`; // placeholder, actual version fetched at runtime
  },
};

export interface BundleCacheKeys {
  version: number;
  scanSums: string;
  dataBox: (month: string) => string;
  sortedJobs: string;
  wireTagFull: string;
  bundle: (page: number, perPage: number) => string;
}

type VersionCacheStore = {
  get(key: string): Promise<CacheEntry | null>;
};

/**
 * Build all keys with actual version
 */
export async function buildKeysWithVersion(
  cacheStore: VersionCacheStore,
  sessionId: string,
  batchId: number,
  user: string
): Promise<BundleCacheKeys> {
  const version = await getVersion(cacheStore, sessionId);
  const v = `v${version}`;

  return {
    version,
    scanSums: `${PREFIX}stkv3:scansums:${v}:${batchId}:${user}:${sessionId}`,
    dataBox: (month: string) =>
      `${PREFIX}stkv3:databox:${v}:${month}`,
    sortedJobs: `${PREFIX}stkv3:sortedjobs:${v}:${batchId}:${user}:${sessionId}`,
    wireTagFull: `${PREFIX}stkv3:wiretag:${v}:${sessionId}`,
    bundle: (page: number, perPage: number) =>
      `${PREFIX}stkv3:bundle:${v}:${sessionId}:${page}:${perPage}`,
  };
}

async function getVersion(
  cacheStore: VersionCacheStore,
  sessionId: string
): Promise<number> {
  const key = `${PREFIX}stkv3:ver:${sessionId}`;
  const entry = await cacheStore.get(key);
  if (entry && !entry.expired && entry.data !== null) {
    return Number.parseInt(String(entry.data), 10) || 1;
  }
  return 1;
}

export async function getVersionOnly(
  cacheStore: VersionCacheStore,
  sessionId: string
): Promise<number> {
  return getVersion(cacheStore, sessionId);
}
