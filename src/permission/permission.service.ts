import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PERMISSION_DEFINITIONS } from '../constants/permission.definitions';

@Injectable()
export class PermissionService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.syncCatalog();
  }

  /** 将代码中定义的权限同步到数据库（名称变更会更新） */
  async syncCatalog() {
    for (const [code, meta] of Object.entries(PERMISSION_DEFINITIONS)) {
      await this.prisma.permission.upsert({
        where: { code },
        create: {
          code,
          name: meta.name,
          description: meta.description ?? null,
        },
        update: {
          name: meta.name,
          description: meta.description ?? null,
        },
      });
    }
  }

  async findAll() {
    return this.prisma.permission.findMany({
      orderBy: { code: 'asc' },
    });
  }
}
