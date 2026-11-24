// Registering: email → code → password, or Google. Logging in: email + password, email + code, or Google.
// These are not write() routes: hashing a password and sending an email take long, and nobody else should have
// to wait for that. Only the short part that changes the database is a transaction.

import crypto from 'node:crypto';
import type { Request } from 'express';
import type { AuthConfig, Lang, Login, RegistrationTicket } from '../../../shared/types.ts';
import { LANGUAGES, isOneOf } from '../../core/allowedKeys.ts';
import { tokenOf } from '../../core/auth.ts';
import { transaction } from '../../core/database.ts';
import { refuse, reply, toText, type Answer } from '../../core/http.ts';
import { forgetAttempts, tooMany } from '../../core/limiter.ts';
import { DEMO_MODE, GOOGLE_CLIENT_ID, MAILBOX_URL } from '../../core/settings.ts';
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
import { createTicket, useTicket } from './registrationModel.ts';
import { createSession, deleteSession, deleteSessionsOf } from './sessionModel.ts';

const TOO_MANY = refuse(429, 'Too many attempts, please wait a few minutes');
// One email = one account. Who registered with Google logs in with Google.
const USE_GOOGLE = reply(409, { error: 'This account logs in with Google', use_google: true });
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 128;

// The login page shows only what this server can do.
export function showConfig() {
  const config: AuthConfig = {
    google_client_id: GOOGLE_CLIENT_ID,
    email_code: canSendEmail,
    demo_mode: DEMO_MODE,
    mailbox_url: MAILBOX_URL,
  };
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

// Registering, step 3: the password. The ticket says that the email was proved in step 2.
export async function register(req: Request) {
  if (tooMany(`register ${req.ip}`, 20, 60)) return TOO_MANY;
  const password: unknown = req.body?.password;
  if (typeof password !== 'string' || password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
    return refuse(400, `The password must be ${MIN_PASSWORD} to ${MAX_PASSWORD} characters`);
  }

  const passwordHash = await hashSecret(password);
  return transaction(async () => {
    const email = await useTicket(toText(req.body?.ticket));
    if (!email) return refuse(401, 'Please prove your email address again');
    const refusal = refuseExisting(await findUserByEmail(email));
    if (refusal) return refusal;
    const lang = toLang(req.body?.lang);
    return logIn(await createUser({ email, email_verified: true, password_hash: passwordHash, lang }));
  });
}

// One email = one account.
function refuseExisting(user: UserRow | undefined): Answer | null {
  if (user?.google_only) return USE_GOOGLE;
  return user ? refuse(409, 'There is already an account with this email') : null;
}

export async function login(req: Request) {
  const email = toEmail(req.body?.email);
  const password: unknown = req.body?.password;
  const key = `login ${email} ${req.ip}`;
  if (tooMany(key, 10, 15) || tooMany(`login ${req.ip}`, 100, 15) || tooMany(`login ${email}`, 100, 15)) return TOO_MANY;

  const user = email ? await findUserByEmail(email) : undefined;
  const given = typeof password === 'string' ? password.slice(0, MAX_PASSWORD + 1) : '';
  if (user?.google_only) return USE_GOOGLE;
  // The same answer for a wrong email and a wrong password: it doesn't tell who has an account.
  if (!(await matchesHash(given, user?.password_hash)) || !user) return refuse(401, 'Wrong email or password');

  forgetAttempts(key);
  return logIn(user);
}

// Sends a code. For registering (step 1) there must be no account yet, for logging in there must be one.
export async function requestCode(req: Request) {
  if (!canSendEmail) return refuse(503, 'This server cannot send emails');
  const purpose: unknown = req.body?.purpose;
  if (!isOneOf(['register', 'login'], purpose)) return refuse(400, "purpose must be 'register' or 'login'");
  const email = toEmail(req.body?.email);
  if (!email) return refuse(400, 'Not an email address');
  if (tooMany(`code ${email}`, 5, 60) || tooMany(`code ${req.ip}`, 20, 60)) return TOO_MANY;

  const user = await findUserByEmail(email);
  if (purpose === 'register') {
    const refusal = refuseExisting(user);
    if (refusal) return refusal;
  } else {
    if (!user) return refuse(404, 'There is no account with this email');
    if (user.google_only) return USE_GOOGLE;
    if (user.is_demo) return refuse(403, 'Demo accounts log in with their password'); // their addresses don't exist
  }

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

// Is this the code that was sent to this address? Then it can't be used again.
async function acceptCode(req: Request): Promise<{ email: string } | Answer> {
  const email = toEmail(req.body?.email);
  if (tooMany(`verify ${req.ip}`, 60, 15)) return TOO_MANY;
  const codeHash = email ? await useAttempt(email) : undefined;
  const correct = (await matchesHash(toText(req.body?.code), codeHash)) && codeHash !== undefined;
  if (!correct || !(await deleteEmailCode(email, codeHash))) return refuse(401, 'Wrong or expired code');
  return { email };
}

// Registering, step 2: the code proves the email address.
export async function verifyCode(req: Request) {
  const result = await acceptCode(req);
  if (!('email' in result)) return result;
  const refusal = refuseExisting(await findUserByEmail(result.email));
  if (refusal) return refusal;
  const answer: RegistrationTicket = { ticket: await createTicket(result.email) };
  return reply(200, answer);
}

// Logging in without a password.
export async function loginWithCode(req: Request) {
  const result = await acceptCode(req);
  if (!('email' in result)) return result;
  return transaction(async () => {
    const user = await findUserByEmail(result.email);
    if (!user) return refuse(404, 'There is no account with this email');
    if (user.google_only) return USE_GOOGLE;
    return logIn(await provedEmail(user));
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
    // Not a second account with the same email: Google becomes one more way into the existing one. Only if Google
    // knows for sure that it is the same person.
    if (!ownsEmail || sameEmail.google_sub) return refuse(409, 'There is already an account with this email');
    // (An account whose owner never proved the address may be somebody else's: then this is like registering.)
    const only = !sameEmail.email_verified;
    await provedEmail(sameEmail);
    await setGoogle(sameEmail.id, sub, only);
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
