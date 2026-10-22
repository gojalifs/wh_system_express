import type { NextFunction, Request, Response } from 'express';
import { ENV } from '../../core/env.js';

/**
 * Shared-secret guard for internal endpoints (server-to-server only).
 * When STO_INTERNAL_SECRET is not configured the endpoints stay disabled.
 */
export function internalAuth(req: Request, res: Response, next: NextFunction): void {
  if (!ENV.STO_INTERNAL_SECRET) {
    res.status(503).json({
      success: false,
      message: 'Internal endpoint tidak aktif (STO_INTERNAL_SECRET belum diatur).',
    });
    return;
  }
  if (req.header('x-internal-secret') !== ENV.STO_INTERNAL_SECRET) {
    res.status(401).json({ success: false, message: 'Unauthorized.' });
    return;
  }
  next();
}
