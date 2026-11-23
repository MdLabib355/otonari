// Layer 2: In-process Server-Sent Events (SSE) pub/sub hub with per-user stream capping.

const MAX_STREAMS_PER_USER = 5;
const HEARTBEAT_MS = 25_000;

// Map<number, Set<{ res: express.Response, timer: NodeJS.Timeout }>>
const subscribers = new Map();

function removeClient(userId, entry) {
  clearInterval(entry.timer);
  const set = subscribers.get(userId);
  if (!set) return;
  set.delete(entry);
  if (set.size === 0) {
    subscribers.delete(userId);
  }
}

export function subscribeUser(userId, res) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  res.write(': connected\n\n');

  let set = subscribers.get(userId);
  if (!set) {
    set = new Set();
    subscribers.set(userId, set);
  }

  // Enforce per-user connection cap by closing the oldest stream.
  while (set.size >= MAX_STREAMS_PER_USER) {
    const oldest = set.values().next().value;
    removeClient(userId, oldest);
    try {
      oldest.res.end();
    } catch {
      // Ignore already-closed stream
    }
  }

  const timer = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      removeClient(userId, entry);
    }
  }, HEARTBEAT_MS);
  timer.unref?.();

  const entry = { res, timer };
  set.add(entry);

  res.on('close', () => removeClient(userId, entry));
}

export function notifyUser(userId, payload = { type: 'update' }) {
  const set = subscribers.get(userId);
  if (!set || set.size === 0) return;

  const frame = `event: update\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const entry of [...set]) {
    try {
      entry.res.write(frame);
    } catch {
      removeClient(userId, entry);
    }
  }
}

export function disconnectUser(userId) {
  const set = subscribers.get(userId);
  if (!set) return;
  for (const entry of [...set]) {
    removeClient(userId, entry);
    try {
      entry.res.write('event: revoked\ndata: {}\n\n');
      entry.res.end();
    } catch {
      // Ignore already-closed stream
    }
  }
}

export function disconnectAll() {
  for (const userId of [...subscribers.keys()]) {
    const set = subscribers.get(userId);
    if (!set) continue;
    for (const entry of [...set]) {
      removeClient(userId, entry);
      try {
        entry.res.end();
      } catch {
        // Ignore already-closed stream
      }
    }
  }
}

export function activeStreamCount(userId) {
  return subscribers.get(userId)?.size ?? 0;
}
