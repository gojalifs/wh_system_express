import { cacheStore } from '../cache/store.js';
import { buildKeysWithVersion } from '../cache/keys.js';
import { getStoPool } from '../infra/db/db.js';
import {
  queryScanSums,
  queryDataBox,
  queryJobs,
  queryScansFor,
  queryWireTagFull,
  queryScopes,
  querySession,
  querySerialCounts,
} from '../infra/db/queries.js';
import { ENV } from '../core/env.js';
import { enrichJobs, sortJobsUnscannedFirst } from './bundleService.js';
import type {
  SessionMetadata,
  SessionPackageV4,
  StoMaterialSerialCount,
  StoScanRow,
} from '../domain/sto.js';

type ScanSums = Record<string, number>;
type WireTagMap = Record<string, string>;

/**
 * STO v4 session package: everything the mobile app needs EXCEPT serials.
 *
 * - All jobs of the session in one response (bounded: max ~400 materials
 *   per user), enriched like the v3 bundle (scan sums, data box, wire tag).
 * - All server scans for those materials.
 * - Per-material expected serial counts, so the client can seed its
 *   per-material download tracker before downloading any serial.
 * - material_count counts distinct MATERIALS from the job list. (The v3
 *   active-session endpoint counted distinct rack codes instead, which
 *   undercounts racks that hold two materials.)
 *
 * Serials themselves are served per material by serialService.
 */
export async function getSessionPackageV4(
  sessionId: string
): Promise<SessionPackageV4> {
  const pool = await getStoPool();

  const session = await querySession(pool, sessionId);
  if (!session) {
    throw new Error('SESSION_NOT_FOUND');
  }
  if (session.status !== 'ACTIVE') {
    throw new Error('SESSION_NOT_ACTIVE');
  }

  const batchId = session.batch_id;
  const user = session.assigned_user ?? '';
  const keys = await buildKeysWithVersion(cacheStore, sessionId, batchId, user);

  const metadata: SessionMetadata = {
    rack_code: session.rack_code,
    assigned_user: session.assigned_user,
    status: session.status,
    total_expected_count: session.total_expected_count,
    snapshot_checksum: session.snapshot_checksum,
    batch: session.batch_code
      ? { id: session.batch_id, batch: session.batch_code, status: session.batch_status }
      : null,
  };

  const [scopes, jobsRaw] = await Promise.all([
    queryScopes(pool, sessionId),
    queryJobs(pool, batchId, user),
  ]);

  // Scan sums (component cache or DB), same pattern as bundleService.
  let scanSums: ScanSums = {};
  const scanSumsEntry = await cacheStore.get<ScanSums>(keys.scanSums);
  if (scanSumsEntry && !scanSumsEntry.expired && scanSumsEntry.data) {
    scanSums = scanSumsEntry.data;
  } else {
    scanSums = await queryScanSums(pool, batchId, user, sessionId);
    await cacheStore.set(keys.scanSums, scanSums, ENV.STO_TTL.scanSums);
  }

  const month = new Date().toISOString().slice(0, 7).replace('-', '');
  let dataBox: ScanSums = {};
  const dataBoxEntry = await cacheStore.get<ScanSums>(keys.dataBox(month));
  if (dataBoxEntry && !dataBoxEntry.expired && dataBoxEntry.data) {
    dataBox = dataBoxEntry.data;
  } else {
    dataBox = await queryDataBox(pool, month);
    await cacheStore.set(keys.dataBox(month), dataBox, ENV.STO_TTL.dataBox);
  }

  const sortedJobs = sortJobsUnscannedFirst(jobsRaw, scanSums);
  const materialNos = [
    ...new Set(
      sortedJobs
        .map((j) => j.material_number?.trim())
        .filter((m): m is string => Boolean(m))
    ),
  ];

  let wireTagMap: WireTagMap = {};
  const wireTagEntry = await cacheStore.get<WireTagMap>(keys.wireTagFull);
  if (wireTagEntry && !wireTagEntry.expired && wireTagEntry.data) {
    wireTagMap = wireTagEntry.data;
  } else {
    wireTagMap = await queryWireTagFull(pool, materialNos);
    await cacheStore.set(keys.wireTagFull, wireTagMap, ENV.STO_TTL.wireTag);
  }

  const [scans, serialCounts] = await Promise.all([
    queryScansFor(pool, batchId, user, sessionId, materialNos),
    querySerialCounts(pool, materialNos),
  ]);

  const materials: StoMaterialSerialCount[] = materialNos.map((no) => ({
    material_no: no,
    serial_count: serialCounts[no] ?? 0,
  }));

  return {
    session_id: sessionId,
    metadata,
    material_count: materialNos.length,
    scope: scopes.map((s) => ({
      rack_code: s.rack_code,
      material_no: s.material_no,
    })),
    jobs: enrichJobs(sortedJobs, scanSums, dataBox, wireTagMap),
    scans,
    materials,
  };
}

/**
 * Live server scans for one session (STO v4 scan restore).
 *
 * Same rows, same filters, same session guards as the `scans` field of
 * getSessionPackageV4 — but read from stocktaking_scan at request time,
 * never from the pre-generated bundle file. The bundle file is frozen at
 * assign time (before anyone scanned), so a phone that downloads the
 * package later would otherwise see zero counts even though the scans
 * already reached the server. The mobile app fetches this endpoint right
 * after a package download and upserts the rows locally.
 *
 * Deliberately NOT part of the bundle: jobs, wire tags and serial files
 * stay pre-generated and zero-copy served; only this small, infrequent
 * query goes live.
 */
export async function getSessionScansV4(
  sessionId: string
): Promise<StoScanRow[]> {
  const pool = await getStoPool();

  const session = await querySession(pool, sessionId);
  if (!session) {
    throw new Error('SESSION_NOT_FOUND');
  }
  if (session.status !== 'ACTIVE') {
    throw new Error('SESSION_NOT_ACTIVE');
  }

  const batchId = session.batch_id;
  const user = session.assigned_user ?? '';
  const jobs = await queryJobs(pool, batchId, user);
  const materialNos = [
    ...new Set(
      jobs
        .map((j) => j.material_number?.trim())
        .filter((m): m is string => Boolean(m))
    ),
  ];

  return queryScansFor(pool, batchId, user, sessionId, materialNos);
}
