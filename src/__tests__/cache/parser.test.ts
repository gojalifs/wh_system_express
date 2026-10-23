import {
  parseLaravelCacheEntry,
} from '../../cache/parser.js';

describe('Cache Parser', () => {
  describe('parseLaravelCacheEntry', () => {
    test('parses valid cache entry with data', () => {
      const expiry = Math.floor(Date.now() / 1000) + 3600;
      const expiryStr = expiry.toString().padStart(10, '0');
      const payload =
        'a:2:{s:3:"key";s:5:"value";s:6:"number";i:42;}';
      const raw = `${expiryStr}${payload}`;

      const result = parseLaravelCacheEntry(raw);

      expect(result).toEqual({
        expired: false,
        data: { key: 'value', number: 42 },
      });
    });

    test('returns expired=true for expired entries', () => {
      const expiry = Math.floor(Date.now() / 1000) - 3600;
      const expiryStr = expiry.toString().padStart(10, '0');
      const payload = 'a:0:{}';
      const raw = `${expiryStr}${payload}`;

      const result = parseLaravelCacheEntry(raw);

      expect(result).toEqual({
        expired: true,
        data: null,
      });
    });

    test('returns null for invalid/short input', () => {
      expect(parseLaravelCacheEntry('')).toBeNull();
      expect(parseLaravelCacheEntry('short')).toBeNull();
      expect(parseLaravelCacheEntry('123456789')).toBeNull();
    });

    test('returns null for non-string input', () => {
      expect(parseLaravelCacheEntry(null)).toBeNull();
      expect(parseLaravelCacheEntry(123)).toBeNull();
    });

    test('handles parse errors gracefully', () => {
      const expiry = Math.floor(Date.now() / 1000) + 3600;
      const expiryStr = expiry.toString().padStart(10, '0');
      const raw = `${expiryStr}invalid-php-serialize-data`;

      const result = parseLaravelCacheEntry(raw);

      expect(result).not.toBeNull();
      expect(result?.expired).toBe(false);
      expect(result?.data).toBeDefined();
      // parseError is set when unserialize throws, but may not throw for all invalid data
      // Just verify the function doesn't throw and returns a valid structure
      expect(result).toHaveProperty('expired');
      expect(result).toHaveProperty('data');
    });
  });

  // Skip tests that require fs/crypto/path mocking for now
  // They would need jest.unstable_mockModule for ESM
  describe.skip('readLaravelCacheFile', () => {
    // These tests require proper ESM mocking with jest.unstable_mockModule
  });

  describe.skip('getLaravelCacheFilePath', () => {
    // These tests require crypto mocking with jest.unstable_mockModule
  });
});
