import { ENV } from '../../core/env.js';
export function auth(req, res, next) {
    const hdr = req.headers['authorization'] ?? '';
    const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : '';
    if (!ENV.AUTH_TOKEN || token === ENV.AUTH_TOKEN)
        return next();
    return res.status(401).json({ ok: false, error: 'unauthorized' });
}
