// An unread message as the client sees it. A new request also says how reliable the borrower is.

import type { InboxMessage } from '../../../shared/types.ts';
import type { StoredInboxMessage } from './messageModel.ts';
import { trustOf } from '../user/userModel.ts';

export function inboxMessageView(message: StoredInboxMessage): InboxMessage {
  return {
    ...message,
    params: JSON.parse(message.params),
    borrower_trust:
      message.phrase_key === 'request' && message.from_user_id !== null ? trustOf(message.from_user_id) : null,
  };
}
