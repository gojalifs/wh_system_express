import { Request, Response } from 'express';
import { getBundle } from '../../services/bundleService.js';
import { ENV } from '../../core/env.js';
import { createLogger } from '../../infra/logger.js';

const log = createLogger('sto-v3');

function parsePositiveInt(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

/**
 * GET /api/v3/sto/sessions/:session_id?page=29&per_page=10
 * Returns paginated offline bundle for stocktaking session
 */
export async function getSessionBundle(req: Request, res: Response) {
  const sessionId = req.params.session_id;
  const page = Math.max(1, parsePositiveInt(req.query.page, 1));
  const perPage = Math.min(
    100,
    Math.max(1, parsePositiveInt(req.query.per_page, 20))
  );

  try {
    const result = await getBundle(sessionId, page, perPage);
    const { _cacheHit, _message, ...data } = result;

    return res.status(200).json({
      success: true,
      message: _message || 'Session package ready.',
      data,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(message);

    if (message === 'SESSION_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        message: 'Session tidak ditemukan.',
      });
    }
    if (message === 'SESSION_NOT_ACTIVE') {
      return res.status(409).json({
        success: false,
        message: 'Session belum aktif. Status saat ini: CREATED.',
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil data session.',
      error: ENV.NODE_ENV === 'development' ? message : undefined,
    });
  }
}
