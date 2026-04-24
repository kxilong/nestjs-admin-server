import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RedisService } from './redis.service';

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * 基于 Redis SET NX + 随机 token 的简易分布式锁（单 Redis 实例场景）。
 * 生产多节点 Redis 请改用 Redlock 等方案。
 */
@Injectable()
export class DistributedLockService {
  private readonly logger = new Logger(DistributedLockService.name);

  constructor(private readonly redis: RedisService) {}

  /**
   * @param resourceKey 业务资源标识，会加上 lock: 前缀
   * @param ttlSec 锁持有最长时间（防止死锁）
   * @param fn 持锁期间执行的逻辑
   */
  async withLock<T>(
    resourceKey: string,
    ttlSec: number,
    fn: () => Promise<T>,
  ): Promise<T> {
    if (!this.redis.enabled) {
      return fn();
    }

    const lockKey = `lock:${resourceKey}`;
    const token = randomUUID();
    const maxWaitMs = Math.min(10_000, ttlSec * 1000);
    const deadline = Date.now() + maxWaitMs;

    while (Date.now() < deadline) {
      const ok = await this.redis.setNxEx(lockKey, token, ttlSec);
      if (ok) {
        try {
          return await fn();
        } finally {
          await this.redis.unlockIfEquals(lockKey, token);
        }
      }
      await sleep(20 + Math.floor(Math.random() * 80));
    }

    this.logger.warn(`获取锁超时，直接执行（无锁）: ${resourceKey}`);
    return fn();
  }
}
