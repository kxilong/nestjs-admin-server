import { apiGet } from './client';

export interface PermissionItem {
  id: number;
  code: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export function listPermissions(token: string) {
  return apiGet<PermissionItem[]>('/permissions', token);
}
