//   GET    /api/v1/groups/:code            anyone        group preview for the join screen and the poster
//   POST   /api/v1/groups                  user          { name, type, city, nickname, lang, create_anyway? } →
//                                                        { user, group }: the creator is its admin
//   GET    /api/v1/me/group/members        group admin   the members of my group
//   DELETE /api/v1/me/group/members/:id    group admin   remove a member (not during a loan)
//   POST   /api/v1/me/group/change-code    group admin   a new join code → { user, group }

import express from 'express';
import { requireGroupAdmin, requireUser } from '../../core/auth.ts';
import { read, write } from '../../core/http.ts';
import { changeCode, previewGroup, removeMember, showMembers, startGroup } from './groupController.ts';

const router = express.Router();

router.get('/groups/:code', read(previewGroup));
router.post('/groups', write(requireUser, startGroup));
router.get('/me/group/members', read(requireGroupAdmin, showMembers));
router.delete('/me/group/members/:id', write(requireGroupAdmin, removeMember));
router.post('/me/group/change-code', write(requireGroupAdmin, changeCode));

export default router;
