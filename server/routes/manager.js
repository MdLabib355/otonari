// Building Manager authentication, group creation/rotation, approval toggle, member moderation,
// lost-phone restore codes, and reported issues visibility.

import crypto from 'node:crypto';
import express from 'express';
import { GROUP_TYPES, ISSUE_KEYS } from '../config/constants.js';
import { query, withTransaction } from '../db/pool.js';
import { requireManager } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { disconnectUser } from '../services/events.js';
import { createMessage, declinePendingLoans } from '../services/loans.js';
import { dispatchStatusNotification } from '../services/notifications.js';
import { hashPassword, verifyPassword } from '../services/passwords.js';
import { createTransferCode } from '../services/transfer.js';

const router = express.Router();

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const registerLimiter = createRateLimiter({ windowMs: 60 * 60_000, max: 10 });
const loginLimiter = createRateLimiter({ windowMs: 15 * 60_000, max: 15 });
const createGroupLimiter = createRateLimiter({
  windowMs: 60 * 60_000,
  max: 10,
  keyFn: (req) => `mgr-group:${req.manager?.id ?? req.ip}`,
});

function parsePositiveInt(raw) {
  const num = Number(raw);
  return Number.isInteger(num) && num > 0 ? num : null;
}

function trimmed(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function simplified(text) {
  return text.normalize('NFKC').toLowerCase().replace(/\s/g, '');
}

async function newJoinCode(excludeCode = null, client = null) {
  let code;
  do {
    let chars = '';
    while (chars.length < 8) chars += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
    code = `${chars.slice(0, 4)}-${chars.slice(4)}`;
    if (code === excludeCode) continue;
    const exists = await query('SELECT id FROM groups WHERE code = $1', [code], client);
    if (exists.rows.length === 0) return code;
  } while (true);
}

async function createManagerSession(managerId, client = null) {
  const token = crypto.randomUUID();
  await query('INSERT INTO manager_sessions (token, manager_id) VALUES ($1, $2)', [token, managerId], client);
  return token;
}

function publicManager(row) {
  return { id: row.id, name: row.name, email: row.email };
}

async function requireOwnedGroup(req, res, next) {
  const groupId = parsePositiveInt(req.params.id);
  if (!groupId) {
    return res.status(404).json({ error: 'Group not found' });
  }
  const groupRes = await query('SELECT * FROM groups WHERE id = $1', [groupId]);
  const group = groupRes.rows[0];
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }
  if (group.manager_id !== req.manager.id) {
    return res.status(403).json({ error: 'Not your neighborhood group' });
  }
  req.group = group;
  next();
}

router.post('/manager/register', registerLimiter, async (req, res) => {
  const name = trimmed(req.body?.name);
  const email = trimmed(req.body?.email).toLowerCase();
  const password = req.body?.password;

  if (name.length < 1 || name.length > 60) {
    return res.status(400).json({ error: 'Name must be 1 to 60 characters' });
  }
  if (!EMAIL_RE.test(email) || email.length > 120) {
    return res.status(400).json({ error: 'Valid email is required' });
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: 'Password must be 8 to 128 characters' });
  }

  const passwordHash = await hashPassword(password);
  try {
    const result = await withTransaction(async (client) => {
      const insertRes = await query(
        `INSERT INTO managers (name, email, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id, name, email`,
        [name, email, passwordHash],
        client
      );
      const manager = insertRes.rows[0];
      const token = await createManagerSession(manager.id, client);
      return { token, manager: publicManager(manager) };
    });
    res.status(201).json(result);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    throw error;
  }
});

router.post('/manager/login', loginLimiter, async (req, res) => {
  const email = trimmed(req.body?.email).toLowerCase();
  const password = req.body?.password;

  if (!email || typeof password !== 'string' || password.length < 1 || password.length > 128) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const managerRes = await query('SELECT * FROM managers WHERE LOWER(email) = $1', [email]);
  const manager = managerRes.rows[0];
  if (!manager || !(await verifyPassword(password, manager.password_hash))) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = await createManagerSession(manager.id);
  res.json({ token, manager: publicManager(manager) });
});

router.get('/manager/me', requireManager, async (req, res) => {
  const groupsRes = await query(
    `SELECT groups.id, groups.code, groups.name, groups.type, groups.city, groups.require_approval,
            (SELECT COUNT(*)::int FROM users WHERE users.group_id = groups.id AND users.left_at IS NULL AND users.status = 'approved') AS member_count,
            (SELECT COUNT(*)::int FROM users WHERE users.group_id = groups.id AND users.left_at IS NULL AND users.status = 'pending') AS pending_count,
            (SELECT COUNT(*)::int FROM items WHERE items.group_id = groups.id AND items.removed_at IS NULL) AS item_count,
            (SELECT COUNT(*)::int FROM messages
              JOIN loans ON loans.id = messages.loan_id
              JOIN items ON items.id = loans.item_id
              WHERE items.group_id = groups.id AND messages.phrase_key = ANY($2::text[])) AS issue_count
     FROM groups
     WHERE groups.manager_id = $1
     ORDER BY groups.id`,
    [req.manager.id, ISSUE_KEYS]
  );

  res.json({
    manager: publicManager(req.manager),
    groups: groupsRes.rows.map((g) => ({
      ...g,
      require_approval: Boolean(g.require_approval),
    })),
  });
});

router.post('/manager/logout', requireManager, async (req, res) => {
  await query('DELETE FROM manager_sessions WHERE token = $1', [req.managerToken]);
  res.status(204).end();
});

// Create a new neighborhood group (requires authenticated manager).
router.post('/groups', requireManager, createGroupLimiter, async (req, res) => {
  const { type, create_anyway, require_approval = false } = req.body ?? {};
  const name = trimmed(req.body?.name);
  const city = trimmed(req.body?.city);

  if (name.length < 1 || name.length > 60 || city.length < 1 || city.length > 40) {
    return res.status(400).json({ error: 'The name must be 1 to 60 characters, the city 1 to 40' });
  }
  if (!GROUP_TYPES.includes(type)) {
    return res.status(400).json({ error: "type must be 'building' or 'block'" });
  }
  if (typeof require_approval !== 'boolean') {
    return res.status(400).json({ error: 'require_approval must be true or false' });
  }

  const allGroups = await query('SELECT name, city FROM groups');
  const similar = allGroups.rows.find(
    (g) => simplified(g.city) === simplified(city) && simplified(g.name) === simplified(name)
  );
  if (similar && create_anyway !== true) {
    return res.status(409).json({ error: 'There is a similar group in this city', existing_name: similar.name });
  }

  const code = await newJoinCode();
  const insertRes = await query(
    `INSERT INTO groups (code, name, type, city, manager_id, require_approval)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, code, name, type, city, require_approval`,
    [code, name, type, city, req.manager.id, require_approval]
  );
  const created = insertRes.rows[0];
  res.status(201).json({ ...created, require_approval: Boolean(created.require_approval) });
});

router.patch('/manager/groups/:id', requireManager, requireOwnedGroup, async (req, res) => {
  const { require_approval } = req.body ?? {};
  if (typeof require_approval !== 'boolean') {
    return res.status(400).json({ error: 'require_approval must be true or false' });
  }
  await query('UPDATE groups SET require_approval = $1 WHERE id = $2', [require_approval, req.group.id]);
  res.json({
    id: req.group.id,
    code: req.group.code,
    name: req.group.name,
    type: req.group.type,
    city: req.group.city,
    require_approval,
  });
});

router.post('/manager/groups/:id/rotate-code', requireManager, requireOwnedGroup, async (req, res) => {
  const nextCode = await withTransaction(async (client) => {
    const code = await newJoinCode(req.group.code, client);
    await query('UPDATE groups SET code = $1 WHERE id = $2', [code, req.group.id], client);
    return code;
  });
  res.json({
    id: req.group.id,
    code: nextCode,
    name: req.group.name,
    type: req.group.type,
    city: req.group.city,
    require_approval: Boolean(req.group.require_approval),
  });
});

router.get('/manager/groups/:id/members', requireManager, requireOwnedGroup, async (req, res) => {
  const result = await query(
    `SELECT users.id, users.nickname, users.lang, users.elder_mode, users.status,
            users.manager_note, users.created_at,
            COUNT(CASE WHEN loans.status = 'returned' AND loans.returned_at <= loans.end_at THEN 1 END)::int AS on_time,
            COUNT(CASE WHEN loans.status = 'returned' AND loans.returned_at > loans.end_at THEN 1 END)::int AS late,
            (SELECT COUNT(*)::int FROM loans l2
              WHERE (l2.borrower_id = users.id OR l2.lender_id = users.id)
                AND (l2.status = 'active' OR (l2.status = 'accepted' AND l2.handover_photo IS NOT NULL))) AS active_loans
     FROM users
     LEFT JOIN loans ON loans.borrower_id = users.id
     WHERE users.group_id = $1 AND users.left_at IS NULL AND users.status IN ('pending', 'approved')
     GROUP BY users.id
     ORDER BY users.created_at DESC, users.id DESC`,
    [req.group.id]
  );

  const mapMember = (row) => ({
    id: row.id,
    nickname: row.nickname,
    lang: row.lang,
    elder_mode: Boolean(row.elder_mode),
    status: row.status,
    manager_note: row.manager_note ?? null,
    created_at: row.created_at,
    on_time: row.on_time,
    late: row.late,
    active_loans: row.active_loans,
  });

  res.json({
    pending: result.rows.filter((r) => r.status === 'pending').map(mapMember),
    active: result.rows.filter((r) => r.status === 'approved').map(mapMember),
  });
});

router.post('/manager/groups/:id/members/:userId/approve', requireManager, requireOwnedGroup, async (req, res) => {
  const userId = parsePositiveInt(req.params.userId);
  if (!userId) return res.status(404).json({ error: 'Member not found' });

  const updateRes = await query(
    `UPDATE users SET status = 'approved'
     WHERE id = $1 AND group_id = $2 AND left_at IS NULL AND status = 'pending'
     RETURNING id`,
    [userId, req.group.id]
  );
  if (updateRes.rows.length === 0) {
    return res.status(404).json({ error: 'Pending member not found' });
  }
  dispatchStatusNotification(userId, 'approved');
  res.status(204).end();
});

router.post('/manager/groups/:id/members/:userId/reject', requireManager, requireOwnedGroup, async (req, res) => {
  const userId = parsePositiveInt(req.params.userId);
  if (!userId) return res.status(404).json({ error: 'Member not found' });

  const updateRes = await query(
    `UPDATE users SET status = 'rejected'
     WHERE id = $1 AND group_id = $2 AND left_at IS NULL AND status = 'pending'
     RETURNING id`,
    [userId, req.group.id]
  );
  if (updateRes.rows.length === 0) {
    return res.status(404).json({ error: 'Pending member not found' });
  }
  dispatchStatusNotification(userId, 'rejected');
  res.status(204).end();
});

router.post('/manager/groups/:id/members/:userId/remove', requireManager, requireOwnedGroup, async (req, res) => {
  const userId = parsePositiveInt(req.params.userId);
  if (!userId) return res.status(404).json({ error: 'Member not found' });

  const outcome = await withTransaction(async (client) => {
    const userRes = await query(
      "SELECT id FROM users WHERE id = $1 AND group_id = $2 AND left_at IS NULL AND status <> 'rejected' FOR UPDATE",
      [userId, req.group.id],
      client
    );
    if (userRes.rows.length === 0) return { status: 404, error: 'Member not found' };

    // Block removal while a physical item is currently lent out or mid-handover.
    const blockingLoan = await query(
      `SELECT id FROM loans
       WHERE (borrower_id = $1 OR lender_id = $1)
         AND (status = 'active' OR (status = 'accepted' AND handover_photo IS NOT NULL))
       LIMIT 1`,
      [userId],
      client
    );
    if (blockingLoan.rows.length > 0) {
      return { status: 409, error: 'Cannot remove a member while an item is currently lent out' };
    }

    // Cancel any accepted loans before handover (in either role) and free their items.
    const acceptedLoans = await query(
      `SELECT * FROM loans
       WHERE (borrower_id = $1 OR lender_id = $1) AND status = 'accepted' AND handover_photo IS NULL
       FOR UPDATE`,
      [userId],
      client
    );
    for (const loan of acceptedLoans.rows) {
      await query("UPDATE loans SET status = 'cancelled' WHERE id = $1", [loan.id], client);
      await query("UPDATE items SET status = 'available' WHERE id = $1", [loan.item_id], client);
      const otherId = loan.borrower_id === userId ? loan.lender_id : loan.borrower_id;
      await createMessage(loan, userId, otherId, 'cancel', client);
    }

    // Soft-delete all remaining available items owned by the removed member & decline waiting requests.
    const itemsRes = await query(
      "SELECT id FROM items WHERE owner_id = $1 AND status = 'available' AND removed_at IS NULL FOR UPDATE",
      [userId],
      client
    );
    for (const item of itemsRes.rows) {
      await query('UPDATE items SET removed_at = NOW() WHERE id = $1', [item.id], client);
      await declinePendingLoans(item.id, null, client);
    }

    // Cancel pending borrow requests submitted by this member.
    const pendingReqs = await query(
      "SELECT * FROM loans WHERE borrower_id = $1 AND status = 'pending' FOR UPDATE",
      [userId],
      client
    );
    for (const loan of pendingReqs.rows) {
      await query("UPDATE loans SET status = 'cancelled' WHERE id = $1", [loan.id], client);
      await createMessage(loan, userId, loan.lender_id, 'cancel', client);
    }

    await query('UPDATE users SET left_at = NOW() WHERE id = $1', [userId], client);
    return { status: 204 };
  });

  if (outcome.status !== 204) {
    return res.status(outcome.status).json({ error: outcome.error });
  }
  disconnectUser(userId);
  res.status(204).end();
});

router.post('/manager/groups/:id/members/:userId/transfer-code', requireManager, requireOwnedGroup, async (req, res) => {
  const userId = parsePositiveInt(req.params.userId);
  if (!userId) return res.status(404).json({ error: 'Member not found' });

  const userRes = await query(
    "SELECT id FROM users WHERE id = $1 AND group_id = $2 AND left_at IS NULL AND status = 'approved'",
    [userId, req.group.id]
  );
  if (userRes.rows.length === 0) {
    return res.status(404).json({ error: 'Active member not found' });
  }

  // Manager lost-phone restore rotates the resident's token so a lost device is logged out immediately.
  const codeInfo = await createTransferCode(userId, { rotateToken: true });
  res.status(201).json(codeInfo);
});

router.get('/manager/groups/:id/issues', requireManager, requireOwnedGroup, async (req, res) => {
  const result = await query(
    `SELECT messages.id, messages.loan_id, messages.phrase_key, messages.params, messages.created_at,
            items.item_key, items.spot,
            reporter.nickname AS reporter_nickname,
            other_user.nickname AS other_nickname
     FROM messages
     JOIN loans ON loans.id = messages.loan_id
     JOIN items ON items.id = loans.item_id
     LEFT JOIN users AS reporter ON reporter.id = messages.from_user_id
     LEFT JOIN users AS other_user ON other_user.id = messages.to_user_id
     WHERE items.group_id = $1 AND messages.phrase_key = ANY($2::text[])
     ORDER BY messages.created_at DESC, messages.id DESC`,
    [req.group.id, ISSUE_KEYS]
  );

  res.json(
    result.rows.map((row) => {
      const params = typeof row.params === 'string' ? JSON.parse(row.params) : row.params;
      return {
        id: row.id,
        loan_id: row.loan_id,
        item_key: row.item_key,
        spot: row.spot,
        phrase_key: row.phrase_key,
        issue_photo: params?.photo ?? null,
        reporter_nickname: row.reporter_nickname,
        other_nickname: row.other_nickname,
        created_at: row.created_at,
      };
    })
  );
});

export default router;
