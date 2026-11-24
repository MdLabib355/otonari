// The settings from server/.env (or from docker-compose.yml). Passwords and other secrets exist only there.

import './env.ts';

export const DEMO_MODE = process.env.DEMO_MODE === 'true';

// "Continue with Google" exists only if this is set. (It is public: every browser gets it.)
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || null;

// Emails with a code are sent only if there is a mail server.
export const SMTP = {
  host: process.env.SMTP_HOST || null,
  port: Number(process.env.SMTP_PORT || 587),
  user: process.env.SMTP_USER || null,
  password: process.env.SMTP_PASSWORD || null,
  from: process.env.SMTP_FROM || process.env.SMTP_USER || 'otonari@localhost',
};

// This account is the first super_admin. It is created (or updated) whenever the server starts.
export const SUPER_ADMIN = {
  email: process.env.SUPER_ADMIN_EMAIL || null,
  password: process.env.SUPER_ADMIN_PASSWORD || null,
};
