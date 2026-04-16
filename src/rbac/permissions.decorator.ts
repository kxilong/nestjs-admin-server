import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from './permissions.guard';
import { PERMISSIONS_KEY } from './permissions.metadata';

/** JWT + 权限校验（需同时具备所列权限码；超级管理员角色跳过校验） */
export function Authorize(...codes: string[]) {
  return applyDecorators(
    UseGuards(JwtAuthGuard, PermissionsGuard),
    SetMetadata(PERMISSIONS_KEY, codes),
  );
}
