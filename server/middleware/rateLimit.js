// Minimal in-memory fixed-window rate limiter (zero external dependencies).
// Set DISABLE_RATE_LIMIT=true in non-rate-limit test runs to avoid throttling test fixtures.

export function createRateLimiter({ windowMs, max, keyFn = (req) => req.ip }) {
  const hits = new Map();

  return (req, res, next) => {
    if (process.env.DISABLE_RATE_LIMIT === 'true') {
      return next();
    }

    const now = Date.now();
    if (hits.size > 1000) {
      for (const [key, entry] of hits) {
        if (entry.resetAt <= now) hits.delete(key);
      }
    }

    const key = String(keyFn(req) ?? 'unknown');
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }

    entry.count += 1;
    if (entry.count > max) {
      const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: 'Too many requests. Please try again shortly.',
        retry_after_seconds: retryAfter,
      });
    }
    next();
  };
}
