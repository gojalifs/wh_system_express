import { Request, Response } from 'express';
import { Audience, ServerNotification } from '../../domain/types.js';
import { sendToAudience } from '../ws/wsHub.js';

export function postNotify(req: Request, res: Response) {
  const { audience, title, body, data } = req.body ?? {};
  if (!audience || !title)
    return res.status(400).json({ ok: false, error: 'audience & title wajib' });

  const payload: ServerNotification = {
    type: 'notification',
    title,
    body: body ?? '',
    data: data ?? {},
    ts: Date.now(),
  };
  const delivered = sendToAudience(audience as Audience, payload);
  return res.json({ ok: true, delivered });
}
