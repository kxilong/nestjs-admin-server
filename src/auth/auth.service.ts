import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { compare, hash } from 'bcryptjs';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly rbac: RbacService,
  ) {}

  async register(dto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { username: dto.username },
      select: { id: true },
    });

    if (existingUser) {
      throw new BadRequestException('用户名已存在');
    }

    const passwordHash = await hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        passwordHash,
      },
      select: {
        id: true,
        username: true,
        createdAt: true,
      },
    });

    return user;
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });

    if (!user) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    const passwordMatched = await compare(dto.password, user.passwordHash);
    if (!passwordMatched) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    const tokens = await this.generateTokenPair(user.id, user.username);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    const profile = await this.getAuthProfile(user.id);

    return {
      ...profile,
      ...tokens,
    };
  }

  async getAuthProfile(userId: number) {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        createdAt: true,
      },
    });
    if (!row) {
      throw new NotFoundException('用户不存在');
    }

    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      include: {
        role: { select: { id: true, code: true, name: true } },
      },
    });

    const roles = userRoles.map((ur) => ur.role);
    const permissionCodes = await this.rbac.getUserPermissionCodes(userId);
    const isSuperAdmin = await this.rbac.isSuperAdmin(userId);

    return {
      user: row,
      roles,
      permissionCodes,
      isSuperAdmin,
    };
  }

  async refreshToken(dto: RefreshTokenDto) {
    let payload: JwtPayload;

    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(
        dto.refreshToken,
        {
          secret: this.refreshSecret,
        },
      );
    } catch {
      throw new UnauthorizedException('刷新令牌无效或已过期');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('刷新令牌类型错误');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || !user.refreshTokenHash) {
      throw new UnauthorizedException('登录状态已失效，请重新登录');
    }

    const matched = await compare(dto.refreshToken, user.refreshTokenHash);
    if (!matched) {
      throw new UnauthorizedException('刷新令牌校验失败');
    }

    const tokens = await this.generateTokenPair(user.id, user.username);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    return tokens;
  }

  async changePassword(userId: number, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    const oldPasswordMatched = await compare(
      dto.oldPassword,
      user.passwordHash,
    );
    if (!oldPasswordMatched) {
      throw new UnauthorizedException('旧密码错误');
    }

    if (dto.oldPassword === dto.newPassword) {
      throw new BadRequestException('新密码不能与旧密码相同');
    }

    const newPasswordHash = await hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: newPasswordHash,
        refreshTokenHash: null,
      },
    });

    return { message: '密码修改成功，请重新登录' };
  }

  async logout(userId: number) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });

    return { message: '已注销登录' };
  }

  private async generateTokenPair(userId: number, username: string) {
    const accessPayload: JwtPayload = {
      sub: userId,
      username,
      type: 'access',
    };
    const refreshPayload: JwtPayload = {
      sub: userId,
      username,
      type: 'refresh',
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, {
        secret: this.accessSecret,
        expiresIn: this.accessExpiresIn as any,
      }),
      this.jwtService.signAsync(refreshPayload, {
        secret: this.refreshSecret,
        expiresIn: this.refreshExpiresIn as any,
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private async updateRefreshToken(userId: number, refreshToken: string) {
    const refreshTokenHash = await hash(refreshToken, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash },
    });
  }

  private get accessSecret(): string {
    return process.env.JWT_ACCESS_SECRET ?? 'dev_access_secret';
  }

  private get refreshSecret(): string {
    return process.env.JWT_REFRESH_SECRET ?? 'dev_refresh_secret';
  }

  private get accessExpiresIn(): number | string {
    return this.parseExpiresIn(process.env.JWT_ACCESS_EXPIRES_IN, '15m');
  }

  private get refreshExpiresIn(): number | string {
    return this.parseExpiresIn(process.env.JWT_REFRESH_EXPIRES_IN, '7d');
  }

  private parseExpiresIn(
    value: string | undefined,
    fallback: string,
  ): number | string {
    const raw = value?.trim();
    if (!raw) {
      return fallback;
    }

    // 纯数字按「秒」传给 jsonwebtoken（与官方示例一致）
    if (/^\d+$/.test(raw)) {
      return Number(raw);
    }

    return raw;
  }
}
