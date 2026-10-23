import { getStoPool } from '../infra/db/db.js';
import {
  queryJobs,
  querySerialsForMaterial,
  querySession,
} from '../infra/db/queries.js';
import { buildPagination } from './pagination.js';
import type { MaterialSerialsV4 } from '../domain/sto.js';

export const SERIALS_MAX_PER_PAGE = 5000;
export const SERIALS_DEFAULT_PER_PAGE = 5000;

/**
 * STO v4 serials for ONE material of a session, paginated inside the
 * material. The unit of pagination is the serial itself, so a page has a
 * bounded, predictable payload no matter how the receiving rows are
 * distributed across materials/racks (the v3 job-based pagination could
 * not bound this and OOM-crashed low-RAM handhelds).
 *
 * The material must belong to the session's job list; serials are keyed by
 * material_no only (never by rack), so a second material sharing a rack is
 * fully downloadable.
 */
export async function getMaterialSerialsV4(
  sessionId: string,
  materialNo: string,
  page = 1,
  perPage = SERIALS_DEFAULT_PER_PAGE
): Promise<MaterialSerialsV4> {
  const pool = await getStoPool();

  const session = await querySession(pool, sessionId);
  if (!session) {
    throw new Error('SESSION_NOT_FOUND');
  }
  if (session.status !== 'ACTIVE') {
    throw new Error('SESSION_NOT_ACTIVE');
  }

  const wanted = materialNo.trim();
  const jobs = await queryJobs(pool, session.batch_id, session.assigned_user ?? '');
  const inSession = jobs.some((j) => (j.material_number ?? '').trim() === wanted);
  if (!inSession) {
    throw new Error('MATERIAL_NOT_IN_SESSION');
  }

  const safePerPage = Math.min(
    SERIALS_MAX_PER_PAGE,
    Math.max(1, perPage)
  );
  const safePage = Math.max(1, page);

  const { rows, total } = await querySerialsForMaterial(
    pool,
    wanted,
    safePage,
    safePerPage
  );
  const pagination = buildPagination(total, safePage, safePerPage);

  return {
    session_id: sessionId,
    material_no: wanted,
    snapshot_checksum: session.snapshot_checksum,
    pagination,
    serials: rows,
  };
}
