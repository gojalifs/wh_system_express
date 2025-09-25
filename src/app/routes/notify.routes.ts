// app/routes/notify.routes.ts
import { Router } from 'express';
import { auth } from '../middleware/auth';
import { postNotify } from '../controllers/notify.controller';

const r = Router();
r.post('/notify', auth, postNotify);
export default r;
