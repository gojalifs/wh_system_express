import { Request, Response } from 'express';
import { getSessionPackageV4 } from '../../services/packageService.js';
import {
  getMaterialSerialsV4,
  SERIALS_DEFAULT_PER_PAGE,
} from '../../services/serialService.js';
import {
  decidePackageServe,
  decideSerialsServe,
  sendArtifact,
  sendNotReady,
} from '../../services/bundleServeService.js';
import { ENV } from '../../core/env.js';
import { createLogger } from '../../infra/logger.js';

const log = createLogger('sto-v4');

function parsePositiveInt(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function sendStoError(res: Response, err: unknown, fallbackMessage: string) {
  const message = err instanceof Error ? err.message : String(err);
  log.error(message);

  if (message === 'SESSION_NOT_FOUND') {
    return res.status(404).json({ success: false, message: 'Session tidak ditemukan.' });
  }
  if (message === 'SESSION_NOT_ACTIVE') {
    return res
      .status(409)
      .json({ success: false, message: 'Session belum aktif. Status saat ini: CREATED.' });
  }
  if (message === 'MATERIAL_NOT_IN_SESSION') {
    return res
      .status(404)
      .json({ success: false, message: 'Material tidak termasuk dalam session ini.' });
  }
  return res.status(500).json({
    success: false,
    message: fallbackMessage,
    error: ENV.NODE_ENV === 'development' ? message : undefined,
  });
}

/**
 * GET /api/v4/sto/sessions/:session_id/package
 * Session package without serials (metadata, scope, all jobs, scans,
 * per-material serial counts). Once the session build is READY the
 * pre-generated file is served; while it builds, 409 BUNDLE_NOT_READY.
 */
export async function getSessionPackage(req: Request, res: Response) {
  try {
    const decision = await decidePackageServe(req.params.session_id);
    if (decision.state === 'file') {
      return sendArtifact(req, res, decision.buffer);
    }
    if (decision.state === 'not_ready') {
      return sendNotReady(res, decision.status);
    }

    const data = await getSessionPackageV4(req.params.session_id);
    return res.status(200).json({
      success: true,
      message: 'Session package ready.',
      data,
    });
  } catch (err) {
    return sendStoError(res, err, 'Gagal mengambil data session.');
  }
}

/**
 * GET /api/v4/sto/sessions/:session_id/materials/:material_no/serials?page=1&per_page=5000
 * Serials of one material, paginated inside the material. Served from
 * the pre-generated per-material files once the build is READY.
 */
export async function getMaterialSerials(req: Request, res: Response) {
  const page = Math.max(1, parsePositiveInt(req.query.page, 1));
  const perPage = parsePositiveInt(req.query.per_page, SERIALS_DEFAULT_PER_PAGE);

  try {
    const decision = await decideSerialsServe(
      req.params.session_id,
      req.params.material_no,
      page
    );
    if (decision.state === 'file') {
      return sendArtifact(req, res, decision.buffer);
    }
    if (decision.state === 'not_ready') {
      return sendNotReady(res, decision.status);
    }

    const data = await getMaterialSerialsV4(
      req.params.session_id,
      req.params.material_no,
      page,
      perPage
    );
    return res.status(200).json({
      success: true,
      message: 'Material serials ready.',
      data,
    });
  } catch (err) {
    return sendStoError(res, err, 'Gagal mengambil serial material.');
  }
}
