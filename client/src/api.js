// Small fetch wrapper for our own API (/api/...).
//  - adds "Authorization: Bearer <token>" when we have one. The token comes from /api/join and is
//    kept in localStorage: it is the user's whole identity (no accounts, no passwords).
//  - sends JSON (or FormData, for photos) and returns the JSON answer.
//  - throws an Error with .status (e.g. 400, 403, 404) and .data (the JSON answer) when the server says no.
//
//    const me = await api.get('/api/me');
//    const result = await api.post('/api/join', { code, nickname, lang });

const TOKEN_KEY = 'otonari-token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function saveToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function request(method, path, body) {
  const headers = {};
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  // Photos go as FormData (the browser sets that header itself); everything else as JSON.
  let payload = body;
  if (body !== undefined && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const response = await fetch(path, { method, headers, body: payload });

  if (response.status === 401) {
    // The server doesn't know our token (e.g. after `npm run seed`): forget it and join again.
    clearToken();
    if (window.location.pathname !== '/join') {
      window.location.assign('/join');
    }
  }

  const data = await response.json().catch(() => null); // empty or non-JSON answer → null
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
  delete: (path) => request('DELETE', path),
};
