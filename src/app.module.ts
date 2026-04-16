import { Module } from '@nestjs/common';
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

@Module({
  imports: [],
  controllers: [
    AppController,
    AuthController,
    RoleController,
    PermissionController,
    UserController,
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
  ],
})
export class AppModule {}
