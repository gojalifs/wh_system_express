import { jest } from '@jest/globals';

const mockGetSessionScansV4 = jest.fn(async (): Promise<unknown> => []);

jest.unstable_mockModule('../../services/packageService.js', () => ({
  getSessionPackageV4: jest.fn(),
  getSessionScansV4: mockGetSessionScansV4,
}));

const { getSessionScans } = await import(
  '../../app/controllers/sto-v4.controller.js'
);

function mockRes() {
  const res: Record<string, unknown> = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res as unknown as {
    status: jest.Mock;
    json: jest.Mock;
  };
}

describe('getSessionScans handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns 200 with the live scans envelope', async () => {
    const rows = [{ id: 1, serial_scanned: 'SN1' }];
    mockGetSessionScansV4.mockResolvedValue(rows);
    const res = mockRes();

    await getSessionScans(
      { params: { session_id: 'S1' } } as never,
      res as never
    );

    expect(mockGetSessionScansV4).toHaveBeenCalledWith('S1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Session scans ready.',
      data: rows,
    });
  });

  test('maps SESSION_NOT_FOUND to 404', async () => {
    mockGetSessionScansV4.mockRejectedValue(
      new Error('SESSION_NOT_FOUND')
    );
    const res = mockRes();

    await getSessionScans(
      { params: { session_id: 'S1' } } as never,
      res as never
    );

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('maps SESSION_NOT_ACTIVE to 409', async () => {
    mockGetSessionScansV4.mockRejectedValue(
      new Error('SESSION_NOT_ACTIVE')
    );
    const res = mockRes();

    await getSessionScans(
      { params: { session_id: 'S1' } } as never,
      res as never
    );

    expect(res.status).toHaveBeenCalledWith(409);
  });

  test('maps an unexpected error to 500', async () => {
    mockGetSessionScansV4.mockRejectedValue(new Error('boom'));
    const res = mockRes();

    await getSessionScans(
      { params: { session_id: 'S1' } } as never,
      res as never
    );

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
