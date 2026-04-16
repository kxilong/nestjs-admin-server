import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from './client';

export interface RoleItem {
  id: number;
  name: string;
  code: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RoleListResult {
  list: RoleItem[];
  total: number;
  page: number;
  pageSize: number;
}

export function listRoles(
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
  return apiGet<RoleListResult>(`/roles${q ? `?${q}` : ''}`, token);
}

export function createRole(
  token: string,
  body: { name: string; code: string; description?: string },
) {
  return apiPost<RoleItem>('/roles', body, token);
}

export function updateRole(
  token: string,
  id: number,
  body: { name?: string; code?: string; description?: string },
) {
  return apiPatch<RoleItem>(`/roles/${id}`, body, token);
}

export function deleteRole(token: string, id: number) {
  return apiDelete<{ message: string }>(`/roles/${id}`, token);
}

export interface PermissionRow {
  id: number;
  code: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export function getRolePermissions(token: string, roleId: number) {
  return apiGet<PermissionRow[]>(`/roles/${roleId}/permissions`, token);
}

export function setRolePermissions(
  token: string,
  roleId: number,
  permissionCodes: string[],
) {
  return apiPut<PermissionRow[]>(
    `/roles/${roleId}/permissions`,
    { permissionCodes },
    token,
  );
}
