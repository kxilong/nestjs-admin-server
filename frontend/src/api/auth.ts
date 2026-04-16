import { apiGet, apiPost } from './client';
import type { AuthProfile } from '@/auth/storage';

export interface LoginResult extends AuthProfile {
  accessToken: string;
  refreshToken: string;
}

export function register(body: { username: string; password: string }) {
  return apiPost<{ id: number; username: string; createdAt: string }>(
    '/auth/register',
    body,
  );
}

export function login(body: { username: string; password: string }) {
  return apiPost<LoginResult>('/auth/login', body);
}

export function getMe(token: string) {
  return apiGet<AuthProfile>('/auth/me', token);
}

export function refreshToken(body: { refreshToken: string }) {
  return apiPost<{ accessToken: string; refreshToken: string }>(
    '/auth/refresh-token',
    body,
  );
}

export function changePassword(
  body: { oldPassword: string; newPassword: string },
  accessToken: string,
) {
  return apiPost<{ message: string }>(
    '/auth/change-password',
    body,
    accessToken,
  );
}

export function logout(accessToken: string) {
  return apiPost<{ message: string }>('/auth/logout', {}, accessToken);
}
