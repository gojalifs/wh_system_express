import { Request, Response, NextFunction } from 'express';
import { ENV } from '../../core/env';

export function auth(req: Request, res: Response, next: NextFunction) {
  const hdr = req.headers['authorization'] ?? '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : '';
  if (!ENV.AUTH_TOKEN || token === ENV.AUTH_TOKEN) return next();
  return res.status(401).json({ ok: false, error: 'unauthorized' });
}
