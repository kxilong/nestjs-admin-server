import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PERMISSIONS_KEY } from './permissions.metadata';
import { RbacService } from './rbac.service';

type RequestWithUser = Request & { user?: JwtPayload };

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbac: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;
    if (!user?.sub) {
      throw new ForbiddenException('未登录');
    }

    const ok = await this.rbac.userHasAllPermissions(user.sub, required);
    if (!ok) {
      throw new ForbiddenException('权限不足');
    }
    return true;
  }
}
