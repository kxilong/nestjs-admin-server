# NestJS Admin Server 项目功能文档

---

## 一、项目概述

本项目是一个基于 **NestJS** 构建的企业级后台管理系统，集成了 **RBAC 权限管理**、**AI 对话** 和 **RAG 知识库** 三大核心模块，提供完整的服务端解决方案。

---

## 二、核心功能模块

### 2.1 基础架构层

| 功能 | 实现方式 | 说明 |
|------|----------|------|
| **统一响应格式** | `ResponseInterceptor` | 所有接口返回 `{code, msg, data}` 结构 |
| **全局异常处理** | `GlobalExceptionFilter` | 统一捕获异常，返回标准化错误响应 |
| **参数校验** | `ValidationPipe` | 使用 class-validator 进行 DTO 校验 |
| **接口限流** | `ThrottlerModule` | 默认 1 分钟 200 次请求限制 |
| **API 文档** | Swagger | 访问 `/api` 查看交互式文档 |

### 2.2 数据库集成

- **数据库类型**：PostgreSQL 15+
- **ORM**：Prisma 7.x
- **向量扩展**：pgvector（支持向量存储和相似度搜索）

### 2.3 认证授权系统

#### 2.3.1 JWT 认证

- **Token 类型**：Access Token（15分钟）+ Refresh Token（7天）
- **登录接口**：`POST /auth/login`
- **刷新 Token**：`POST /auth/refresh`
- **密码哈希**：bcryptjs（10轮）

#### 2.3.2 RBAC 权限控制

**权限定义**（`src/constants/permission.definitions.ts`）：

| 权限码 | 名称 | 说明 |
|--------|------|------|
| `system:role:create` | 创建角色 | POST /roles |
| `system:role:list` | 查询角色 | GET /roles |
| `system:role:update` | 修改角色 | PATCH /roles/:id |
| `system:role:delete` | 删除角色 | DELETE /roles/:id |
| `system:role:permissions` | 角色权限配置 | PUT /roles/:id/permissions |
| `system:permission:list` | 权限列表 | GET /permissions |
| `system:user:list` | 用户列表 | GET /users |
| `system:user:roles` | 分配用户角色 | PATCH /users/:id/roles |
| `system:ai:chat` | AI 对话 | POST /ai/chat/stream |

**权限校验装饰器**：

```typescript
@Authorize('system:user:list')
async findAll(@Query() query: QueryUserListDto) { ... }
```

#### 2.3.3 超级管理员初始化

系统启动时自动执行：
1. 同步权限定义到数据库
2. 若无超管角色，自动创建 `super_admin` 角色并分配所有权限
3. 若无超管用户，自动创建 `admin` 用户（密码：`Admin@123`）

---

### 2.4 系统管理模块

#### 2.4.1 用户管理

**接口列表**：

| 接口 | 方法 | 权限 | 说明 |
|------|------|------|------|
| `/users` | GET | `system:user:list` | 用户列表（支持分页、搜索） |
| `/users/:id/roles` | PATCH | `system:user:roles` | 分配用户角色 |

**缓存策略**：用户列表缓存 60 秒，变更时自动失效

#### 2.4.2 角色管理

**接口列表**：

| 接口 | 方法 | 权限 | 说明 |
|------|------|------|------|
| `/roles` | POST | `system:role:create` | 创建角色 |
| `/roles` | GET | `system:role:list` | 角色列表 |
| `/roles/:id` | PATCH | `system:role:update` | 修改角色 |
| `/roles/:id` | DELETE | `system:role:delete` | 删除角色 |
| `/roles/:id/permissions` | GET | `system:role:permissions` | 获取角色权限 |
| `/roles/:id/permissions` | PUT | `system:role:permissions` | 设置角色权限 |

---

### 2.5 AI 对话模块

#### 2.5.1 SSE 流式对话

**接口**：`POST /ai/chat/stream`

**特性**：
- 使用阿里云 DashScope API（通义千问）
- Server-Sent Events 实时推送
- 支持自定义系统提示词

**请求参数**：

```json
{
"prompt": "帮我设计一个用户权限审批流程",
"systemPrompt": "你是一个后台管理系统助手..."
}
```

**响应格式**（SSE）：

```
event: meta
data: {"model": "qwen3.5-122b-a10b"}

event: delta
data: {"text": "好的"}

event: delta
data: {"text": "，我来帮你设计"}

event: done
data: {"ok": true}
```

---

### 2.6 RAG 知识库模块 ⭐

#### 2.6.1 核心架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                     RAG 知识库架构                                  │
├─────────────────────────────────────────────────────────────────────┤
│ 文档上传 → 文本解析 → 分块处理 → Embedding → 向量存储 → 语义检索     │
│                                                       ↓            │
│                                              LLM 生成回答          │
└─────────────────────────────────────────────────────────────────────┘
```

#### 2.6.2 文档上传

**接口**：`POST /rag/documents/ingest`（multipart/form-data）

**支持格式**：PDF、Word（.doc/.docx）、TXT、Markdown

**参数说明**：

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `file` | File | 必填 | 上传的文档文件 |
| `chunkSize` | int | 1000 | 分块大小（字符数） |
| `chunkOverlap` | int | 150 | 分块重叠大小 |
| `source` | string | - | 文件来源标识 |

**返回示例**：

```json
{
"code": 200,
"msg": "success",
"data": {
    "documentId": "1",
    "filename": "test-document.md",
    "chunkCount": 3,
    "totalChars": 2480,
    "embeddingModel": "text-embedding-v3",
    "chunkSize": 1000,
    "chunkOverlap": 150
}
}
```

#### 2.6.3 Embedding 生成

**模型**：阿里云 text-embedding-v3

**特性**：
- 向量维度：1024 维
- 支持批量调用（每批 20 条）
- 支持降级到哈希嵌入（环境变量控制）

**环境变量**：
- `DASHSCOPE_API_KEY`：API 密钥
- `EMBEDDING_MODEL`：模型名称（默认 `text-embedding-v3`）
- `RAG_EMBEDDING_DIM`：向量维度（默认 1024）
- `RAG_USE_REAL_EMBEDDING`：是否使用真实 Embedding（默认 true）

#### 2.6.4 向量存储

**表结构**：

**rag_documents**：
| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | BIGSERIAL | 主键 |
| `filename` | TEXT | 文件名 |
| `mime_type` | TEXT | MIME 类型 |
| `source` | TEXT | 来源 |
| `content` | TEXT | 完整内容 |
| `created_at` | TIMESTAMPTZ | 创建时间 |

**rag_chunks**：
| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | BIGSERIAL | 主键 |
| `document_id` | BIGINT | 关联文档 ID |
| `chunk_index` | INT | 分块索引 |
| `content` | TEXT | 分块内容 |
| `embedding` | VECTOR(1024) | 向量表示 |
| `created_at` | TIMESTAMPTZ | 创建时间 |

**索引**：
- `rag_chunks_document_chunk_idx`：文档+分块索引
- `rag_chunks_embedding_idx`：HNSW 向量索引（cosine 相似度）

#### 2.6.5 语义检索

**接口**：`POST /rag/query`

**请求参数**：

```json
{
"question": "NestJS 是什么？",
"topK": 5,
"minScore": 0
}
```

**返回示例**：

```json
{
"code": 200,
"msg": "success",
"data": {
    "question": "NestJS 是什么？",
    "topK": 5,
    "minScore": 0,
    "matchCount": 3,
    "matches": [
    {
        "chunkId": "1",
        "documentId": "1",
        "filename": "test-document.md",
        "chunkIndex": 0,
        "content": "# NestJS 框架介绍...",
        "score": 0.7435
    }
    ]
}
}
```

**缓存策略**：查询结果缓存 5 分钟，文档变更时自动清除所有缓存

#### 2.6.6 RAG 问答

**接口**：`POST /rag/chat`（同步）、`POST /rag/chat/stream`（SSE 流式）

**工作流程**：
1. 用户提问 → 生成查询向量
2. 向量相似度搜索 → 获取 Top-K 相关分块
3. 将分块内容作为上下文 → 调用 LLM 生成回答
4. 返回回答 + 引用来源

**返回示例**：

```json
{
"code": 200,
"msg": "success",
"data": {
    "question": "NestJS 是什么？有哪些核心特性？",
    "answer": "## NestJS 是什么\n\nNestJS 是一个用于构建高效、可扩展的 Node.js 服务器端应用程序的框架...",
    "sources": [
    {
        "filename": "test-document.md",
        "chunkIndex": 0,
        "score": 0.7442,
        "snippet": "# NestJS 框架介绍..."
    }
    ],
    "matchCount": 3
}
}
```

#### 2.6.7 文档管理

**接口列表**：

| 接口 | 方法 | 说明 |
|------|------|------|
| `/rag/documents` | GET | 获取文档列表 |
| `/rag/documents/:id` | DELETE | 删除文档（级联删除分块） |

---

### 2.7 Redis 缓存模块

#### 2.7.1 功能特性

| 功能 | 说明 |
|------|------|
| **用户列表缓存** | 60 秒 TTL |
| **角色列表缓存** | 60 秒 TTL |
| **RAG 查询缓存** | 300 秒 TTL |
| **分布式锁** | 用于缓存重建 |

#### 2.7.2 环境变量

- `REDIS_HOST`：Redis 地址
- `REDIS_PORT`：端口（默认 6379）
- `REDIS_PASSWORD`：密码（可选）
- `REDIS_DISABLED`：是否禁用（默认 false）

---

## 三、前端功能

### 3.1 页面结构

| 页面 | 路径 | 说明 |
|------|------|------|
| **登录页** | `/login` | JWT 登录 |
| **注册页** | `/register` | 用户注册 |
| **工作台** | `/admin/dashboard` | 首页 |
| **服务状态** | `/admin/system` | 系统信息 |
| **用户管理** | `/admin/users` | 用户列表、角色分配 |
| **角色管理** | `/admin/roles` | 角色 CRUD、权限配置 |
| **账号安全** | `/admin/security` | 修改密码等 |
| **AI 对话** | `/admin/ai-chat` | SSE 流式对话 |
| **知识库** | `/admin/rag` | 文档管理、问答、检索 |

### 3.2 知识库页面功能

**三个标签页**：

1. **文档管理**：
    - 上传文档（支持拖拽）
    - 文档列表展示
    - 删除文档（带确认）
    - 配置分块参数

2. **知识库问答**：
    - SSE 流式对话
    - 消息历史展示
    - 思考动画提示

3. **语义检索**：
    - 输入检索关键词
    - 展示匹配分块列表
    - 显示相似度得分

---

## 四、技术栈

| 分类 | 技术 | 版本 |
|------|------|------|
| **后端框架** | NestJS | 11.x |
| **数据库** | PostgreSQL | 15+ |
| **ORM** | Prisma | 7.x |
| **向量数据库** | pgvector | 0.7+ |
| **缓存** | Redis | 7.x |
| **AI 模型** | DashScope（通义千问） | - |
| **前端框架** | Vue 3 | 3.x |
| **UI 组件** | Ant Design Vue | 4.x |
| **构建工具** | Vite | 8.x |

---

## 五、部署说明

### 5.1 环境变量

```bash
# 数据库
DATABASE_URL=postgresql://postgres:123456@localhost:5433/nest_prisma

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
JWT_SECRET=your-secret-key

# AI
DASHSCOPE_API_KEY=your-api-key
AI_MODEL=qwen3.5-122b-a10b

# RAG
RAG_EMBEDDING_DIM=1024
RAG_USE_REAL_EMBEDDING=true

# 超级管理员
SEED_ADMIN_USERNAME=admin
SEED_ADMIN_PASSWORD=Admin@123
```

### 5.2 启动命令

```bash
# 开发模式
pnpm run start:dev

# 生产构建
pnpm run build

# 生产运行
pnpm run start:prod
```

### 5.3 访问地址

| 服务 | 地址 |
|------|------|
| API | http://localhost:3000 |
| Swagger | http://localhost:3000/api |
| 前端 | http://localhost:5173 |
| 知识库 | http://localhost:5173/admin/rag |

---

## 六、功能亮点总结

| 亮点 | 说明 |
|------|------|
| **真实 Embedding** | 使用 text-embedding-v3，相似度得分提升至 0.7+ |
| **流式问答** | SSE 实时推送，用户体验流畅 |
| **智能引用** | 回答自动引用来源文档 |
| **缓存优化** | Redis 缓存查询结果，提升性能 |
| **权限控制** | 细粒度 RBAC，支持动态权限校验 |
| **统一响应** | 全局拦截器确保响应格式一致 |
| **异常处理** | 全局异常过滤器统一错误处理 |

---

*文档生成时间：2026-04-29*