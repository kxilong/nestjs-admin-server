import { Injectable, OnModuleInit } from '@nestjs/common';
import { hash } from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../permission/permission.service';
import { SUPER_ADMIN_ROLE_CODE } from '../constants/permission.definitions';

@Injectable()
export class SuperAdminBootstrapService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionService: PermissionService,
  ) {}

  async onModuleInit() {
    await this.ensureDefaultSuperAdmin();
  }

  /** 当库中没有任何超管时，创建默认超管账号（逻辑与 prisma/seed 中默认用户一致） */
  async ensureDefaultSuperAdmin() {
    const superAdminCount = await this.prisma.userRole.count({
      where: { role: { code: SUPER_ADMIN_ROLE_CODE } },
    });
    if (superAdminCount > 0) {
      return;
    }

    console.log('🔍 开始执行超管初始化逻辑...');

    await this.permissionService.syncCatalog();

    const allPerms = await this.prisma.permission.findMany({
      select: { id: true },
    });

    const superRole = await this.prisma.role.upsert({
      where: { code: SUPER_ADMIN_ROLE_CODE },
      create: {
        code: SUPER_ADMIN_ROLE_CODE,
        name: '超级管理员',
        description: '拥有全部权限，不可删除',
      },
      update: {},
    });

    await this.prisma.rolePermission.deleteMany({
      where: { roleId: superRole.id },
    });
    await this.prisma.rolePermission.createMany({
      data: allPerms.map((perm) => ({
        roleId: superRole.id,
        permissionId: perm.id,
      })),
    });

    const adminName = process.env.SEED_ADMIN_USERNAME ?? 'admin';
    const adminPass = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@123';
    const passwordHash = await hash(adminPass, 10);

    const user = await this.prisma.user.upsert({
      where: { username: adminName },
      create: {
        username: adminName,
        passwordHash,
      },
      update: {},
    });

    await this.prisma.userRole.upsert({
      where: {
        userId_roleId: { userId: user.id, roleId: superRole.id },
      },
      create: { userId: user.id, roleId: superRole.id },
      update: {},
    });

    console.log(`✅ 已自动创建默认超管用户 ${adminName}`);
    console.log(
      '（密码来自 SEED_ADMIN_PASSWORD 或默认 Admin@123，生产环境请尽快修改）',
    );
  }
}
