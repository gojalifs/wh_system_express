import { Router } from 'express';
import { getMaterialRequests } from '../controllers/material-requests.query.controller';

const r = Router();
r.get('/material-requests', getMaterialRequests);
export default r;
