// Dedicated API client for Super Admin (/api/v1/super-admin/*), isolated from resident tokens.

import { ApiError } from '../../core/api.ts';

const SA_TOKEN_KEY = 'otonari_sa_token';
const API_BASE = '/api/v1/super-admin';

export function getSuperAdminToken(): string | null {
  return localStorage.getItem(SA_TOKEN_KEY);
}

export function saveSuperAdminToken(token: string) {
  localStorage.setItem(SA_TOKEN_KEY, token);
}

export function clearSuperAdminToken() {
  localStorage.removeItem(SA_TOKEN_KEY);
}

async function saRequest<T>(
  method: string,
  path: string,
  body?: object,
  extraHeaders: Record<string, string> = {}
): Promise<T> {
  const headers: Record<string, string> = { ...extraHeaders };
  const token = getSuperAdminToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload: string | undefined;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const response = await fetch(API_BASE + path, { method, headers, body: payload });
  if (response.status === 401 && path !== '/auth/login') {
    clearSuperAdminToken();
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status, data);
  }
  return data;
}

export const saApi = {
  get: <T>(path: string, headers?: Record<string, string>) => saRequest<T>('GET', path, undefined, headers),
  post: <T>(path: string, body?: object, headers?: Record<string, string>) =>
    saRequest<T>('POST', path, body, headers),
  patch: <T>(path: string, body: object, headers?: Record<string, string>) =>
    saRequest<T>('PATCH', path, body, headers),
};
