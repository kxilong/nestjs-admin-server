import { apiGet, apiPatch } from './client';

export interface UserListItem {
  id: number;
  username: string;
  createdAt: string;
  updatedAt: string;
  roles: { id: number; code: string; name: string }[];
}

export interface UserListResult {
  list: UserListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export function listUsers(
  token: string,
  params: { page?: number; pageSize?: number; keyword?: string },
) {
  const sp = new URLSearchParams();
  if (params.page != null) {
    sp.set('page', String(params.page));
  }
  if (params.pageSize != null) {
    sp.set('pageSize', String(params.pageSize));
  }
  if (params.keyword?.trim()) {
    sp.set('keyword', params.keyword.trim());
  }
  const q = sp.toString();
  return apiGet<UserListResult>(`/users${q ? `?${q}` : ''}`, token);
}

export function assignUserRoles(
  token: string,
  userId: number,
  roleIds: number[],
) {
  return apiPatch<{
    id: number;
    username: string;
    userRoles: { role: { id: number; code: string; name: string } }[];
  }>(
    `/users/${userId}/roles`,
    { roleIds },
    token,
  );
}
