// The notification inbox: messages to me that I haven't read yet.

import type { Request, Response } from 'express';
import { listUnread, markRead } from './messageModel.ts';
import { inboxMessageView } from './messageView.ts';

export function showInbox(req: Request, res: Response) {
  res.json(listUnread(req.user.id).map(inboxMessageView));
}

export function readMessages(req: Request, res: Response) {
  const ids: unknown = req.body?.ids;
  if (!Array.isArray(ids) || !ids.every(Number.isInteger)) {
    return res.status(400).json({ error: 'ids must be a list of message ids' });
  }
  res.json({ updated: markRead(ids, req.user.id) });
}
