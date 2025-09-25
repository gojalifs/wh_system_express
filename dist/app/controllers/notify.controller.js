"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.postNotify = postNotify;
const wsHub_1 = require("../ws/wsHub");
function postNotify(req, res) {
    const { audience, title, body, data } = req.body ?? {};
    if (!audience || !title)
        return res.status(400).json({ ok: false, error: 'audience & title wajib' });
    const payload = {
        type: 'notification',
        title,
        body: body ?? '',
        data: data ?? {},
        ts: Date.now(),
    };
    const delivered = (0, wsHub_1.sendToAudience)(audience, payload);
    return res.json({ ok: true, delivered });
}
