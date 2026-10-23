import sql from 'mssql';
import { getStoPool } from './db.js';

/**
 * Durable build queue for STO v4 pre-generation (table sto_bundle_builds,
 * created by the Laravel migration of the same name). The table doubles as
 * the build-status source for the Web admin page: Laravel reads it, the
 * Express runner writes it.
 */
export type BuildStatus = 'QUEUED' | 'RUNNING' | 'READY' | 'FAILED';

export interface StoBuildRow {
  id: number;
  session_id: string;
  cache_version: number;
  status: BuildStatus;
  total_materials: number | null;
  materials_done: number;
  max_serial_count: number | null;
  attempts: number;
  error: string | null;
  started_at: Date | string | null;
  finished_at: Date | string | null;
  created_at: Date | string | null;
  updated_at: Date | string | null;
}

async function pool(): Promise<sql.ConnectionPool> {
  return getStoPool();
}

/**
 * Insert a QUEUED build for (session, version) unless one already exists.
 * Always returns the row for that pair (idempotent enqueue).
 */
export async function enqueueBuild(
  sessionId: string,
  cacheVersion: number
): Promise<StoBuildRow> {
  const p = await pool();
  const request = p.request();
  request.input('sessionId', sql.NVarChar, sessionId);
  request.input('version', sql.Int, cacheVersion);
  await request.query(`
    INSERT INTO [sto_bundle_builds]
      ([session_id], [cache_version], [status], [materials_done], [attempts], [created_at], [updated_at])
    SELECT @sessionId, @version, 'QUEUED', 0, 0, SYSUTCDATETIME(), SYSUTCDATETIME()
    WHERE NOT EXISTS (
      SELECT 1 FROM [sto_bundle_builds] WITH (UPDLOCK, HOLDLOCK)
      WHERE [session_id] = @sessionId AND [cache_version] = @version
    )
  `);

  const row = await getBuild(sessionId, cacheVersion);
  if (!row) throw new Error('BUILD_ENQUEUE_FAILED');
  return row;
}

export async function getBuild(
  sessionId: string,
  cacheVersion: number
): Promise<StoBuildRow | null> {
  const p = await pool();
  const request = p.request();
  request.input('sessionId', sql.NVarChar, sessionId);
  request.input('version', sql.Int, cacheVersion);
  const result = await request.query<StoBuildRow>(`
    SELECT * FROM [sto_bundle_builds]
    WHERE [session_id] = @sessionId AND [cache_version] = @version
  `);
  return result.recordset[0] ?? null;
}

/** Atomically claim the oldest QUEUED build (marks it RUNNING). */
export async function claimNextBuild(): Promise<StoBuildRow | null> {
  const p = await pool();
  const result = await p.request().query<StoBuildRow>(`
    WITH next AS (
      SELECT TOP 1 * FROM [sto_bundle_builds] WITH (UPDLOCK, READPAST)
      WHERE [status] = 'QUEUED'
      ORDER BY [created_at] ASC, [id] ASC
    )
    UPDATE next
    SET [status] = 'RUNNING',
        [started_at] = SYSUTCDATETIME(),
        [attempts] = [attempts] + 1,
        [error] = NULL,
        [updated_at] = SYSUTCDATETIME()
    OUTPUT inserted.*
  `);
  return result.recordset[0] ?? null;
}

export async function updateBuildProgress(
  id: number,
  materialsDone: number,
  maxSerialCount: number,
  totalMaterials: number
): Promise<void> {
  const p = await pool();
  const request = p.request();
  request.input('id', sql.BigInt, id);
  request.input('done', sql.Int, materialsDone);
  request.input('maxSerial', sql.Int, maxSerialCount);
  request.input('total', sql.Int, totalMaterials);
  await request.query(`
    UPDATE [sto_bundle_builds]
    SET [materials_done] = @done,
        [total_materials] = @total,
        [max_serial_count] = @maxSerial,
        [updated_at] = SYSUTCDATETIME()
    WHERE [id] = @id
  `);
}

export async function completeBuild(
  id: number,
  totalMaterials: number,
  maxSerialCount: number
): Promise<void> {
  const p = await pool();
  const request = p.request();
  request.input('id', sql.BigInt, id);
  request.input('total', sql.Int, totalMaterials);
  request.input('maxSerial', sql.Int, maxSerialCount);
  await request.query(`
    UPDATE [sto_bundle_builds]
    SET [status] = 'READY',
        [total_materials] = @total,
        [materials_done] = @total,
        [max_serial_count] = @maxSerial,
        [finished_at] = SYSUTCDATETIME(),
        [updated_at] = SYSUTCDATETIME()
    WHERE [id] = @id
  `);
}

export async function failBuild(id: number, error: string): Promise<void> {
  const p = await pool();
  const request = p.request();
  request.input('id', sql.BigInt, id);
  request.input('error', sql.NVarChar, error.slice(0, 1000));
  await request.query(`
    UPDATE [sto_bundle_builds]
    SET [status] = 'FAILED',
        [error] = @error,
        [finished_at] = SYSUTCDATETIME(),
        [updated_at] = SYSUTCDATETIME()
    WHERE [id] = @id
  `);
}

/** RUNNING builds whose runner died (restart/crash) go back to QUEUED. */
export async function requeueStaleBuilds(staleMinutes: number): Promise<number> {
  const p = await pool();
  const request = p.request();
  request.input('minutes', sql.Int, staleMinutes);
  const result = await request.query(`
    UPDATE [sto_bundle_builds]
    SET [status] = 'QUEUED',
        [started_at] = NULL,
        [updated_at] = SYSUTCDATETIME()
    WHERE [status] = 'RUNNING'
      AND [started_at] < DATEADD(minute, -@minutes, SYSUTCDATETIME())
  `);
  return result.rowsAffected[0] ?? 0;
}
