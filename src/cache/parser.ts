import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { unserialize } from 'php-serialize';
import type { CacheEntry } from './store.js';

/**
 * Laravel file cache format:
 * - First 10 characters: expiry timestamp (unix, zero-padded)
 * - Rest: PHP serialized value
 * Example: "1716543210a:2:{i:0;s:3:"foo";i:1;s:3:"bar";}"
 */
export function parseLaravelCacheEntry(raw: unknown): CacheEntry | null {
  if (!raw || typeof raw !== 'string') {
    return null;
  }

  // Need at least 10 chars for expiry + some data
  if (raw.length < 11) {
    return null;
  }

  const expiryStr = raw.substring(0, 10);
  const payload = raw.substring(10);

  const expiry = Number.parseInt(expiryStr, 10);
  if (Number.isNaN(expiry)) {
    return null;
  }

  // Check if expired
  const now = Math.floor(Date.now() / 1000);
  if (expiry !== 0 && expiry < now) {
    return { expired: true, data: null };
  }

  try {
    const data = unserialize(payload);
    return { expired: false, data };
  } catch (e) {
    // If unserialize fails, return raw payload for debugging
    return {
      expired: false,
      data: payload,
      parseError: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Read and parse a Laravel cache file
 */
export function readLaravelCacheFile(
  filepath: string
): CacheEntry | null {
  try {
    const raw = fs.readFileSync(filepath, 'utf8');
    return parseLaravelCacheEntry(raw);
  } catch (e) {
    const error = e as NodeJS.ErrnoException;
    if (error.code === 'ENOENT') {
      return null; // File not found = cache miss
    }
    throw e;
  }
}

/**
 * Find Laravel cache file by key
 * Laravel uses SHA1 of key as filename in subdirectories
 */
export function getLaravelCacheFilePath(
  cacheDir: string,
  key: string
): string {
  const hash = crypto.createHash('sha1').update(key).digest('hex');
  const prefix = hash.substring(0, 2);
  return path.join(cacheDir, prefix, hash);
}

/**
 * Get cache value by key from Laravel file cache
 */
export function getFromLaravelCache(
  cacheDir: string,
  key: string
): CacheEntry | null {
  const filepath = getLaravelCacheFilePath(cacheDir, key);
  return readLaravelCacheFile(filepath);
}
