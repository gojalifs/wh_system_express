import { jest } from '@jest/globals';

const mockPool = { name: 'test-pool' };
const mockGetStoPool = jest.fn(async () => mockPool);
const mockQuerySession = jest.fn(async (): Promise<unknown> => null);
const mockQueryJobs = jest.fn(async (): Promise<unknown> => []);
const mockQueryScansFor = jest.fn(async (): Promise<unknown> => []);

jest.unstable_mockModule('../../infra/db/db.js', () => ({
  getStoPool: mockGetStoPool,
}));
jest.unstable_mockModule('../../infra/db/queries.js', () => ({
  // Only the three below are exercised; the rest satisfy packageService's
  // named imports so the ESM graph can link.
  querySession: mockQuerySession,
  queryJobs: mockQueryJobs,
  queryScansFor: mockQueryScansFor,
  queryScanSums: jest.fn(async () => ({})),
  queryDataBox: jest.fn(async () => ({})),
  queryWireTagFull: jest.fn(async () => ({})),
  queryScopes: jest.fn(async () => []),
  querySerialCounts: jest.fn(async () => ({})),
  queryMaterialsFor: jest.fn(async () => []),
}));

const { getSessionScansV4 } = await import(
  '../../services/packageService.js'
);

describe('getSessionScansV4', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('throws SESSION_NOT_FOUND when the session does not exist', async () => {
    mockQuerySession.mockResolvedValue(null);

    await expect(getSessionScansV4('S1')).rejects.toThrow(
      'SESSION_NOT_FOUND'
    );
    expect(mockQueryJobs).not.toHaveBeenCalled();
    expect(mockQueryScansFor).not.toHaveBeenCalled();
  });

  test('throws SESSION_NOT_ACTIVE when the session is not ACTIVE', async () => {
    mockQuerySession.mockResolvedValue({
      session_id: 'S1',
      status: 'CREATED',
      batch_id: 7,
      assigned_user: 'NIK1',
    });

    await expect(getSessionScansV4('S1')).rejects.toThrow(
      'SESSION_NOT_ACTIVE'
    );
    expect(mockQueryScansFor).not.toHaveBeenCalled();
  });

  test('queries scans for the session materials, trimmed and deduped', async () => {
    mockQuerySession.mockResolvedValue({
      session_id: 'S1',
      status: 'ACTIVE',
      batch_id: 7,
      assigned_user: 'NIK1',
    });
    mockQueryJobs.mockResolvedValue([
      { material_number: ' MAT1 ' },
      { material_number: 'MAT1' },
      { material_number: 'MAT2' },
      { material_number: null },
    ]);
    const rows = [{ id: 1, serial_scanned: 'SN1' }];
    mockQueryScansFor.mockResolvedValue(rows);

    await expect(getSessionScansV4('S1')).resolves.toBe(rows);
    expect(mockQueryJobs).toHaveBeenCalledWith(mockPool, 7, 'NIK1');
    expect(mockQueryScansFor).toHaveBeenCalledWith(mockPool, 7, 'NIK1', 'S1', [
      'MAT1',
      'MAT2',
    ]);
  });
});
