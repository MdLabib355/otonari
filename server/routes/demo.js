// Demo-only routes. server/index.js mounts them ONLY when DEMO_MODE=true.
//   GET  /api/demo/users                  public       seeded demo neighbors for quick demo login
//   POST /api/demo/login                  public       { user_id } (is_demo only) -> { token, user, group }
//   POST /api/demo/manager-login          public       seeded demo manager quick-login -> { token, manager }
//   POST /api/demo/fast-forward/:loanId   participant  { to: 'dueSoon' | 'overdue' } -> shifts dates & runs reminders

import crypto from 'node:crypto';
import express from 'express';
import { query, withTransaction } from '../db/pool.js';
import { requireUser } from '../middleware/auth.js';
import { getMe, publicUser } from '../services/loans.js';
import { checkReminders } from '../services/reminders.js';

const router = express.Router();
const HOUR_MS = 60 * 60 * 1000;
const DUE_IN = { dueSoon: 12 * HOUR_MS, overdue: -1 * HOUR_MS };

function parsePositiveInt(raw) {
  const num = Number(raw);
  return Number.isInteger(num) && num > 0 ? num : null;
}

router.get('/demo/users', async (req, res) => {
  const result = await query(
    `SELECT users.*, groups.name AS group_name, groups.code AS group_code
     FROM users
     JOIN groups ON groups.id = users.group_id
     WHERE users.is_demo = TRUE AND users.left_at IS NULL AND users.status = 'approved'
     ORDER BY users.group_id, users.id`
  );
  res.json(
    result.rows.map((user) => ({
      ...publicUser(user),
      group_name: user.group_name,
      group_code: user.group_code,
    }))
  );
});

router.post('/demo/login', async (req, res) => {
  const userId = parsePositiveInt(req.body?.user_id);
  if (!userId) {
    return res.status(400).json({ error: 'user_id must be a number' });
  }
  const userRes = await query(
    "SELECT * FROM users WHERE id = $1 AND left_at IS NULL AND status = 'approved'",
    [userId]
  );
  const user = userRes.rows[0];
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  if (!user.is_demo) {
    return res.status(403).json({ error: 'You can only continue as a demo neighbor' });
  }
  res.json({ token: user.token, ...(await getMe(user.id)) });
});

router.post('/demo/manager-login', async (req, res) => {
  const mgrRes = await query('SELECT id, name, email FROM managers WHERE is_demo = TRUE ORDER BY id LIMIT 1');
  const manager = mgrRes.rows[0];
  if (!manager) {
    return res.status(404).json({ error: 'Demo manager not found' });
  }
  const token = crypto.randomUUID();
  await query('INSERT INTO manager_sessions (token, manager_id) VALUES ($1, $2)', [token, manager.id]);
  res.json({ token, manager });
});

router.post('/demo/fast-forward/:loanId', requireUser, async (req, res) => {
  const to = req.body?.to;
  if (to !== 'dueSoon' && to !== 'overdue') {
    return res.status(400).json({ error: "to must be 'dueSoon' or 'overdue'" });
  }
  const loanId = parsePositiveInt(req.params.loanId);
  if (!loanId) {
    return res.status(404).json({ error: 'Loan not found' });
  }

  const outcome = await withTransaction(async (client) => {
    const loanRes = await query(
      'SELECT id, borrower_id, lender_id, status, start_at, end_at FROM loans WHERE id = $1 FOR UPDATE',
      [loanId],
      client
    );
    const loan = loanRes.rows[0];
    if (!loan) return { status: 404, error: 'Loan not found' };
    if (loan.borrower_id !== req.user.id && loan.lender_id !== req.user.id) {
      return { status: 403, error: 'Only a participant in this loan can fast-forward it' };
    }
    if (loan.status !== 'active') {
      return { status: 409, error: 'Only an active loan can be fast-forwarded' };
    }

    const length = Math.max(Date.parse(loan.end_at) - Date.parse(loan.start_at), 24 * HOUR_MS);
    const end = Date.now() + DUE_IN[to];
    const startAt = new Date(end - length).toISOString();
    const endAt = new Date(end).toISOString();

    await query('UPDATE loans SET start_at = $1, end_at = $2 WHERE id = $3', [startAt, endAt, loan.id], client);
    await query(
      `UPDATE messages
       SET params = jsonb_set(jsonb_set(params, '{start}', to_jsonb($1::text)), '{end}', to_jsonb($2::text))
       WHERE loan_id = $3`,
      [startAt, endAt, loan.id],
      client
    );
    return { status: 204 };
  });

  if (outcome.status !== 204) {
    return res.status(outcome.status).json({ error: outcome.error });
  }

  await checkReminders();
  res.status(204).end();
});

export default router;
