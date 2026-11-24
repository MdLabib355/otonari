// Registering and logging in: email + password, a 6-digit code by email, or Google.
// These are not write() routes: hashing a password and sending an email take long, and nobody else should have
// to wait for that. Only the short part that changes the database is a transaction.

import crypto from 'node:crypto';
import type { Request } from 'express';
import type { AuthConfig, Lang, Login } from '../../../shared/types.ts';
import { LANGUAGES, isOneOf } from '../../core/allowedKeys.ts';
import { tokenOf } from '../../core/auth.ts';
import { transaction } from '../../core/database.ts';
import { refuse, reply, toText, type Answer } from '../../core/http.ts';
import { forgetAttempts, tooMany } from '../../core/limiter.ts';
import { DEMO_MODE, GOOGLE_CLIENT_ID } from '../../core/settings.ts';
import type { UserRow } from '../../types.ts';
import {
  confirmEmail,
  createUser,
  findUserByEmail,
  findUserByGoogle,
  getUser,
  setGoogle,
} from '../user/userModel.ts';
import { meView } from '../user/userView.ts';
import { deleteEmailCode, saveEmailCode, useAttempt } from './emailCodeModel.ts';
import { readGoogleToken } from './google.ts';
import { canSendEmail, sendCode } from './mailer.ts';
import { hashSecret, matchesHash } from './password.ts';
import { createSession, deleteSession, deleteSessionsOf } from './sessionModel.ts';

const TOO_MANY = refuse(429, 'Too many attempts, please wait a few minutes');
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 128;

// The login page shows only what this server can do.
export function showConfig() {
  const config: AuthConfig = { google_client_id: GOOGLE_CLIENT_ID, email_code: canSendEmail, demo_mode: DEMO_MODE };
  return reply(200, config);
}

// '' if it isn't an email address. (Whether it exists, only an email can tell.)
function toEmail(value: unknown): string {
  const email = toText(value).toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function toLang(value: unknown): Lang {
  return isOneOf(LANGUAGES, value) ? value : 'en';
}

// The last step of every way to log in.
async function logIn(user: UserRow): Promise<Answer> {
  if (user.deactivated_at || (user.is_demo && !DEMO_MODE)) return refuse(403, 'This account is deactivated');
  const answer: Login = { token: await createSession(user.id), ...(await meView(user)) };
  return reply(200, answer);
}

export async function register(req: Request) {
  if (tooMany(`register ${req.ip}`, 20, 60)) return TOO_MANY;
  const email = toEmail(req.body?.email);
  const password: unknown = req.body?.password;
  if (!email) return refuse(400, 'Not an email address');
  if (typeof password !== 'string' || password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
    return refuse(400, `The password must be ${MIN_PASSWORD} to ${MAX_PASSWORD} characters`);
  }

  const passwordHash = await hashSecret(password);
  return transaction(async () => {
    if (await findUserByEmail(email)) return refuse(409, 'There is already an account with this email');
    return logIn(await createUser({ email, password_hash: passwordHash, lang: toLang(req.body?.lang) }));
  });
}

export async function login(req: Request) {
  const email = toEmail(req.body?.email);
  const password: unknown = req.body?.password;
  const key = `login ${email} ${req.ip}`;
  if (tooMany(key, 10, 15) || tooMany(`login ${req.ip}`, 100, 15) || tooMany(`login ${email}`, 100, 15)) return TOO_MANY;

  const user = email ? await findUserByEmail(email) : undefined;
  const given = typeof password === 'string' ? password.slice(0, MAX_PASSWORD + 1) : '';
  // The same answer for a wrong email and a wrong password: it doesn't tell who has an account.
  if (!(await matchesHash(given, user?.password_hash)) || !user) return refuse(401, 'Wrong email or password');

  forgetAttempts(key);
  return logIn(user);
}

// Always the same answer, whether there is an account or not: a new one is created with the code.
export async function requestCode(req: Request) {
  if (!canSendEmail) return refuse(503, 'This server cannot send emails');
  const email = toEmail(req.body?.email);
  if (!email) return refuse(400, 'Not an email address');
  if (tooMany(`code ${email}`, 5, 60) || tooMany(`code ${req.ip}`, 20, 60)) return TOO_MANY;

  const user = await findUserByEmail(email);
  if (user?.is_demo) return reply(204); // their addresses don't exist

  const code = String(crypto.randomInt(1_000_000)).padStart(6, '0');
  await saveEmailCode(email, await hashSecret(code));
  try {
    await sendCode(email, code, user?.lang ?? toLang(req.body?.lang));
  } catch (error) {
    console.error('Email could not be sent:', (error as Error).message);
    return refuse(502, 'The email could not be sent');
  }
  return reply(204);
}

export async function loginWithCode(req: Request) {
  const email = toEmail(req.body?.email);
  const code = toText(req.body?.code);
  if (tooMany(`verify ${req.ip}`, 60, 15)) return TOO_MANY;

  const codeHash = email ? await useAttempt(email) : undefined;
  if (!(await matchesHash(code, codeHash)) || !codeHash) return refuse(401, 'Wrong or expired code');

  return transaction(async () => {
    if (!(await deleteEmailCode(email, codeHash))) return refuse(401, 'Wrong or expired code');
    const user = await findUserByEmail(email);
    if (user) return logIn(await provedEmail(user));
    return logIn(await createUser({ email, email_verified: true, lang: toLang(req.body?.lang) }));
  });
}

export async function loginWithGoogle(req: Request) {
  if (tooMany(`google ${req.ip}`, 60, 15)) return TOO_MANY;
  const account = await readGoogleToken(toText(req.body?.credential));
  if (!account) return refuse(401, 'Google login failed');
  const { sub, email, ownsEmail } = account;

  return transaction(async () => {
    const known = await findUserByGoogle(sub);
    if (known) return logIn(known);

    const sameEmail = await findUserByEmail(email);
    if (!sameEmail) {
      return logIn(await createUser({ email, email_verified: ownsEmail, google_sub: sub, lang: toLang(req.body?.lang) }));
    }
    // Connect the two only if Google knows for sure that it is the same person.
    if (!ownsEmail || sameEmail.google_sub) return refuse(409, 'There is already an account with this email');
    await provedEmail(sameEmail);
    await setGoogle(sameEmail.id, sub);
    return logIn(await getUser(sameEmail.id));
  });
}

// This person has just proved that the address is theirs. If the account was made without that proof, somebody
// else may have made it: then their password and their devices must stop working.
async function provedEmail(user: UserRow): Promise<UserRow> {
  if (!user.email_verified) {
    await deleteSessionsOf(user.id);
    await confirmEmail(user.id);
  }
  return getUser(user.id);
}

export async function logout(req: Request) {
  await deleteSession(tokenOf(req));
  return reply(204);
}
