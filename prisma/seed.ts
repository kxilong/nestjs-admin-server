import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

/** 须与 src/constants/permission.definitions.ts 保持一致 */
const PERMISSION_ROWS: { code: string; name: string; description?: string }[] = [
  { code: 'system:role:create', name: '创建角色', description: 'POST /roles' },
  { code: 'system:role:list', name: '查询角色', description: 'GET /roles' },
  { code: 'system:role:update', name: '修改角色', description: 'PATCH /roles/:id' },
  { code: 'system:role:delete', name: '删除角色', description: 'DELETE /roles/:id' },
  { code: 'system:permission:list', name: '权限列表', description: 'GET /permissions' },
  {
    code: 'system:role:permissions',
    name: '角色权限配置',
    description: '读写角色的权限分配',
  },
  { code: 'system:user:list', name: '用户列表', description: 'GET /users' },
  {
    code: 'system:user:roles',
    name: '分配用户角色',
    description: 'PATCH /users/:id/roles',
  },
];

const SUPER_ADMIN_CODE = 'super_admin';

async function main() {
  for (const p of PERMISSION_ROWS) {
    await prisma.permission.upsert({
      where: { code: p.code },
      create: {
        code: p.code,
        name: p.name,
        description: p.description ?? null,
      },
      update: {
        name: p.name,
        description: p.description ?? null,
      },
    });
  }

  const allPerms = await prisma.permission.findMany({ select: { id: true } });

  const superRole = await prisma.role.upsert({
    where: { code: SUPER_ADMIN_CODE },
    create: {
      code: SUPER_ADMIN_CODE,
      name: '超级管理员',
      description: '拥有全部权限，不可删除',
    },
    update: {},
  });

  await prisma.rolePermission.deleteMany({ where: { roleId: superRole.id } });
  await prisma.rolePermission.createMany({
    data: allPerms.map((perm) => ({
      roleId: superRole.id,
      permissionId: perm.id,
    })),
  });

  const adminName = process.env.SEED_ADMIN_USERNAME ?? 'admin';
  const adminPass = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@123';

  const passwordHash = await hash(adminPass, 10);
  const user = await prisma.user.upsert({
    where: { username: adminName },
    create: {
      username: adminName,
      passwordHash,
    },
    update: {},
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: { userId: user.id, roleId: superRole.id },
    },
    create: { userId: user.id, roleId: superRole.id },
    update: {},
  });

  console.log(
    `Seed OK: 超级管理员角色已绑定全部权限；用户「${adminName}」已关联该角色（默认密码见环境变量或 Admin@123）。`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
