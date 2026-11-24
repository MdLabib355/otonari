//   GET    /api/v1/groups/:code   anyone   group preview for the join screen and the poster
//   POST   /api/v1/groups         anyone   { name, type, city, create_anyway? } → the new group with
//                                          its join code (the creator does NOT become a member)

import express from 'express';
import { read, write } from '../../core/http.ts';
import { previewGroup, startGroup } from './groupController.ts';

const router = express.Router();

router.get('/groups/:code', read(previewGroup));
router.post('/groups', write(startGroup));

export default router;
