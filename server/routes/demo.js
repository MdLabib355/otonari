// Demo-only routes. server/index.js mounts them ONLY when DEMO_MODE=true.
// "Continue as" hands out tokens, so it works only for the seeded demo neighbors (is_demo), never for
// people who joined with a code.
//   GET  /api/demo/users   the demo neighbors you can "continue as", with their group
//   POST /api/demo/login   { user_id } → { token, user, group }  (same shape as /api/join)
//   POST /api/demo/fast-forward/:loanId   { to: 'dueSoon' | 'overdue' } → moves the dates of an
//                          active loan, so nobody has to wait days to see the reminders

import express from 'express';
import { db, getMe, publicUser } from '../db.js';
import { checkReminders } from '../reminders.js';

const router = express.Router();
const HOUR = 60 * 60 * 1000;
const DUE_IN = { dueSoon: 12 * HOUR, overdue: -1 * HOUR }; // the new due time, from now

router.get('/demo/users', (req, res) => {
  const users = db
    .prepare(
      `SELECT users.*, groups.name AS group_name, groups.code AS group_code
       FROM users JOIN groups ON groups.id = users.group_id
       WHERE users.is_demo = 1 AND users.left_at IS NULL
       ORDER BY users.group_id, users.id`
    )
    .all();
  res.json(
    users.map((user) => ({
      ...publicUser(user),
      group_name: user.group_name,
      group_code: user.group_code,
    }))
  );
});

router.post('/demo/login', (req, res) => {
  const userId = Number(req.body?.user_id);
  if (!Number.isInteger(userId)) {
    return res.status(400).json({ error: 'user_id must be a number' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ? AND left_at IS NULL').get(userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  if (user.is_demo !== 1) {
    return res.status(403).json({ error: 'You can only continue as a demo neighbor' });
  }
  res.json({ token: user.token, ...getMe(user.id) });
});

router.post('/demo/fast-forward/:loanId', (req, res) => {
  const to = req.body?.to;
  if (to !== 'dueSoon' && to !== 'overdue') {
    return res.status(400).json({ error: "to must be 'dueSoon' or 'overdue'" });
  }
  const loan = db.prepare('SELECT id, status, start_at, end_at FROM loans WHERE id = ?').get(req.params.loanId);
  if (!loan) {
    return res.status(404).json({ error: 'Loan not found' });
  }
  if (loan.status !== 'active') {
    return res.status(409).json({ error: 'Only an active loan can be fast-forwarded' });
  }

  // The start moves along with the end, so the loan keeps its length and never starts after it ends.
  // (At least a day: this also repairs a loan whose start was left behind by an older fast-forward.)
  const length = Math.max(Date.parse(loan.end_at) - Date.parse(loan.start_at), 24 * HOUR);
  const end = Date.now() + DUE_IN[to];
  const startAt = new Date(end - length).toISOString();
  const endAt = new Date(end).toISOString();
  db.prepare('UPDATE loans SET start_at = ?, end_at = ? WHERE id = ?').run(startAt, endAt, loan.id);
  // The dates in its messages move too, or the reminder would contradict the request above it.
  db.prepare("UPDATE messages SET params = json_set(params, '$.start', ?, '$.end', ?) WHERE loan_id = ?")
    .run(startAt, endAt, loan.id);
  checkReminders(); // right now, instead of at the next 30-second check
  res.status(204).end();
});

export default router;
