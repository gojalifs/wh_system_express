import { Router } from 'express';
import {
  getMaterialSerials,
  getSessionPackage,
  getSessionScans,
} from '../controllers/sto-v4.controller.js';

const r = Router();
r.get('/sessions/:session_id/package', getSessionPackage);
r.get('/sessions/:session_id/scans', getSessionScans);
r.get('/sessions/:session_id/materials/:material_no/serials', getMaterialSerials);
export default r;
