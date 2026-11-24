// The messages table.
// Golden rule: never store translated text. A message is a phrase_key + params (keys and raw values);
// the client renders it in each viewer's own language.

import type { InboxMessage, Message, PhraseParams } from '../../../shared/types.ts';
import { db } from '../../core/database.ts';
import type { LoanRow } from '../../types.ts';
import { getItem } from '../item/itemModel.ts';
import { getUser } from '../user/userModel.ts';

// As stored, the params are still JSON text (see messageView.ts).
export type StoredMessage = Omit<Message, 'params'> & { params: string };
export type StoredInboxMessage = Omit<InboxMessage, 'params' | 'borrower_trust'> & { params: string };

// Create one message for a loan. Every message gets the same params object, so any phrase
// can use any placeholder. {name} is always the OTHER person, seen from the recipient's side:
// the borrower sees the lender's nickname, the lender sees the borrower's.
// fromUserId is null for system messages (reminders). Returns the new message id.
export function createMessage(
  loan: LoanRow,
  fromUserId: number | null,
  toUserId: number,
  phraseKey: string
): number {
  const item = getItem(loan.item_id);
  const otherId = toUserId === loan.borrower_id ? loan.lender_id : loan.borrower_id;

  const params: PhraseParams = {
    item: item.item_key,
    spot: item.spot,
    start: loan.start_at,
    end: loan.end_at,
    name: getUser(otherId).nickname,
  };
  const result = db
    .prepare(
      'INSERT INTO messages (loan_id, from_user_id, to_user_id, phrase_key, params) VALUES (?, ?, ?, ?, ?)'
    )
    .run(loan.id, fromUserId, toUserId, phraseKey, JSON.stringify(params));
  return Number(result.lastInsertRowid);
}

// The viewer sees what they sent, what was sent to them, and their own reminders; a reminder meant
// for the other person stays hidden.
export function listLoanMessages(loanId: number, viewerId: number): StoredMessage[] {
  return db
    .prepare<unknown[], StoredMessage>(
      `SELECT messages.id, messages.from_user_id, messages.to_user_id, messages.phrase_key,
              messages.params, messages.read_at, messages.created_at,
              sender.lang AS from_lang  -- for "Show original" (NULL for system reminders)
       FROM messages LEFT JOIN users AS sender ON sender.id = messages.from_user_id
       WHERE messages.loan_id = ? AND (messages.to_user_id = ? OR messages.from_user_id = ?)
       ORDER BY messages.created_at, messages.id`
    )
    .all(loanId, viewerId, viewerId);
}

// Unread messages to this person, oldest first, with sender + loan + item.
export function listUnread(userId: number): StoredInboxMessage[] {
  return db
    .prepare<unknown[], StoredInboxMessage>(
      `SELECT messages.id, messages.loan_id, messages.from_user_id, messages.phrase_key,
              messages.params, messages.created_at,
              sender.nickname AS from_nickname, sender.lang AS from_lang,  -- NULL for system reminders
              items.item_key
       FROM messages
       JOIN loans ON loans.id = messages.loan_id
       JOIN items ON items.id = loans.item_id
       LEFT JOIN users AS sender ON sender.id = messages.from_user_id
       WHERE messages.to_user_id = ? AND messages.read_at IS NULL
       ORDER BY messages.created_at, messages.id`
    )
    .all(userId);
}

// Returns how many were marked. "AND to_user_id = ?" means nobody can mark someone else's messages.
export const markRead = db.transaction((ids: number[], userId: number): number => {
  const statement = db.prepare(
    "UPDATE messages SET read_at = datetime('now') WHERE id = ? AND to_user_id = ? AND read_at IS NULL"
  );
  let updated = 0;
  for (const id of ids) updated += statement.run(id, userId).changes;
  return updated;
});

// Demo fast-forward: the dates in a loan's messages move along with the loan.
export function moveMessageDates(loanId: number, startAt: string, endAt: string) {
  db.prepare("UPDATE messages SET params = json_set(params, '$.start', ?, '$.end', ?) WHERE loan_id = ?").run(
    startAt,
    endAt,
    loanId
  );
}
