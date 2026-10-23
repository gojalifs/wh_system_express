// app/routes/notify.routes.ts
import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import { postNotify } from '../controllers/notify.controller.js';
const r = Router();
r.post('/notify', auth, postNotify);
export default r;
