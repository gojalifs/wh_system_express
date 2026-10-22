// jest.setup.js - ESM compatible setup
import { jest } from '@jest/globals';

// Mock mssql module
jest.mock('mssql', () => {
  const mockRequest = {
    input: jest.fn().mockReturnThis(),
    query: jest.fn(),
  };

  const mockPool = {
    request: jest.fn(() => mockRequest),
    connect: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
  };

  const sqlTypes = {
    Int: 'Int',
    NVarChar: 'NVarChar',
    VarChar: 'VarChar',
    BigInt: 'BigInt',
    Bit: 'Bit',
    DateTime: 'DateTime',
    Decimal: 'Decimal',
    Float: 'Float',
    Money: 'Money',
    Real: 'Real',
    SmallInt: 'SmallInt',
    SmallMoney: 'SmallMoney',
    Text: 'Text',
    Time: 'Time',
    TinyInt: 'TinyInt',
    UniqueIdentifier: 'UniqueIdentifier',
    Variant: 'Variant',
    Xml: 'Xml',
  };

  return {
    ConnectionPool: jest.fn(() => mockPool),
    ...sqlTypes,
    // Export mocks for test access
    __mockPool: mockPool,
    __mockRequest: mockRequest,
  };
});

// Mock fs for cache parser tests
import fs from 'fs';
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  readFileSync: jest.fn(),
  existsSync: jest.fn(),
}));

// Mock path for config
jest.mock('path', () => ({
  ...jest.requireActual('path'),
  resolve: jest.fn((...args) => args.join('/')),
  join: jest.fn((...args) => args.join('/')),
  dirname: jest.fn((p) => p.split('/').slice(0, -1).join('/')),
}));

// Mock crypto for cache parser
jest.mock('crypto', () => ({
  createHash: jest.fn(() => ({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn(),
  })),
}));

// Make jest globally available
global.jest = jest;

// Global test utilities
global.testUtils = {
  createMockCacheEntry: (data, expirySeconds = 3600) => {
    const expiry = Math.floor(Date.now() / 1000) + expirySeconds;
    const expiryStr = expiry.toString().padStart(10, '0');
    const payload = JSON.stringify(data);
    return `${expiryStr}${payload}`;
  },

  createExpiredCacheEntry: (data) => {
    const expiry = Math.floor(Date.now() / 1000) - 3600;
    const expiryStr = expiry.toString().padStart(10, '0');
    const payload = JSON.stringify(data);
    return `${expiryStr}${payload}`;
  },
};

// Silence console.log/error during tests unless DEBUG_TESTS=1
if (!process.env.DEBUG_TESTS) {
  global.console = {
    ...console,
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  };
}

export { jest };