import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SUPER_ADMIN_ROLE_CODE } from '../constants/permission.definitions';

@Injectable()
export class RbacService {
  constructor(private readonly prisma: PrismaService) {}

  async isSuperAdmin(userId: number): Promise<boolean> {
    const row = await this.prisma.userRole.findFirst({
      where: {
        userId,
        role: { code: SUPER_ADMIN_ROLE_CODE },
      },
      select: { userId: true },
    });
    return Boolean(row);
  }

  /** 超级管理员返回库中全部权限码；否则返回用户经角色继承的权限码 */
  async getUserPermissionCodes(userId: number): Promise<string[]> {
    if (await this.isSuperAdmin(userId)) {
      const rows = await this.prisma.permission.findMany({
        select: { code: true },
      });
      return rows.map((r) => r.code);
    }

    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      include: {
        role: {
          include: {
            rolePermissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    const set = new Set<string>();
    for (const ur of userRoles) {
      for (const rp of ur.role.rolePermissions) {
        set.add(rp.permission.code);
      }
    }
    return [...set];
  }

  async userHasAllPermissions(
    userId: number,
    requiredCodes: string[],
  ): Promise<boolean> {
    if (requiredCodes.length === 0) {
      return true;
    }
    if (await this.isSuperAdmin(userId)) {
      return true;
    }
    const owned = new Set(await this.getUserPermissionCodes(userId));
    return requiredCodes.every((c) => owned.has(c));
  }
}
