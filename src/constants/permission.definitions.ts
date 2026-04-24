/** 权限码与展示名（与数据库 Permission 表同步，启动时 upsert） */
export const PERMISSION_DEFINITIONS: Record<
  string,
  { name: string; description?: string }
> = {
  'system:role:create': { name: '创建角色', description: 'POST /roles' },
  'system:role:list': { name: '查询角色', description: 'GET /roles' },
  'system:role:update': { name: '修改角色', description: 'PATCH /roles/:id' },
  'system:role:delete': { name: '删除角色', description: 'DELETE /roles/:id' },
  'system:permission:list': {
    name: '权限列表',
    description: 'GET /permissions',
  },
  'system:role:permissions': {
    name: '角色权限配置',
    description: '读写角色的权限分配',
  },
  'system:user:list': { name: '用户列表', description: 'GET /users' },
  'system:user:roles': {
    name: '分配用户角色',
    description: 'PATCH /users/:id/roles',
  },
  'system:ai:chat': {
    name: 'AI 对话',
    description: 'POST /ai/chat/stream',
  },
};

export const SUPER_ADMIN_ROLE_CODE = 'super_admin';
