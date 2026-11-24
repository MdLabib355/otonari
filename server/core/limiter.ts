// Counts attempts, so nobody can try passwords or codes all day. In memory: this app is one server.

const MINUTE = 60_000;
const attempts = new Map<string, { count: number; until: number }>();

// Counts one attempt. True if there were more than `max` of them within `minutes`.
export function tooMany(key: string, max: number, minutes: number): boolean {
  const now = Date.now();
  if (attempts.size > 10_000) {
    for (const [oldKey, entry] of attempts) if (entry.until < now) attempts.delete(oldKey);
  }
  const entry = attempts.get(key);
  if (!entry || entry.until < now) {
    attempts.set(key, { count: 1, until: now + minutes * MINUTE });
    return false;
  }
  entry.count += 1;
  return entry.count > max;
}

export function forgetAttempts(key: string) {
  attempts.delete(key);
}
