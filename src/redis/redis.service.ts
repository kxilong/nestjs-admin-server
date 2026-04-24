import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import Redis from 'ioredis';

/** 缓存穿透：表示“数据库里确实没有”的占位 */
export const CACHE_NULL_MARKER = '__NULL__';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;

  get enabled(): boolean {
    return this.client !== null;
  }

  async onModuleInit() {
    if (process.env.REDIS_DISABLED === '1') {
      this.logger.warn('REDIS_DISABLED=1，Redis 已关闭');
      return;
    }
    const host = process.env.REDIS_HOST?.trim();
    if (!host) {
      this.logger.warn('未设置 REDIS_HOST，Redis 缓存与锁将不启用');
      return;
    }
    const port = Number(process.env.REDIS_PORT ?? '6379');
    const password = process.env.REDIS_PASSWORD?.trim();
    try {
      this.client = new Redis({
        host,
        port,
        ...(password ? { password } : {}),
        maxRetriesPerRequest: 2,
        lazyConnect: true,
      });
      await this.client.connect();
      this.logger.log(`Redis 已连接 ${host}:${port}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`Redis 连接失败，将禁用缓存: ${msg}`);
      if (this.client) {
        this.client.disconnect();
      }
      this.client = null;
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit().catch(() => undefined);
      this.client = null;
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.client) return null;
    try {
      return await this.client.get(key);
    } catch {
      return null;
    }
  }

  async set(key: string, value: string, ttlSec: number): Promise<void> {
    if (!this.client) return;
    try {
      if (ttlSec > 0) {
        await this.client.set(key, value, 'EX', ttlSec);
      } else {
        await this.client.set(key, value);
      }
    } catch {
      /* 忽略缓存写入失败 */
    }
  }

  /** SET key value NX EX seconds — 用于分布式锁 */
  async setNxEx(key: string, value: string, ttlSec: number): Promise<boolean> {
    if (!this.client) return false;
    try {
      const r = await this.client.set(key, value, 'EX', ttlSec, 'NX');
      return r === 'OK';
    } catch {
      return false;
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (!this.client || keys.length === 0) return;
    try {
      await this.client.del(...keys);
    } catch {
      /* ignore */
    }
  }

  async incr(key: string): Promise<number> {
    if (!this.client) return 0;
    try {
      return await this.client.incr(key);
    } catch {
      return 0;
    }
  }

  async getCounter(key: string): Promise<string> {
    const v = await this.get(key);
    return v ?? '0';
  }

  /** 用户列表缓存版本（变更时 INCR，使旧 key 全部失效） */
  async bumpUserListVersion(): Promise<void> {
    await this.incr('cache:ver:user_list');
  }

  async bumpRoleListVersion(): Promise<void> {
    await this.incr('cache:ver:role_list');
  }

  async bumpRolePermissionVersion(roleId: number): Promise<void> {
    await this.incr(`cache:ver:role_perm:${roleId}`);
  }

  /** 仅当值仍为 token 时删除锁，避免误删他人锁 */
  async unlockIfEquals(key: string, token: string): Promise<void> {
    if (!this.client) return;
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    try {
      await this.client.eval(script, 1, key, token);
    } catch {
      /* ignore */
    }
  }
}
