import { ENV } from '../core/env.js';
import {
  readLaravelCacheFile,
  getLaravelCacheFilePath,
} from './parser.js';

export interface CacheEntry<T = unknown> {
  expired: boolean;
  data: T | null;
  parseError?: string;
}

export interface ReadableCacheStore {
  get<T = unknown>(key: string): Promise<CacheEntry<T> | null>;
  has(key: string): Promise<boolean>;
}

export interface CacheStore extends ReadableCacheStore {
  set<T = unknown>(
    key: string,
    data: T,
    ttlSeconds?: number
  ): Promise<void>;
}

/**
 * Laravel file cache store reader
 * Reads directly from Laravel's file cache directory
 */
export class LaravelFileCacheStore implements ReadableCacheStore {
  constructor(public readonly cacheDir = ENV.LARAVEL_CACHE_PATH) {}

  /**
   * Get a cache entry by key
   * Returns { data, expired, parseError } or null if not found
   */
  async get<T = unknown>(key: string): Promise<CacheEntry<T> | null> {
    const filepath = getLaravelCacheFilePath(this.cacheDir, key);
    return readLaravelCacheFile(filepath) as CacheEntry<T> | null;
  }

  /**
   * Get multiple keys at once
   */
  async getMany(
    keys: string[]
  ): Promise<Record<string, CacheEntry | null>> {
    const results: Record<string, CacheEntry | null> = {};
    for (const key of keys) {
      results[key] = await this.get(key);
    }
    return results;
  }

  /**
   * Check if key exists and not expired
   */
  async has(key: string): Promise<boolean> {
    const entry = await this.get(key);
    return entry !== null && !entry.expired && entry.data !== null;
  }
}

interface MemoryEntry {
  data: unknown;
  expiry: number;
}

/**
 * In-memory cache store (for Express's own cache if needed)
 */
export class MemoryCacheStore implements CacheStore {
  readonly store = new Map<string, MemoryEntry>();

  async get<T = unknown>(key: string): Promise<CacheEntry<T> | null> {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (entry.expiry && entry.expiry < Date.now()) {
      this.store.delete(key);
      return { expired: true, data: null };
    }

    return { expired: false, data: entry.data as T };
  }

  async set<T = unknown>(
    key: string,
    data: T,
    ttlSeconds?: number
  ): Promise<void> {
    const expiry = ttlSeconds ? Date.now() + ttlSeconds * 1000 : 0;
    this.store.set(key, { data, expiry });
  }

  async has(key: string): Promise<boolean> {
    const entry = await this.get(key);
    return entry !== null && !entry.expired;
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

/**
 * Composite store: tries Laravel file cache first, falls back to memory
 * (for Express's own computed values)
 */
export class CompositeCacheStore implements CacheStore {
  readonly laravel: LaravelFileCacheStore;
  readonly memory: MemoryCacheStore;

  constructor(laravelCacheDir = ENV.LARAVEL_CACHE_PATH) {
    this.laravel = new LaravelFileCacheStore(laravelCacheDir);
    this.memory = new MemoryCacheStore();
  }

  async get<T = unknown>(key: string): Promise<CacheEntry<T> | null> {
    // Try Laravel cache first
    const laravelEntry = await this.laravel.get<T>(key);
    if (laravelEntry && !laravelEntry.expired && laravelEntry.data !== null) {
      return laravelEntry;
    }

    // Fallback to memory
    return this.memory.get<T>(key);
  }

  async set<T = unknown>(
    key: string,
    data: T,
    ttlSeconds?: number
  ): Promise<void> {
    // Only write to memory (Express's own cache)
    // We don't write to Laravel's cache from here
    return this.memory.set(key, data, ttlSeconds);
  }

  async has(key: string): Promise<boolean> {
    return (await this.laravel.has(key)) || (await this.memory.has(key));
  }
}

// Singleton instance
export const cacheStore = new CompositeCacheStore();
