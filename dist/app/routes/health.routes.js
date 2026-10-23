// app/routes/health.routes.ts
import { Router } from 'express';
const r = Router();
r.get('/health', (_req, res) => res.json({ ok: true }));
export default r;
