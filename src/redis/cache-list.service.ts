import { Injectable } from '@nestjs/common';
import { CACHE_NULL_MARKER, RedisService } from './redis.service';

export type CacheListOptions = {
  /** 正常命中缓存 TTL（秒） */
  ttlSec: number;
  /** 空结果防穿透 TTL（秒），应短于 ttlSec */
  nullTtlSec: number;
  /** 重建缓存互斥锁 TTL（毫秒） */
  lockTtlMs: number;
  /** 雪崩：在 ttl 上增加随机比例 0~jitterRatio，例如 0.2 表示最多 +20% */
  jitterRatio?: number;
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * 列表类接口缓存：穿透 / 击穿 / 雪崩 基础防护
 * - 穿透：对「确定无数据」的结果写短 TTL 占位
 * - 击穿：热点 key 过期时，用 SET NX 互斥，只有一个请求回源
 * - 雪崩：TTL 加随机抖动，避免同时过期
 */
@Injectable()
export class CacheListService {
  constructor(private readonly redis: RedisService) {}

  private jitteredTtl(baseSec: number, jitterRatio = 0.2): number {
    const r = Math.random() * jitterRatio;
    return Math.max(1, Math.floor(baseSec * (1 + r)));
  }

  async getOrSetJson<T>(
    cacheKey: string,
    load: () => Promise<T | null>,
    opts: CacheListOptions,
  ): Promise<T | null> {
    if (!this.redis.enabled) {
      return load();
    }

    const jitterRatio = opts.jitterRatio ?? 0.2;
    const lockKey = `${cacheKey}:rebuild_lock`;

    for (let attempt = 0; attempt < 40; attempt++) {
      const raw = await this.redis.get(cacheKey);
      if (raw === CACHE_NULL_MARKER) {
        return null;
      }
      if (raw) {
        try {
          return JSON.parse(raw) as T;
        } catch {
          await this.redis.del(cacheKey);
        }
      }

      const gotLock = await this.redis.setNxEx(
        lockKey,
        '1',
        Math.max(1, Math.ceil(opts.lockTtlMs / 1000)),
      );
      if (gotLock) {
        try {
          const fresh = await load();
          const nullTtl = Math.max(1, opts.nullTtlSec);
          const dataTtl = this.jitteredTtl(opts.ttlSec, jitterRatio);
          if (fresh === null) {
            await this.redis.set(cacheKey, CACHE_NULL_MARKER, nullTtl);
          } else {
            await this.redis.set(cacheKey, JSON.stringify(fresh), dataTtl);
          }
          return fresh;
        } finally {
          await this.redis.del(lockKey);
        }
      }

      await sleep(25 + Math.floor(Math.random() * 60));
    }

    return load();
  }
}
