// The client asks every 5 seconds (simple polling, no push notifications).
//   GET  /api/v1/inbox        user   my unread messages, oldest first, with sender + loan + item
//                                 (and for a new request: borrower_trust, how reliable the borrower is)
//   POST /api/v1/inbox/read   user   { ids } → mark those messages (only ones sent to me) as read

import express from 'express';
import { readMessages, showInbox } from './messageController.ts';
import { requireUser } from '../../core/auth.ts';

const router = express.Router();

router.get('/inbox', requireUser, showInbox);
router.post('/inbox/read', requireUser, readMessages);

export default router;
