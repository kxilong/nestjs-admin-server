# Redis、缓存策略与接口限流 — 小白入门（结合本项目）

本文说明本仓库里**已经接好的能力**，以及你在服务器 / 本地要如何启动、如何验证。

---

## 一、为什么要用 Redis？

- **缓存**：把「读多写少」的结果放进内存数据库，减少 PostgreSQL 压力、加快接口响应。
- **分布式锁**：多实例或多请求同时改同一资源时，避免互相踩数据（本项目中示例：`PATCH /users/:id/roles`）。
- **配合限流**：全局限流可用内存；若要多实例共享计数，可把限流存储换成 Redis（当前使用 `@nestjs/throttler` 默认内存存储，足够单机入门）。

---

## 二、本项目中 Redis 做了什么？

### 1. 热点数据缓存

| 数据 | 接口 | 说明 |
|------|------|------|
| 用户列表 | `GET /users` | 分页 + 关键词查询结果缓存 |
| 角色列表 | `GET /roles` | 分页 + 关键词查询结果缓存 |
| 角色权限列表 | `GET /roles/:id/permissions` | 按角色缓存权限数组 |

缓存失效采用 **版本号**（Redis `INCR`），例如用户列表版本键：`cache:ver:user_list`。  
一旦用户注册、分配角色等写操作发生，版本 +1，旧缓存 key 自然失效，无需 `KEYS *` 扫描删除。

### 2. 缓存穿透 / 击穿 / 雪崩（代码里怎么防的？）

实现位置：`src/redis/cache-list.service.ts` + `src/redis/redis.service.ts`。

- **穿透（查不存在的数据）**  
  恶意或业务上大量查询「一定不存在」的 key，若不做处理会反复打数据库。  
  本项目对「可缓存的空结果」写入短 TTL 占位串 `__NULL__`（见 `CACHE_NULL_MARKER`），短期内重复请求只打 Redis。

- **击穿（热点 key 过期瞬间）**  
  大量请求同时发现缓存过期，会一起打数据库。  
  本项目在回源前使用 **互斥锁 key**（`SET key NX` + TTL），同一时刻只有一个请求去查库并回填缓存，其它请求短暂等待后读缓存。

- **雪崩（大量 key 同时过期）**  
  若 TTL 完全相同，容易同一秒集体过期。  
  本项目对正常数据的 TTL 增加 **随机抖动**（默认在基础 TTL 上增加 0～20%～25% 随机比例），让过期时间分散开。

可通过环境变量微调（可选）：

| 变量 | 含义 | 默认 |
|------|------|------|
| `CACHE_USER_LIST_TTL_SEC` | 用户列表缓存秒数 | 60 |
| `CACHE_ROLE_LIST_TTL_SEC` | 角色列表缓存秒数 | 120 |
| `CACHE_ROLE_PERM_TTL_SEC` | 角色权限缓存秒数 | 180 |
| `CACHE_NULL_TTL_SEC` | 空结果占位 TTL | 15～20 |
| `CACHE_REBUILD_LOCK_MS` | 回源互斥锁 TTL（毫秒转秒存 Redis） | 8000 |

### 3. 分布式锁（示例）

实现位置：`src/redis/distributed-lock.service.ts`。  
使用 Redis `SET lock:xxx token NX EX ttl` + Lua 脚本校验 token 再删除，避免误删别人的锁。

**示例用法**：`UserService.setUserRoles` 对同一 `userId` 使用 `withLock('user_roles:${userId}', 15, ...)`，避免并发 PATCH 角色时交错写入。

> 注意：这是 **单 Redis 节点** 下的常用写法。若以后是多主 Redis 集群，需要 Redlock 等更强方案。

### 4. 接口限流

实现位置：`src/app.module.ts` + `src/auth/auth.controller.ts`。

- 全局限流：`ThrottlerGuard` + `ThrottlerModule`，默认 **每 IP 每 60 秒** 内请求上限见 `THROTTLE_LIMIT`（默认 200，且代码里下限 30）。
- 登录 / 注册额外更严：`@Throttle` 单独限制暴力尝试。

---

## 三、本地如何跑起来？

### 1. 安装依赖

在项目根目录：

```bash
npm install
```

### 2. 启动 Redis（任选一种）

**方式 A：Docker 只跑 Redis**

```bash
docker run -d --name redis-dev -p 6379:6379 redis:7-alpine
```

**方式 B：使用仓库自带 `docker-compose`**

根目录执行：

```bash
docker compose up -d redis db
```

### 3. 配置环境变量

在根目录 `.env` 增加（本地示例）：

```env
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
```

若暂时不想用 Redis（例如同事电脑没装 Redis）：

```env
REDIS_DISABLED=1
```

此时缓存与锁会自动降级为「直连数据库 / 无锁」，项目仍可运行。

### 4. 启动 API

```bash
npm run start:dev:api
```

---

## 四、Docker 部署时怎么用？

`docker-compose.yml` 已增加 `redis` 服务，并在 `app` 容器中注入：

- `REDIS_HOST=redis`
- `REDIS_PORT=6379`

请确保 **`app` 与 `redis` 在同一 compose 工程里启动**，容器内才能用主机名 `redis` 访问。

---

## 五、如何自测缓存是否生效？

1. 打开 Swagger：`http://localhost:3000/api`（或你的域名）。
2. 先登录拿到 token。
3. 连续两次请求 `GET /users`：第二次应明显更快（可用浏览器 Network 看耗时）。
4. 调用 `PATCH /users/:id/roles` 修改角色后，再请求 `GET /users`：应重新查库（版本号已变）。

也可用 `redis-cli`：

```bash
redis-cli KEYS 'cache:user_list*'
```

---

## 六、和「数据没了」的关系说明

Redis **只存缓存**，不是主数据库。缓存丢了不会丢 PostgreSQL 里的业务数据。  
若你看到「列表数据变了 / 空了」，优先检查：

- 是否连到了**另一套数据库**（`DATABASE_URL` 是否变化）；
- 是否执行过删卷、删库操作。

---

## 七、相关源码文件（想深入就看这些）

| 文件 | 作用 |
|------|------|
| `src/redis/redis.module.ts` | 全局 Redis 模块 |
| `src/redis/redis.service.ts` | 连接、字符串读写、版本号、SET NX |
| `src/redis/cache-list.service.ts` | 穿透/击穿/雪崩封装 |
| `src/redis/distributed-lock.service.ts` | 分布式锁 |
| `src/user/user.service.ts` | 用户列表缓存 + 分配角色加锁 |
| `src/role/role.service.ts` | 角色列表与角色权限缓存 |
| `src/auth/auth.service.ts` | 注册后使用户列表缓存失效 |
| `src/app.module.ts` | 限流全局注册 |

---

## 八、常见问题

**Q：接口返回 429？**  
A：触发了限流。可调大 `THROTTLE_LIMIT`，或降低自测时的请求频率。

**Q：Redis 连不上会怎样？**  
A：默认会打日志并禁用缓存；若设置了 `REDIS_DISABLED=1` 同样禁用。业务接口仍可用。

**Q：还要学哪些进阶？**  
A：缓存一致性（先删缓存还是先写库）、布隆过滤器防穿透、Redisson/Redlock、把限流计数迁到 Redis、Prometheus 监控缓存命中率等。

祝学习顺利。若你希望我下一步把「限流计数存到 Redis」也接上，可以再说。
