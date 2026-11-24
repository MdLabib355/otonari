// Passwords (and email codes) are never stored, only their scrypt hash: "salt:hash".

import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify<string, Buffer, number, Buffer>(crypto.scrypt);
const LENGTH = 64;

export async function hashSecret(secret: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(secret, salt, LENGTH);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

// Takes equally long with and without a stored hash, so the time doesn't tell whether an account exists.
const NOTHING = await hashSecret(crypto.randomUUID());

export async function matchesHash(secret: string, stored: string | null | undefined): Promise<boolean> {
  const [salt, hash] = (stored ?? NOTHING).split(':').map((part) => Buffer.from(part, 'hex'));
  const same = crypto.timingSafeEqual(await scrypt(secret, salt, LENGTH), hash);
  return same && Boolean(stored);
}
