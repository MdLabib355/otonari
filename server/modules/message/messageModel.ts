// The messages table.
// Golden rule: never store translated text. A message is a phrase_key + params (keys and raw values);
// the client renders it in each viewer's own language.

import type { InboxMessage, Message, PhraseParams } from '../../../shared/types.ts';
import { found, query, queryOne } from '../../core/database.ts';
import type { LoanRow } from '../../types.ts';
import { getItem } from '../item/itemModel.ts';
import { getUser } from '../user/userModel.ts';

export type UnreadMessage = Omit<InboxMessage, 'borrower_trust'>; // the trust is added in messageView.ts

// Create one message for a loan. Every message gets the same params object, so any phrase
// can use any placeholder. {name} is always the OTHER person, seen from the recipient's side:
// the borrower sees the lender's nickname, the lender sees the borrower's.
// fromUserId is null for system messages (reminders). Returns the new message id.
export async function createMessage(
  loan: LoanRow,
  fromUserId: number | null,
  toUserId: number,
  phraseKey: string
): Promise<number> {
  const item = await getItem(loan.item_id);
  const otherId = toUserId === loan.borrower_id ? loan.lender_id : loan.borrower_id;
  const other = await getUser(otherId);

  const params: PhraseParams = {
    item: item.item_key,
    spot: item.spot,
    start: loan.start_at,
    end: loan.end_at,
    name: other.nickname,
  };
  const message = await queryOne<{ id: number }>(
    `INSERT INTO messages (loan_id, from_user_id, to_user_id, phrase_key, params)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [loan.id, fromUserId, toUserId, phraseKey, params]
  );
  return found(message).id;
}

// The viewer sees what they sent, what was sent to them, and their own reminders; a reminder meant
// for the other person stays hidden.
export async function listLoanMessages(loanId: number, viewerId: number): Promise<Message[]> {
  return query<Message>(
    `SELECT messages.id, messages.from_user_id, messages.to_user_id, messages.phrase_key,
            messages.params, messages.read_at, messages.created_at,
            sender.lang AS from_lang  -- for "Show original" (NULL for system reminders)
     FROM messages LEFT JOIN users AS sender ON sender.id = messages.from_user_id
     WHERE messages.loan_id = $1 AND (messages.to_user_id = $2 OR messages.from_user_id = $2)
     ORDER BY messages.created_at, messages.id`,
    [loanId, viewerId]
  );
}

// Unread messages to this person, oldest first, with sender + loan + item.
export async function listUnread(userId: number): Promise<UnreadMessage[]> {
  return query<UnreadMessage>(
    `SELECT messages.id, messages.loan_id, messages.from_user_id, messages.phrase_key,
            messages.params, messages.created_at,
            sender.nickname AS from_nickname, sender.lang AS from_lang,  -- NULL for system reminders
            items.item_key
     FROM messages
     JOIN loans ON loans.id = messages.loan_id
     JOIN items ON items.id = loans.item_id
     LEFT JOIN users AS sender ON sender.id = messages.from_user_id
     WHERE messages.to_user_id = $1 AND messages.read_at IS NULL
     ORDER BY messages.created_at, messages.id`,
    [userId]
  );
}

// Returns how many were marked. "AND to_user_id" means nobody can mark someone else's messages.
export async function markRead(ids: number[], userId: number): Promise<number> {
  const marked = await query(
    'UPDATE messages SET read_at = now() WHERE id = ANY($1::int[]) AND to_user_id = $2 AND read_at IS NULL RETURNING id',
    [ids, userId]
  );
  return marked.length;
}

// Demo fast-forward: the dates in a loan's messages move along with the loan.
export async function moveMessageDates(loanId: number, startAt: string, endAt: string) {
  const dates: PhraseParams = { start: startAt, end: endAt };
  await query('UPDATE messages SET params = params || $1::jsonb WHERE loan_id = $2', [dates, loanId]);
}
