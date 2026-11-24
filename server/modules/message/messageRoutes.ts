// The client asks every 5 seconds (simple polling, no push notifications).
//   GET    /api/v1/me/inbox             user   my unread messages, oldest first, with sender + loan + item
//                                              (and for a new request: borrower_trust, how reliable the borrower is)
//   POST   /api/v1/me/inbox/mark-read   user   { ids } → mark those messages (only ones sent to me) as read

import express from 'express';
import { readMessages, showInbox } from './messageController.ts';
import { requireMember } from '../../core/auth.ts';
import { read, write } from '../../core/http.ts';

const router = express.Router();

router.get('/me/inbox', read(requireMember, showInbox));
router.post('/me/inbox/mark-read', write(requireMember, readMessages));

export default router;
