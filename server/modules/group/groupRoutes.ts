//   GET    /api/v1/groups/:code            anyone        group preview for the join screen and the poster
//   POST   /api/v1/groups                  user          { name, type, city, nickname, lang, create_anyway? } -> { user, group }
//   GET    /api/v1/group/announcement      member        pinned building announcement
//   GET    /api/v1/me/group/members        group admin   the members of my group
//   DELETE /api/v1/me/group/members/:id    group admin   remove a member (not during a loan)
//   POST   /api/v1/me/group/change-code    group admin   a new join code -> { user, group }

import express from 'express';
import { requireGroupAdmin, requireMember, requireUser } from '../../core/auth.ts';
import { read, write } from '../../core/http.ts';
import {
  changeCode,
  previewGroup,
  removeMember,
  showGroupAnnouncement,
  showMembers,
  startGroup,
} from './groupController.ts';

const router = express.Router();

router.get('/groups/:code', read(previewGroup));
router.post('/groups', write(requireUser, startGroup));
router.get('/group/announcement', read(requireMember, showGroupAnnouncement));
router.get('/me/group/members', read(requireGroupAdmin, showMembers));
router.delete('/me/group/members/:id', write(requireGroupAdmin, removeMember));
router.post('/me/group/change-code', write(requireGroupAdmin, changeCode));

export default router;
