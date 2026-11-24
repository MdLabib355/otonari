//   GET    /api/v1/me                     user     → { user, group }; group is null before joining one
//   PATCH  /api/v1/me                     user     { nickname?, lang?, elder_mode? } → { user, group }
//   POST   /api/v1/me/avatar              user     photo (multipart) → a new profile photo; { user, group }
//   DELETE /api/v1/me/avatar              user     no profile photo anymore; { user, group }
//   POST   /api/v1/groups/:code/members   user     { nickname, lang } → join; { user, group }
//   DELETE /api/v1/me/group               member   leave the group (not while a loan is accepted or active)

import express from 'express';
import { requireMember, requireUser } from '../../core/auth.ts';
import { check, read, write } from '../../core/http.ts';
import { storePhoto } from '../../core/photoFiles.ts';
import { receivePhoto } from '../../core/receivePhoto.ts';
import { changeAvatar, join, leave, removeAvatar, showMe, updateMe } from './userController.ts';

const router = express.Router();

router.get('/me', read(requireUser, showMe));
router.patch('/me', write(requireUser, updateMe));
// Not write(): storing and deleting files can be slow, and these change only one column.
router.post('/me/avatar', check(requireUser), receivePhoto, storePhoto, read(requireUser, changeAvatar));
router.delete('/me/avatar', read(requireUser, removeAvatar));
router.post('/groups/:code/members', write(requireUser, join));
router.delete('/me/group', write(requireMember, leave));

export default router;
