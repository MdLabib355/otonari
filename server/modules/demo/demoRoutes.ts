// Demo-only routes. server/api/v1.ts mounts them ONLY when DEMO_MODE=true.
//   POST   /api/v1/demo/loans/:id/fast-forward   participant   { to: 'dueSoon' | 'overdue' }

import express from 'express';
import { requireMember } from '../../core/auth.ts';
import { write } from '../../core/http.ts';
import { fastForward } from './demoController.ts';

const router = express.Router();

router.post('/demo/loans/:id/fast-forward', write(requireMember, fastForward));

export default router;
