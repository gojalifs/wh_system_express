import { Request, Response } from 'express';
import { getVersionOnly } from '../../cache/keys.js';
import { cacheStore } from '../../cache/store.js';
import { enqueueBuild } from '../../infra/db/buildQueue.js';
import { createLogger } from '../../infra/logger.js';

const log = createLogger('internal');

/**
 * POST /api/v4/sto/internal/prewarm  { session_id }
 * Called by Laravel right after a job assignment commits. Enqueues a
 * bundle build for the session's current cache version; the in-process
 * runner picks it up. Idempotent per (session_id, cache_version).
 */
export async function postPrewarm(req: Request, res: Response) {
  const sessionId = String(req.body?.session_id || '').trim();
  if (!sessionId) {
    return res
      .status(422)
      .json({ success: false, message: 'session_id wajib diisi.' });
  }

  try {
    const version = await getVersionOnly(cacheStore, sessionId);
    const build = await enqueueBuild(sessionId, version);
    log.info(
      `prewarm enqueued session=${sessionId} v${version} build=${build.id} status=${build.status}`
    );
    return res.status(202).json({
      success: true,
      message: 'Build bundle masuk antrean.',
      data: {
        build_id: build.id,
        session_id: build.session_id,
        cache_version: build.cache_version,
        status: build.status,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(`prewarm failed session=${sessionId}: ${message}`);
    return res.status(500).json({
      success: false,
      message: 'Gagal memasukkan build ke antrean.',
    });
  }
}
