import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { CacheListService } from './cache-list.service';
import { DistributedLockService } from './distributed-lock.service';

@Global()
@Module({
  providers: [RedisService, CacheListService, DistributedLockService],
  exports: [RedisService, CacheListService, DistributedLockService],
})
export class RedisModule {}
