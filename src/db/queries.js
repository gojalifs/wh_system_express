import { config } from '../config.js';
import { sql } from './pool.js';

const CHUNK_SIZE = config.chunkSize;

// ============================================================
// SCAN SUMS - GROUP BY stocktaking_scan
// ============================================================
export const QUERY_SCAN_SUMS = `
SELECT
    [material_no],
    SUM([qty]) AS [qty]
FROM [stocktaking_scan]
WHERE [sto_batch] = @batchId
  AND [stocktaking_by] = @user
  AND [session_id] = @sessionId
  AND [deleted_at] IS NULL
GROUP BY [material_no]
`;

/**
 * Execute scan sums query
 * Returns: { [material_no]: qty }
 */
export async function queryScanSums(pool, batchId, user, sessionId) {
  const request = pool.request();
  request.input('batchId', sql.Int, batchId);
  request.input('user', sql.NVarChar, user);
  request.input('sessionId', sql.NVarChar, sessionId);

  const result = await request.query(QUERY_SCAN_SUMS);
  const mapped = {};
  for (const row of result.recordset) {
    mapped[row.material_no?.trim()] = parseFloat(row.qty) || 0;
  }
  return mapped;
}

// ============================================================
// DATA BOX - Global per-month aggregate
// ============================================================
export const QUERY_DATA_BOX = `
SELECT
    [material_no],
    SUM([qty]) AS [qty]
FROM [stocktaking_scan]
WHERE [is_data_box] = 1
  AND [month] = @month
GROUP BY [material_no]
`;

export async function queryDataBox(pool, month) {
  const request = pool.request();
  request.input('month', sql.NVarChar, month);

  const result = await request.request.query(QUERY_DATA_BOX);
  const mapped = {};
  for (const row of result.recordset) {
    mapped[row.material_no?.trim()] = parseFloat(row.qty) || 0;
  }
  return mapped;
}

// ============================================================
// SORTED JOBS - stocktaking_inv_mst for user + batch
// ============================================================
export const QUERY_JOBS_BASE = `
SELECT
    [id],
    [tally_no],
    [sect_code],
    [location_code],
    [material_number],
    [material_name],
    [inventory_qty],
    [uom],
    [batch],
    [job_assign_to],
    [counted],
    [correction_number]
FROM [stocktaking_inv_mst]
WHERE [job_assign_to] = @user
  AND [batch] = @batchId
`;

export async function queryJobs(pool, batchId, user) {
  const request = pool.request();
  request.input('batchId', sql.Int, batchId);
  request.input('user', sql.NVarChar, user);

  const result = await request.query(QUERY_JOBS_BASE);
  return result.recordset;
}

// ============================================================
// MATERIALS - material_receiving_mst for material numbers
// ============================================================
export const QUERY_MATERIALS = `
SELECT
    [id],
    [material_no],
    [material_nm],
    [material_loc],
    [box_qty],
    [receiving_serial],
    [rack_entry_date],
    [rack_entry_by],
    [status],
    [remark]
FROM [material_receiving_mst]
WHERE [material_no] IN (${'@'.repeat(CHUNK_SIZE).split('').map((_, i) => `@mat${i}`).join(',')})
`;

/**
 * Query materials in chunks (SQL Server 2100 param limit)
 */
export async function queryMaterialsFor(pool, materialNos) {
  const unique = [...new Set(materialNos.map(m => m?.trim()).filter(Boolean))];
  if (unique.length === 0) return [];

  const allMaterials = [];
  for (let i = 0; i < unique.length; i += CHUNK_SIZE) {
    const chunk = unique.slice(i, i + CHUNK_SIZE);
    const request = pool.request();
    chunk.forEach((mat, idx) => {
      request.input(`mat${idx}`, sql.NVarChar, mat);
    });

    const placeholders = chunk.map((_, idx) => `@mat${idx}`).join(',');
    const sql = `
      SELECT
          [id], [material_no], [material_nm], [material_loc],
          [box_qty], [receiving_serial], [rack_entry_date],
          [rack_entry_by], [status], [remark]
      FROM [material_receiving_mst]
      WHERE [material_no] IN (${placeholders})
    `;

    const result = await request.query(sql);
    allMaterials.push(...result.recordset);
  }
  return allMaterials;
}

// ============================================================
// SCANS - stocktaking_scan for session + materials
// ============================================================
export const QUERY_SCANS_BASE = `
SELECT *
FROM [stocktaking_scan]
WHERE [sto_batch] = @batchId
  AND [stocktaking_by] = @user
  AND [session_id] = @sessionId
  AND [material_no] IN (${'@'.repeat(CHUNK_SIZE).split('').map((_, i) => `@mat${i}`).join(',')})
`;

export async function queryScansFor(pool, batchId, user, sessionId, materialNos) {
  const unique = [...new Set(materialNos.map(m => m?.trim()).filter(Boolean))];
  if (unique.length === 0) return [];

  const allScans = [];
  for (let i = 0; i < unique.length; i += CHUNK_SIZE) {
    const chunk = unique.slice(i, i + CHUNK_SIZE);
    const request = pool.request();
    request.input('batchId', sql.Int, batchId);
    request.input('user', sql.NVarChar, user);
    request.input('sessionId', sql.NVarChar, sessionId);

    chunk.forEach((mat, idx) => {
      request.input(`mat${idx}`, sql.NVarChar, mat);
    });

    const placeholders = chunk.map((_, idx) => `@mat${idx}`).join(',');
    const sql = `
      SELECT *
      FROM [stocktaking_scan]
      WHERE [sto_batch] = @batchId
        AND [stocktaking_by] = @user
        AND [session_id] = @sessionId
        AND [material_no] IN (${placeholders})
    `;

    const result = await request.query(sql);
    allScans.push(...result.recordset);
  }
  return allScans;
}

// ============================================================
// WIRE TAG - Linked server view
// ============================================================
const LINKED_VIEW = `[192.168.89.218\\iGHSSIWSL202].[iGHS_L2_B3].[dbo].[B3R_Wire_tag_View]`;

export async function queryWireTagFull(pool, materialNos) {
  const unique = [...new Set(materialNos.map(m => m?.trim()).filter(Boolean))];
  if (unique.length === 0) return {};

  const wireTagMap = {};
  for (let i = 0; i < unique.length; i += CHUNK_SIZE) {
    const chunk = unique.slice(i, i + CHUNK_SIZE);
    const request = pool.request();

    chunk.forEach((mat, idx) => {
      request.input(`mat${idx}`, sql.NVarChar, mat);
    });

    const placeholders = chunk.map((_, idx) => `@mat${idx}`).join(',');
    const sql = `
      SELECT [Matl_no], [wire_cd]
      FROM ${LINKED_VIEW}
      WHERE [Matl_no] IN (${placeholders})
    `;

    try {
      const result = await request.query(sql);
      for (const row of result.recordset) {
        wireTagMap[row.Matl_no?.trim()] = row.wire_cd;
      }
    } catch (err) {
      // Linked server might not be accessible with SQL Server auth
      // Log warning but don't fail the whole request
      console.warn('[WireTag] Linked server query failed (may need linked server security config):', err.message);
      // Continue with empty wireTagMap for this chunk
    }
  }
  return wireTagMap;
}

// ============================================================
// SCOPES - snapshot_scope for session
// ============================================================
export const QUERY_SCOPES = `
SELECT [rack_code], [material_no]
FROM [stocktaking_snapshot_scope]
WHERE [session_id] = @sessionId
`;

export async function queryScopes(pool, sessionId) {
  const request = pool.request();
  request.input('sessionId', sql.NVarChar, sessionId);
  const result = await request.query(QUERY_SCOPES);
  return result.recordset;
}

// ============================================================
// SESSION + BATCH - for metadata
// ============================================================
export const QUERY_SESSION = `
SELECT s.*, b.[batch] as batch_code, b.[status] as batch_status
FROM [stocktaking_snapshot_session] s
LEFT JOIN [stocktaking_batch] b ON s.[batch_id] = b.[id]
WHERE s.[session_id] = @sessionId
`;

export async function querySession(pool, sessionId) {
  const request = pool.request();
  request.input('sessionId', sql.NVarChar, sessionId);
  const result = await request.query(QUERY_SESSION);
  return result.recordset[0] || null;
}

export { sql } from './pool.js';