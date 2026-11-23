// Asynchronous scrypt password hashing and constant-time verification using Node built-in crypto.

import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(crypto.scrypt);
const KEY_LEN = 64;

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await scryptAsync(password, salt, KEY_LEN);
  return `scrypt$${salt}$${derived.toString('hex')}`;
}

export async function verifyPassword(password, storedHash) {
  if (typeof password !== 'string' || typeof storedHash !== 'string') return false;
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, hexHash] = parts;
  const expected = Buffer.from(hexHash, 'hex');
  if (expected.length !== KEY_LEN) return false;
  const actual = await scryptAsync(password, salt, KEY_LEN);
  return crypto.timingSafeEqual(expected, actual);
}
