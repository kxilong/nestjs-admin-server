import { API_BASE } from '@/config';
import { AUTH_KEYS } from '@/auth/storage';
import type { ApiResponse } from './types';

function normalizeMsg(msg: string | string[]): string {
  return Array.isArray(msg) ? msg.join(', ') : msg;
}

/** 并发 401 时共用一个刷新 Promise */
let refreshInflight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const rt = localStorage.getItem(AUTH_KEYS.refresh);
  if (!rt) {
    return null;
  }

  const response = await fetch(`${API_BASE}/auth/refresh-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: rt }),
  });

  const payload = (await response.json()) as ApiResponse<{
    accessToken: string;
    refreshToken: string;
  }>;

  if (!response.ok) {
    return null;
  }

  const { accessToken, refreshToken } = payload.data;
  localStorage.setItem(AUTH_KEYS.access, accessToken);
  localStorage.setItem(AUTH_KEYS.refresh, refreshToken);
  window.dispatchEvent(
    new CustomEvent('admin-tokens-updated', {
      detail: { accessToken, refreshToken },
    }),
  );
  return accessToken;
}

async function getFreshAccessToken(): Promise<string | null> {
  if (!refreshInflight) {
    refreshInflight = refreshAccessToken().finally(() => {
      refreshInflight = null;
    });
  }
  return refreshInflight;
}

type FetchInit = {
  method: string;
  path: string;
  body?: string;
  token?: string;
  retried?: boolean;
};

async function requestJson<T>(init: FetchInit): Promise<T> {
  const { method, path, body, token, retried } = init;

  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body,
  });

  const payload = (await response.json()) as ApiResponse<T>;

  if (
    response.status === 401 &&
    token &&
    !retried &&
    path !== '/auth/refresh-token'
  ) {
    const newAccess = await getFreshAccessToken();
    if (newAccess) {
      return requestJson<T>({
        ...init,
        token: newAccess,
        retried: true,
      });
    }
  }

  if (!response.ok) {
    throw new Error(normalizeMsg(payload.msg) || '请求失败');
  }

  return payload.data;
}

export async function apiGet<T>(
  path: string,
  token?: string,
): Promise<T> {
  return requestJson<T>({ method: 'GET', path, token });
}

export async function apiPost<T>(
  path: string,
  body?: Record<string, unknown>,
  token?: string,
): Promise<T> {
  return requestJson<T>({
    method: 'POST',
    path,
    body: body ? JSON.stringify(body) : undefined,
    token,
  });
}

export async function apiPut<T>(
  path: string,
  body?: Record<string, unknown>,
  token?: string,
): Promise<T> {
  return requestJson<T>({
    method: 'PUT',
    path,
    body: body ? JSON.stringify(body) : undefined,
    token,
  });
}

export async function apiPatch<T>(
  path: string,
  body?: Record<string, unknown>,
  token?: string,
): Promise<T> {
  return requestJson<T>({
    method: 'PATCH',
    path,
    body: body ? JSON.stringify(body) : undefined,
    token,
  });
}

export async function apiDelete<T>(path: string, token?: string): Promise<T> {
  return requestJson<T>({ method: 'DELETE', path, token });
}
