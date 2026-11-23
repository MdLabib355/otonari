// Fetch wrappers for Resident API (otonari-token), Manager API (otonari-manager-token),
// and authenticated Server-Sent Events stream (keeping Bearer tokens out of URLs).

const TOKEN_KEY = 'otonari-token';
const MANAGER_TOKEN_KEY = 'otonari-manager-token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function saveToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function getManagerToken() {
  return localStorage.getItem(MANAGER_TOKEN_KEY);
}
export function saveManagerToken(token) {
  localStorage.setItem(MANAGER_TOKEN_KEY, token);
}
export function clearManagerToken() {
  localStorage.removeItem(MANAGER_TOKEN_KEY);
}

async function request(method, path, body, { tokenFn = getToken, redirectOn401 = true } = {}) {
  const headers = {};
  const token = tokenFn();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let payload = body;
  if (body !== undefined && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const response = await fetch(path, { method, headers, body: payload });

  if (response.status === 401 && redirectOn401) {
    clearToken();
    if (window.location.pathname !== '/join' && window.location.pathname !== '/manager') {
      window.location.assign('/join');
    }
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.error ?? `Request failed (${response.status})`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  patch: (path, body) => request('PATCH', path, body),
  delete: (path, body) => request('DELETE', path, body),
};

export const managerApi = {
  get: (path) => request('GET', path, undefined, { tokenFn: getManagerToken, redirectOn401: false }),
  post: (path, body) => request('POST', path, body, { tokenFn: getManagerToken, redirectOn401: false }),
  patch: (path, body) => request('PATCH', path, body, { tokenFn: getManagerToken, redirectOn401: false }),
  delete: (path, body) => request('DELETE', path, body, { tokenFn: getManagerToken, redirectOn401: false }),
};

// Opens an authenticated SSE stream via fetch() so the Bearer token stays in headers, never URLs.
export async function openEventStream({ onEvent, onRevoked, signal }) {
  const token = getToken();
  if (!token) return;

  const response = await fetch('/api/events', {
    headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
    signal,
  });
  if (response.status === 401) {
    onRevoked?.();
    return;
  }
  if (!response.ok || !response.body) {
    throw new Error(`SSE failed (${response.status})`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let splitIdx = buffer.indexOf('\n\n');
    while (splitIdx !== -1) {
      const block = buffer.slice(0, splitIdx);
      buffer = buffer.slice(splitIdx + 2);
      splitIdx = buffer.indexOf('\n\n');

      let eventType = 'message';
      let dataLine = '';
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) eventType = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLine += line.slice(5).trim();
      }
      if (eventType === 'revoked') {
        onRevoked?.();
        return;
      }
      if (eventType === 'update' && dataLine) {
        try {
          onEvent?.(JSON.parse(dataLine));
        } catch {
          onEvent?.({ type: 'update' });
        }
      }
    }
  }
}
