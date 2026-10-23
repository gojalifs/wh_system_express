import { Router } from 'express';
import { getSessionBundle } from '../controllers/sto.controller.js';
const r = Router();
r.get('/sessions/:session_id', getSessionBundle);
export default r;
