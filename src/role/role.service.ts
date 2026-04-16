import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SUPER_ADMIN_ROLE_CODE } from '../constants/permission.definitions';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { QueryRoleListDto } from './dto/query-role-list.dto';

@Injectable()
export class RoleService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateRoleDto) {
    const existed = await this.prisma.role.findUnique({
      where: { code: dto.code },
    });
    if (existed) {
      throw new ConflictException('角色编码已存在');
    }

    const desc = dto.description?.trim();
    return this.prisma.role.create({
      data: {
        name: dto.name.trim(),
        code: dto.code.trim(),
        description: desc ? desc : null,
      },
    });
  }

  async findAll(query: QueryRoleListDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const keyword = query.keyword?.trim();

    const where = keyword
      ? {
          OR: [
            { name: { contains: keyword, mode: 'insensitive' as const } },
            { code: { contains: keyword, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [list, total] = await Promise.all([
      this.prisma.role.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.role.count({ where }),
    ]);

    return { list, total, page, pageSize };
  }

  async update(id: number, dto: UpdateRoleDto) {
    const { name, code, description } = dto;
    if (name === undefined && code === undefined && description === undefined) {
      throw new BadRequestException('请至少提供一个要修改的字段');
    }

    const existing = await this.prisma.role.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('角色不存在');
    }

    if (code !== undefined && code !== existing.code) {
      const codeTaken = await this.prisma.role.findUnique({
        where: { code },
      });
      if (codeTaken) {
        throw new ConflictException('角色编码已被占用');
      }
    }

    return this.prisma.role.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(code !== undefined ? { code: code.trim() } : {}),
        ...(description !== undefined
          ? { description: description.trim() ? description.trim() : null }
          : {}),
      },
    });
  }

  async remove(id: number) {
    const existing = await this.prisma.role.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('角色不存在');
    }
    if (existing.code === SUPER_ADMIN_ROLE_CODE) {
      throw new BadRequestException('不能删除系统内置超级管理员角色');
    }

    await this.prisma.role.delete({ where: { id } });
    return { message: '删除成功' };
  }

  async getRolePermissions(roleId: number) {
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      include: {
        rolePermissions: {
          include: { permission: true },
        },
      },
    });
    if (!role) {
      throw new NotFoundException('角色不存在');
    }
    return role.rolePermissions.map((rp) => rp.permission);
  }

  async setRolePermissions(roleId: number, permissionCodes: string[]) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      throw new NotFoundException('角色不存在');
    }

    const permissions = await this.prisma.permission.findMany({
      where: { code: { in: permissionCodes } },
    });
    if (permissions.length !== permissionCodes.length) {
      const found = new Set(permissions.map((p) => p.code));
      const missing = permissionCodes.filter((c) => !found.has(c));
      throw new BadRequestException(`无效权限码: ${missing.join(', ')}`);
    }

    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId } }),
      this.prisma.rolePermission.createMany({
        data: permissions.map((p) => ({
          roleId,
          permissionId: p.id,
        })),
      }),
    ]);

    return this.getRolePermissions(roleId);
  }
}
