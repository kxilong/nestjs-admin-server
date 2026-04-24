import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { JwtService } from '@nestjs/jwt';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RoleController } from './role/role.controller';
import { RoleService } from './role/role.service';
import { PermissionController } from './permission/permission.controller';
import { PermissionService } from './permission/permission.service';
import { UserController } from './user/user.controller';
import { UserService } from './user/user.service';
import { RbacService } from './rbac/rbac.service';
import { PermissionsGuard } from './rbac/permissions.guard';
import { SuperAdminBootstrapService } from './bootstrap/super-admin-bootstrap.service';
import { RedisModule } from './redis/redis.module';
import { AiController } from './ai/ai.controller';
import { AiService } from './ai/ai.service';

@Module({
  imports: [
    RedisModule,
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: Math.max(
          30,
          Number.parseInt(process.env.THROTTLE_LIMIT ?? '200', 10) || 200,
        ),
      },
    ]),
  ],
  controllers: [
    AppController,
    AuthController,
    RoleController,
    PermissionController,
    UserController,
    AiController,
  ],
  providers: [
    AppService,
    PrismaService,
    AuthService,
    JwtService,
    JwtAuthGuard,
    RoleService,
    PermissionService,
    UserService,
    RbacService,
    PermissionsGuard,
    SuperAdminBootstrapService,
    AiService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
