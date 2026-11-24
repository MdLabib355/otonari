import express from 'express';
import { readMessages, showInbox } from './messageController.ts';
import { requireMember } from '../../core/auth.ts';
import { read, write } from '../../core/http.ts';

const router = express.Router();

router.get('/me/inbox', read(requireMember, showInbox));
router.post('/me/inbox/mark-read', write(requireMember, readMessages));

export default router;
