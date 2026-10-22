import express from 'express';
import { getBundle } from '../services/bundleService.js';
import { config } from '../config.js';

const router = express.Router();

/**
 * GET /api/v3/sto/sessions/:session_id?page=29&per_page=10
 * Returns paginated offline bundle for stocktaking session
 */
router.get('/sessions/:session_id', async (req, res) => {
  const { session_id } = req.params;
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const perPage = Math.min(100, Math.max(1, parseInt(req.query.per_page || '20', 10)));

  try {
    const result = await getBundle(session_id, page, perPage);

    const statusCode = 200;
    const response = {
      success: true,
      message: result._message || 'Session package ready.',
      data: result,
    };

    // Remove internal fields
    delete response.data._cacheHit;
    delete response.data._message;

    res.status(statusCode).json(response);
  } catch (err) {
    console.error('[Route] Error:', err.message);

    if (err.message === 'SESSION_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        message: 'Session tidak ditemukan.',
      });
    }
    if (err.message === 'SESSION_NOT_ACTIVE') {
      return res.status(409).json({
        success: false,
        message: `Session belum aktif. Status saat ini: CREATED.`,
      });
    }

    res.status(500).json({
      success: false,
      message: 'Gagal mengambil data session.',
      error: config.nodeEnv === 'development' ? err.message : undefined,
    });
  }
});

export default router;