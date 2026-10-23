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

// Silence console.log/error during tests unless DEBUG_TESTS=1
if (!process.env.DEBUG_TESTS) {
  global.console = {
    ...console,
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  } as unknown as Console;
}
