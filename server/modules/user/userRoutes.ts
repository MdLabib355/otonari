//   POST  /api/v1/join    anyone   { code, nickname, lang } → { token, user, group }
//   GET   /api/v1/me      user     → { user, group }
//   PATCH /api/v1/me      user     { lang?, elder_mode? } → { user, group }
//   POST  /api/v1/leave   user     leave the group (not while a loan is accepted or active)

import express from 'express';
import { join, leave, showMe, updateMe } from './userController.ts';
import { requireUser } from '../../core/auth.ts';
import { read, write } from '../../core/http.ts';

const router = express.Router();

router.post('/join', write(join));
router.get('/me', read(requireUser, showMe));
router.patch('/me', write(requireUser, updateMe));
router.post('/leave', write(requireUser, leave));

export default router;
