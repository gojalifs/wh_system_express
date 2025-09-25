// app/routes/material-requests.routes.ts
import { Router } from 'express';
import { auth } from '../middleware/auth';
import {
  postMRInvalidate,
  postMRDelta,
} from '../controllers/material-requests.controller';

const r = Router();
r.post('/material-requests/invalidate', auth, postMRInvalidate);
r.post('/material-requests/delta', auth, postMRDelta);
export default r;
