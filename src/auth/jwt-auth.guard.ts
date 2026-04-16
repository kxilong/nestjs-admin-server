import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { JwtPayload } from './interfaces/jwt-payload.interface';

type RequestWithUser = Request & { user?: JwtPayload };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = this.extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException('未提供访问令牌');
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: process.env.JWT_ACCESS_SECRET ?? 'dev_access_secret',
      });

      if (payload.type !== 'access') {
        throw new UnauthorizedException('访问令牌类型错误');
      }

      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('访问令牌无效或已过期');
    }
  }

  private extractBearerToken(request: Request): string | null {
    const authorization = request.headers.authorization;
    if (!authorization) {
      return null;
    }

    const [type, token] = authorization.split(' ');
    if (type !== 'Bearer' || !token) {
      return null;
    }

    return token;
  }
}
