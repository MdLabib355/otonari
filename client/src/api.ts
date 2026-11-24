// Small fetch wrapper for our own API (/api/...).
//  - adds "Authorization: Bearer <token>" when we have one. The token comes from /api/join and is
//    kept in localStorage: it is the user's whole identity (no accounts, no passwords).
//  - sends JSON (or FormData, for photos) and returns the JSON answer.
//  - throws an ApiError with .status (e.g. 400, 403, 404) and .data (the JSON answer) when the server says no.
//
// The type of the answer (see shared/types.ts) goes in the angle brackets:
//
//    const me = await api.get<Me>('/api/me');
//    const result = await api.post<Login>('/api/join', { code, nickname, lang });

const TOKEN_KEY = 'otonari-token';

// The JSON answer when the server says no.
interface ErrorData {
  error?: string;
  existing_name?: string; // only POST /api/groups
}

export class ApiError extends Error {
  status: number;
  data: ErrorData | null;

  constructor(status: number, data: ErrorData | null) {
    super(data?.error ?? `Request failed (${status})`);
    this.status = status;
    this.data = data;
  }
}

// The status of whatever was caught, e.g. 404. Undefined if there was no answer at all (no connection).
export function errorStatus(error: unknown): number | undefined {
  return error instanceof ApiError ? error.status : undefined;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function saveToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(method: string, path: string, body?: object): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  // Photos go as FormData (the browser sets that header itself); everything else as JSON.
  let payload: FormData | string | undefined;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
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
    throw new ApiError(response.status, data);
  }
  return data;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: object) => request<T>('POST', path, body),
  patch: <T>(path: string, body: object) => request<T>('PATCH', path, body),
  delete: (path: string) => request<null>('DELETE', path),
};
