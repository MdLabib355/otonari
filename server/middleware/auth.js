// Authentication middleware with strict domain separation between residents and managers.

import { query } from '../db/pool.js';

function extractBearer(req) {
  const header = req.get('Authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
}

// Authenticates any non-departed resident (including pending/rejected for /api/me, /api/leave, /api/events).
export async function requireResidentAnyStatus(req, res, next) {
  const token = extractBearer(req);
  if (!token) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  const result = await query('SELECT * FROM users WHERE token = $1 AND left_at IS NULL', [token]);
  const user = result.rows[0];
  if (!user) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  req.user = user;
  next();
}

// Authenticates an approved resident for shelf, item, loan, and inbox operations.
export async function requireUser(req, res, next) {
  await requireResidentAnyStatus(req, res, () => {
    if (req.user.status !== 'approved') {
      return res.status(403).json({
        error:
          req.user.status === 'rejected'
            ? 'Your join request was not approved'
            : 'Waiting for manager approval',
        status: req.user.status,
      });
    }
    next();
  });
}

// Authenticates a building manager session (separate token domain from resident tokens).
export async function requireManager(req, res, next) {
  const token = extractBearer(req);
  if (!token) {
    return res.status(401).json({ error: 'Manager authentication required' });
  }
  const result = await query(
    `SELECT managers.id, managers.name, managers.email, managers.is_demo
     FROM manager_sessions
     JOIN managers ON managers.id = manager_sessions.manager_id
     WHERE manager_sessions.token = $1 AND manager_sessions.expires_at > NOW()`,
    [token]
  );
  const manager = result.rows[0];
  if (!manager) {
    return res.status(401).json({ error: 'Manager session expired or invalid' });
  }
  req.manager = manager;
  req.managerToken = token;
  next();
}
