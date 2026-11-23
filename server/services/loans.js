// Shared domain helpers for messages, open-loan checks, trust scoring, and public user views.

import { afterCommit, query } from '../db/pool.js';
import { dispatchMessageNotification } from './notifications.js';

function toIso(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export async function createMessage(
  loan,
  fromUserId,
  toUserId,
  phraseKey,
  client = null,
  extraParams = {},
  { silent = false } = {}
) {
  const itemRes = await query('SELECT item_key, spot FROM items WHERE id = $1', [loan.item_id], client);
  const item = itemRes.rows[0];
  const otherId = toUserId === loan.borrower_id ? loan.lender_id : loan.borrower_id;
  const otherRes = await query('SELECT nickname FROM users WHERE id = $1', [otherId], client);
  const other = otherRes.rows[0];

  const params = {
    item: item.item_key,
    spot: item.spot,
    start: toIso(loan.start_at),
    end: toIso(loan.end_at),
    name: other.nickname,
    ...extraParams,
  };
  const result = await query(
    `INSERT INTO messages (loan_id, from_user_id, to_user_id, phrase_key, params)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     RETURNING id`,
    [loan.id, fromUserId, toUserId, phraseKey, JSON.stringify(params)],
    client
  );

  if (!silent) {
    afterCommit(client, () =>
      dispatchMessageNotification(toUserId, {
        loanId: loan.id,
        fromUserId,
        phraseKey,
        params,
      })
    );
  }
  return result.rows[0].id;
}

export async function findOpenLoan(itemId, borrowerId, client = null) {
  const result = await query(
    `SELECT id FROM loans
     WHERE item_id = $1 AND borrower_id = $2 AND status IN ('pending', 'accepted')
     LIMIT 1`,
    [itemId, borrowerId],
    client
  );
  return result.rows[0];
}

export async function declinePendingLoans(itemId, exceptLoanId = null, client = null) {
  const pendingRes = await query(
    `SELECT * FROM loans WHERE item_id = $1 AND status = 'pending' FOR UPDATE`,
    [itemId],
    client
  );
  for (const loan of pendingRes.rows) {
    if (loan.id === exceptLoanId) continue;
    await query("UPDATE loans SET status = 'declined' WHERE id = $1", [loan.id], client);
    await createMessage(loan, loan.lender_id, loan.borrower_id, 'decline', client);
  }
}

export async function trustOf(userId, client = null) {
  const result = await query(
    `SELECT GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - users.created_at)) / 86400))::int AS joined_days,
            COUNT(CASE WHEN loans.returned_at <= loans.end_at THEN 1 END)::int AS on_time,
            COUNT(CASE WHEN loans.returned_at > loans.end_at THEN 1 END)::int AS late
     FROM users
     LEFT JOIN loans ON loans.borrower_id = users.id AND loans.status = 'returned'
     WHERE users.id = $1
     GROUP BY users.id`,
    [userId],
    client
  );
  return result.rows[0] ?? { joined_days: 0, on_time: 0, late: 0 };
}

export async function isTrusted(userId, client = null) {
  const trust = await trustOf(userId, client);
  return trust.on_time > 0;
}

export function publicUser(user) {
  return {
    id: user.id,
    group_id: user.group_id,
    nickname: user.nickname,
    lang: user.lang,
    elder_mode: Boolean(user.elder_mode),
    status: user.status ?? 'approved',
  };
}

export async function getMe(userId, client = null) {
  const userRes = await query('SELECT * FROM users WHERE id = $1', [userId], client);
  const user = userRes.rows[0];
  const groupRes = await query(
    'SELECT id, code, name, type, city, require_approval FROM groups WHERE id = $1',
    [user.group_id],
    client
  );
  const row = groupRes.rows[0];
  const group = {
    id: row.id,
    name: row.name,
    type: row.type,
    city: row.city,
    require_approval: Boolean(row.require_approval),
    ...(user.status === 'approved' ? { code: row.code } : {}),
  };
  return { user: publicUser(user), group };
}
