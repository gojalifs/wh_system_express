"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.postMRInvalidate = postMRInvalidate;
exports.postMRDelta = postMRDelta;
const wsHub_1 = require("../ws/wsHub");
function postMRInvalidate(req, res) {
    const { audience, version } = req.body ?? {};
    if (!audience || typeof version !== 'number') {
        return res
            .status(400)
            .json({ ok: false, error: 'audience & version wajib' });
    }
    const payload = {
        type: 'material_requests.list.invalidate',
        version,
        ts: Date.now(),
    };
    const delivered = (0, wsHub_1.sendToAudience)(audience, payload);
    return res.json({ ok: true, delivered });
}
function postMRDelta(req, res) {
    const { audience, version, changed } = req.body ?? {};
    if (!audience || typeof version !== 'number' || typeof changed !== 'object') {
        return res
            .status(400)
            .json({ ok: false, error: 'audience, version, changed wajib' });
    }
    const payload = {
        type: 'material_requests.list.delta',
        version,
        changed: {
            added: Array.isArray(changed?.added) ? changed.added : undefined,
            updated: Array.isArray(changed?.updated) ? changed.updated : undefined,
            removed: Array.isArray(changed?.removed) ? changed.removed : undefined,
        },
        ts: Date.now(),
    };
    const delivered = (0, wsHub_1.sendToAudience)(audience, payload);
    return res.json({ ok: true, delivered });
}
