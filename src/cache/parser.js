import { unserialize } from 'php-serialize';

/**
 * Laravel file cache format:
 * - First 10 characters: expiry timestamp (unix, zero-padded)
 * - Rest: PHP serialized value
 * Example: "1716543210a:2:{i:0;s:3:"foo";i:1;s:3:"bar";}"
 */
export function parseLaravelCacheEntry(raw) {
  if (!raw || typeof raw !== 'string') {
    return null;
  }

  // Need at least 10 chars for expiry + some data
  if (raw.length < 11) {
    return null;
  }

  const expiryStr = raw.substring(0, 10);
  const payload = raw.substring(10);

  const expiry = parseInt(expiryStr, 10);
  if (isNaN(expiry)) {
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
    return { expired: false, data: payload, parseError: e.message };
  }
}

/**
 * Read and parse a Laravel cache file
 */
import fs from 'fs';

export function readLaravelCacheFile(filepath) {
  try {
    const raw = fs.readFileSync(filepath, 'utf8');
    return parseLaravelCacheEntry(raw);
  } catch (e) {
    if (e.code === 'ENOENT') {
      return null; // File not found = cache miss
    }
    throw e;
  }
}

/**
 * Find Laravel cache file by key
 * Laravel uses SHA1 of key as filename in subdirectories
 */
import crypto from 'crypto';

export function getLaravelCacheFilePath(cacheDir, key) {
  const hash = crypto.createHash('sha1').update(key).digest('hex');
  const prefix = hash.substring(0, 2);
  return path.join(cacheDir, prefix, hash);
}

import path from 'path';

/**
 * Get cache value by key from Laravel file cache
 */
export function getFromLaravelCache(cacheDir, key) {
  const filepath = getLaravelCacheFilePath(cacheDir, key);
  return readLaravelCacheFile(filepath);
}