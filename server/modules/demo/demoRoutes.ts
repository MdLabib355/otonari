// Demo-only routes. server/index.ts mounts them ONLY when DEMO_MODE=true.
//   GET  /api/v1/demo/users   the demo neighbors you can "continue as", with their group
//   POST /api/v1/demo/login   { user_id } → { token, user, group }  (same shape as /api/v1/join)
//   POST /api/v1/demo/fast-forward/:loanId   participant   { to: 'dueSoon' | 'overdue' }

import express from 'express';
import { demoLogin, fastForward, showDemoUsers } from './demoController.ts';
import { requireUser } from '../../core/auth.ts';
import { read, write } from '../../core/http.ts';

const router = express.Router();

router.get('/demo/users', read(showDemoUsers));
router.post('/demo/login', read(demoLogin));
router.post('/demo/fast-forward/:loanId', write(requireUser, fastForward));

export default router;
