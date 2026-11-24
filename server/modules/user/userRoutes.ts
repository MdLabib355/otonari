//   GET    /api/v1/me                     user     → { user, group }; group is null before joining one
//   PATCH  /api/v1/me                     user     { lang?, elder_mode? } → { user, group }
//   POST   /api/v1/groups/:code/members   user     { nickname, lang } → join; { user, group }
//   DELETE /api/v1/me/group               member   leave the group (not while a loan is accepted or active)

import express from 'express';
import { requireMember, requireUser } from '../../core/auth.ts';
import { read, write } from '../../core/http.ts';
import { join, leave, showMe, updateMe } from './userController.ts';

const router = express.Router();

router.get('/me', read(requireUser, showMe));
router.patch('/me', write(requireUser, updateMe));
router.post('/groups/:code/members', write(requireUser, join));
router.delete('/me/group', write(requireMember, leave));

export default router;
