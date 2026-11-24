//   POST  /api/v1/join    anyone   { code, nickname, lang } → { token, user, group }
//   GET   /api/v1/me      user     → { user, group }
//   PATCH /api/v1/me      user     { lang?, elder_mode? } → { user, group }
//   POST  /api/v1/leave   user     leave the group (not while a loan is accepted or active)

import express from 'express';
import { join, leave, showMe, updateMe } from './userController.ts';
import { requireUser } from '../../core/auth.ts';

const router = express.Router();

router.post('/join', join);
router.get('/me', requireUser, showMe);
router.patch('/me', requireUser, updateMe);
router.post('/leave', requireUser, leave);

export default router;
