import { ENV } from '../core/env.js';
import { readLaravelCacheFile, getLaravelCacheFilePath, } from './parser.js';
/**
 * Laravel file cache store reader
 * Reads directly from Laravel's file cache directory
 */
export class LaravelFileCacheStore {
    cacheDir;
    constructor(cacheDir = ENV.LARAVEL_CACHE_PATH) {
        this.cacheDir = cacheDir;
    }
    /**
     * Get a cache entry by key
     * Returns { data, expired, parseError } or null if not found
     */
    async get(key) {
        const filepath = getLaravelCacheFilePath(this.cacheDir, key);
        return readLaravelCacheFile(filepath);
    }
    /**
     * Get multiple keys at once
     */
    async getMany(keys) {
        const results = {};
        for (const key of keys) {
            results[key] = await this.get(key);
        }
        return results;
    }
    /**
     * Check if key exists and not expired
     */
    async has(key) {
        const entry = await this.get(key);
        return entry !== null && !entry.expired && entry.data !== null;
    }
}
/**
 * In-memory cache store (for Express's own cache if needed)
 */
export class MemoryCacheStore {
    store = new Map();
    async get(key) {
        const entry = this.store.get(key);
        if (!entry)
            return null;
        if (entry.expiry && entry.expiry < Date.now()) {
            this.store.delete(key);
            return { expired: true, data: null };
        }
        return { expired: false, data: entry.data };
    }
    async set(key, data, ttlSeconds) {
        const expiry = ttlSeconds ? Date.now() + ttlSeconds * 1000 : 0;
        this.store.set(key, { data, expiry });
    }
    async has(key) {
        const entry = await this.get(key);
        return entry !== null && !entry.expired;
    }
    async delete(key) {
        this.store.delete(key);
    }
    clear() {
        this.store.clear();
    }
}
/**
 * Composite store: tries Laravel file cache first, falls back to memory
 * (for Express's own computed values)
 */
export class CompositeCacheStore {
    laravel;
    memory;
    constructor(laravelCacheDir = ENV.LARAVEL_CACHE_PATH) {
        this.laravel = new LaravelFileCacheStore(laravelCacheDir);
        this.memory = new MemoryCacheStore();
    }
    async get(key) {
        // Try Laravel cache first
        const laravelEntry = await this.laravel.get(key);
        if (laravelEntry && !laravelEntry.expired && laravelEntry.data !== null) {
            return laravelEntry;
        }
        // Fallback to memory
        return this.memory.get(key);
    }
    async set(key, data, ttlSeconds) {
        // Only write to memory (Express's own cache)
        // We don't write to Laravel's cache from here
        return this.memory.set(key, data, ttlSeconds);
    }
    async has(key) {
        return (await this.laravel.has(key)) || (await this.memory.has(key));
    }
}
// Singleton instance
export const cacheStore = new CompositeCacheStore();
