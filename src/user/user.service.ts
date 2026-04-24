import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QueryUserListDto } from './dto/query-user-list.dto';
import { AssignUserRolesDto } from './dto/assign-user-roles.dto';
import { CacheListService } from '../redis/cache-list.service';
import { RedisService } from '../redis/redis.service';
import { DistributedLockService } from '../redis/distributed-lock.service';

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheList: CacheListService,
    private readonly redis: RedisService,
    private readonly distributedLock: DistributedLockService,
  ) {}

  async findAll(query: QueryUserListDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const keyword = query.keyword?.trim() ?? '';

    const listVer = await this.redis.getCounter('cache:ver:user_list');
    const cacheKey = `cache:user_list:v${listVer}:p${page}:s${pageSize}:k${keyword}`;

    return this.cacheList.getOrSetJson(
      cacheKey,
      async () => {
        const where = keyword
          ? {
              username: { contains: keyword, mode: 'insensitive' as const },
            }
          : {};

        const [rows, total] = await Promise.all([
          this.prisma.user.findMany({
            where,
            orderBy: { id: 'asc' },
            skip: (page - 1) * pageSize,
            take: pageSize,
            select: {
              id: true,
              username: true,
              createdAt: true,
              updatedAt: true,
              userRoles: {
                include: {
                  role: {
                    select: { id: true, code: true, name: true },
                  },
                },
              },
            },
          }),
          this.prisma.user.count({ where }),
        ]);

        const list = rows.map((u) => ({
          id: u.id,
          username: u.username,
          createdAt: u.createdAt,
          updatedAt: u.updatedAt,
          roles: u.userRoles.map((ur) => ur.role),
        }));

        return { list, total, page, pageSize };
      },
      {
        ttlSec: Number(process.env.CACHE_USER_LIST_TTL_SEC ?? '60'),
        nullTtlSec: Number(process.env.CACHE_NULL_TTL_SEC ?? '20'),
        lockTtlMs: Number(process.env.CACHE_REBUILD_LOCK_MS ?? '8000'),
        jitterRatio: 0.25,
      },
    );
  }

  async setUserRoles(userId: number, dto: AssignUserRolesDto) {
    return this.distributedLock.withLock(
      `user_roles:${userId}`,
      15,
      async () => {
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
        });
        if (!user) {
          throw new NotFoundException('用户不存在');
        }

        const roles = await this.prisma.role.findMany({
          where: { id: { in: dto.roleIds } },
        });
        if (roles.length !== dto.roleIds.length) {
          throw new NotFoundException('部分角色不存在');
        }

        await this.prisma.$transaction(async (tx) => {
          await tx.userRole.deleteMany({ where: { userId } });
          if (dto.roleIds.length > 0) {
            await tx.userRole.createMany({
              data: dto.roleIds.map((roleId) => ({ userId, roleId })),
            });
          }
        });

        await this.redis.bumpUserListVersion();

        return this.prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            username: true,
            userRoles: {
              include: {
                role: { select: { id: true, code: true, name: true } },
              },
            },
          },
        });
      },
    );
  }
}
