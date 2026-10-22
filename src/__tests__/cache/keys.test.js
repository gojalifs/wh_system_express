import { CacheKeys, buildKeysWithVersion, getVersionOnly } from '../../cache/keys.js';

describe('Cache Keys', () => {
  const PREFIX = 'laravel_cache_';

  describe('CacheKeys static methods', () => {
    test('version() returns correct key format', () => {
      const key = CacheKeys.version('STK-ABC12345');
      expect(key).toBe(`${PREFIX}stkv3:ver:STK-ABC12345`);
    });

    test('scanSums() includes version placeholder', () => {
      const key = CacheKeys.scanSums(12, 'USER001', 'STK-ABC12345');
      expect(key).toContain(`${PREFIX}stkv3:scansums:v{ver:STK-ABC12345}:12:USER001:STK-ABC12345`);
    });

    test('dataBox() includes version placeholder and month', () => {
      const key = CacheKeys.dataBox('STK-ABC12345', '202601');
      expect(key).toBe(`${PREFIX}stkv3:databox:v{ver:STK-ABC12345}:202601`);
    });

    test('sortedJobs() includes version placeholder', () => {
      const key = CacheKeys.sortedJobs(12, 'USER001', 'STK-ABC12345');
      expect(key).toContain(`${PREFIX}stkv3:sortedjobs:v{ver:STK-ABC12345}:12:USER001:STK-ABC12345`);
    });

    test('wireTagFull() includes version placeholder', () => {
      const key = CacheKeys.wireTagFull('STK-ABC12345');
      expect(key).toBe(`${PREFIX}stkv3:wiretag:v{ver:STK-ABC12345}:STK-ABC12345`);
    });

    test('bundle() includes version placeholder, page, perPage', () => {
      const key = CacheKeys.bundle('STK-ABC12345', 5, 20);
      expect(key).toBe(`${PREFIX}stkv3:bundle:v{ver:STK-ABC12345}:STK-ABC12345:5:20`);
    });
  });

  describe('buildKeysWithVersion()', () => {
    let mockCacheStore;

    beforeEach(() => {
      mockCacheStore = {
        get: jest.fn(),
      };
    });

    test('builds all keys with actual version from cache', async () => {
      mockCacheStore.get.mockResolvedValue({
        expired: false,
        data: '5',
      });

      const keys = await buildKeysWithVersion(mockCacheStore, 'STK-ABC12345', 12, 'USER001');

      expect(keys.version).toBe(5);
      expect(keys.scanSums).toBe('laravel_cache_stkv3:scansums:v5:12:USER001:STK-ABC12345');
      expect(keys.dataBox('202601')).toBe('laravel_cache_stkv3:databox:v5:202601');
      expect(keys.sortedJobs).toBe('laravel_cache_stkv3:sortedjobs:v5:12:USER001:STK-ABC12345');
      expect(keys.wireTagFull).toBe('laravel_cache_stkv3:wiretag:v5:STK-ABC12345');
      expect(keys.bundle(1, 10)).toBe('laravel_cache_stkv3:bundle:v5:STK-ABC12345:1:10');
      expect(keys.bundle(5, 20)).toBe('laravel_cache_stkv3:bundle:v5:STK-ABC12345:5:20');
    });

    test('defaults to version 1 when cache miss', async () => {
      mockCacheStore.get.mockResolvedValue(null);

      const keys = await buildKeysWithVersion(mockCacheStore, 'STK-ABC12345', 12, 'USER001');

      expect(keys.version).toBe(1);
      expect(keys.scanSums).toContain('v1:');
    });

    test('defaults to version 1 when cache expired', async () => {
      mockCacheStore.get.mockResolvedValue({ expired: true, data: '5' });

      const keys = await buildKeysWithVersion(mockCacheStore, 'STK-ABC12345', 12, 'USER001');

      expect(keys.version).toBe(1);
    });

    test('defaults to version 1 when cache data is null', async () => {
      mockCacheStore.get.mockResolvedValue({ expired: false, data: null });

      const keys = await buildKeysWithVersion(mockCacheStore, 'STK-ABC12345', 12, 'USER001');

      expect(keys.version).toBe(1);
    });

    test('handles non-numeric version data', async () => {
      mockCacheStore.get.mockResolvedValue({ expired: false, data: 'invalid' });

      const keys = await buildKeysWithVersion(mockCacheStore, 'STK-ABC12345', 12, 'USER001');

      expect(keys.version).toBe(1);
    });
  });

  describe('getVersionOnly()', () => {
    let mockCacheStore;

    beforeEach(() => {
      mockCacheStore = { get: jest.fn() };
    });

    test('returns version from cache', async () => {
      mockCacheStore.get.mockResolvedValue({ expired: false, data: '42' });

      const version = await getVersionOnly(mockCacheStore, 'STK-ABC12345');

      expect(version).toBe(42);
    });

    test('returns 1 for cache miss', async () => {
      mockCacheStore.get.mockResolvedValue(null);

      const version = await getVersionOnly(mockCacheStore, 'STK-ABC12345');

      expect(version).toBe(1);
    });
  });
});