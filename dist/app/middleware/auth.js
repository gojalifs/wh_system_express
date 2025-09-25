"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auth = auth;
const env_1 = require("../../core/env");
function auth(req, res, next) {
    const hdr = req.headers['authorization'] ?? '';
    const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : '';
    if (!env_1.ENV.AUTH_TOKEN || token === env_1.ENV.AUTH_TOKEN)
        return next();
    return res.status(401).json({ ok: false, error: 'unauthorized' });
}
