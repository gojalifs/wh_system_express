import { Request, Response } from 'express';
import { Audience, MRInvalidate, MRDelta } from '../../domain/types.js';
import { sendToAudience } from '../ws/wsHub.js';

export function postMRInvalidate(req: Request, res: Response) {
  const { audience, version } = req.body ?? {};
  if (!audience || typeof version !== 'number') {
    return res
      .status(400)
      .json({ ok: false, error: 'audience & version wajib' });
  }
  const payload: MRInvalidate = {
    type: 'material_requests.list.invalidate',
    version,
    ts: Date.now(),
  };
  const delivered = sendToAudience(audience as Audience, payload);
  return res.json({ ok: true, delivered });
}

export function postMRDelta(req: Request, res: Response) {
  const { audience, version, changed } = req.body ?? {};
  if (!audience || typeof version !== 'number' || typeof changed !== 'object') {
    return res
      .status(400)
      .json({ ok: false, error: 'audience, version, changed wajib' });
  }
  const payload: MRDelta = {
    type: 'material_requests.list.delta',
    version,
    changed: {
      added: Array.isArray(changed?.added) ? changed.added : undefined,
      updated: Array.isArray(changed?.updated) ? changed.updated : undefined,
      removed: Array.isArray(changed?.removed) ? changed.removed : undefined,
    },
    ts: Date.now(),
  };
  const delivered = sendToAudience(audience as Audience, payload);
  return res.json({ ok: true, delivered });
}
