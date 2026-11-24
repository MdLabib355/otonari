// Demo-only routes. server/index.ts mounts them ONLY when DEMO_MODE=true.
//   GET  /api/demo/users   the demo neighbors you can "continue as", with their group
//   POST /api/demo/login   { user_id } → { token, user, group }  (same shape as /api/join)
//   POST /api/demo/fast-forward/:loanId   participant   { to: 'dueSoon' | 'overdue' }

import express from 'express';
import { demoLogin, fastForward, showDemoUsers } from './demoController.ts';
import { requireUser } from '../../core/auth.ts';

const router = express.Router();

router.get('/demo/users', showDemoUsers);
router.post('/demo/login', demoLogin);
router.post('/demo/fast-forward/:loanId', requireUser, fastForward);

export default router;
