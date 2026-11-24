// The notification inbox: messages to me that I haven't read yet.

import type { Request } from 'express';
import { refuse, reply, toId } from '../../core/http.ts';
import { listUnread, markRead } from './messageModel.ts';
import { inboxMessageView } from './messageView.ts';

export async function showInbox(req: Request) {
  const messages = await listUnread(req.user.id);
  return reply(200, await Promise.all(messages.map(inboxMessageView)));
}

export async function readMessages(req: Request) {
  const ids: unknown = req.body?.ids;
  if (!Array.isArray(ids) || !ids.every(Number.isInteger)) {
    return refuse(400, 'ids must be a list of message ids');
  }
  return reply(200, { updated: await markRead(ids.map(toId), req.user.id) });
}
