import { sendToAudience } from '../ws/wsHub.js';
export function postNotify(req, res) {
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
    const delivered = sendToAudience(audience, payload);
    return res.json({ ok: true, delivered });
}
