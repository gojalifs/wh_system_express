import { cacheStore } from '../cache/store.js';
import {
  buildKeysWithVersion,
  type BundleCacheKeys,
} from '../cache/keys.js';
import { getStoPool } from '../infra/db/db.js';
import {
  queryScanSums,
  queryDataBox,
  queryJobs,
  queryMaterialsFor,
  queryScansFor,
  queryWireTagFull,
  queryScopes,
  querySession,
} from '../infra/db/queries.js';
import { ENV } from '../core/env.js';
import type {
  BundleResult,
  EnrichedJob,
  JobEnrichment,
  JobForEnrichment,
  SessionMetadata,
  StoBundle,
  StoJobRow,
  StoMaterialRow,
  StoScanRow,
} from '../domain/sto.js';
import { createLogger } from '../infra/logger.js';

const log = createLogger('bundle-v3');

type ScanSums = Record<string, number>;
type WireTagMap = Record<string, string>;

interface BundleKeyContext extends BundleCacheKeys {
  batchId: number;
  user: string;
}

/**
 * Sort jobs: unscanned first, then by material_number
 */
export function sortJobsUnscannedFirst<
  T extends { material_number?: string | null },
>(jobs: readonly T[], scanSums: ScanSums | null | undefined): T[] {
  const sums = new Set(Object.keys(scanSums ?? {}));
  return [...jobs].sort((a, b) => {
    const aKey = (a.material_number ?? '').trim();
    const bKey = (b.material_number ?? '').trim();
    const aScanned = sums.has(aKey);
    const bScanned = sums.has(bKey);

    if (aScanned !== bScanned) {
      return aScanned ? 1 : -1; // unscanned (false) first
    }
    return aKey.localeCompare(bKey);
  });
}

/**
 * Enrich jobs with scan data
 */
export function enrichJobs<T extends JobForEnrichment>(
  jobs: T[],
  scanSums: ScanSums,
  dataBox: ScanSums,
  wireTagMap: WireTagMap
): Array<T & JobEnrichment> {
  return jobs.map((job) => {
    const key = (job.material_number ?? '').trim();
    const scannedQty = scanSums[key] || 0;
    const boxQty = dataBox[key] || 0;
    const inventoryQty =
      Number.parseFloat(String(job.inventory_qty ?? 0)) || 0;

    let scannedPercent: number | null = null;
    if (inventoryQty > 0) {
      scannedPercent =
        Math.round(((scannedQty + boxQty) / inventoryQty) * 100 * 100) / 100;
    } else if (inventoryQty === 0 && scanSums[key] !== undefined) {
      scannedPercent = 100;
    }

    return {
      ...job,
      scanned_qty: scannedQty,
      scanned_percent: scannedPercent,
      data_box: boxQty,
      wire_tag: wireTagMap[key] || null,
    };
  });
}

/**
 * Get session metadata + batch info
 */
async function getSessionMetadata(
  pool: Awaited<ReturnType<typeof getStoPool>>,
  sessionId: string
): Promise<SessionMetadata | null> {
  const session = await querySession(pool, sessionId);
  if (!session) return null;

  return {
    rack_code: session.rack_code,
    assigned_user: session.assigned_user,
    status: session.status,
    total_expected_count: session.total_expected_count,
    snapshot_checksum: session.snapshot_checksum,
    batch: session.batch_code
      ? {
          id: session.batch_id,
          batch: session.batch_code,
          status: session.batch_status,
        }
      : null,
  };
}

/**
 * Build full bundle response (matches Laravel shape exactly)
 */
async function buildBundleResponse(
  sessionId: string,
  page: number,
  perPage: number,
  pool: Awaited<ReturnType<typeof getStoPool>>,
  keys: BundleKeyContext
): Promise<StoBundle | null> {
  const [sessionMeta, scopes, jobsRaw] = await Promise.all([
    getSessionMetadata(pool, sessionId),
    queryScopes(pool, sessionId),
    queryJobs(pool, keys.batchId, keys.user),
  ]);

  if (!sessionMeta) return null;

  // Get scan sums (from cache or DB)
  let scanSums: ScanSums = {};
  const scanSumsEntry = await cacheStore.get<ScanSums>(keys.scanSums);
  if (scanSumsEntry && !scanSumsEntry.expired && scanSumsEntry.data) {
    scanSums = scanSumsEntry.data;
  } else {
    scanSums = await queryScanSums(
      pool,
      keys.batchId,
      keys.user,
      sessionId
    );
    await cacheStore.set(keys.scanSums, scanSums, ENV.STO_TTL.scanSums);
  }

  // Get dataBox (from cache or DB)
  const month = new Date().toISOString().slice(0, 7).replace('-', '');
  let dataBox: ScanSums = {};
  const dataBoxKey = keys.dataBox(month);
  const dataBoxEntry = await cacheStore.get<ScanSums>(dataBoxKey);
  if (dataBoxEntry && !dataBoxEntry.expired && dataBoxEntry.data) {
    dataBox = dataBoxEntry.data;
  } else {
    dataBox = await queryDataBox(pool, month);
    await cacheStore.set(dataBoxKey, dataBox, ENV.STO_TTL.dataBox);
  }

  // Sort jobs
  const sortedJobs = sortJobsUnscannedFirst(jobsRaw, scanSums);

  // Pagination
  const total = sortedJobs.length;
  const lastPage = perPage > 0 ? Math.ceil(total / perPage) : 0;
  const currentPage = Math.max(1, Math.min(page, lastPage || 1));
  const offset = (currentPage - 1) * perPage;
  const pagedJobs = sortedJobs.slice(offset, offset + perPage);

  if (pagedJobs.length === 0) {
    return {
      session_id: sessionId,
      metadata: sessionMeta,
      pagination: {
        current_page: currentPage,
        per_page: perPage,
        total,
        last_page: lastPage,
        from: 0,
        to: 0,
      },
      scope: scopes.map((s) => ({
        rack_code: s.rack_code,
        material_no: s.material_no,
      })),
      jobs: [],
      materials: [],
      scans: [],
    };
  }

  // Material numbers for this page
  const pageMaterialNos = [
    ...new Set(
      pagedJobs
        .map((j) => j.material_number?.trim())
        .filter((m): m is string => Boolean(m))
    ),
  ];

  // Fetch materials, scans, wire_tag in parallel
  const [materials, scans, wireTagMap] = await Promise.all([
    queryMaterialsFor(pool, pageMaterialNos),
    queryScansFor(
      pool,
      keys.batchId,
      keys.user,
      sessionId,
      pageMaterialNos
    ),
    (async (): Promise<WireTagMap> => {
      // Try cache first
      const wireTagKey = keys.wireTagFull;
      const entry = await cacheStore.get<WireTagMap>(wireTagKey);
      if (entry && !entry.expired && entry.data) {
        return entry.data;
      }
      const wireTag = await queryWireTagFull(pool, pageMaterialNos);
      await cacheStore.set(wireTagKey, wireTag, ENV.STO_TTL.wireTag);
      return wireTag;
    })(),
  ]);

  // Enrich paged jobs
  const enrichedJobs = enrichJobs(pagedJobs, scanSums, dataBox, wireTagMap);

  // Group materials and scans by material_no for response
  const materialsByNo: Record<string, StoMaterialRow> = {};
  for (const m of materials) {
    const key = m.material_no?.trim();
    if (key && !materialsByNo[key]) {
      materialsByNo[key] = m;
    }
  }

  const scansByNo: Record<string, StoScanRow[]> = {};
  for (const s of scans) {
    const key = s.material_no?.trim();
    if (key) {
      if (!scansByNo[key]) scansByNo[key] = [];
      scansByNo[key].push(s);
    }
  }

  // Build response arrays
  const responseMaterials = pageMaterialNos
    .map((key) => materialsByNo[key])
    .filter((m): m is StoMaterialRow => Boolean(m));

  const responseScans = pageMaterialNos.flatMap(
    (key) => scansByNo[key] || []
  );

  // Pagination metadata
  const from = total > 0 && offset < total ? offset + 1 : 0;
  const to = Math.min(offset + perPage, total);

  return {
    session_id: sessionId,
    metadata: sessionMeta,
    pagination: {
      current_page: currentPage,
      per_page: perPage,
      total,
      last_page: lastPage,
      from,
      to,
    },
    scope: scopes.map((s) => ({
      rack_code: s.rack_code,
      material_no: s.material_no,
    })),
    jobs: enrichedJobs,
    materials: responseMaterials,
    scans: responseScans,
  };
}

/**
 * Main entry: get bundle for session/page
 * Tries cache first, falls back to DB build
 */
export async function getBundle(
  sessionId: string,
  page = 1,
  perPage = 20
): Promise<BundleResult> {
  const pool = await getStoPool();

  // Get session to find batch_id and assigned_user
  const session = await querySession(pool, sessionId);
  if (!session) {
    throw new Error('SESSION_NOT_FOUND');
  }
  if (session.status !== 'ACTIVE') {
    throw new Error('SESSION_NOT_ACTIVE');
  }

  const batchId = session.batch_id;
  const user = session.assigned_user ?? '';

  // Build cache keys with current version
  const keys = await buildKeysWithVersion(
    cacheStore,
    sessionId,
    batchId,
    user
  );

  // Try bundle cache first
  const bundleKey = keys.bundle(page, perPage);
  const bundleEntry = await cacheStore.get<StoBundle>(bundleKey);

  if (
    bundleEntry &&
    !bundleEntry.expired &&
    bundleEntry.data?.session_id === sessionId
  ) {
    return {
      ...bundleEntry.data,
      _cacheHit: true,
      _message: 'Session package ready (cached).',
    };
  }

  // Cache miss - build from DB
  log.debug(
    `cache miss session=${sessionId} page=${page} per_page=${perPage}, building from DB`
  );
  const bundle = await buildBundleResponse(
    sessionId,
    page,
    perPage,
    pool,
    {
      ...keys,
      batchId,
      user,
    }
  );

  if (!bundle) {
    throw new Error('SESSION_NOT_FOUND');
  }

  // Store in memory cache (Express's own cache) for subsequent requests
  await cacheStore.set(bundleKey, bundle, ENV.STO_TTL.bundle);

  return {
    ...bundle,
    _cacheHit: false,
    _message: 'Session package ready.',
  };
}
