// An unread message as the client sees it. A new request also says how reliable the borrower is.

import type { InboxMessage } from '../../../shared/types.ts';
import { trustOf } from '../user/userModel.ts';
import type { UnreadMessage } from './messageModel.ts';

export async function inboxMessageView(message: UnreadMessage): Promise<InboxMessage> {
  const isRequest = message.phrase_key === 'request' && message.from_user_id !== null;
  return { ...message, borrower_trust: isRequest ? await trustOf(message.from_user_id!) : null };
}
