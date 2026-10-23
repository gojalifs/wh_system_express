import { Router } from 'express';
import { postPrewarm } from '../controllers/internal.controller.js';
import { internalAuth } from '../middleware/internalAuth.js';

const router = Router();

router.post('/internal/prewarm', internalAuth, postPrewarm);

export default router;
