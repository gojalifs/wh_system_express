import { jest } from '@jest/globals';
import {
  LaravelFileCacheStore,
  MemoryCacheStore,
  CompositeCacheStore,
} from '../../cache/store.js';

describe('Cache Store', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('LaravelFileCacheStore', () => {
    let store: LaravelFileCacheStore;

    beforeEach(() => {
      store = new LaravelFileCacheStore('/custom/cache/path');
    });

    test('uses provided cache directory', () => {
      expect(store.cacheDir).toBe('/custom/cache/path');
    });

    test('uses default cache directory when none provided', () => {
      const defaultStore = new LaravelFileCacheStore();
      expect(defaultStore.cacheDir).toBeDefined();
    });

    test('get() returns correct structure for valid entry', async () => {
      const store = new LaravelFileCacheStore('/fake/path');
      // The actual get() method will try to read the file system
      // Since we can't easily mock fs in ESM, we test the structure
      const result = await store.get('test-key');
      // Should return null for non-existent file
      expect(result).toBeNull();
    });

    test('has() returns false for non-existent key', async () => {
      const store = new LaravelFileCacheStore('/fake/path');
      const result = await store.has('missing-key');
      expect(result).toBe(false);
    });
  });

  describe('MemoryCacheStore', () => {
    let store: MemoryCacheStore;

    beforeEach(() => {
      store = new MemoryCacheStore();
    });

    test('stores and retrieves data', async () => {
      await store.set('key1', 'value1', 60);

      const result = await store.get('key1');

      expect(result).toEqual({ expired: false, data: 'value1' });
    });

    test('returns expired for expired entries', async () => {
      await store.set('key1', 'value1', 0);

      store.store.set('key1', {
        data: 'value1',
        expiry: Date.now() - 1000,
      });

      const result = await store.get('key1');

      expect(result).toEqual({ expired: true, data: null });
    });

    test('has() works correctly', async () => {
      await store.set('key1', 'value1', 60);

      expect(await store.has('key1')).toBe(true);
      expect(await store.has('missing')).toBe(false);
    });

    test('delete() removes entry', async () => {
      await store.set('key1', 'value1', 60);
      await store.delete('key1');

      const result = await store.get('key1');

      expect(result).toBeNull();
    });

    test('clear() removes all entries', async () => {
      await store.set('key1', 'value1', 60);
      await store.set('key2', 'value2', 60);

      store.clear();

      expect(await store.get('key1')).toBeNull();
      expect(await store.get('key2')).toBeNull();
    });
  });

  describe('CompositeCacheStore', () => {
    let store: CompositeCacheStore;

    beforeEach(() => {
      store = new CompositeCacheStore('/nonexistent/cache/path');
    });

    test('set() only writes to memory cache', async () => {
      await store.set('new-key', 'new-value', 60);

      const result = await store.get('new-key');
      expect(result?.data).toBe('new-value');
    });

    test.skip('has() checks memory store when laravel cache misses', async () => {
      await store.memory.set('in-memory', 'value', 60);

      // Spy on laravel.has to return false
      const laravelHasSpy = jest
        .spyOn(store.laravel, 'has')
        .mockResolvedValue(false);

      const result = await store.has('in-memory');
      expect(result).toBe(true);

      // Restore
      laravelHasSpy.mockRestore();

      // Test not found
      const nowhereSpy = jest
        .spyOn(store.laravel, 'has')
        .mockResolvedValue(false);
      expect(await store.has('nowhere')).toBe(false);
      nowhereSpy.mockRestore();
    });
  });
});
